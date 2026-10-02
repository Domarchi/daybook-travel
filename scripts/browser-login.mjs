import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

const ROOT = process.cwd();
const DEADLINE_MS = 45_000;
const children = [];
let ownedRoot;
let tearingDown = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error(`No se encontró Chrome/Chromium. Rutas revisadas: ${candidates.join(", ")}`);
}

function rememberOutput(child) {
  let output = "";
  const append = (chunk) => {
    output = (output + chunk.toString()).slice(-30_000);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  return () => output;
}

function spawnOwned(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    ...options,
  });
  child.output = rememberOutput(child);
  children.push(child);
  return child;
}

async function stopOwned(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  const signal = (name) => {
    try {
      if (process.platform === "win32") child.kill(name);
      else process.kill(-child.pid, name);
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  };

  signal("SIGTERM");
  if (await Promise.race([exited.then(() => true), delay(5_000).then(() => false)])) return;
  signal("SIGKILL");
  await Promise.race([exited, delay(5_000)]);
}

async function teardown() {
  if (tearingDown) return;
  tearingDown = true;
  for (const child of [...children].reverse()) await stopOwned(child);
  if (ownedRoot) await rm(ownedRoot, { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await teardown();
    process.exit(128 + (signal === "SIGINT" ? 2 : 15));
  });
}

async function waitForHttp(url, child) {
  const deadline = Date.now() + DEADLINE_MS;
  let lastError = "sin respuesta";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next terminó antes de estar listo (${child.exitCode}).\n${child.output()}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      await response.text();
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(150);
  }
  throw new Error(`Next no quedó listo en ${DEADLINE_MS} ms: ${lastError}\n${child.output()}`);
}

async function waitForDevTools(profile, child) {
  const file = join(profile, "DevToolsActivePort");
  const deadline = Date.now() + 20_000;
  let lastError = "archivo todavía ausente";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Chrome terminó antes de exponer CDP (${child.exitCode}).\n${child.output()}`);
    }
    try {
      const [port] = (await readFile(file, "utf8")).trim().split("\n");
      if (/^\d+$/.test(port)) return Number(port);
      lastError = `puerto inválido: ${port}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(100);
  }
  throw new Error(`Chrome no expuso CDP: ${lastError}\n${child.output()}`);
}

