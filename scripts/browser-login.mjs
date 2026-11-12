import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, open, readFile, realpath, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
  const explicit = process.env.CHROME_PATH !== undefined;
  const candidates = explicit ? [process.env.CHROME_PATH] : [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/local/share/chromium/chrome-linux/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  // Rutas canónicas de binarios Chrome instalados por el sistema. Las rutas
  // de /usr/bin son sólo puntos de descubrimiento: jamás son una autorización
  // por sí mismas después de realpath.
  const systemExecutables = new Set([
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/opt/google/chrome/chrome",
    "/usr/lib/chromium/chromium",
    "/usr/lib/chromium-browser/chromium-browser",
    "/usr/local/share/chromium/chrome-linux/chrome",
  ]);
  const vendorWrapper = "/opt/google/chrome/google-chrome";

  for (const candidate of candidates) {
    let executable;
    try {
      executable = await realpath(candidate);
    } catch (error) {
      if (!explicit && ["ENOENT", "ENOTDIR"].includes(error.code)) continue;
      throw new Error("T3 CHROME_PATH no accesible");
    }
    try {
      if (executable === vendorWrapper) executable = await realpath("/opt/google/chrome/chrome");
      const info = await stat(executable);
      if (!info.isFile()) throw new Error("T3 CHROME_PATH debe ser un archivo ejecutable");
      await access(executable, constants.X_OK);
      const systemTrusted = systemExecutables.has(executable) && (info.mode & 0o022) === 0;
      if (!systemTrusted) {
        throw new Error("T3 CHROME_PATH fuera de la lista permitida");
      }
      // El FD se abre después de la allowlist y se hereda al hijo. No se
      // devuelve una ruta que otro proceso pueda reemplazar antes de exec.
      const file = await open(executable, constants.O_RDONLY | constants.O_NOFOLLOW);
      const opened = await file.stat();
      if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino) {
        await file.close();
        throw new Error("T3 CHROME_PATH cambió durante validación");
      }
      return { file };
    } catch (error) {
      // Fallos FS sanitizados; ningún rechazo habilita otro candidato.
      if (error.code) throw new Error("T3 CHROME_PATH ejecutable no verificable");
      throw error;
    }
  }
  throw new Error("T3 no se encontró un ejecutable Chrome/Chromium");
}

function chromeCommand(file) {
  assert.ok(Number.isInteger(file?.fd) && file.fd >= 3, "T3 descriptor Chrome inválido");
  if (process.platform === "linux") return `/proc/self/fd/${file.fd}`;
  if (process.platform === "darwin") return `/dev/fd/${file.fd}`;
  throw new Error("T3 plataforma Chrome no soportada");
}

function chromeStdio(fd) {
  const stdio = ["ignore", "pipe", "pipe"];
  for (let index = 3; index <= fd; index++) stdio[index] = index === fd ? fd : "ignore";
  return stdio;
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
  // Un fallo de spawn no siempre emite `exit`; conservarlo evita que el poller
  // espere un DevToolsActivePort imposible y que teardown espere un hijo que
  // nunca tuvo PID/proceso propio.
  child.launchError = null;
  child.once("error", (error) => { child.launchError = error; });
  children.push(child);
  return child;
}

async function stopOwned(child) {
  if (!child || child.launchError || child.exitCode !== null || child.signalCode !== null) return;
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
  try {
    for (const child of [...children].reverse()) await stopOwned(child);
    children.length = 0;
    if (ownedRoot) await rm(ownedRoot, { recursive: true, force: true });
    ownedRoot = undefined;
  } finally {
    tearingDown = false;
  }
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
    if (child.launchError) {
      const code = typeof child.launchError.code === "string" ? child.launchError.code : "UNKNOWN";
      throw new Error(`Chrome no pudo iniciarse (${code})`);
    }
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

async function pressTab(cdp, backwards = false) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Tab",
    modifiers: backwards ? 8 : 0,
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    modifiers: backwards ? 8 : 0,
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
}

async function pressEnter(cdp) {
  const key = {
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  };
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...key });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "char",
    text: "\r",
    unmodifiedText: "\r",
    ...key,
  });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
}

