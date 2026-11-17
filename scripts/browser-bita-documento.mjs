// Bita lee un documento, en un navegador de verdad y con la app real.
//
// El panel de Bita con preguntas necesita una cuenta, y la demostración no la
// tiene, así que aquí hay dos servidores falsos en la misma máquina:
//   - una Supabase mínima (sesión, lectura de tablas, el contador de mensajes y la
//     inserción de viajes con la misma regla de PostgREST: `ignoreDuplicates` salta
//     lo que ya existe y la vigencia de la ficha la valida «la base»);
//   - un Anthropic que responde `proponer_viajes` según el texto que recibe, y que
//     guarda lo que recibió para comprobar que nada identificable salió.
// La app es la de verdad (`next dev`), con los clics del mouse del navegador.
//
// Recorre: adjuntar un Excel, ver la propuesta, elegir, un fallo al crear y el
// reintento, crear, cerrar y abrir el panel, un archivo que no sirve, Word y PDF, y
// el teléfono de 390 px en modo oscuro.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Cdp, delay, openTarget, startBrowser, teardown, waitUntil } from "./browser-login.mjs";
import { crearAnthropic, crearSupabase, excel, mas, pdf, word } from "./bita-simulados.mjs";

const CAPTURAS = process.env.BITA_CAPTURAS || null;

// ── Navegador ──────────────────────────────────────────────────────────────
async function clicReal(cdp, expresion) {
  const [x, y] = await cdp.evaluate(`(() => { const el = ${expresion}; if (!el) return null; el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`).then((v) => {
    if (!v) throw new Error(`No hay elemento para ${expresion}`);
    return v;
  });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}
const boton = (texto, dentro = "document") =>
  `[...${dentro}.querySelectorAll("button")].find((b) => b.textContent.replace(/\\s+/g, " ").trim().includes(${JSON.stringify(texto)}))`;
const PANEL = `document.querySelector('[role=dialog][aria-label^="Bita"]')`;
const BOTON_BITA = `document.querySelector('button[aria-label="Abrir el chat con Bita"]')`;

async function escribir(cdp, selector, texto) {
  await clicReal(cdp, `document.querySelector(${JSON.stringify(selector)})`);
  await cdp.send("Input.insertText", { text: texto });
}

async function adjuntar(cdp, ruta) {
  const { root } = await cdp.send("DOM.getDocument", { depth: 1 });
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "input[data-bita-archivo]" });
  assert.ok(nodeId, "no hay selector de archivos");
  await cdp.send("DOM.setFileInputFiles", { files: [ruta], nodeId });
}

async function captura(cdp, nombre) {
  if (!CAPTURAS) return;
  await mkdir(CAPTURAS, { recursive: true });
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(CAPTURAS, `${nombre}.png`), Buffer.from(data, "base64"));
}

