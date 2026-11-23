import test from "node:test";
import assert from "node:assert/strict";
import {
  correoDeRecordatorio,
  leerDatosDeRecordatorio,
  parametrosDeWhatsapp,
  textoDeWhatsapp,
} from "./recordatorios.ts";
import { limpiarParametro, enviarPorWhatsapp } from "./send-whatsapp.ts";
import { manejarRecordatorios } from "./recordatorios-handler.ts";
import type { MensajeDeCorreo } from "./send-mail.ts";
import type { MensajeDeWhatsapp } from "./send-whatsapp.ts";

const crudo = {
  hoy: "2026-11-23",
  manana: "2026-11-24",
  viajes: [
    { id: "t1", persona: "Persona de ejemplo", correo: "persona@obra.test", telefono: "+56911111111", fecha: "2026-11-24", sentido: "SUBIDA", origen: "Santiago", destino: "Copiapó", hora: "08:30", vuelo: "LA 340", reserva: "ABC123", equipaje: "Mochila" },
    { id: "t2", persona: "Otra Persona", correo: null, telefono: "+56922222222", fecha: "2026-11-24", sentido: "BAJADA", origen: "Copiapó", destino: "La Serena", hora: null, vuelo: "", reserva: "XYZ789", equipaje: "Por confirmar" },
  ],
};

test("lee lo que entrega la base y rechaza lo que no tiene forma", () => {
  const datos = leerDatosDeRecordatorio(crudo);
  assert.equal(datos.viajes.length, 2);
  assert.equal(datos.viajes[1].correo, null);
  assert.equal(datos.viajes[1].hora, null);
  assert.throws(() => leerDatosDeRecordatorio({ hoy: "ayer", viajes: [] }), /forma inesperada/);
  assert.throws(() => leerDatosDeRecordatorio({ hoy: "2026-11-23", viajes: [{}] }), /fecha válida/);
});

test("el correo dice ruta, fecha, vuelo, hora y código", () => {
  const datos = leerDatosDeRecordatorio(crudo);
  const correo = correoDeRecordatorio(datos.viajes[0], datos.hoy, "https://relevo-chi.vercel.app/mis-vuelos");
  assert.equal(correo.asunto, "Mañana viajas: Santiago → Copiapó a las 08:30");
  assert.match(correo.texto, /^Hola Persona, te recordamos tu vuelo de mañana\./);
  assert.match(correo.texto, /Subida: Santiago → Copiapó/);
  assert.match(correo.texto, /Fecha: Mañana, martes 24 de noviembre/);
  assert.match(correo.texto, /Vuelo: LA 340, a las 08:30/);
  assert.match(correo.texto, /Código de reserva: ABC123/);
  assert.match(correo.texto, /Equipaje: mochila/);
  assert.match(correo.html, /<a href="https:\/\/relevo-chi\.vercel\.app\/mis-vuelos">/);
  // Sin hora ni vuelo, lo dice en vez de dejar el hueco.
  const otro = correoDeRecordatorio(datos.viajes[1], datos.hoy, "x");
  assert.equal(otro.asunto, "Mañana viajas: Copiapó → La Serena");
  assert.match(otro.texto, /Vuelo: vuelo por confirmar, hora por confirmar/);
  assert.doesNotMatch(otro.texto, /Equipaje/);
});

test("los parámetros de la plantilla de WhatsApp van en orden y sin saltos", () => {
  const datos = leerDatosDeRecordatorio(crudo);
  const parametros = parametrosDeWhatsapp(datos.viajes[0], datos.hoy);
  assert.deepEqual(parametros, ["Persona", "martes 24 de noviembre", "Santiago → Copiapó", "LA 340, a las 08:30", "ABC123"]);
  assert.equal(
    textoDeWhatsapp(parametros),
    "Hola Persona, te recordamos tu vuelo de mañana martes 24 de noviembre: Santiago → Copiapó, LA 340, a las 08:30. Código de reserva: ABC123. Buen viaje.",
  );
  assert.equal(limpiarParametro("a\nb\tc      d"), "a b c   d");
  assert.equal(limpiarParametro("  "), "—", "WhatsApp rechaza un parámetro vacío");
});