async function assertKeyboardFocus(cdp, stop, label) {
  const focus = await cdp.evaluate(`(() => {
    const expected = document.querySelector(${JSON.stringify(stop.selector)});
    const active = document.activeElement;
    const style = active ? getComputedStyle(active) : null;
    return {
      matches: Boolean(expected && active === expected),
      tag: active?.tagName,
      name: active?.getAttribute("name"),
      text: active?.textContent?.trim(),
      outline: style?.outlineStyle,
      outlineWidth: style?.outlineWidth,
    };
  })()`);
  assert.equal(focus.matches, true, `foco ${stop.name} ${label}: ${JSON.stringify(focus)}`);
  assert.notEqual(focus.outline, "none", `foco visible ${stop.name} ${label}: ${JSON.stringify(focus)}`);
  assert.notEqual(focus.outlineWidth, "0px", `foco visible ${stop.name} ${label}: ${JSON.stringify(focus)}`);
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
  let externalRequests = 0;
  cdp.onEvent(({ method, params }) => {
    if (method !== "Fetch.requestPaused") return;
    const local = new URL(params.request.url).origin === new URL(appUrl).origin;
    if (!local) externalRequests++;
    void cdp.send(local ? "Fetch.continueRequest" : "Fetch.failRequest", {
      requestId: params.requestId,
      ...(local ? {} : { errorReason: "BlockedByClient" }),
    }).catch(() => {});
  });

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
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await cdp.send("Page.navigate", { url: appUrl });
    await waitUntil(
      cdp,
      `document.querySelector("h1")?.textContent?.trim() === "Bienvenido a Daybook Travel"`,
      `título de login en ${label}`,
    );
    await waitUntil(
      cdp,
      `[...document.querySelectorAll("[data-brand-identity] img, [data-login-card] [data-brand-mark] img")]
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
        logo: rect("[data-brand-identity] [data-brand-logo]"),
        mark: rect("[data-login-card] [data-brand-mark]"),
        title: rect("h1"),
        card: rect("[data-login-card]"),
        email: rect('input[name="email"]'),
        password: rect('input[name="password"]'),
        submit: rect("form button"),
        demo: rect("[data-demo-action]"),
        titleText: document.querySelector("h1")?.textContent?.trim(),
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
    // La altura exacta de la tarjeta cambia con cada fila que se agrega al formulario
    // (el enlace de recuperación, la casilla de mostrar contraseña) y fijarla a 0,01 px
    // obligaba a reescribir esta prueba por un cambio que se ve bien. Lo que importa es
    // que la tarjeta sea razonable y quepa entera, y eso lo comprueba el desbordamiento.
    assert.ok(
      metrics.card.height >= 450 && metrics.card.height <= 700,
      `alto de tarjeta ${label}: ${metrics.card.height.toFixed(2)} fuera de 450–700`,
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

    const initialTheme = await cdp.evaluate(`document.documentElement.dataset.theme`);
    const keyboardStops = [
      { name: "tema", selector: 'button[aria-label^="Activar modo"]' },
      { name: "correo", selector: 'input[name="email"]' },
      { name: "contraseña", selector: 'input[name="password"]' },
      { name: "mostrar contraseña", selector: "input[data-show-password]" },
      { name: "submit", selector: "form button" },
      { name: "recuperación", selector: "[data-recovery-action]" },
      { name: "demostración", selector: "[data-demo-action]" },
    ];
    for (const stop of keyboardStops) {
      await pressTab(cdp);
      await assertKeyboardFocus(cdp, stop, label);
      if (stop.name === "tema") {
        await pressEnter(cdp);
        await waitUntil(
          cdp,
          `document.documentElement.dataset.theme !== ${JSON.stringify(initialTheme)}`,
          `cambio de tema por teclado en ${label}`,
        );
      }
      if (stop.name === "demostración") {
        await pressEnter(cdp);
      }
    }
    await waitUntil(
      cdp,
      `document.body.innerText.includes("Demostración con datos ficticios") && !document.querySelector("[data-login-card]")`,
      `apertura de demostración por teclado en ${label}`,
    );
    assert.deepEqual(collector.errors, [], `errores de navegador ${label}`);
    assert.equal(externalRequests, 0, `requests externos ${label}`);

    return `${label}: logo 168×${metrics.logo.height.toFixed(2)}, isotipo 56×56, tarjeta ${metrics.card.width.toFixed(0)}×${metrics.card.height.toFixed(2)}, sin overflow ni errores`;
  } finally {
    collector.stop();
    try { await cdp.send("Page.close"); } catch {}
    cdp.close();
  }
}

function assertSandboxedChromeArgs(argv) {
  // Lista cerrada de argumentos efectivos: ningún flag extra ni cambio de
  // features puede reducir el sandbox. El perfil sólo se usa como un argv.
  const allowed = new Set([
    "--headless=new",
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-domain-reliability",
    "--disable-sync",
    "--metrics-recording-only",
    "--disable-features=Translate,OptimizationHints,MediaRouter",
    "about:blank",
  ]);
  assert.ok(Array.isArray(argv), "T3 argv debe ser una lista");
  assert.ok(argv.every((arg) => typeof arg === "string" && (allowed.has(arg)
    || (arg.startsWith("--user-data-dir=") && arg.length > "--user-data-dir=".length
      && !/[\0\r\n]/.test(arg)))), "T3 argumento Chrome fuera del contrato de sandbox");
  const flags = argv.filter((arg) => arg.startsWith("--")).map((arg) => arg.split("=")[0]);
  assert.ok(new Set(flags).size === flags.length, "T3 flags Chrome sin duplicados");
  assert.ok(argv.filter((arg) => arg === "about:blank").length === 1, "T3 destino inicial cerrado");
  // Sólo nombres de flags y estado: no perfil, puerto, URL ni valores de argv.
  return { sandboxRequested: true, argvValidated: true, flags };
}

export async function startBrowser() {
  // Sólo pruebas locales sintéticas pueden inyectar un servidor efímero. La
  // invocación normal no lee flags de proceso ni cambia el runner de Next.
  const testConfig = globalThis.__travelBrowserStartTest ?? {};
  const nextEntrypoint = testConfig.nextEntrypoint ?? join(ROOT, "node_modules/next/dist/bin/next");
  const temporaryParent = testConfig.temporaryParent ?? tmpdir();
  const onPort = testConfig.onPort ?? (() => {});
  const selectChrome = testConfig.chromePath ?? chromePath;
  assert.equal(typeof nextEntrypoint, "string", "browser runner requiere entrypoint string");
  assert.equal(typeof temporaryParent, "string", "browser runner requiere parent temporal string");
  assert.equal(typeof onPort, "function", "browser runner requiere callback de puerto");
  assert.equal(typeof selectChrome, "function", "browser runner requiere selector Chrome function");
  const chromeExecutable = await selectChrome();
  assert.ok(chromeExecutable && typeof chromeExecutable === "object", "browser runner requiere descriptor Chrome");
  const chromeFile = chromeExecutable.file;
  assert.ok(chromeFile && Number.isInteger(chromeFile.fd) && chromeFile.fd >= 3
    && typeof chromeFile.close === "function", "browser runner requiere descriptor Chrome abierto");
  let chromeFileOpen = true;
  try {
    ownedRoot = await mkdtemp(join(temporaryParent, "daybook-travel-browser-"));
    const port = await freePort();
    onPort(port);
    const appUrl = `http://127.0.0.1:${port}/`;
    const next = spawnOwned(process.execPath, [
      nextEntrypoint,
      "dev",
      "--hostname", "127.0.0.1",
      "--port", String(port),
    ], {
      env: {
        ...process.env,
        TRAVEL_BROWSER_FIXTURE: "document-boundaries-v1",
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
    // Evidencia previa al spawn: no afirma estado de procesos/renderer del SO.
    console.log(`Chrome sandbox: ${JSON.stringify({
      ...assertSandboxedChromeArgs(chromeArgs), executableAllowlistVerified: true,
      seccomp: "not-measured", namespaces: "not-measured",
    })}`);
    let chrome;
    try {
      chrome = spawnOwned(chromeCommand(chromeFile), chromeArgs, {
        stdio: chromeStdio(chromeFile.fd),
      });
    } finally {
      await chromeFile.close();
      chromeFileOpen = false;
    }
    const cdpPort = await waitForDevTools(profile, chrome);

    return { cdpPort, appUrl };
  } catch (error) {
    await teardown();
    throw error;
  } finally {
    if (chromeFileOpen) await chromeFile.close();
  }
}

async function main() {
  const { cdpPort, appUrl } = await startBrowser();
  const results = [];
  results.push(await runViewport({ cdpPort, appUrl, width: 390, height: 844, mobile: true }));
  results.push(await runViewport({ cdpPort, appUrl, width: 1440, height: 900, mobile: false }));
  for (const result of results) console.log(`✓ ${result}`);
}

export { Cdp, openTarget, waitUntil, delay, teardown, pressTab, pressEnter, assertKeyboardFocus };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } finally {
    await teardown();
  }
}