async function conectar(cdpPort, { ancho, alto, movil, oscuro = false }) {
  const objetivo = await openTarget(cdpPort);
  const cdp = await Cdp.connect(objetivo.webSocketDebuggerUrl);
  const errores = [];
  cdp.onEvent(({ method, params }) => {
    if (method === "Runtime.exceptionThrown") errores.push(`excepción: ${params.exceptionDetails.exception?.description ?? params.exceptionDetails.text}`);
    if (method === "Log.entryAdded" && params.entry.level === "error") errores.push(`${params.entry.source}: ${params.entry.text} ${params.entry.url ?? ""}`);
  });
  await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Log.enable"), cdp.send("DOM.enable")]);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto, screenWidth: ancho, screenHeight: alto, deviceScaleFactor: 1, mobile: movil });
  await cdp.send("Emulation.setTouchEmulationEnabled", movil ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  if (oscuro) await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  return { cdp, errores };
}

async function entrar(cdp, appUrl) {
  await cdp.send("Page.navigate", { url: appUrl });
  // La sesión queda en el navegador: una pestaña nueva puede entrar directo a la agenda.
  await waitUntil(cdp, `!!document.querySelector('input[name="email"]') || !!document.querySelector("main h1")?.textContent.includes("Agenda")`, "el formulario de entrada o la agenda", 120_000);
  if (await cdp.evaluate(`!!document.querySelector('input[name="email"]')`)) {
    await escribir(cdp, 'input[name="email"]', "katy@fcc.test");
    await escribir(cdp, 'input[name="password"]', "clave-de-prueba-123");
    await clicReal(cdp, boton("Entrar", "document"));
  }
  await waitUntil(cdp, `document.querySelector("main h1")?.textContent.includes("Agenda")`, "la agenda tras entrar", 60_000);
}

const textoDelPanel = (cdp) => cdp.evaluate(`${PANEL}?.innerText ?? ""`);
const normalizado = (t) => t.replace(/\s+/g, " ");

// ── Recorridos ─────────────────────────────────────────────────────────────
async function escritorio({ cdpPort, appUrl, supabase, anthropic, carpeta }) {
  const { cdp, errores } = await conectar(cdpPort, { ancho: 1440, alto: 900, movil: false });
  try {
    await entrar(cdp, appUrl);
    await waitUntil(cdp, `!!${BOTON_BITA}`, "el botón de Bita");
    await clicReal(cdp, BOTON_BITA);
    await waitUntil(cdp, `!!${PANEL}?.querySelector("textarea")`, "el panel con preguntas");

    // El contador de mensajes ya no está y el documento se ofrece con su aviso de privacidad.
    let panel = normalizado(await textoDelPanel(cdp));
    assert.ok(!/Te quedan/.test(panel), "sin el contador de mensajes");
    assert.match(panel, /Planificar vuelos desde un documento/);
    assert.match(panel, /cambio los nombres por seudónimos y quito RUT, correos, teléfonos, reservas, vuelos y montos/);
    await captura(cdp, "1-panel-con-documento");

    // Un archivo que no sirve: no se sube, y un .xlsx dañado no gasta ningún mensaje.
    const foto = join(carpeta, "foto.png");
    await writeFile(foto, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    await adjuntar(cdp, foto);
    await waitUntil(cdp, `${PANEL}.querySelector('[role=alert]')?.textContent.includes("Excel (.xlsx), Word (.docx) y PDF")`, "el aviso de formato");
    const roto = join(carpeta, "roto.xlsx");
    await writeFile(roto, new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]));
    await adjuntar(cdp, roto);
    await waitUntil(cdp, `${PANEL}.querySelector('[role=alert]')?.textContent.includes("No pude leer el archivo")`, "el aviso de archivo dañado");
    assert.equal(supabase.estado.usados, 0, "un archivo que no se pudo leer no gasta mensajes");
    assert.equal(anthropic.recibido.length, 0, "ni llega al modelo");
    assert.ok(!/roto\.xlsx/.test(await textoDelPanel(cdp)), "el archivo dañado sale de la conversación");

    // El Excel de verdad.
    await adjuntar(cdp, await excel(carpeta));
    await waitUntil(cdp, `!!${PANEL}.querySelector('[aria-label="Viajes encontrados en el documento"]')`, "la propuesta", 60_000);
    panel = normalizado(await textoDelPanel(cdp));
    assert.match(panel, /manifiesto\.xlsx/);
    assert.match(panel, /Excel · 2 viajes nuevos · 1 ya en la agenda · 3 con problemas/);
    assert.match(panel, /Juan Pérez Soto/);
    assert.match(panel, /Ya está en la agenda/);
    assert.match(panel, /La fecha ya pasó/);
    assert.match(panel, /Fuera de la vigencia de la ficha/);
    assert.match(panel, /La persona está inactiva/);
    assert.match(panel, /No pude identificar Carlos Díaz Mena: No tiene ficha en Travel/);
    assert.match(panel, /Crear 2 viajes/);
    assert.equal(supabase.estado.usados, 1, "el documento cuenta como un mensaje");
    // La propuesta se ve desde su encabezado, no desde sus botones.
    const visible = await cdp.evaluate(`(() => { const t = [...${PANEL}.querySelectorAll("p")].find((p) => p.textContent === "manifiesto.xlsx").getBoundingClientRect(); const l = ${PANEL}.querySelector("[role=log]").getBoundingClientRect(); return t.top >= l.top && t.bottom <= l.bottom; })()`);
    assert.equal(visible, true, "el encabezado de la propuesta está a la vista");
    await captura(cdp, "2-propuesta-escritorio");

    // Lo que salió hacia Anthropic: nada identificable.
    assert.equal(anthropic.recibido.length, 1);
    const enviado = JSON.stringify(anthropic.recibido[0]);
    for (const dato of ["Ana", "Rojas", "Juan", "Pérez", "Luis", "Vega", "Pedro", "Olmos", "Carlos", "Mena", "12.345.678", "9.876.543", "juan.perez", "8765 4321", "LA123", "H2 4567", "LA 801", "DJVHQQ", "XYZ987", "QWE456", "85000", "90000", "70000", "E-100"])
      assert.ok(!enviado.includes(dato), `«${dato}» salió hacia el modelo`);
    assert.deepEqual(anthropic.recibido[0].tool_choice, { type: "tool", name: "proponer_viajes" });
    assert.deepEqual(anthropic.recibido[0].thinking, { type: "disabled" });

    // Elegir con clics: quitar uno, quitar todos, elegir todos.
    const casilla = (i) => `${PANEL}.querySelectorAll('[aria-label="Viajes encontrados en el documento"] input[type=checkbox]')[${i}]`;
    assert.equal(await cdp.evaluate(`${casilla(0)}.checked && ${casilla(1)}.checked`), true, "los nuevos vienen elegidos");
    const registro = `${PANEL}.querySelector("[role=log]")`;
    // Marcar una casilla no mueve la conversación.
    // (clicReal centra la casilla antes de pulsar y eso mueve el registro: se mide después de centrarla.)
    await cdp.evaluate(`${casilla(1)}.scrollIntoView({ block: "center", behavior: "instant" })`);
    const antes = await cdp.evaluate(`${registro}.scrollTop`);
    await clicReal(cdp, casilla(1));
    await waitUntil(cdp, `${PANEL}.innerText.includes("Crear 1 viaje")`, "un viaje menos");
    assert.equal(await cdp.evaluate(`${registro}.scrollTop`), antes, "marcar una casilla no desplaza la conversación");
    await clicReal(cdp, boton("Elegir todos", PANEL));
    await waitUntil(cdp, `${PANEL}.innerText.includes("Crear 2 viajes") && !!${boton("Quitar todos", PANEL)}`, "todos elegidos");
    await clicReal(cdp, boton("Quitar todos", PANEL));
    await waitUntil(cdp, `${PANEL}.innerText.includes("Elige al menos un viaje") && ${boton("Elige al menos un viaje", PANEL)}.disabled`, "ninguno elegido");
    await clicReal(cdp, boton("Elegir todos", PANEL));
    await waitUntil(cdp, `${PANEL}.innerText.includes("Crear 2 viajes")`, "todos elegidos otra vez");

    // Un fallo de la base: se dice, la propuesta sigue y nada se creó.
    supabase.estado.fallarProxima = true;
    await clicReal(cdp, boton("Crear 2 viajes", PANEL));
    await waitUntil(cdp, `!!${PANEL}.querySelector('[aria-label="Viajes encontrados en el documento"]') && !!${PANEL}.querySelector('[role=alert]')`, "el aviso del fallo y la propuesta intacta");
    assert.equal(supabase.estado.viajes.length, 1, "nada se creó");
    assert.match(await textoDelPanel(cdp), /Crear 2 viajes/);
    assert.equal(await cdp.evaluate(`document.activeElement === ${PANEL}.querySelector("[role=alert]")`), true, "el foco pasa al aviso, que queda a la vista");
    await captura(cdp, "3-fallo-al-crear");

    // El reintento crea, por la misma vía que «Planificar turnos».
    await clicReal(cdp, boton("Crear 2 viajes", PANEL));
    await waitUntil(cdp, `${PANEL}.innerText.includes("Listo: 2 viajes planificados.")`, "los viajes creados");
    assert.equal(await cdp.evaluate(`${PANEL}.querySelector("[role=alert]")`), null, "el aviso del fallo se fue al crear");
    const intento = supabase.estado.inserciones.at(-1);
    assert.equal(intento.conflicto, "person_id,date,direction");
    assert.match(intento.prefer, /resolution=ignore-duplicates/);
    assert.deepEqual(
      intento.filas.map((f) => [f.person_id, f.date, f.direction, f.origin, f.destination, f.requested_time, f.status, f.pnr, f.flight, f.amount, f.baggage, f.notes]),
      [
        ["p-juan", mas(8), "SUBIDA", "Santiago", "Copiapó", "07:15", "Planificado", "", "", null, "Mochila", "Planificado desde «manifiesto.xlsx» con Bita."],
        ["p-juan", mas(9), "BAJADA", "Copiapó", "Santiago", "18:40", "Planificado", "", "", null, "Mochila", "Planificado desde «manifiesto.xlsx» con Bita."],
      ],
    );
    assert.equal(supabase.estado.viajes.length, 3);
    assert.ok(supabase.estado.consultasDeViajes >= 2, "la pantalla recargó los viajes");
    assert.equal(await cdp.evaluate(`!${boton("Crear", PANEL)}`), true, "ya no hay botón para crear");
    assert.equal(await cdp.evaluate(`${PANEL}.contains(document.activeElement) && document.activeElement.getAttribute("role") === "status"`), true, "el foco queda en el resultado, dentro del panel");
    await captura(cdp, "4-creados");

    // Cerrar y abrir el panel no devuelve la propuesta: no se puede crear dos veces.
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitUntil(cdp, `!${PANEL}`, "cerrar el panel");
    await clicReal(cdp, BOTON_BITA);
    await waitUntil(cdp, `${PANEL}?.innerText.includes("Listo: 2 viajes planificados.")`, "la propuesta como quedó");
    assert.equal(await cdp.evaluate(`!${boton("Crear", PANEL)}`), true);

    // Word: una tabla.
    await adjuntar(cdp, await word(carpeta));
    await waitUntil(cdp, `${PANEL}.innerText.includes("itinerario.docx") && ${PANEL}.innerText.includes("Word · 2 viajes nuevos")`, "la propuesta del Word", 60_000);
    await clicReal(cdp, `[...${PANEL}.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Descartar").at(-1)`);
    await waitUntil(cdp, `${PANEL}.innerText.includes("Descartaste esta propuesta")`, "descartar la propuesta del Word");
    assert.equal(await cdp.evaluate(`${PANEL}.contains(document.activeElement) && document.activeElement.getAttribute("role") === "status"`), true, "tras descartar el foco sigue en el panel");
    assert.equal(supabase.estado.viajes.length, 3, "descartar no crea nada");
    // PDF: líneas de texto; este sí se crea.
    await adjuntar(cdp, await pdf(carpeta));
    await waitUntil(cdp, `${PANEL}.innerText.includes("pasajes.pdf") && ${PANEL}.innerText.includes("PDF · 2 viajes nuevos")`, "la propuesta del PDF", 60_000);
    assert.equal(supabase.estado.usados, 3, "tres documentos, tres mensajes");
    const pasajes = `${PANEL}.querySelectorAll("button")`;
    await clicReal(cdp, `[...${pasajes}].filter((b) => b.textContent.includes("Crear 2 viajes")).at(-1)`);
    await waitUntil(cdp, `${PANEL}.innerText.split("Listo: 2 viajes planificados.").length === 3`, "los viajes del PDF creados");
    assert.equal(supabase.estado.viajes.length, 5);

    // El panel sigue sirviendo para preguntas: el contador no vuelve.
    assert.ok(!/Te quedan/.test(await textoDelPanel(cdp)));

    // «Ver la agenda» lleva a la agenda.
    await clicReal(cdp, `[...${pasajes}].filter((b) => b.textContent.includes("Ver la agenda")).at(-1)`);
    await waitUntil(cdp, `document.querySelector("main h1")?.textContent.includes("Agenda")`, "la agenda");

    const reales = errores.filter((e) => !/status of (400|403|413|415|422)|\b(415|422)\b/.test(e));
    assert.deepEqual(reales, [], "sin errores en la consola");
    return "escritorio: adjuntar Excel, propuesta, elegir, fallo y reintento, crear, cerrar y abrir, Word y PDF";
  } finally {
    cdp.close();
  }
}

