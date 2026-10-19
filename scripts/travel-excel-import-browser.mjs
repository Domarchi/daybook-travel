import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, copyFile, symlink, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import writeXlsxFile from "write-excel-file/node";
import { PERSON_MATRIX, PREAMBLE_MATRIX, TRIP_MATRIX, FAKE_REQUEST_ID } from "./fixtures/travel-import-fake.ts";
import { dirname, join, resolve, isAbsolute } from "node:path";

const ROOT = process.cwd();
const DEADLINE_MS = 45_000;
const ROUTE_SEGMENT = "excel-import-test";

const children = [];
let ownedRoot;
let nextProcess;
let chromeProcess;

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
  const override = process.env.TRAVEL_IMPORT_CHROME_PATH?.trim();
  if (override) {
    let canonicalOverride;
    try {
      canonicalOverride = await realpath(override);
    } catch {
      throw new BrowserLaunchError("TRAVEL_IMPORT_CHROME_PATH sólo acepta rutas allowlisted de Chrome/Chromium.");
    }
    if (!canonicalCandidates.has(canonicalOverride)) {
      throw new BrowserLaunchError("TRAVEL_IMPORT_CHROME_PATH sólo acepta rutas allowlisted de Chrome/Chromium.");
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
  if (ownedRoot) {
    if (nextProcess) await clean(() => writeFile(join(ownedRoot, "next.log"), nextProcess.output()));
    if (chromeProcess) await clean(() => writeFile(join(ownedRoot, "chrome.log"), chromeProcess.output()));
  }
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
    this.onEvent = () => {};
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) { this.onEvent(message); return; }
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

async function openTarget(cdpPort) {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about%3Ablank`, {
    method: "PUT",
    signal: AbortSignal.timeout(3_000),
  });
  assert.equal(response.ok, true);
  return response.json();
}

const ui = label => `[aria-label=${JSON.stringify(label)}]`;
async function change(cdp, label, value) {
  const selector = ui(label);
  await cdp.evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el) throw new Error("Missing input"); const proto=el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true})); })()`);
  await delay(80);
}
async function click(cdp, text) {
  await cdp.evaluate(`(() => { const button=[...document.querySelectorAll("button")].find(el=>el.textContent.trim()===${JSON.stringify(text)}); if(!button) throw new Error("Missing button"); button.click(); })()`);
  await delay(80);
}
async function calls(cdp) { return cdp.evaluate('JSON.parse(document.querySelector("#fake-calls").textContent)'); }
async function runScenario({ cdpPort, appUrl, book, mixed, ai, width, height }) {
  const target = await openTarget(cdpPort);
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  const label = `${mixed ? "mixed" : "preamble"}-${ai ? "ai" : "manual"}-${width}`;
  const forbidden = [];
  try {
    await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
    cdp.onEvent = message => {
      if(message.method !== "Fetch.requestPaused") return;
      const {requestId,request} = message.params;
      if(new URL(request.url).origin === new URL(appUrl).origin) void cdp.send("Fetch.continueRequest",{requestId});
      else { forbidden.push(request.url); void cdp.send("Fetch.failRequest",{requestId,errorReason:"BlockedByClient"}); }
    };
    await cdp.send("Fetch.enable",{patterns:[{urlPattern:"*",requestStage:"Request"}]});
    await cdp.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<500});
    await cdp.send("Page.navigate", { url: appUrl });
    await waitUntil(cdp, 'Boolean(document.querySelector("[data-import-ready=true] input[type=file]"))', "panel real hidratado");
    const dom = await cdp.send("DOM.getDocument");
    const {nodeId} = await cdp.send("DOM.querySelector",{nodeId:dom.root.nodeId,selector:'input[type="file"]'});
    await cdp.send("DOM.setFileInputFiles",{nodeId,files:[book]});
    await waitUntil(cdp, `Boolean(document.querySelector('[aria-label="Fila de encabezados"]'))`, "hojas del Excel real");
    assert.deepEqual(await calls(cdp),[]);
    await click(cdp,"Interpretar columnas con IA"); assert.deepEqual(await calls(cdp),[]);
    if(mixed) {
      await change(cdp,"Tipo de información","people");
      assert.equal(await cdp.evaluate(`document.querySelector(${JSON.stringify(ui("Etiqueta 2"))}).value`),"nombreCompleto");
      await change(cdp,"Tipo de información","trips");
      assert.equal(await cdp.evaluate(`document.querySelector(${JSON.stringify(ui("Etiqueta 2"))}).value`),"Fecha");
    }
    await change(cdp,"Fila de encabezados",mixed ? "1" : "2");
    await click(cdp,"Interpretar columnas con IA"); assert.deepEqual(await calls(cdp),[]);
    await change(cdp,"Etiqueta 1","Código trabajador");
    const reviewScreenshot = await cdp.send("Page.captureScreenshot",{format:"png"});
    await writeFile(join(ownedRoot,`${label}-review.png`),Buffer.from(reviewScreenshot.data,"base64"));
    if(ai) {
      await cdp.evaluate(`document.querySelector('[aria-label="Confirmar encabezados"]').click()`);
      await click(cdp,"Interpretar columnas con IA");
      await waitUntil(cdp,'document.body.textContent.includes("Interpretación lista")',"respuesta IA falsa");
      const expected = {schema:"travel-import-map-v1",entity:mixed ? "trips":"people",headers:mixed ? ["Código trabajador","Fecha","Dirección","Desde","Hasta"]:["Código trabajador","Trabajador","Desde","Hasta","Inicio"],samples:[mixed ? ["XXX-9","9999-99-99","Xxxxxx","Xxxxxxxx","Xxxxxx"]:["XXX-9","Xxxxxxx Xxxxxxxxx","Xxxxxxxx","Xxxxxx","9999-99-99"]]};
      assert.deepEqual(await calls(cdp),[{name:"request_trip_import_mapping",args:{p_request:expected}},{name:"get_trip_ai_request",args:{p_id:FAKE_REQUEST_ID}}]);
      // Editing invalidates confirmation and proposal; request fresh approval.
      await change(cdp,"Etiqueta 1","Código");
      assert.equal(await cdp.evaluate(`document.querySelector('[aria-label="Confirmar encabezados"]').checked`),false);
      assert.equal(await cdp.evaluate(`document.querySelector('[aria-label="Mapeo Código"]').value`),"");
      await click(cdp,"Interpretar columnas con IA"); assert.equal((await calls(cdp)).length,2);
      await cdp.evaluate(`document.querySelector('[aria-label="Confirmar encabezados"]').click()`);
      await click(cdp,"Interpretar columnas con IA");
      await waitUntil(cdp,'document.body.textContent.includes("Interpretación lista")',"segunda respuesta IA falsa");
    } else {
      const mapping = mixed ? {"Código trabajador":"codigoPersona",Fecha:"fechaViaje",Dirección:"sentido",Desde:"origen",Hasta:"destino"} : {"Código trabajador":"codigoPersona",Trabajador:"nombreCompleto",Desde:"origen",Hasta:"destino",Inicio:"fechaInicio"};
      for(const [header,field] of Object.entries(mapping)) await change(cdp,`Mapeo ${header}`,field);
      assert.deepEqual(await calls(cdp),[]);
    }
    await click(cdp,"Revisar con este mapeo");
    await waitUntil(cdp,'document.body.textContent.includes("Revisión local completada")',"preview");
    assert.equal(await cdp.evaluate('document.body.textContent.includes("Persona Sintética")'),true);
    if(mixed) assert.equal(await cdp.evaluate('document.body.textContent.includes("Viaje")'),true);
    const previewScreenshot = await cdp.send("Page.captureScreenshot",{format:"png"});
    await writeFile(join(ownedRoot,`${label}-preview.png`),Buffer.from(previewScreenshot.data,"base64"));
    await click(cdp, mixed ? "Aplicar 2 cambios":"Aplicar 1 cambio");
    await waitUntil(cdp,'document.querySelector("#fake-applied").textContent === "1"',"aplicación fake");
    const observed = await calls(cdp); const apply = observed.at(-1);
    assert.equal(apply.name,"sync_excel_batch");
    assert.equal(apply.args.p_payload.people.length,1); assert.equal(apply.args.p_payload.trips.length,mixed ? 1:0);
    assert.equal(apply.args.p_payload.people[0].employee_code,"SYN-1");
    assert.equal(apply.args.p_payload.people[0].row_number,mixed ? 2:3);
    if(mixed) assert.equal(apply.args.p_payload.trips[0].person_employee_code,"SYN-1");
    assert.deepEqual(forbidden,[],"unexpected external network");
    await writeFile(join(ownedRoot,`${label}.json`),JSON.stringify({label,calls:observed,forbidden},null,2));
    const screenshot = await cdp.send("Page.captureScreenshot",{format:"png"});
    await writeFile(join(ownedRoot,`${label}.png`),Buffer.from(screenshot.data,"base64"));
    return `${label}: Excel → fila → renombrado → ${ai ? "confirmación IA":"manual sin RPC"} → preview → apply fake`;
  } finally { try { await cdp.send("Page.close"); } catch {} cdp.close(); }
}

