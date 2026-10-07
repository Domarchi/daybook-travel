import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const DEADLINE_MS = 45_000;
const ROUTE_SEGMENT = "b3-confirmation-test";
const routeDir = resolve(ROOT, "app", ROUTE_SEGMENT);
const pagePath = join(routeDir, "page.tsx");
const children = [];
let ownedRoot;
let routeCreated = false;
let removeNext = false;
let removeNextDev = false;

class BrowserLaunchError extends Error {
  constructor(message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "BrowserLaunchError";
  }
}

function chromeCandidates() {
  if (process.platform === "darwin") return [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  if (process.platform === "win32") return [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
}

async function canonicalChromeCandidates(candidates) {
  const canonical = new Set();
  for (const candidate of candidates) {
    try {
      canonical.add(await realpath(candidate));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return canonical;
}

async function resolveChromePath() {
  const candidates = chromeCandidates();
  const canonicalCandidates = await canonicalChromeCandidates(candidates);
  const override = process.env.TRAVEL_B3_CHROME_PATH?.trim();
  if (override) {
    let canonicalOverride;
    try {
      canonicalOverride = await realpath(override);
    } catch {
      throw new BrowserLaunchError("TRAVEL_B3_CHROME_PATH sólo acepta rutas allowlisted de Chrome/Chromium.");
    }
    if (!canonicalCandidates.has(canonicalOverride)) {
      throw new BrowserLaunchError("TRAVEL_B3_CHROME_PATH sólo acepta rutas allowlisted de Chrome/Chromium.");
    }
    return canonicalOverride;
  }
  for (const candidate of candidates) {
    try {
      return await realpath(candidate);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new BrowserLaunchError(`No se encontró Chrome en rutas allowlisted: ${candidates.join(", ") || "ninguna"}`);
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

function spawnOwned(command, args, options = {}, label = command) {
  let child;
  try {
    child = spawn(command, args, {
      cwd: ROOT,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
  } catch (error) {
    throw new BrowserLaunchError(`No se pudo iniciar ${label}: ${error?.code ?? error?.message ?? String(error)}`, error);
  }
  let output = "";
  const collect = (chunk) => { output = (output + chunk.toString()).slice(-20_000); };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  child.output = () => output;
  child.launchError = null;
  child.once("error", (error) => {
    child.launchError = new BrowserLaunchError(`No se pudo iniciar ${label}: ${error?.code ?? error?.message ?? String(error)}`, error);
  });
  children.push(child);
  return child;
}

async function stopOwned(child) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
  if (await Promise.race([exited.then(() => true), delay(5_000).then(() => false)])) return;
  try {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
  await Promise.race([exited, delay(5_000)]);
}

async function teardown() {
  let firstError;
  const clean = async (operation) => {
    try {
      await operation();
    } catch (error) {
      firstError ??= error;
    }
  };
  for (const child of [...children].reverse()) await clean(() => stopOwned(child));
  if (routeCreated) await clean(() => rm(routeDir, { recursive: true, force: true }));
  if (removeNextDev) await clean(() => rm(join(ROOT, ".next", "dev"), { recursive: true, force: true }));
  if (removeNext) await clean(() => rm(join(ROOT, ".next"), { recursive: true, force: true }));
  if (ownedRoot) await clean(() => rm(ownedRoot, { recursive: true, force: true }));
  if (firstError) throw firstError;
}

async function waitForHttp(url, child) {
  const deadline = Date.now() + DEADLINE_MS;
  let lastError = "sin respuesta";
  while (Date.now() < deadline) {
    if (child.launchError) throw child.launchError;
    if (child.exitCode !== null) throw new Error(`Next terminó antes de estar listo.\n${child.output()}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      await response.text();
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(100);
  }
  throw new Error(`Next no quedó listo: ${lastError}\n${child.output()}`);
}

async function waitForDevTools(profile, child) {
  const portFile = join(profile, "DevToolsActivePort");
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.launchError) throw child.launchError;
    if (child.exitCode !== null) throw new Error(`Chrome terminó antes de CDP.\n${child.output()}`);
    try {
      const [port] = (await readFile(portFile, "utf8")).trim().split("\n");
      if (/^\d+$/.test(port)) return Number(port);
    } catch {}
    await delay(100);
  }
  throw new Error("Chrome no expuso CDP.");
}

class Cdp {
  static async connect(url) {
    const socket = new WebSocket(url);
    await Promise.race([once(socket, "open"), delay(10_000).then(() => { throw new Error("CDP no abrió."); })]);
    return new Cdp(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveSend, rejectSend) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectSend(new Error(`Timeout CDP en ${method}`));
      }, 10_000);
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend, timer, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }

  close() { this.socket.close(); }
}

async function waitUntil(cdp, expression, label) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      if (await cdp.evaluate(expression)) return;
    } catch {}
    await delay(75);
  }
  throw new Error(`Timeout esperando ${label}.`);
}

async function pressTab(cdp) {
  const key = { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 };
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...key });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
}

async function pressSpace(cdp) {
  const key = { key: "Spacebar", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 };
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", text: " ", unmodifiedText: " ", ...key });
  await cdp.send("Input.dispatchKeyEvent", { type: "char", text: " ", unmodifiedText: " ", ...key });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
}

async function pressShiftTab(cdp) {
  const shift = { key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 };
  const tab = { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, modifiers: 8 };
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...shift });
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...tab });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...tab });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...shift });
}

async function pressEnter(cdp) {
  const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...key });
  await cdp.send("Input.dispatchKeyEvent", { type: "char", text: "\r", unmodifiedText: "\r", ...key });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
}

async function openTarget(cdpPort) {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about%3Ablank`, {
    method: "PUT",
    signal: AbortSignal.timeout(3_000),
  });
  assert.equal(response.ok, true);
  return response.json();
}

async function runViewport({ cdpPort, appUrl, width, height, mobile }) {
  const target = await openTarget(cdpPort);
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  const label = `${width}x${height}`;
  try {
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Log.enable")]);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width, height, screenWidth: width, screenHeight: height, deviceScaleFactor: 1, mobile,
    });
    await cdp.send("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    await cdp.send("Page.navigate", { url: appUrl });
    await waitUntil(cdp, 'document.querySelector("#travel-agent-human-confirmation") instanceof HTMLInputElement', `checkbox ${label}`);
    await waitUntil(cdp, 'document.querySelector("[data-b3-hydrated]")?.getAttribute("data-b3-hydrated") === "true"', `hidratación ${label}`);

    const layout = await cdp.evaluate(`(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      buttonDisabled: document.querySelector("button")?.disabled,
      status: document.body.textContent.includes("pending_confirmation"),
    }))()`);
    assert.equal(layout.status, true, `estado visible ${label}`);
    assert.equal(layout.buttonDisabled, true, `acción bloqueada ${label}`);
    assert.ok(layout.scrollWidth <= layout.clientWidth, `overflow horizontal ${label}: ${JSON.stringify(layout)}`);

    await cdp.evaluate("document.body.focus()");
    await pressTab(cdp);
    assert.equal(await cdp.evaluate('document.activeElement?.id'), "travel-agent-human-confirmation", `foco checkbox ${label}`);
    await pressSpace(cdp);
    await waitUntil(cdp, 'document.querySelector("#travel-agent-human-confirmation")?.checked === true', `confirmación por teclado ${label}`);
    await waitUntil(cdp, 'document.querySelector("button")?.disabled === false', `acción habilitada ${label}`);

    await pressTab(cdp);
    assert.equal(await cdp.evaluate('document.activeElement?.textContent?.trim()'), "Aplicar propuesta", `foco acción ${label}`);
    await pressEnter(cdp);
    await waitUntil(cdp, 'document.querySelector("[data-confirm-count]")?.textContent === "1"', `primera confirmación A ${label}`);
    assert.equal(await cdp.evaluate('document.querySelector("button")?.disabled'), true, `acción bloqueada tras envío A ${label}`);
    await pressEnter(cdp);
    assert.equal(await cdp.evaluate('document.querySelector("[data-confirm-count]")?.textContent'), "1", `no duplica callback A ${label}`);

    await pressTab(cdp);
    assert.equal(await cdp.evaluate('document.activeElement?.getAttribute("data-b3-replace-proposal")'), "true", `foco para sustituir B ${label}`);
    await pressEnter(cdp);
    await waitUntil(cdp, 'document.querySelector("[data-b3-proposal]")?.textContent === "B"', `propuesta B ${label}`);
    await waitUntil(cdp, 'document.querySelector("#travel-agent-human-confirmation")?.checked === false && document.querySelector("#travel-agent-human-confirmation")?.disabled === false', `reset de confirmación B ${label}`);
    assert.equal(await cdp.evaluate('document.querySelector("button")?.disabled'), true, `acción bloqueada para B ${label}`);
    assert.equal(await cdp.evaluate('document.querySelector("[data-confirm-count]")?.textContent'), "1", `B no reenvía callback de A ${label}`);

    await pressShiftTab(cdp);
    assert.equal(await cdp.evaluate('document.activeElement?.id'), "travel-agent-human-confirmation", `foco checkbox B ${label}`);
    await pressSpace(cdp);
    await waitUntil(cdp, 'document.querySelector("button")?.disabled === false', `acción B habilitada ${label}`);
    await pressTab(cdp);
    assert.equal(await cdp.evaluate('document.activeElement?.textContent?.trim()'), "Aplicar propuesta", `foco acción B ${label}`);
    await pressEnter(cdp);
    await waitUntil(cdp, 'document.querySelector("[data-confirm-count]")?.textContent === "2"', `confirmación B ${label}`);
    return `${label}: A y B requieren confirmación humana independiente por teclado`;
  } finally {
    try { await cdp.send("Page.close"); } catch {}
    cdp.close();
  }
}

async function writeFixture() {
  try {
    await mkdir(routeDir);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`Ruta temporal ya existe: ${routeDir}`);
    throw error;
  }
  routeCreated = true;
  await writeFile(pagePath, `"use client";\n\nimport { useEffect, useState } from "react";\nimport { TravelAgentConfirmation } from "@/components/travel-agent-confirmation";\n\nexport default function ConfirmationFixture() {\n  const [count, setCount] = useState(0);\n  const [proposal, setProposal] = useState("A");\n  const [hydrated, setHydrated] = useState(false);\n  useEffect(() => { setHydrated(true); }, []);\n  const result = proposal === "A" ? { status: "pending_confirmation", requiresHumanConfirmation: true, proposal: { requested_time: "09:30", notes: "Ajuste A sintético" } } : { status: "pending_confirmation", requiresHumanConfirmation: true, proposal: { requested_time: "10:45", notes: "Ajuste B sintético" } };\n  return <main data-b3-hydrated={hydrated ? "true" : "false"} className="grid gap-4 p-4"><TravelAgentConfirmation current={{ date: "2026-11-12", requested_time: "08:00", baggage: "Mochila", notes: "Base sintética" }} result={result} onConfirm={() => setCount((value) => value + 1)} /><button type="button" data-b3-replace-proposal onClick={() => setProposal("B")}>Sustituir propuesta</button><output data-b3-proposal>{proposal}</output><output data-confirm-count>{count}</output></main>;\n}\n`, "utf8");
}

async function recordTestServerPort(port) {
  const path = process.env.TRAVEL_B3_TEST_SERVER_PORT_FILE;
  if (path) await writeFile(path, `${port}\n`, { encoding: "utf8", flag: "wx" });
}

async function main() {
  const chromePath = await resolveChromePath();
  ownedRoot = await mkdtemp(join(tmpdir(), "travel-b3-browser-"));
  try {
    await stat(join(ROOT, ".next"));
    try {
      await stat(join(ROOT, ".next", "dev"));
    } catch (error) {
      if (error?.code === "ENOENT") removeNextDev = true;
      else throw error;
    }
  } catch (error) {
    if (error?.code === "ENOENT") removeNext = true;
    else throw error;
  }
  await writeFixture();
  const port = await freePort();
  await recordTestServerPort(port);
  const next = spawnOwned(process.execPath, [join(ROOT, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  const appUrl = `http://127.0.0.1:${port}/${ROUTE_SEGMENT}`;
  await waitForHttp(appUrl, next);

  const profile = join(ownedRoot, "chrome-profile");
  const chromeArgs = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "about:blank"];
  if (process.platform === "linux") chromeArgs.unshift("--no-sandbox");
  const chromeCommand = process.argv.includes("--travel-b3-test-force-chrome-eacces")
    ? (process.platform === "win32" ? "C:\\Windows" : "/")
    : chromePath;
  const chrome = spawnOwned(chromeCommand, chromeArgs, {}, "Chrome");
  const cdpPort = await waitForDevTools(profile, chrome);
  for (const viewport of [
    { width: 390, height: 844, mobile: true },
    { width: 1440, height: 900, mobile: false },
  ]) console.log(`✓ ${await runViewport({ cdpPort, appUrl, ...viewport })}`);
}

try {
  await main();
} finally {
  await teardown();
}