async function telefono({ cdpPort, appUrl, supabase, carpeta }) {
  const { cdp, errores } = await conectar(cdpPort, { ancho: 390, alto: 844, movil: true, oscuro: true });
  try {
    await entrar(cdp, appUrl);
    await waitUntil(cdp, `!!${BOTON_BITA}`, "el botón de Bita");
    await clicReal(cdp, BOTON_BITA);
    await waitUntil(cdp, `!!${PANEL}?.querySelector("textarea")`, "el panel en el teléfono");
    await captura(cdp, "5-telefono-panel");
    await adjuntar(cdp, await excel(carpeta));
    await waitUntil(cdp, `!!${PANEL}.querySelector('[aria-label="Viajes encontrados en el documento"]')`, "la propuesta en el teléfono", 60_000);
    // Ahora Juan ya tiene esos viajes: lo nuevo es lo mismo de antes menos lo creado.
    const medidas = await cdp.evaluate(`(() => {
      const p = ${PANEL}.getBoundingClientRect();
      const registro = ${PANEL}.querySelector('[role=log]');
      const botones = [...${PANEL}.querySelectorAll('button, label')].filter((b) => b.closest('[aria-label="Viajes encontrados en el documento"]') || /Crear|Descartar|Elegir|Quitar/.test(b.textContent)).map((b) => Math.round(b.getBoundingClientRect().height));
      return { panel: [p.width, p.height], pagina: document.documentElement.scrollWidth, registro: [registro.scrollWidth, registro.clientWidth], botones };
    })()`);
    assert.deepEqual(medidas.panel, [390, 844], "el panel ocupa la pantalla");
    assert.equal(medidas.pagina, 390, "la página no se desborda");
    assert.ok(medidas.registro[0] <= medidas.registro[1], `la conversación no se desborda: ${medidas.registro}`);
    assert.ok(medidas.botones.every((h) => h >= 40), `botones y casillas de al menos 44 px: ${medidas.botones}`);
    await cdp.evaluate(`${PANEL}.querySelector('[role=log]').scrollTop = ${PANEL}.querySelector('[role=log]').scrollHeight`);
    await captura(cdp, "6-telefono-propuesta");
    assert.equal(supabase.estado.usados, 4);
    const reales = errores.filter((e) => !/status of (400|403|413|415|422)/.test(e));
    assert.deepEqual(reales, [], "sin errores en la consola");
    return "teléfono oscuro de 390 px: la propuesta cabe, sin desbordar y con botones táctiles";
  } finally {
    cdp.close();
  }
}

async function principal() {
  const carpeta = await mkdtemp(join(tmpdir(), "bita-documento-"));
  const supabase = await crearSupabase();
  const anthropic = await crearAnthropic();
  process.env.BITA_PRUEBA_ENV = JSON.stringify({
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${supabase.puerto}`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "llave-publicable-de-prueba",
    SUPABASE_SERVICE_ROLE_KEY: "llave-de-servicio-de-prueba",
    BITA_ENABLED: "1",
    BITA_DAILY_LIMIT: "10",
    ANTHROPIC_API_KEY: "sk-ant-de-prueba",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${anthropic.puerto}`,
  });
  globalThis.__travelBrowserStartTest = { nextEntrypoint: fileURLToPath(new URL("./browser-bita-next.mjs", import.meta.url)) };
  const { cdpPort, appUrl } = await startBrowser();
  const contexto = { cdpPort, appUrl, supabase, anthropic, carpeta };
  for (const recorrido of [escritorio, telefono]) console.log(`✓ ${await recorrido(contexto)}`);
  supabase.cerrar();
  anthropic.cerrar();
}

try {
  await principal();
} finally {
  await teardown();
}
