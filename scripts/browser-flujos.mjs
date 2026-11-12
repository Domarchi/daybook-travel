// Los flujos principales de Daybook Travel, en un navegador de verdad y con la
// demostración (sin Supabase): planificar turnos, armar el manifiesto, marcar
// como solicitado, editar un viaje con su motivo, el aviso de persona repetida
// y cerrar en bloque los viajes pasados sin reserva.
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

    assert.deepEqual(lista, [], "sin errores en la consola");
    return `planificar ${nuevos} viajes, manifiesto, solicitado, motivo mínimo y persona repetida`;
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

async function main() {
  const { cdpPort, appUrl } = await startBrowser();
  for (const escenario of [planificarYSolicitar, cerrarEnBloque]) {
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
