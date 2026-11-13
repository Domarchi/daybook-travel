// Los flujos principales de Daybook Travel, en un navegador de verdad y con la
// demostración (sin Supabase): planificar turnos, armar el manifiesto, marcar
// como solicitado, editar un viaje con su motivo, el aviso de persona repetida,
// cerrar en bloque los viajes pasados sin reserva, los viajes para revisar y la
// reserva en bloque.
//
// Hasta ahora el CI probaba en navegador solo la entrada y la recuperación de
// clave; el resto se comprobaba a mano. Esto no reemplaza las pruebas de
// `lib/`, que dicen si la regla está bien: dice si la pantalla la usa.
//
// Reusa el arranque del arnés de la entrada (Next en desarrollo + Chrome sin
// cabeza). Cada escenario abre su pestaña y termina sin errores en la consola.
import assert from "node:assert/strict";
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
  window.__aviso = () => document.querySelector("main [role=status]")?.textContent?.trim() ?? "";
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
    await cdp.evaluate(`window.__valor(".dialog input[name=pnr]", "")`);
    await cdp.evaluate(`window.__valor(".dialog input[name=amount]", "")`);
    await cdp.evaluate(`window.__valor(".dialog textarea[name=change_reason]", ".")`);
    await cdp.evaluate(`window.__clic("Guardar viaje", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `window.__error().includes("al menos 5 letras")`, "el rechazo del motivo corto");
    assert.equal(await hayDialogo(cdp), true, "con un motivo corto el diálogo sigue abierto");
    await cdp.evaluate(`window.__valor(".dialog textarea[name=change_reason]", "Cambio de hora")`);
    await cdp.evaluate(`window.__clic("Guardar viaje", document.querySelector(".dialog"))`);
    await waitUntil(cdp, `window.__aviso() === "Viaje guardado correctamente."`, "el viaje guardado");

    // Persona repetida: al escribir un nombre que ya está, el diálogo avisa.
    await ir(cdp, "Personas");
    await cdp.evaluate(`window.__clic("Nueva persona", document.querySelector("main"))`);
    await waitUntil(cdp, `!!document.querySelector(".dialog input[name=name]")`, "el diálogo de persona");
    await cdp.evaluate(`window.__valor(".dialog input[name=name]", "persona  de EJEMPLO 1")`);
    await waitUntil(cdp, `!!document.getElementById("persona-repetida")`, "el aviso de persona repetida");
    await cdp.evaluate(`window.__clic("Cancelar", document.querySelector(".dialog"))`);
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

async function main() {
  const { cdpPort, appUrl } = await startBrowser();
  for (const escenario of [planificarYSolicitar, cerrarEnBloque, revisarYReservar, bita]) {
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