async function runPaginationScenario({ cdpPort, appUrl, width, height }) {
  const target = await openTarget(cdpPort);
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  const label = `pagination-${width}`;
  const forbidden = [];
  try {
    await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
    cdp.onEvent = message => {
      if (message.method !== "Fetch.requestPaused") return;
      const { requestId, request } = message.params;
      if (new URL(request.url).origin === new URL(appUrl).origin) void cdp.send("Fetch.continueRequest", { requestId });
      else { forbidden.push(request.url); void cdp.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }); }
    };
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await cdp.send("Page.navigate", { url: appUrl });
    await waitUntil(cdp, 'Boolean(document.querySelector("[data-import-ready=true] input[type=file]"))', "pagination fixture hydrated");
    async function load(book) {
      const dom = await cdp.send("DOM.getDocument");
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: dom.root.nodeId, selector: 'input[type="file"]' });
      await cdp.send("DOM.setFileInputFiles", { nodeId, files: [join(ownedRoot, book)] });
      await waitUntil(cdp, `Boolean(document.querySelector('[aria-label="Fila de encabezados"]'))`, "pagination workbook loaded");
      await click(cdp, "Revisar con este mapeo");
      await waitUntil(cdp, 'document.body.textContent.includes("Revisión local completada")', "pagination preview ready");
    }
    const regionText = id => cdp.evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`);
    const countChildren = id => cdp.evaluate(`document.getElementById(${JSON.stringify(id)}).children.length`);
    const disabled = name => cdp.evaluate(`document.querySelector(${JSON.stringify(ui(name))}).disabled`);
    async function nextByKeyboard(name) {
      await cdp.evaluate(`document.querySelector(${JSON.stringify(ui(name))}).focus()`);
      assert.equal(await cdp.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(ui(name))})`), true, "pager must receive keyboard focus");
      // Match the native Enter sequence used by browser-login.mjs, including keypress.
      const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
      await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...key });
      await cdp.send("Input.dispatchKeyEvent", { type: "char", text: "\r", unmodifiedText: "\r", ...key });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
      await delay(80);
    }
    async function assertResultVisible(id) {
      assert.deepEqual(await cdp.evaluate(`(() => { const region=document.getElementById(${JSON.stringify(id)}); const box=region.firstElementChild.getBoundingClientRect(); return {focused:document.activeElement===region,visible:box.top>=0 && box.top<innerHeight && box.bottom>0}; })()`),
        { focused: true, visible: true }, "page result must receive focus and be visible");
    }
    await load("pagination-valid.xlsx");
    assert.equal(await countChildren("excel-preview-rows"), 50);
    assert.equal((await regionText("excel-preview-rows")).includes("SYN-PAGE-051"), false);
    assert.equal(await disabled("Filas anteriores"), true);
    await nextByKeyboard("Filas siguientes");
    assert.equal(await countChildren("excel-preview-rows"), 1);
    assert.equal((await regionText("excel-preview-rows")).includes("SYN-PAGE-051"), true);
    await assertResultVisible("excel-preview-rows");
    assert.equal(await disabled("Filas siguientes"), true);
    assert.deepEqual(await cdp.evaluate(`(() => { const button=document.querySelector('[aria-label="Filas anteriores"]'); const status=document.getElementById('excel-preview-page-status'); return {controls:button.getAttribute('aria-controls'),role:status.getAttribute('role'),live:status.getAttribute('aria-live')}; })()`),
      { controls: "excel-preview-rows", role: "status", live: "polite" });
    assert.deepEqual(await calls(cdp), []);
    const rowsImage = await cdp.send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(ownedRoot, `${label}-last-row.png`), Buffer.from(rowsImage.data, "base64"));
    await click(cdp, "Cambiar archivo");
    await load("pagination-valid.xlsx");
    assert.equal(await disabled("Filas anteriores"), true);
    assert.equal(await countChildren("excel-preview-rows"), 50);
    assert.equal((await regionText("excel-preview-rows")).includes("SYN-PAGE-001"), true);
    await nextByKeyboard("Filas siguientes");
    await click(cdp, "Aplicar 51 cambios");
    await waitUntil(cdp, 'document.querySelector("#fake-applied").textContent === "1"', "pagination fake applied once");
    const applied = await calls(cdp);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].name, "sync_excel_batch");
    assert.equal(applied[0].args.p_payload.people.length, 51);
    assert.deepEqual(applied[0].args.p_payload.people.map(row => row.employee_code), Array.from({ length: 51 }, (_, index) => `SYN-PAGE-${String(index + 1).padStart(3, "0")}`));
    await click(cdp, "Revisar otro libro");
    await load("pagination-issues.xlsx");
    assert.equal(await countChildren("excel-issues-list"), 12);
    assert.equal((await regionText("excel-issues-list")).includes("fila 14"), false);
    await nextByKeyboard("Observaciones siguientes");
    assert.equal(await countChildren("excel-issues-list"), 1);
    assert.equal((await regionText("excel-issues-list")).includes("fila 14"), true);
    await assertResultVisible("excel-issues-list");
    assert.equal(await disabled("Observaciones siguientes"), true);
    assert.equal(await cdp.evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Corrige el archivo para continuar').disabled`), true);
    await click(cdp, "Corrige el archivo para continuar");
    const issuesImage = await cdp.send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(ownedRoot, `${label}-last-observation.png`), Buffer.from(issuesImage.data, "base64"));
    await click(cdp, "Cambiar archivo");
    await load("pagination-issues.xlsx");
    assert.equal(await disabled("Observaciones anteriores"), true);
    assert.equal(await countChildren("excel-issues-list"), 12);
    assert.equal((await regionText("excel-issues-list")).includes("fila 14"), false);
    assert.deepEqual(await calls(cdp), applied, "paging/reset/error must not request AI or retry apply");
    assert.deepEqual(forbidden, []);
    await writeFile(join(ownedRoot, `${label}.json`), JSON.stringify({ label, rows: 51, observations: 13, keyboard: true, reset: true, calls: applied, forbidden }, null, 2));
    return `${label}: 51 rows / 13 observations → keyboard → last items → reset → full payload / explicit apply fake`;
  } finally { try { await cdp.send("Page.close"); } catch {} cdp.close(); }
}

