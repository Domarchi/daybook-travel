// Los flujos principales de Daybook Travel, en un navegador de verdad y con la
// demostración (sin Supabase): planificar turnos, armar el manifiesto, marcar
// como solicitado, editar un viaje con su motivo, el aviso de persona repetida,
// cerrar en bloque los viajes pasados sin reserva, los viajes para revisar, la
// reserva en bloque, que lo escrito en un diálogo no se pierda sin preguntar y
// el motivo que se anota solo al registrar un dato que faltaba, el orden de
// las pantallas en el teléfono y Mis vuelos (la ficha y la pantalla del
// trabajador).
//
// Hasta ahora el CI probaba en navegador solo la entrada y la recuperación de
// clave; el resto se comprobaba a mano. Esto no reemplaza las pruebas de
// `lib/`, que dicen si la regla está bien: dice si la pantalla la usa.
//
// Reusa el arranque del arnés de la entrada (Next en desarrollo + Chrome sin
// cabeza). Cada escenario abre su pestaña y termina sin errores en la consola.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Cdp, delay, openTarget, startBrowser, teardown, waitUntil } from "./browser-login.mjs";

// Ayudas que se cargan en la página. Buscan por el texto que ve la persona, no
// por clases: una clase cambia en una migración, el texto de un botón no.
const AYUDAS = `
  window.__boton = (texto, dentro = document) =>
    [...dentro.querySelectorAll("button")].find((b) => b.textContent.replace(/\\s+/g, " ").trim().includes(texto));
  window.__clic = (texto, dentro) => {
    const b = window.__boton(texto, dentro);
    if (!b) throw new Error("No hay botón «" + texto + "»");
    b.click();
    return true;
  };
  window.__valor = (selector, valor) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error("No hay " + selector);
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, valor);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };
  // El aviso es la tarjeta flotante común del estándar Daybook (Fase 5a): va fuera
  // de <main>, en .toast-region. Se lee solo su texto, sin «Deshacer» ni la ✕.
  window.__aviso = () => {
    const t = document.querySelector(".toast-region .toast");
    return t ? [...t.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim() : "";
  };
  window.__error = () => document.querySelector(".dialog [role=alert]")?.textContent?.trim() ?? "";
  true;
`;

// Adelanta el reloj de la página. Así los viajes de la demostración, que caen en
// las próximas semanas, quedan en el pasado y hay viajes "sin cerrar". Se aplica
// después de entrar: la demostración arma sus viajes desde la fecha de hoy, y
// con el reloj ya corrido al cargar, los viajes se correrían con él.
const RELOJ_ADELANTADO = (dias) => `
  (() => {
    const Real = Date;
    const salto = ${dias} * 86400000;
    class Falso extends Real {
      constructor(...a) { if (a.length === 0) super(Real.now() + salto); else super(...a); }
      static now() { return Real.now() + salto; }
    }
    globalThis.Date = Falso;
  })();
`;

function errores(cdp) {
  const lista = [];
  cdp.onEvent(({ method, params }) => {
    if (method === "Runtime.consoleAPICalled" && params.type === "error") {
      lista.push(`console.error: ${params.args.map((a) => a.value ?? a.description ?? a.type).join(" ")}`);
    }
    if (method === "Runtime.exceptionThrown") {
      lista.push(`excepción: ${params.exceptionDetails.exception?.description ?? params.exceptionDetails.text}`);
    }
  });
  return lista;
}

async function abrirDemo(cdpPort, appUrl) {
  const target = await openTarget(cdpPort);
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  const lista = errores(cdp);
  await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable")]);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Page.navigate", { url: appUrl });
  await waitUntil(cdp, `!!document.querySelector("[data-demo-action]")`, "botón de demostración");
  await cdp.evaluate(AYUDAS);
  await cdp.evaluate(`document.querySelector("[data-demo-action]").click()`);
  await waitUntil(cdp, `!!document.querySelector("aside nav")`, "la aplicación en demostración");
  return { cdp, lista };
}

const ir = (cdp, pantalla) =>
  cdp.evaluate(`window.__clic(${JSON.stringify(pantalla)}, document.querySelector("aside nav"))`);
const hayDialogo = (cdp) => cdp.evaluate(`!!document.querySelector(".dialog")`);

