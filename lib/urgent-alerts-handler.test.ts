import test from "node:test";
import assert from "node:assert/strict";
import { manejarAlertas, type EntornoDeAlertas } from "./urgent-alerts-handler.ts";
import type { MensajeDeCorreo } from "./send-mail.ts";

const ENTORNO: EntornoDeAlertas = {
  CRON_SECRET: "secreto-del-cron",
  RESEND_API_KEY: "re_clave_de_prueba",
  ALERT_FROM: "Daybook Travel <avisos@obra.test>",
  ALERT_RECIPIENTS: "katy@obra.test, tamara@obra.test",
};
const DATOS = {
  hoy: "2026-09-10", ventana: 21,
  viajes: [{ id: "t1", persona: "Ana Pérez", fecha: "2026-09-12", sentido: "SUBIDA", origen: "Santiago", destino: "Copiapó", estado: "Planificado", hora: "08:30" }],
};

function pedido(autorizacion?: string, consulta = "") {
  return new Request("https://app.test/api/cron/alertas-urgentes" + consulta, {
    headers: autorizacion ? { authorization: autorizacion } : {},
  });
}

function entorno(extra: Partial<EntornoDeAlertas> = {}) {
  const enviados: MensajeDeCorreo[] = [];
  let consultas = 0;
  return {
    enviados,
    consultas: () => consultas,
    llamar: (solicitud: Request, datos: unknown = DATOS, entornoDeAlertas: EntornoDeAlertas = { ...ENTORNO, ...extra }) =>
      manejarAlertas({
        request: solicitud, entorno: entornoDeAlertas,
        consultar: async () => { consultas++; return datos; },
        enviar: async (mensaje) => { enviados.push(mensaje); },
      }),
  };
}

test("sin el secreto del cron configurado no responde a nadie (falla cerrado)", async () => {
  const t = entorno();
  const respuesta = await t.llamar(pedido("Bearer "), DATOS, { ...ENTORNO, CRON_SECRET: "" });
  assert.equal(respuesta.status, 503);
  assert.equal(t.consultas(), 0);
});

test("sin encabezado o con otro secreto es 401 y no toca la base ni manda nada", async () => {
  for (const autorizacion of [undefined, "Bearer otro", "secreto-del-cron", "Bearer secreto-del-cron-x"]) {
    const t = entorno();
    const respuesta = await t.llamar(pedido(autorizacion));
    assert.equal(respuesta.status, 401, String(autorizacion));
    assert.equal(t.consultas(), 0);
    assert.equal(t.enviados.length, 0);
  }
});

test("con el secreto correcto y viajes por comprar envía un correo a todos", async () => {
  const t = entorno();
  const respuesta = await t.llamar(pedido("Bearer secreto-del-cron"));
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), { enviado: true, vencidos: 0, urgentes: 1, destinatarios: 2 });
  assert.equal(t.enviados.length, 1);
  assert.deepEqual(t.enviados[0].para, ["katy@obra.test", "tamara@obra.test"]);
  assert.match(t.enviados[0].asunto, /1 viaje por comprar/);
});

test("la respuesta del cron no repite nombres ni correos", async () => {
  const respuesta = await entorno().llamar(pedido("Bearer secreto-del-cron"));
  const cuerpo = JSON.stringify(await respuesta.json());
  assert.doesNotMatch(cuerpo, /Ana|katy@|tamara@|Santiago/);
});

test("sin viajes por comprar no manda correo", async () => {
  const t = entorno();
  const respuesta = await t.llamar(pedido("Bearer secreto-del-cron"), { ...DATOS, viajes: [] });
  assert.deepEqual(await respuesta.json(), { enviado: false, motivo: "No hay viajes por comprar.", vencidos: 0, urgentes: 0 });
  assert.equal(t.enviados.length, 0);
});

test("sin la configuración del correo no envía y dice qué variables faltan, no sus valores", async () => {
  const t = entorno();
  const respuesta = await t.llamar(pedido("Bearer secreto-del-cron"), DATOS, { CRON_SECRET: "secreto-del-cron" });
  assert.equal(respuesta.status, 503);
  const cuerpo = await respuesta.json();
  assert.deepEqual(cuerpo.faltan, ["RESEND_API_KEY", "ALERT_FROM", "ALERT_RECIPIENTS"]);
  assert.equal(t.consultas(), 0, "ni siquiera consulta la base");
});

test("simular muestra el correo sin enviarlo y no exige la configuración del correo", async () => {
  const t = entorno();
  const respuesta = await t.llamar(pedido("Bearer secreto-del-cron", "?simular=1"), DATOS, { CRON_SECRET: "secreto-del-cron", ALERT_RECIPIENTS: "katy@obra.test" });
  assert.equal(respuesta.status, 200);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.simulado, true);
  assert.equal(cuerpo.enviado, false);
  assert.match(cuerpo.texto, /Ana Pérez/);
  assert.equal(t.enviados.length, 0);
});

test("si la base falla o devuelve algo raro, responde 502 y no envía", async () => {
  const t = entorno();
  const respuesta = await t.llamar(pedido("Bearer secreto-del-cron"), { hoy: "mal" });
  assert.equal(respuesta.status, 502);
  assert.equal(t.enviados.length, 0);
});

test("si el proveedor rechaza el envío, responde 502 con un mensaje genérico", async () => {
  const respuesta = await manejarAlertas({
    request: pedido("Bearer secreto-del-cron"), entorno: ENTORNO,
    consultar: async () => DATOS,
    enviar: async () => { throw new Error("Resend rechazó el envío (HTTP 403)."); },
  });
  assert.equal(respuesta.status, 502);
  const cuerpo = JSON.stringify(await respuesta.json());
  assert.doesNotMatch(cuerpo, /Resend|403|re_clave/);
});