const UNICODE_CASES = [
  { name: "high", header: "\ud800", valid: false },
  { name: "low", header: "\udc00", valid: false },
  { name: "mixed-high", header: "Columna\ud800texto", valid: false },
  { name: "mixed-low", header: "Columna\udc00texto", valid: false },
  { name: "reversed", header: "\udc00\ud800", valid: false },
  { name: "emoji-pair", header: "\ud83d\ude00", valid: true },
  { name: "emoji-20-80bytes", header: "😀".repeat(20), valid: true },
  { name: "emoji-21-overflow", header: "😀".repeat(21), valid: false },
];

async function runUnicodeCase({ cdpPort, appUrl, book, width, height, name, header, valid }) {
  const label = `unicode-${name}-${width}`;
  const result = { label, name, width, header, valid, pass: false, stage: "bootstrap", forbidden: [] };
  let cdp;
  try {
    const target = await openTarget(cdpPort);
    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
    cdp.onEvent = message => {
      if (message.method !== "Fetch.requestPaused") return;
      const { requestId, request } = message.params;
      if (new URL(request.url).origin === new URL(appUrl).origin) void cdp.send("Fetch.continueRequest", { requestId });
      else { result.forbidden.push(request.url); void cdp.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }); }
    };
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await cdp.send("Page.navigate", { url: appUrl });
    await waitUntil(cdp, 'Boolean(document.querySelector("[data-import-ready=true] input[type=file]"))', "panel Unicode hidratado");
    const dom = await cdp.send("DOM.getDocument");
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: dom.root.nodeId, selector: 'input[type="file"]' });
    await cdp.send("DOM.setFileInputFiles", { nodeId, files: [book] });
    await waitUntil(cdp, `Boolean(document.querySelector('[aria-label="Fila de encabezados"]'))`, "hojas Unicode del Excel real");
    result.before = await calls(cdp);
    result.stage = "events";
    await change(cdp, "Etiqueta 1", header);
    await change(cdp, "Fila de encabezados", "2");
    // Row selection restores source labels. Review the same renamed label again.
    await change(cdp, "Etiqueta 1", header);
    result.input = await cdp.evaluate(`document.querySelector('[aria-label="Etiqueta 1"]').value`);
    await cdp.evaluate(`document.querySelector('[aria-label="Confirmar encabezados"]').click()`);
    result.controls = await cdp.evaluate(`(() => { const checkbox=document.querySelector('[aria-label="Confirmar encabezados"]'); const button=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Interpretar columnas con IA'); return { confirmationDisabled:checkbox.disabled, checked:checkbox.checked, aiDisabled:button.disabled }; })()`);
    await click(cdp, "Interpretar columnas con IA");
    if (valid) await waitUntil(cdp, 'document.body.textContent.includes("Interpretación lista")', "respuesta Unicode IA falsa");
    result.calls = await calls(cdp);
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(ownedRoot, `${label}.png`), Buffer.from(screenshot.data, "base64"));
    assert.equal(result.input, header, "input must retain exact UTF-16 code units");
    assert.deepEqual(result.before, []);
    assert.deepEqual(result.forbidden, [], "unexpected external network");
    result.stage = "behavioral assertions";
    if (!valid) {
      assert.deepEqual({ controls: result.controls, calls: result.calls }, { controls: { confirmationDisabled: true, checked: false, aiDisabled: true }, calls: [] });
    } else {
      assert.deepEqual(result.controls, { confirmationDisabled: false, checked: true, aiDisabled: false });
      const expected = { schema: "travel-import-map-v1", entity: "people", headers: [header, "Trabajador", "Desde", "Hasta", "Inicio"], samples: [["XXX-9", "Xxxxxxx Xxxxxxxxx", "Xxxxxxxx", "Xxxxxx", "9999-99-99"]] };
      assert.deepEqual(result.calls, [{ name: "request_trip_import_mapping", args: { p_request: expected } }, { name: "get_trip_ai_request", args: { p_id: FAKE_REQUEST_ID } }], "valid pairs must reach the fake unchanged, without replacement");
    }
    result.pass = true;
  } catch (error) {
    result.failureKind = result.stage === "behavioral assertions" && error.name === "AssertionError" ? "behavioral" : "harness";
    result.error = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    if (cdp) { try { await cdp.send("Page.close"); } catch {} cdp.close(); }
    await writeFile(join(ownedRoot, `${label}.json`), JSON.stringify(result, null, 2));
  }
  return result;
}