async function planificarYSolicitar(cdpPort, appUrl) {
  const { cdp, lista } = await abrirDemo(cdpPort, appUrl);
  try {
    // Planificar turnos: el diálogo dice cuántos viajes agrega y, al confirmar, lo cumple.
    await cdp.evaluate(`window.__clic("Planificar turnos", document.querySelector("main"))`);
    await waitUntil(cdp, `!!window.__boton("Generar", document.querySelector(".dialog"))`, "el diálogo de planificar");
    await cdp.evaluate(`window.__valor(".dialog input[name=until]", new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10))`);
    await delay(200);
    const etiqueta = await cdp.evaluate(`window.__boton("Generar", document.querySelector(".dialog")).textContent.trim()`);
    const nuevos = Number(etiqueta.match(/Generar (\d+)/)?.[1] ?? 0);
    assert.ok(nuevos > 0, `planificar a 90 días debía agregar viajes; el botón dice «${etiqueta}»`);
    await cdp.evaluate(`window.__clic("Generar", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `window.__aviso().includes("viajes nuevos")`, "el aviso de viajes generados");
    const aviso = await cdp.evaluate(`window.__aviso()`);
    assert.match(aviso, new RegExp(`^${nuevos} viajes nuevos`), `el aviso dice otra cantidad: «${aviso}»`);

    // Viajes: marcar uno, ver el manifiesto y marcarlo como solicitado.
    await ir(cdp, "Viajes");
    await waitUntil(cdp, `!!document.querySelector("tbody input[type=checkbox]")`, "viajes planificados para marcar");
    await cdp.evaluate(`document.querySelector("tbody input[type=checkbox]").click()`);
    await waitUntil(cdp, `!!window.__boton("Marcar 1 como solicitado")`, "la barra de selección");
    await cdp.evaluate(`window.__clic("Lista para solicitar", document.querySelector("main"))`);
    // El primer viaje de la demostración es de alguien con el examen médico
    // vencido: el manifiesto lo deja fuera y lo muestra en "Acreditación
    // pendiente" hasta que alguien decide incluirlo igual.
    await waitUntil(cdp, `(document.querySelector(".dialog textarea")?.value ?? "").includes("Total: 0 pasajes")`, "el manifiesto sin el pasajero no acreditado");
    assert.match(await cdp.evaluate(`document.querySelector(".dialog").innerText`), /Acreditación pendiente[\s\S]*Examen médico: vence/, "el motivo de la exclusión está a la vista");
    await cdp.evaluate(`[...document.querySelectorAll(".dialog label")].find((l) => l.textContent.includes("Incluir igual")).querySelector("input").click()`);
    await waitUntil(cdp, `(document.querySelector(".dialog textarea")?.value ?? "").includes("1 pasajero")`, "el manifiesto con el pasajero incluido");
    await cdp.evaluate(`window.__clic("Cerrar", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `!document.querySelector(".dialog")`, "cerrar el manifiesto");
    await cdp.evaluate(`window.__clic("Marcar 1 como solicitado")`);
    await waitUntil(cdp, `window.__aviso() === "1 viaje marcado como solicitado."`, "el aviso de solicitado");

    // Editar un viaje: un motivo de un punto no pasa; uno que se entiende, sí.
    await cdp.evaluate(`window.__clic("Abrir", document.querySelector("tbody"))`);
    await waitUntil(cdp, `!!document.querySelector(".dialog textarea[name=change_reason]")`, "el diálogo de viaje");
    // Con código de reserva y sin monto, el diálogo pide el monto; con monto, deja de pedirlo.
    await cdp.evaluate(`window.__valor(".dialog input[name=pnr]", "ABC123")`);
    await waitUntil(cdp, `!!document.getElementById("pedir-monto")`, "el pedido de monto");
    await cdp.evaluate(`window.__valor(".dialog input[name=amount]", "85990")`);
    await waitUntil(cdp, `!document.getElementById("pedir-monto")`, "el pedido de monto resuelto");
    // Registrar el código y el monto que faltaban no pide motivo: se anota solo.
    await waitUntil(
      cdp,
      `!document.querySelector(".dialog textarea[name=change_reason]") && document.getElementById("motivo-automatico")?.textContent.includes("«Se registró la reserva ABC123 y el monto.»")`,
      "el motivo que se anota solo",
    );
    await cdp.evaluate(`window.__valor(".dialog input[name=pnr]", "")`);
    await cdp.evaluate(`window.__valor(".dialog input[name=amount]", "")`);
    await cdp.evaluate(`window.__valor(".dialog textarea[name=change_reason]", ".")`);
    await cdp.evaluate(`window.__clic("Guardar viaje", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `window.__error().includes("al menos 5 letras")`, "el rechazo del motivo corto");
    assert.equal(await hayDialogo(cdp), true, "con un motivo corto el diálogo sigue abierto");
    await cdp.evaluate(`window.__valor(".dialog textarea[name=change_reason]", "Cambio de hora")`);
    await cdp.evaluate(`window.__clic("Guardar viaje", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `window.__aviso() === "Viaje guardado."`, "el viaje guardado");

    // Persona repetida: al escribir un nombre que ya está, el diálogo avisa.
    await ir(cdp, "Personas");
    await cdp.evaluate(`window.__clic("Nueva persona", document.querySelector("main"))`);
    await waitUntil(cdp, `!!document.querySelector(".dialog input[name=name]")`, "el diálogo de persona");
    await cdp.evaluate(`window.__valor(".dialog input[name=name]", "persona  de EJEMPLO 1")`);
    await waitUntil(cdp, `!!document.getElementById("persona-repetida")`, "el aviso de persona repetida");
    // Ya hay algo escrito: «Cancelar» pregunta antes de descartarlo.
    await cdp.evaluate(`window.__clic("Cancelar", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `!!window.__boton("Descartar cambios", document.querySelector("[role=alertdialog]"))`, "la pregunta antes de descartar");
    await cdp.evaluate(`window.__clic("Descartar cambios", document.querySelector("[role=alertdialog]"))`);
    await waitUntil(cdp, `!document.querySelector(".dialog")`, "cerrar el diálogo de persona");

    // Desactivar a una persona ofrece anular sus viajes futuros sin reserva.
    await cdp.evaluate(`
      const fila = [...document.querySelectorAll("main article")].find((a) => a.querySelector("h2")?.textContent === "Persona de ejemplo 1");
      window.__clic("Editar", fila);
    `);
    await waitUntil(cdp, `!!document.querySelector(".dialog input[name=active]")`, "el diálogo de la persona");
    await cdp.evaluate(`document.querySelector(".dialog input[name=active]").click()`);
    await waitUntil(cdp, `!!document.querySelector(".dialog input[name=anular_futuros]")`, "la oferta de anular sus viajes");
    await cdp.evaluate(`document.querySelector(".dialog input[name=anular_futuros]").click()`);
    await cdp.evaluate(`window.__clic("Guardar", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `/^Persona guardada como inactiva\. Se anul/.test(window.__aviso())`, "el aviso de viajes anulados");

    assert.deepEqual(lista, [], "sin errores en la consola");
    return `planificar ${nuevos} viajes, manifiesto, solicitado, pedido de monto, motivo mínimo, persona repetida y desactivar con sus viajes`;
  } finally {
    cdp.close();
  }
}

async function cerrarEnBloque(cdpPort, appUrl) {
  const { cdp, lista } = await abrirDemo(cdpPort, appUrl);
  try {
    // Con el reloj 40 días adelante, la Agenda separa lo que ya pasó sin reserva.
    // Cambiar la anticipación hace que la Agenda vuelva a calcular con la fecha nueva.
    await cdp.evaluate(RELOJ_ADELANTADO(40));
    await cdp.evaluate(`window.__valor("main select", "14")`);
    await waitUntil(cdp, `!!window.__boton("quedaron sin reserva")`, "el enlace de viajes sin cerrar");
    const enlace = await cdp.evaluate(`window.__boton("quedaron sin reserva").textContent.trim()`);
    const total = Number(enlace.match(/^(\d+)/)?.[1] ?? 0);
    assert.ok(total > 1, `debía haber varios viajes sin cerrar: «${enlace}»`);
    await cdp.evaluate(`window.__clic("quedaron sin reserva")`);
    await waitUntil(cdp, `document.querySelector("main").innerText.includes("pasados sin reserva")`, "la lista de sin cerrar");

    await cdp.evaluate(`document.querySelector("thead input[type=checkbox]").click()`);
    await waitUntil(cdp, `!!window.__boton("Cerrar ${total} viajes")`, "la barra de cierre");
    await cdp.evaluate(`window.__clic("Cerrar ${total} viajes")`);
    await waitUntil(cdp, `!!document.querySelector(".dialog select[name=modo]")`, "el diálogo de cierre");
    // Son de días distintos: una sola reserva no puede ser de todos.
    assert.equal(
      await cdp.evaluate(`document.querySelector(".dialog option[value=reserva]").disabled`),
      true,
      "con viajes de días distintos la reserva común no se ofrece",
    );
    await cdp.evaluate(`window.__valor(".dialog textarea[name=motivo]", ".")`);
    await cdp.evaluate(`window.__clic("Anular", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `window.__error().includes("al menos 5 letras")`, "el rechazo del motivo corto");
    await cdp.evaluate(`window.__valor(".dialog textarea[name=motivo]", "No se realizaron")`);
    await cdp.evaluate(`window.__clic("Anular", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `window.__aviso() === "${total} viajes anulados."`, "el aviso de anulados");
    await waitUntil(cdp, `document.querySelector("main").innerText.includes("No hay viajes con estos filtros")`, "la lista vacía");

    assert.deepEqual(lista, [], "sin errores en la consola");
    return `cerrar en bloque ${total} viajes sin cerrar`;
  } finally {
    cdp.close();
  }
}

// Cambiar el turno de alguien deja sus viajes planificados donde estaban: la
// persona lo sabe al guardar, la Agenda los cuenta y Viajes dice por qué. Y la
// reserva que manda la agencia se registra desde la lista de solicitados.
async function revisarYReservar(cdpPort, appUrl) {
  const { cdp, lista } = await abrirDemo(cdpPort, appUrl);
  try {
    await ir(cdp, "Personas");
    await cdp.evaluate(`
      const fila = [...document.querySelectorAll("main article")].find((a) => a.querySelector("h2")?.textContent === "Persona de ejemplo 1");
      window.__clic("Editar", fila);
    `);
    await waitUntil(cdp, `!!document.querySelector(".dialog select[name=up_weekday]")`, "el diálogo de la persona");
    await cdp.evaluate(`window.__valor(".dialog select[name=up_weekday]", "2")`);
    await cdp.evaluate(`window.__clic("Guardar", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `/ya no calzan? con su turno/.test(window.__aviso())`, "el aviso de viajes fuera de turno");

    await ir(cdp, "Agenda");
    await waitUntil(cdp, `!!window.__boton("para revisar")`, "el enlace de viajes para revisar");
    const enlace = await cdp.evaluate(`window.__boton("para revisar").textContent.trim()`);
    const total = Number(enlace.match(/^(\d+)/)?.[1] ?? 0);
    assert.ok(total > 0, `debía haber viajes para revisar: «${enlace}»`);
    await cdp.evaluate(`window.__clic("para revisar")`);
    await waitUntil(cdp, `document.querySelector("main").innerText.includes("para revisar")`, "la lista para revisar");
    const avisos = await cdp.evaluate(`document.querySelector("tbody").innerText.match(/No calza con su turno/g)?.length ?? 0`);
    assert.equal(avisos, total, "cada viaje de la lista dice por qué está");
    // El modo «para revisar» no tiene control en la barra: es una pastilla que se quita.
    const pastilla = `document.querySelector('main button[aria-label="Quitar el filtro «Para revisar»"]')`;
    assert.equal(await cdp.evaluate(`${pastilla}?.textContent.trim()`), "Para revisar");
    await clicReal(cdp, pastilla);
    await waitUntil(cdp, `!${pastilla} && document.getElementById("trip-results").innerText.includes("desde hoy")`, "quitar la pastilla");

    // La agencia respondió: el solicitado recibe su código desde la lista.
    await ir(cdp, "Agenda");
    await cdp.evaluate(`window.__clic("Pendientes de confirmación", document.querySelector("main"))`);
    await waitUntil(cdp, `document.querySelector("main").innerText.includes("registrar su reserva")`, "la lista de solicitados");
    await cdp.evaluate(`document.querySelector("tbody input[type=checkbox]").click()`);
    await waitUntil(cdp, `!!window.__boton("Registrar reserva")`, "la barra de reserva");
    await cdp.evaluate(`window.__clic("Registrar reserva")`);
    await waitUntil(cdp, `!!document.querySelector(".dialog input[name=pnr]")`, "el diálogo de reserva");
    await cdp.evaluate(`window.__valor(".dialog input[name=pnr]", "demo77")`);
    await cdp.evaluate(`window.__clic("Registrar en 1 viaje", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `window.__aviso() === "Reserva DEMO77 registrada en 1 viaje."`, "el aviso de reserva registrada");

    assert.deepEqual(lista, [], "sin errores en la consola");
    return `fuera de turno (${total} para revisar) y reserva en bloque`;
  } finally {
    cdp.close();
  }
}

// Bita en la demostración: el botón flotante abre el resumen sin IA, cada línea
// lleva a su pantalla, Escape cierra y devuelve el foco, y en un teléfono de 390 px
// en modo oscuro el panel ocupa la pantalla sin desbordarla. Sin cuenta real no
// hay preguntas: la demostración no tiene sesión que mandar al servidor.
async function bita(cdpPort, appUrl) {
  const { cdp, lista } = await abrirDemo(cdpPort, appUrl);
  const boton = `document.querySelector('button[aria-label="Abrir el chat con Bita"]')`;
  const panel = `document.querySelector('[role=dialog][aria-label^="Bita"]')`;
  try {
    await waitUntil(cdp, `!!${boton}`, "el botón flotante de Bita");
    const lugar = await cdp.evaluate(`(() => { const r = ${boton}.getBoundingClientRect(); return [document.documentElement.clientWidth - r.right, innerHeight - r.bottom, getComputedStyle(${boton}).position]; })()`);
    assert.deepEqual(lugar, [24, 24, "fixed"], "abajo a la derecha, fijo");

    await ir(cdp, "Viajes");
    await cdp.evaluate(`${boton}.click()`);
    await waitUntil(cdp, `!!${panel}?.querySelector('[aria-label="Cómo vienen los viajes"] li')`, "el resumen de Bita");
    const resumen = await cdp.evaluate(`${panel}.innerText`);
    assert.match(resumen, /Soy Bita/);
    assert.match(resumen, /Hoy (nadie viaja|\d+ (sube|suben|baja|bajan))/);
    assert.match(resumen, /Esta semana: \d+ subidas? y \d+ bajadas?/);
    assert.match(resumen, /solo muestro este resumen/, "en la demostración no hay preguntas");
    assert.equal(await cdp.evaluate(`!!${panel}.querySelector("textarea")`), false);

    // Una línea del resumen lleva a su pantalla.
    await cdp.evaluate(`window.__clic("Esta semana", ${panel})`);
    await waitUntil(cdp, `document.querySelector("main h1")?.textContent.includes("Agenda")`, "la agenda desde el resumen");

    // Escape cierra y el foco vuelve al botón.
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitUntil(cdp, `!${panel} && document.activeElement === ${boton}`, "cerrar con Escape y volver al botón");

    // Teléfono de 390 px en modo oscuro: el panel ocupa la pantalla y no la desborda.
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
    await delay(300);
    await cdp.evaluate(`${boton}.click()`);
    await waitUntil(cdp, `!!${panel}`, "el panel en el teléfono");
    const medidas = await cdp.evaluate(`[${panel}.getBoundingClientRect().width, document.documentElement.scrollWidth]`);
    assert.deepEqual(medidas, [390, 390], "el panel ocupa el ancho y nada se sale");

    assert.deepEqual(lista, [], "sin errores en la consola");
    return "Bita: botón, resumen sin IA, enlace, Escape y teléfono oscuro";
  } finally {
    cdp.close();
  }
}

// Un clic de verdad (mouse del navegador, no `element.click()`) en el centro de
// lo que devuelve la expresión, o en un punto dado.
// La app desplaza con animación (scroll-behavior: smooth en globals.css): sin
// «instant», el rectángulo se mide a mitad del desplazamiento y el clic puede caer
// fuera del elemento (así falló «Gestionar con Excel» desde «Más» en el CI de main).
async function clicReal(cdp, expresion) {
  const [x, y] = Array.isArray(expresion)
    ? expresion
    : await cdp.evaluate(`(() => { const el = ${expresion}; el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function escape(cdp) {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
}

const PREGUNTA = `document.querySelector("[role=alertdialog]")`;
// Un punto del velo fuera de la caja del diálogo (la caja va a la derecha).
const VELO = [60, 450];

// Lo escrito en un diálogo no se pierde sin preguntar: sin cambios, el velo y
// Escape cierran de una; con cambios, el velo, Escape, la ✕ y «Cancelar»
// preguntan. El importador de Excel sigue la misma regla con un archivo cargado.
// El historial se abre dentro del formulario. Marcar como solicitado se deshace
// desde el aviso. Cerrar sesión (salir de la demostración) pregunta y dice que se
// pierden los cambios; el selector de tema mide 44 px y no queda pegado a él.
async function noPerderLoEscrito(cdpPort, appUrl) {
  const { cdp, lista } = await abrirDemo(cdpPort, appUrl);
  // Un archivo que no es .xlsx: basta para que el importador quede con una revisión.
  const carpeta = await mkdtemp(join(tmpdir(), "travel-excel-"));
  const archivo = join(carpeta, "viajes.csv");
  await writeFile(archivo, "Nombre;Fecha\n");
  try {
    await ir(cdp, "Viajes");
    await waitUntil(cdp, `!!window.__boton("Abrir", document.querySelector("tbody"))`, "la lista de viajes");

    // Sin cambios, Escape cierra de una.
    await clicReal(cdp, `window.__boton("Abrir", document.querySelector("tbody"))`);
    await waitUntil(cdp, `!!document.querySelector(".dialog textarea[name=notes]")`, "el diálogo de viaje");
    await delay(500);
    await escape(cdp);
    await waitUntil(cdp, `!document.querySelector(".dialog")`, "cerrar sin cambios con Escape");

    // Sin cambios, tocar el velo también cierra, sin preguntar.
    await clicReal(cdp, `window.__boton("Abrir", document.querySelector("tbody"))`);
    await waitUntil(cdp, `!!document.querySelector(".dialog textarea[name=notes]")`, "el diálogo de viaje otra vez");
    await delay(500); // el diálogo entra deslizándose: se espera a que llegue
    await clicReal(cdp, VELO);
    await waitUntil(cdp, `!document.querySelector(".dialog") && !${PREGUNTA}`, "cerrar sin cambios con el velo");

    // Con algo escrito: el velo pregunta, y Escape también.
    await clicReal(cdp, `window.__boton("Abrir", document.querySelector("tbody"))`);
    await waitUntil(cdp, `!!document.querySelector(".dialog textarea[name=notes]")`, "el diálogo de viaje con cambios");
    await delay(500);
    await clicReal(cdp, `document.querySelector(".dialog textarea[name=notes]")`);
    await cdp.send("Input.insertText", { text: "Llega con equipaje extra" });
    assert.equal(await cdp.evaluate(`document.querySelector(".dialog textarea[name=notes]").value`), "Llega con equipaje extra");
    await clicReal(cdp, VELO);
    await waitUntil(cdp, `${PREGUNTA}?.innerText.includes("Hay cambios sin guardar")`, "la pregunta al tocar el velo");
    assert.equal(await hayDialogo(cdp), true, "el velo no cierra un formulario con cambios");
    await delay(100); // el foco se mueve al terminar el toque, no en el mousedown
    assert.equal(await cdp.evaluate(`document.activeElement.textContent.trim()`), "Seguir editando", "tras el velo, el foco va a la salida segura");
    // Tocar fuera de la pregunta es seguir editando, y el foco vuelve al campo.
    await clicReal(cdp, [8, 8]);
    await waitUntil(cdp, `!${PREGUNTA}`, "tocar fuera de la pregunta");
    assert.equal(await cdp.evaluate(`document.activeElement.name`), "notes", "el foco vuelve al campo");
    await clicReal(cdp, VELO);
    await waitUntil(cdp, `${PREGUNTA}?.innerText.includes("Hay cambios sin guardar")`, "la pregunta al tocar el velo otra vez");
    await clicReal(cdp, `window.__boton("Seguir editando", ${PREGUNTA})`);
    await waitUntil(cdp, `!${PREGUNTA} && document.querySelector(".dialog textarea[name=notes]")?.value === "Llega con equipaje extra"`, "seguir editando desde el velo");
    await escape(cdp);
    await waitUntil(cdp, `${PREGUNTA}?.innerText.includes("Hay cambios sin guardar")`, "la pregunta al cerrar con Escape");
    assert.equal(await cdp.evaluate(`document.activeElement.textContent.trim()`), "Seguir editando", "el foco va a la salida segura");
    // Escape cierra solo la pregunta.
    await escape(cdp);
    await waitUntil(cdp, `!${PREGUNTA}`, "cerrar la pregunta con Escape");
    assert.equal(await cdp.evaluate(`document.querySelector(".dialog textarea[name=notes]").value`), "Llega con equipaje extra");
    assert.equal(await cdp.evaluate(`document.activeElement.name`), "notes", "Escape en la pregunta devuelve el foco al campo");

    // El historial se abre dentro del formulario y lo escrito sigue ahí.
    await clicReal(cdp, `[...document.querySelectorAll(".dialog summary")].find((s) => s.textContent.includes("Historial del viaje"))`);
    await waitUntil(cdp, `document.querySelector(".dialog").innerText.includes("La demostración no guarda historial")`, "el historial dentro del formulario");
    assert.equal(await cdp.evaluate(`document.querySelector(".dialog textarea[name=notes]").value`), "Llega con equipaje extra", "abrir el historial no borra lo escrito");

    // La ✕ pregunta; «Seguir editando» vuelve; «Descartar cambios» cierra.
    await clicReal(cdp, `document.querySelector('.dialog button[aria-label="Cerrar"]')`);
    await waitUntil(cdp, `!!${PREGUNTA}`, "la pregunta al tocar la ✕");
    await clicReal(cdp, `window.__boton("Seguir editando", ${PREGUNTA})`);
    await waitUntil(cdp, `!${PREGUNTA} && document.querySelector(".dialog textarea[name=notes]")?.value === "Llega con equipaje extra"`, "seguir editando");
    await clicReal(cdp, `window.__boton("Cancelar", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `!!${PREGUNTA}`, "la pregunta al tocar Cancelar");
    await clicReal(cdp, `window.__boton("Descartar cambios", ${PREGUNTA})`);
    await waitUntil(cdp, `!document.querySelector(".dialog") && !${PREGUNTA}`, "descartar y cerrar");

    // Marcar como solicitado se deshace desde el aviso.
    await clicReal(cdp, `document.querySelector("tbody input[type=checkbox]")`);
    await waitUntil(cdp, `!!window.__boton("Marcar 1 como solicitado")`, "la barra de selección");
    await clicReal(cdp, `window.__boton("Marcar 1 como solicitado")`);
    await waitUntil(cdp, `window.__aviso() === "1 viaje marcado como solicitado."`, "el aviso de solicitado");
    const solicitados = await cdp.evaluate(`document.querySelector("tbody").innerText.match(/Solicitado/g)?.length ?? 0`);
    await clicReal(cdp, `document.querySelector(".toast-undo")`);
    await waitUntil(cdp, `window.__aviso() === "1 viaje volvió a Planificado."`, "el aviso de deshecho");
    await waitUntil(cdp, `(document.querySelector("tbody").innerText.match(/Solicitado/g)?.length ?? 0) === ${solicitados} - 1`, "el viaje de vuelta en Planificado");

    // El importador de Excel: sin archivo, el velo cierra; con un archivo
    // cargado, pregunta, y «Cancelar» también.
    await ir(cdp, "Personas");
    const excel = async () => {
      await clicReal(cdp, `window.__boton("Más", document.querySelector("main"))`);
      await waitUntil(cdp, `!!window.__boton("Gestionar con Excel")`, "el menú Más");
      await clicReal(cdp, `window.__boton("Gestionar con Excel")`);
      await waitUntil(cdp, `document.getElementById("dialog-title")?.textContent === "Gestionar con Excel"`, "el importador");
      await delay(500);
    };
    await excel();
    await clicReal(cdp, VELO);
    await waitUntil(cdp, `!document.querySelector(".dialog") && !${PREGUNTA}`, "cerrar el importador sin archivo con el velo");
    await excel();
    const { result: entrada } = await cdp.send("Runtime.evaluate", { expression: `document.querySelector('.dialog input[type=file]')` });
    await cdp.send("DOM.setFileInputFiles", { objectId: entrada.objectId, files: [archivo] });
    await waitUntil(cdp, `document.querySelector(".dialog").innerText.includes("Usa un archivo .xlsx")`, "la revisión del archivo cargado");
    await clicReal(cdp, VELO);
    await waitUntil(cdp, `${PREGUNTA}?.innerText.includes("Hay cambios sin guardar")`, "la pregunta del importador al tocar el velo");
    await clicReal(cdp, `window.__boton("Seguir editando", ${PREGUNTA})`);
    await waitUntil(cdp, `!${PREGUNTA} && document.querySelector(".dialog").innerText.includes("Usa un archivo .xlsx")`, "la revisión sigue ahí");
    await clicReal(cdp, `window.__boton("Cancelar", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `!!${PREGUNTA}`, "la pregunta del importador al tocar Cancelar");
    await clicReal(cdp, `window.__boton("Descartar cambios", ${PREGUNTA})`);
    await waitUntil(cdp, `!document.querySelector(".dialog") && !${PREGUNTA}`, "descartar la revisión");

    // Salir de la demostración: 44 px, pregunta y dice que se pierden los cambios.
    // El tema, debajo, también mide 44 px y deja aire entre los dos.
    const salir = `document.querySelector('aside button[aria-label="Salir de la demostración"]')`;
    assert.deepEqual(await cdp.evaluate(`(() => { const r = ${salir}.getBoundingClientRect(); return [r.width, r.height]; })()`), [44, 44]);
    const [altoTema, aire] = await cdp.evaluate(`(() => { const t = document.querySelector('aside select[aria-label="Tema"]').getBoundingClientRect(); return [t.height, t.top - ${salir}.getBoundingClientRect().bottom]; })()`);
    assert.equal(altoTema, 44, "el selector de tema mide 44 px");
    assert.ok(aire >= 8, `el tema queda a ${aire} px del botón de salir`);
    await clicReal(cdp, salir);
    await waitUntil(cdp, `${PREGUNTA}?.innerText.includes("Se pierden los cambios")`, "la pregunta al salir");
    await escape(cdp);
    await waitUntil(cdp, `!${PREGUNTA} && !!document.querySelector("aside nav")`, "seguir en la demostración");
    await clicReal(cdp, salir);
    await waitUntil(cdp, `!!${PREGUNTA}`, "la pregunta otra vez");
    await clicReal(cdp, `window.__boton("Salir de la demostración", ${PREGUNTA})`);
    await waitUntil(cdp, `!!document.querySelector("[data-demo-action]")`, "de vuelta en la entrada");

    assert.deepEqual(lista, [], "sin errores en la consola");
    return "formulario: sin cambios el velo cierra; con cambios velo, Escape, ✕ y Cancelar preguntan; Excel igual; historial dentro; Deshacer solicitado; salir y tema de 44 px";
  } finally {
    cdp.close();
    await rm(carpeta, { recursive: true, force: true });
  }
}

// El motivo de un cambio: cargar el monto que faltaba se guarda sin escribir
// nada; cambiar la fecha lo pide, avisa del mínimo al salir del campo (no al
// guardar) y ofrece opciones de un toque. La anticipación de la Agenda dice que
// es para todo el equipo y avisa al guardarse.
async function motivoYAnticipacion(cdpPort, appUrl) {
  const { cdp, lista } = await abrirDemo(cdpPort, appUrl);
  const dialogo = `document.querySelector(".dialog")`;
  const motivo = `document.querySelector(".dialog textarea[name=change_reason]")`;
  try {
    await ir(cdp, "Viajes");
    await waitUntil(cdp, `!!window.__boton("Abrir", document.querySelector("tbody"))`, "la lista de viajes");
    await clicReal(cdp, `window.__boton("Abrir", document.querySelector("tbody"))`);
    await waitUntil(cdp, `!!${motivo}`, "el diálogo de viaje");
    await delay(500);
    // Sin cambios todavía se ve el campo; al cargar el monto se va.
    const datos = `[...document.querySelectorAll(".dialog summary")].find((s) => s.textContent.includes("Datos de reserva"))`;
    if (!(await cdp.evaluate(`${datos}.parentElement.open`))) await clicReal(cdp, datos);
    await clicReal(cdp, `document.querySelector(".dialog input[name=amount]")`);
    await cdp.send("Input.insertText", { text: "85990" });
    await waitUntil(cdp, `!${motivo} && document.getElementById("motivo-automatico")?.textContent.includes("«Se registró el monto.»")`, "el motivo automático del monto");
    await clicReal(cdp, `window.__boton("Guardar viaje", ${dialogo})`);
    await waitUntil(cdp, `window.__aviso() === "Viaje guardado." && !${dialogo}`, "guardar sin escribir motivo");

    // Cambiar la fecha sí pide motivo.
    await clicReal(cdp, `window.__boton("Abrir", document.querySelector("tbody"))`);
    await waitUntil(cdp, `!!${motivo}`, "el diálogo de viaje otra vez");
    await delay(500);
    const fecha = await cdp.evaluate(`document.querySelector(".dialog input[name=date]").value`);
    const otroDia = new Date(Date.parse(fecha + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
    await cdp.evaluate(`window.__valor(".dialog input[name=date]", "${otroDia}")`);
    await waitUntil(cdp, `!!${motivo} && !document.getElementById("motivo-automatico")`, "el motivo pedido al cambiar la fecha");
    // Un motivo corto se avisa al salir del campo, junto a él, sin apretar Guardar.
    await clicReal(cdp, motivo);
    await cdp.send("Input.insertText", { text: "ok" });
    await clicReal(cdp, `[...document.querySelectorAll(".dialog h3")].find((h) => h.textContent === "Observaciones")`);
    await waitUntil(cdp, `document.getElementById("motivo-error")?.textContent.includes("al menos 5 letras")`, "el aviso del mínimo al salir del campo");
    assert.equal(await cdp.evaluate(`${motivo}.getAttribute("aria-invalid")`), "true");
    assert.equal(await cdp.evaluate(`!!document.querySelector(".dialog-error")`), false, "no hay error arriba del diálogo");
    // Una opción de un toque llena el campo y quita el aviso.
    await clicReal(cdp, `window.__boton("Cambio de fecha", ${dialogo})`);
    await waitUntil(cdp, `${motivo}.value === "Cambio de fecha" && !document.getElementById("motivo-error")`, "la opción de un toque");
    const alto = await cdp.evaluate(`window.__boton("Corrección", ${dialogo}).getBoundingClientRect().height`);
    assert.ok(alto >= 44, `las opciones miden ${alto} px de alto`);
    await clicReal(cdp, `window.__boton("Guardar viaje", ${dialogo})`);
    await waitUntil(cdp, `window.__aviso() === "Viaje guardado." && !${dialogo}`, "guardar con el motivo de un toque");

    // La anticipación es del equipo y avisa al guardarse.
    await ir(cdp, "Agenda");
    await waitUntil(cdp, `document.querySelector("main").innerText.includes("Avisar compras con")`, "la anticipación");
    assert.match(await cdp.evaluate(`document.querySelector("main select").closest("label").textContent`), /Avisar compras con.*de anticipación\(para todo el equipo\)/);
    await cdp.evaluate(`window.__valor("main select", "30")`);
    await waitUntil(cdp, `window.__aviso() === "Anticipación guardada: 30 días, para todo el equipo."`, "el aviso de anticipación guardada");

    assert.deepEqual(lista, [], "sin errores en la consola");
    return "motivo: el monto se anota solo, la fecha lo pide, mínimo al salir del campo, opción de un toque; anticipación para todo el equipo";
  } finally {
    cdp.close();
  }
}

// En el teléfono lo primero que se ve es para lo que se entra: la Agenda pone lo
// pendiente de hoy antes del calendario y su leyenda explica las abreviaturas;
// Viajes deja la búsqueda y «Filtros (n)» y permite marcar todo sin la cabecera;
// Personas pliega los documentos exigidos y lleva Excel a «Más».
async function telefono(cdpPort, appUrl) {
  const { cdp, lista } = await abrirDemo(cdpPort, appUrl);
  const visible = (expr) => `(() => { const el = ${expr}; return !!el && el.getClientRects().length > 0; })()`;
  try {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await delay(300);
    assert.equal(
      await cdp.evaluate(`!!(document.getElementById("handoff-title").compareDocumentPosition(document.getElementById("calendar-title")) & Node.DOCUMENT_POSITION_FOLLOWING)`),
      true,
      "la entrega de coordinación va antes del calendario",
    );
    const leyenda = await cdp.evaluate(`document.querySelector('[aria-label="Leyenda del calendario"]').innerText.replace(/\\s+/g, " ")`);
    assert.match(leyenda, /10 = 10×10.*S\/T = sin turno.*\? = por confirmar/, `la leyenda en el teléfono: «${leyenda}»`);

    await ir(cdp, "Viajes");
    await waitUntil(cdp, `!!document.querySelector("tbody")`, "la lista de viajes");
    const filtros = `window.__boton("Filtros", document.querySelector("main"))`;
    assert.equal(await cdp.evaluate(`${filtros}.textContent.trim()`), "Filtros (1)");
    assert.equal(await cdp.evaluate(visible(`window.__boton("Solo próximos")`)), false, "los filtros empiezan plegados");
    await clicReal(cdp, filtros);
    await waitUntil(cdp, visible(`window.__boton("Solo próximos")`), "los filtros desplegados");
    assert.equal(await cdp.evaluate(`${filtros}.getAttribute("aria-expanded")`), "true");
    assert.equal(await cdp.evaluate(`window.__boton("Solo próximos").getAttribute("aria-pressed")`), "true");

    const fila = `[...document.querySelectorAll("main label")].find((l) => /^Seleccionar los \\d+ planificados visibles$/.test(l.textContent.trim()))`;
    assert.equal(await cdp.evaluate(visible(fila)), true, "la fila para marcar todos");
    const n = await cdp.evaluate(`Number(${fila}.textContent.match(/\\d+/)[0])`);
    await clicReal(cdp, fila);
    await waitUntil(cdp, `!!window.__boton("Marcar ${n} como solicitados")`, "marcar todos desde la fila");
    await delay(400); // la barra de selección se abre y empuja la fila hacia abajo
    await clicReal(cdp, fila);
    await waitUntil(cdp, `!!document.querySelector("main [role=status][aria-hidden=true]")`, "quitar la selección");

    await ir(cdp, "Personas");
    const documentos = `[...document.querySelectorAll("main details")].find((d) => d.textContent.includes("Documentos exigidos"))`;
    await waitUntil(cdp, `!!${documentos}`, "los documentos exigidos");
    assert.equal(await cdp.evaluate(`${documentos}.open`), false, "plegados");
    assert.match(await cdp.evaluate(`${documentos}.querySelector("summary").innerText.replace(/\\s+/g, " ").trim()`), /^Documentos exigidos: .*Examen médico.* Ver$/);
    assert.equal(await cdp.evaluate(`!!window.__boton("Gestionar con Excel")`), false, "Excel no está en la barra");
    const mas = `window.__boton("Más", document.querySelector("main"))`;
    await clicReal(cdp, mas);
    await waitUntil(cdp, `!!window.__boton("Gestionar con Excel")`, "el menú Más");
    await escape(cdp);
    await waitUntil(cdp, `!window.__boton("Gestionar con Excel") && document.activeElement === ${mas}`, "Escape cierra Más y devuelve el foco");
    await clicReal(cdp, mas);
    await waitUntil(cdp, `!!window.__boton("Gestionar con Excel")`, "el menú Más otra vez");
    await clicReal(cdp, `window.__boton("Gestionar con Excel")`);
    await waitUntil(cdp, `document.getElementById("dialog-title")?.textContent === "Gestionar con Excel"`, "el importador desde Más");

    assert.equal(await cdp.evaluate(`document.documentElement.scrollWidth`), 390, "nada se sale a 390 px");
    assert.deepEqual(lista, [], "sin errores en la consola");
    return "teléfono: entrega antes del calendario, leyenda, Filtros (n), marcar todos, documentos plegados y Más";
  } finally {
    cdp.close();
  }
}

// La lista para el campamento: se abre desde la Agenda, sale de los viajes de la
// demostración (que caen en las próximas semanas) y cambia al mover la fecha.
// Copiar no se prueba: el portapapeles de un Chrome sin cabeza no es el de nadie.
async function campamento(cdpPort, appUrl) {
  const { cdp, lista } = await abrirDemo(cdpPort, appUrl);
  const texto = `(document.querySelector(".dialog textarea")?.value ?? "")`;
  try {
    await cdp.evaluate(`window.__clic("Lista para el campamento", document.querySelector("main"))`);
    await waitUntil(cdp, `${texto}.startsWith("CAMPAMENTO — Daybook Travel")`, "la lista para el campamento");
    await cdp.evaluate(`window.__valor(".dialog select[name=dias]", "14")`);
    await waitUntil(cdp, `${texto}.includes("Llegan — traslado aeropuerto → campamento")`, "alguna llegada en dos semanas");
    const valor = await cdp.evaluate(texto);
    assert.match(valor, /Duermen en el campamento: \d+ personas?/);
    const total = valor.match(/Total: (\d+) llegadas?/)?.[1];
    const resumen = await cdp.evaluate(`document.querySelector("[data-campamento-resumen]").textContent`);
    assert.ok(total && resumen.startsWith(`${total} llegada`), `el resumen («${resumen}») y el texto (${total}) cuentan lo mismo`);

    // Mover la fecha cambia el primer día de la lista.
    const otra = await cdp.evaluate(`new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)`);
    await cdp.evaluate(`window.__valor(".dialog input[name=desde]", ${JSON.stringify(otra)})`);
    const dia = Number(otra.slice(8));
    await waitUntil(cdp, `${texto}.split("\\n")[1].includes("del ${dia} ")`, "la lista desde la otra fecha");

    assert.deepEqual(lista, [], "sin errores en la consola");
    return "Campamento: lista desde la Agenda, dos semanas y otra fecha";
  } finally {
    cdp.close();
  }
}

// Mis vuelos. La ficha de la persona (demostración): el RUT se valida al
// guardar, el teléfono queda internacional y «Dar código» muestra el código con
// el enlace de WhatsApp ya escrito. La pantalla del trabajador, en el ancho de
// un teléfono: el formulario de RUT y código, y su demostración con el próximo
// viaje, el código de reserva y el calendario. Entrar de verdad no se prueba
// aquí: eso es la base (lib/mis-vuelos-postgres.test.ts).
async function misVuelos(cdpPort, appUrl) {
  const { cdp, lista } = await abrirDemo(cdpPort, appUrl);
  const abrirFicha = () => cdp.evaluate(`(() => {
    const fila = [...document.querySelectorAll("main article")].find((a) => a.querySelector("h2")?.textContent === "Persona de ejemplo 1");
    return window.__clic("Editar", fila);
  })()`);
  try {
    await ir(cdp, "Personas");
    await abrirFicha();
    await waitUntil(cdp, `!!document.querySelector("[data-acceso-mis-vuelos]") && !!window.__boton("Dar código", document.querySelector(".dialog"))`, "el acceso a Mis vuelos en la ficha");
    assert.equal(await cdp.evaluate(`document.querySelector(".dialog input[name=rut]").value`), "11.111.111-1");

    await cdp.evaluate(`window.__clic("Dar código", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `!!document.querySelector("[data-codigo-mis-vuelos]")`, "el código entregado");
    const codigo = await cdp.evaluate(`document.querySelector("[data-codigo-mis-vuelos] strong").textContent`);
    assert.match(codigo, /^\d{4}$/);
    const whatsapp = await cdp.evaluate(`[...document.querySelectorAll("[data-codigo-mis-vuelos] a")].find((a) => a.textContent.includes("WhatsApp")).href`);
    assert.ok(whatsapp.startsWith("https://wa.me/56900000000?text="), whatsapp);
    const mensaje = decodeURIComponent(whatsapp.split("text=")[1]);
    assert.ok(mensaje.includes(`código: ${codigo}`) && mensaje.includes("/mis-vuelos con tu RUT"), mensaje);

    // Un RUT con el dígito verificador equivocado no se guarda, y lo dice.
    await cdp.evaluate(`window.__valor(".dialog input[name=rut]", "11.111.111-2")`);
    await cdp.evaluate(`window.__clic("Guardar", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `/RUT no es válido/.test(window.__error())`, "el error de RUT");
    await cdp.evaluate(`window.__valor(".dialog input[name=rut]", "11111111-1")`);
    await cdp.evaluate(`window.__valor(".dialog input[name=phone]", "9 1234 5678")`);
    await cdp.evaluate(`window.__clic("Guardar", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `window.__aviso().startsWith("Persona guardada")`, "la ficha guardada");
    await waitUntil(cdp, `!document.querySelector(".dialog")`, "el diálogo cerrado");
    await abrirFicha();
    await waitUntil(cdp, `!!document.querySelector(".dialog input[name=phone]")`, "la ficha otra vez");
    assert.equal(await cdp.evaluate(`document.querySelector(".dialog input[name=phone]").value`), "+56 9 1234 5678");
    assert.deepEqual(lista, [], "sin errores en la consola (coordinación)");
  } finally {
    cdp.close();
  }

  // La pantalla del trabajador, en un teléfono.
  const target = await openTarget(cdpPort);
  const telefono = await Cdp.connect(target.webSocketDebuggerUrl);
  const erroresDelTrabajador = errores(telefono);
  try {
    await Promise.all([telefono.send("Page.enable"), telefono.send("Runtime.enable")]);
    await telefono.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await telefono.send("Page.navigate", { url: new URL("mis-vuelos", appUrl).href });
    await waitUntil(telefono, `!!document.querySelector("input[name=rut]") && !!document.querySelector("input[name=codigo]")`, "el formulario de Mis vuelos");
    await telefono.evaluate(AYUDAS);
    assert.equal(await telefono.evaluate(`document.querySelector("input[name=codigo]").inputMode`), "numeric");
    assert.equal(await telefono.evaluate(`document.title`), "Mis vuelos · Daybook Travel");

    await telefono.evaluate(`document.querySelector("[data-mis-vuelos-demo]").click()`);
    await waitUntil(telefono, `document.querySelectorAll("[data-viaje-trabajador]").length > 1`, "los vuelos de la demostración");
    const texto = await telefono.evaluate(`document.querySelector("main").innerText`);
    assert.match(texto, /Hola, Persona/);
    assert.match(texto, /TU PRÓXIMO VIAJE|Tu próximo viaje/i);
    const primero = await telefono.evaluate(`document.querySelector("[data-viaje-trabajador]").innerText`);
    assert.match(primero, /DEMO01/);
    assert.match(primero, /Pasaje listo/);
    assert.match(texto, /Pasaje por confirmar/);
    assert.match(texto, /aviso por WhatsApp/);
    assert.equal(await telefono.evaluate(`!!document.querySelector("[data-mis-vuelos-calendario]")`), true, "el botón del calendario");
    assert.equal(await telefono.evaluate(`document.documentElement.scrollWidth`), 390, "nada se sale a 390 px");

    await telefono.evaluate(`document.querySelector("[data-mis-vuelos-salir]").click()`);
    await waitUntil(telefono, `!!document.querySelector("input[name=rut]")`, "Salir vuelve al formulario");
    assert.deepEqual(erroresDelTrabajador, [], "sin errores en la consola (trabajador)");
    return `Mis vuelos: código con WhatsApp, RUT validado, teléfono internacional y la pantalla del trabajador a 390 px`;
  } finally {
    telefono.close();
  }
}

async function main() {
  const { cdpPort, appUrl } = await startBrowser();
  for (const escenario of [planificarYSolicitar, cerrarEnBloque, revisarYReservar, campamento, misVuelos, bita, noPerderLoEscrito, motivoYAnticipacion, telefono]) {
    console.log(`✓ ${await escenario(cdpPort, appUrl)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } finally {
    await teardown();
  }
}