test("envía la plantilla a la API de WhatsApp, y un rechazo no repite la respuesta", async () => {
  let pedido: { url: string; init: RequestInit } | null = null;
  const configuracion = { token: "tok_de_prueba", numeroId: "123456", plantilla: "recordatorio_vuelo", idioma: "es" };
  await enviarPorWhatsapp(configuracion, { para: "+56911111111", parametros: ["Persona", "x\ny"] }, (async (url: string, init: RequestInit) => {
    pedido = { url, init };
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch);
  const { url, init } = pedido as unknown as { url: string; init: RequestInit };
  assert.match(url, /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/123456\/messages$/);
  assert.equal((init.headers as Record<string, string>).Authorization, "Bearer tok_de_prueba");
  assert.deepEqual(JSON.parse(String(init.body)), {
    messaging_product: "whatsapp",
    to: "56911111111",
    type: "template",
    template: {
      name: "recordatorio_vuelo",
      language: { code: "es" },
      components: [{ type: "body", parameters: [{ type: "text", text: "Persona" }, { type: "text", text: "x y" }] }],
    },
  });
  await assert.rejects(
    enviarPorWhatsapp(configuracion, { para: "+56911111111", parametros: [] }, (async () =>
      new Response('{"error":"token tok_de_prueba para 56911111111"}', { status: 401 })) as unknown as typeof fetch),
    (error: Error) => /HTTP 401/.test(error.message) && !/tok_de|5691/.test(error.message),
  );
});

// El cron, con todo lo externo de mentira.
function preparar(entorno: Record<string, string>, opciones: { fallaCorreo?: boolean; fallaWhatsapp?: boolean } = {}) {
  const correos: MensajeDeCorreo[] = [];
  const whatsapps: MensajeDeWhatsapp[] = [];
  return {
    correos,
    whatsapps,
    llamar: (url = "https://relevo-chi.vercel.app/api/cron/recordatorios", autorizacion = "Bearer secreto") =>
      manejarRecordatorios({
        request: new Request(url, { headers: autorizacion ? { authorization: autorizacion } : {} }),
        entorno,
        consultar: async () => crudo,
        enviarCorreo: async (mensaje) => {
          if (opciones.fallaCorreo) throw new Error("caído");
          correos.push(mensaje);
        },
        enviarWhatsapp: async (mensaje) => {
          if (opciones.fallaWhatsapp) throw new Error("caído");
          whatsapps.push(mensaje);
        },
      }),
  };
}

const CORREO = { RESEND_API_KEY: "re_x", ALERT_FROM: "Daybook <avisos@obra.test>" };
const WHATSAPP = { WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_TEMPLATE: "recordatorio_vuelo" };

test("el cron falla cerrado: sin secreto, con otro secreto o sin canales", async () => {
  assert.equal((await preparar({ ...CORREO }).llamar()).status, 503);
  assert.equal((await preparar({ CRON_SECRET: "secreto", ...CORREO }).llamar(undefined, "Bearer otro")).status, 401);
  assert.equal((await preparar({ CRON_SECRET: "secreto", ...CORREO }).llamar(undefined, "")).status, 401);
  const sinCanales = await preparar({ CRON_SECRET: "secreto" }).llamar();
  assert.equal(sinCanales.status, 503);
  const cuerpo = await sinCanales.json();
  assert.ok(cuerpo.faltan.includes("WHATSAPP_TOKEN"));
});

test("manda por cada canal configurado a quien tenga ese dato, y responde solo cantidades", async () => {
  const todo = preparar({ CRON_SECRET: "secreto", ...CORREO, ...WHATSAPP });
  const respuesta = await todo.llamar();
  assert.equal(respuesta.status, 200);
  const cuerpo = await respuesta.json();
  assert.deepEqual(cuerpo, { viajes: 2, correo: { enviados: 1, fallidos: 0 }, whatsapp: { enviados: 2, fallidos: 0 } });
  assert.deepEqual(todo.correos.map((c) => c.para), [["persona@obra.test"]]);
  assert.deepEqual(todo.whatsapps.map((w) => w.para), ["+56911111111", "+56922222222"]);
  assert.ok(!JSON.stringify(cuerpo).includes("Persona"));

  // Con un solo canal, solo ese.
  const soloWhatsapp = preparar({ CRON_SECRET: "secreto", ...WHATSAPP });
  assert.equal((await soloWhatsapp.llamar()).status, 200);
  assert.equal(soloWhatsapp.correos.length, 0);
  assert.equal(soloWhatsapp.whatsapps.length, 2);
});

test("un envío caído no detiene a los demás; si cae todo, responde 502", async () => {
  const mitad = preparar({ CRON_SECRET: "secreto", ...CORREO, ...WHATSAPP }, { fallaCorreo: true });
  const respuesta = await mitad.llamar();
  assert.equal(respuesta.status, 200);
  assert.deepEqual((await respuesta.json()).correo, { enviados: 0, fallidos: 1 });
  assert.equal(mitad.whatsapps.length, 2);
  const nada = preparar({ CRON_SECRET: "secreto", ...CORREO, ...WHATSAPP }, { fallaCorreo: true, fallaWhatsapp: true });
  assert.equal((await nada.llamar()).status, 502);
});

test("simular arma los mensajes sin mandar nada, aunque falten los canales", async () => {
  const simulado = preparar({ CRON_SECRET: "secreto" });
  const respuesta = await simulado.llamar("https://relevo-chi.vercel.app/api/cron/recordatorios?simular=1");
  assert.equal(respuesta.status, 200);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.simulado, true);
  assert.equal(cuerpo.correos.length, 1);
  assert.equal(cuerpo.whatsapps.length, 2);
  assert.match(cuerpo.whatsapps[0].texto, /Código de reserva: ABC123/);
  assert.equal(simulado.correos.length + simulado.whatsapps.length, 0);
});