async function prepareFixture() {
  const project = join(ownedRoot,"project");
  const sources = ["app/excel-sync-panel.tsx","app/globals.css","postcss.config.mjs",
    "lib/excel-sync.ts","lib/travel-ai-queue.ts","lib/types.ts","lib/utils.ts","lib/format.ts","lib/calendar.ts","lib/brand.ts",
    "components/ui/button.tsx","components/ui/section-kicker.tsx","components/ui/table-wrap.tsx","components/ui/data-table.tsx",
    "scripts/fixtures/travel-import-fake.ts"];
  const manifest = [];
  for(const source of sources) {
    const content = await readFile(join(ROOT,source));
    manifest.push({source,sha256:createHash("sha256").update(content).digest("hex")});
    const destination = join(project,source); await mkdir(dirname(destination),{recursive:true}); await writeFile(destination,content);
  }
  const route = join(project,"app",ROUTE_SEGMENT); await mkdir(route,{recursive:true});
  await copyFile(join(ROOT,"scripts/fixtures/excel-import-page.tsx"),join(route,"page.tsx"));
  // Even a missing injection fails locally; credentials and production env files
  // are never copied or loaded by this isolated fixture project.
  await writeFile(join(project,"lib/supabase.ts"),'export function db(): { rpc(name: string, args: Record<string, unknown>): Promise<{data: unknown; error: {message?: string} | null}> } { throw new Error("REAL DATABASE FORBIDDEN IN IMPORT FIXTURE"); }\n');
  await writeFile(join(project,"app/layout.tsx"),'import "./globals.css"; export default function Layout({children}:{children: React.ReactNode}) { return <html lang="es"><body>{children}</body></html>; }\n');
  await writeFile(join(project,"package.json"),JSON.stringify({name:"travel-import-browser-fixture",private:true,type:"module",dependencies:{next:"16.3.6",react:"19.2.8","react-dom":"19.2.8",typescript:"7.0.2"}}));
  await writeFile(join(project,"tsconfig.json"),JSON.stringify({compilerOptions:{target:"ES2017",lib:["dom","esnext"],skipLibCheck:true,noEmit:true,module:"esnext",moduleResolution:"bundler",jsx:"react-jsx",allowImportingTsExtensions:true,esModuleInterop:true,paths:{"@/*":["./*"]}}}));
  await writeFile(join(project,"next-env.d.ts"),'/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n');
  await symlink(join(ROOT,"node_modules"),join(project,"node_modules"),"dir");
  await writeFile(join(ownedRoot,"sources.json"),JSON.stringify(manifest,null,2));
  const paginationRows = Array.from({ length: 51 }, (_, index) => [
    `SYN-PAGE-${String(index + 1).padStart(3, "0")}`, `Persona sintética SYN-PAGE-${String(index + 1).padStart(3, "0")}`, ...PERSON_MATRIX[1].slice(2),
  ]);
  const paginationIssues = paginationRows.slice(0, 13).map(row => [row[0], "", ...row.slice(2)]);
  for(const [name,matrices,names] of [["preamble",[PREAMBLE_MATRIX],["Personas"]],["mixed",[PERSON_MATRIX,TRIP_MATRIX],["Personas","Viajes"]],
    ["pagination-valid",[[PERSON_MATRIX[0], ...paginationRows]],["Personas"]], ["pagination-issues",[[PERSON_MATRIX[0], ...paginationIssues]],["Personas"]]]) {
    await writeXlsxFile(matrices.map(matrix=>matrix.map(row=>row.map(value=>({value,type:String})))),{sheets:names,filePath:join(ownedRoot,`${name}.xlsx`)});
  }
  return project;
}