class Cdp {
  static async connect(url) {
    const socket = new WebSocket(url);
    await Promise.race([
      once(socket, "open"),
      delay(10_000).then(() => { throw new Error("Timeout al abrir el WebSocket CDP"); }),
    ]);
    return new Cdp(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`CDP se cerró durante ${pending.method}`));
      }
      this.pending.clear();
    });
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(method, params = {}, timeoutMs = 10_000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout CDP en ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function waitUntil(cdp, expression, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "la condición devolvió false";
  while (Date.now() < deadline) {
    try {
      if (await cdp.evaluate(expression)) return;
      lastError = "la condición devolvió false";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(100);
  }
  throw new Error(`Timeout esperando ${label}: ${lastError}`);
}

function browserErrorCollector(cdp) {
  const errors = [];
  const stop = cdp.onEvent(({ method, params }) => {
    if (method === "Runtime.consoleAPICalled" && params.type === "error") {
      const text = params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(" ");
      errors.push(`console.error: ${text}`);
    }
    if (method === "Runtime.exceptionThrown") {
      errors.push(`excepción: ${params.exceptionDetails.exception?.description ?? params.exceptionDetails.text}`);
    }
    if (method === "Log.entryAdded" && params.entry.level === "error") {
      errors.push(`log: ${params.entry.text}`);
    }
    if (method === "Network.responseReceived" && params.response.status >= 400) {
      errors.push(`HTTP ${params.response.status}: ${params.response.url}`);
    }
  });
  return { errors, stop };
}

function assertNear(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: esperado ${expected}±${tolerance}, recibido ${actual}`,
  );
}

async function openTarget(cdpPort) {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about%3Ablank`, {
    method: "PUT",
    signal: AbortSignal.timeout(3_000),
  });
  assert.equal(response.ok, true, `Chrome no creó una pestaña: HTTP ${response.status}`);
  return response.json();
}

async function runViewport({ cdpPort, appUrl, width, height, mobile }) {
  const target = await openTarget(cdpPort);
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  const collector = browserErrorCollector(cdp);
  const label = `${width}x${height}`;

  try {
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Log.enable"),
      cdp.send("Network.enable"),
    ]);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      screenWidth: width,
      screenHeight: height,
      deviceScaleFactor: 1,
      mobile,
    });
    await cdp.send("Emulation.setTouchEmulationEnabled", mobile
      ? { enabled: true, maxTouchPoints: 5 }
      : { enabled: false });
    await cdp.send("Network.setUserAgentOverride", {
      userAgent: mobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
        : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    });
    await cdp.send("Page.navigate", { url: appUrl });
    await waitUntil(
      cdp,
      `document.querySelector("h2")?.textContent?.trim() === "Bienvenido a Daybook Travel"`,
      `título de login en ${label}`,
    );
    await waitUntil(
      cdp,
      `[...document.querySelectorAll(".login-header-identity img, .login-card-mark img")]
        .filter((image) => getComputedStyle(image).display !== "none")
        .every((image) => image.complete && image.naturalWidth > 0)`,
      `activos de marca en ${label}`,
    );

    const metrics = await cdp.evaluate(`(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error("Falta " + selector);
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          x: box.x, y: box.y, width: box.width, height: box.height,
          display: style.display, visibility: style.visibility,
          fontSize: style.fontSize,
        };
      };
      return {
        viewport: { innerWidth, innerHeight, screenWidth: screen.width, screenHeight: screen.height },
        document: {
          clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          bodyScrollWidth: document.body.scrollWidth,
          bodyScrollHeight: document.body.scrollHeight,
        },
        logo: rect(".login-header-identity .daybook-logo"),
        mark: rect(".login-card-mark"),
        title: rect("h2"),
        card: rect("[data-login-card]"),
        email: rect('input[name="email"]'),
        password: rect('input[name="password"]'),
        submit: rect("form button"),
        demo: rect("[data-demo-action]"),
        titleText: document.querySelector("h2")?.textContent?.trim(),
        copy: document.querySelector("[data-login-card] p")?.textContent?.trim(),
      };
    })()`);

    assert.deepEqual(metrics.viewport, {
      innerWidth: width,
      innerHeight: height,
      screenWidth: width,
      screenHeight: height,
    }, `viewport efectivo ${label}: ${JSON.stringify(metrics.viewport)}`);
    assertNear(metrics.logo.width, 168, 0.5, `logo ${label}`);
    assertNear(metrics.logo.height, 49.17, 1, `alto de logo ${label}`);
    assertNear(metrics.mark.width, 56, 0.5, `isotipo ${label}`);
    assertNear(metrics.mark.height, 56, 0.5, `alto de isotipo ${label}`);
    assertNear(metrics.card.width, mobile ? 354 : 430, 0.5, `tarjeta ${label}`);
    assert.ok(
      metrics.card.height >= 500 && metrics.card.height <= 560,
      `alto de tarjeta ${label}: esperado 500–560, recibido ${metrics.card.height}`,
    );
    assert.equal(metrics.titleText, "Bienvenido a Daybook Travel");
    assert.equal(metrics.title.fontSize, "28px");
    assert.equal(metrics.copy, "Usa el mismo correo y contraseña de Daybook Asistencia.");
    for (const [name, control] of Object.entries({
      correo: metrics.email,
      contraseña: metrics.password,
      ingresar: metrics.submit,
      demostración: metrics.demo,
    })) {
      assert.ok(control.height >= 44, `${name} ${label}: alto ${control.height} < 44`);
    }
    assert.ok(
      metrics.document.scrollWidth <= metrics.document.clientWidth &&
        metrics.document.bodyScrollWidth <= metrics.document.clientWidth,
      `overflow horizontal ${label}: ${JSON.stringify(metrics.document)}`,
    );
    assert.ok(
      metrics.document.scrollHeight <= metrics.document.clientHeight &&
        metrics.document.bodyScrollHeight <= metrics.document.clientHeight,
      `overflow vertical ${label}: ${JSON.stringify(metrics.document)}`,
    );

    await cdp.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9,
    });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9,
    });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    const focus = await cdp.evaluate(`(() => ({
      name: document.activeElement?.getAttribute("name"),
      outline: getComputedStyle(document.activeElement).outlineStyle,
      outlineWidth: getComputedStyle(document.activeElement).outlineWidth,
    }))()`);
    assert.equal(focus.name, "email", `orden de foco ${label}: ${JSON.stringify(focus)}`);
    assert.notEqual(focus.outline, "none", `foco visible ${label}: ${JSON.stringify(focus)}`);
    assert.notEqual(focus.outlineWidth, "0px", `foco visible ${label}: ${JSON.stringify(focus)}`);

    const initialTheme = await cdp.evaluate(`document.documentElement.dataset.theme`);
    await cdp.evaluate(`document.querySelector('button[aria-label^="Activar modo"]')?.click()`);
    await waitUntil(
      cdp,
      `document.documentElement.dataset.theme !== ${JSON.stringify(initialTheme)}`,
      `cambio de tema en ${label}`,
    );

    await cdp.evaluate(`document.querySelector("[data-demo-action]")?.click()`);
    await waitUntil(
      cdp,
      `document.body.innerText.includes("Demostración con datos ficticios") && !document.querySelector("[data-login-card]")`,
      `apertura de demostración en ${label}`,
    );
    await delay(100);
    assert.deepEqual(collector.errors, [], `errores de navegador ${label}`);

    return `${label}: logo 168×${metrics.logo.height.toFixed(2)}, isotipo 56×56, tarjeta ${metrics.card.width.toFixed(0)}×${metrics.card.height.toFixed(2)}, sin overflow ni errores`;
  } finally {
    collector.stop();
    try { await cdp.send("Page.close"); } catch {}
    cdp.close();
  }
}

async function main() {
  ownedRoot = await mkdtemp(join(tmpdir(), "daybook-travel-browser-"));
  const port = await freePort();
  const appUrl = `http://127.0.0.1:${port}/`;
  const next = spawnOwned(process.execPath, [
    join(ROOT, "node_modules/next/dist/bin/next"),
    "dev",
    "--hostname", "127.0.0.1",
    "--port", String(port),
  ], {
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "browser-test-publishable-key",
    },
  });
  await waitForHttp(appUrl, next);

  const profile = join(ownedRoot, "chrome-profile");
  const chromeArgs = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-domain-reliability",
    "--disable-sync",
    "--metrics-recording-only",
    "--disable-features=Translate,OptimizationHints,MediaRouter",
    "about:blank",
  ];
  if (process.platform === "linux") chromeArgs.unshift("--no-sandbox");
  const chrome = spawnOwned(await chromePath(), chromeArgs);
  const cdpPort = await waitForDevTools(profile, chrome);

  const results = [];
  results.push(await runViewport({ cdpPort, appUrl, width: 390, height: 844, mobile: true }));
  results.push(await runViewport({ cdpPort, appUrl, width: 1440, height: 900, mobile: false }));
  for (const result of results) console.log(`✓ ${result}`);
}

try {
  await main();
} finally {
  await teardown();
}