async function main() {
  assert.ok(process.version.startsWith("v24."),"Use Node24 explícito");
  const artifacts = process.env.TRAVEL_IMPORT_ARTIFACTS;
  assert.ok(artifacts && isAbsolute(artifacts),"TRAVEL_IMPORT_ARTIFACTS debe ser directorio absoluto escribible de recibos");
  ownedRoot = await mkdtemp(join(artifacts,"browser-import-"));
  console.log(`Evidencia sintética: ${ownedRoot}`);
  const project = await prepareFixture();
  if(process.argv.includes("--prepare-only")) { console.log("PREPARED ONLY: browser/Next NOT RUN"); return; }
  const chromePath = await resolveChromePath(); const port = await freePort();
  const safeEnv = {PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,NEXT_TELEMETRY_DISABLED:"1",NODE_ENV:"development"};
  nextProcess = spawnOwned(process.execPath,[join(ROOT,"node_modules/next/dist/bin/next"),"dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{cwd:project,env:safeEnv});
  const appUrl = `http://127.0.0.1:${port}/${ROUTE_SEGMENT}`; await waitForHttp(appUrl,nextProcess);
  const profile = join(ownedRoot,"chrome-profile");
  chromeProcess = spawnOwned(chromePath,["--headless=new","--remote-debugging-address=127.0.0.1","--remote-debugging-port=0",`--user-data-dir=${profile}`,"--no-first-run","--no-default-browser-check","--disable-background-networking","about:blank"],{env:safeEnv},"Chrome");
  const cdpPort = await waitForDevTools(profile,chromeProcess);
  if (process.argv.includes("--pagination-only")) {
    for (const viewport of [{width:390,height:844},{width:1440,height:900}]) {
      console.log(`✓ ${await runPaginationScenario({cdpPort,appUrl,...viewport})}`);
    }
    return;
  }
  const unicodeResults = [];
  // Collect every malformed case and every control before raising a product failure.
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    for (const vector of UNICODE_CASES) {
      const result = await runUnicodeCase({ cdpPort, appUrl, book: join(ownedRoot, "preamble.xlsx"), ...viewport, ...vector });
      unicodeResults.push(result);
      console.log(`${result.pass ? "✓" : "✗"} ${result.label}`);
    }
  }
  await writeFile(join(ownedRoot, "unicode-results.json"), JSON.stringify({ cases: unicodeResults.length, pass: unicodeResults.filter(result => result.pass).length, fail: unicodeResults.filter(result => !result.pass).length, results: unicodeResults }, null, 2));
  if (!process.argv.includes("--unicode-only")) {
  for(const viewport of [{width:390,height:844},{width:1440,height:900}]) {
    for(const mixed of [false,true]) for(const ai of [false,true]) console.log(`✓ ${await runScenario({cdpPort,appUrl,book:join(ownedRoot,`${mixed ? "mixed":"preamble"}.xlsx`),mixed,ai,...viewport})}`);
    console.log(`✓ ${await runPaginationScenario({cdpPort,appUrl,...viewport})}`);
  }
  }
  assert.equal(unicodeResults.filter(result => !result.pass).length, 0, "Unicode browser cases failed; all controls and cases saved in unicode-results.json");
}

try {
  await main();
} finally {
  await teardown();
}
