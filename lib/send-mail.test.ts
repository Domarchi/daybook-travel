import test from "node:test";
import assert from "node:assert/strict";
import { ENDPOINT_DE_RESEND, enviarConResend } from "./send-mail.ts";

const configuracion = { apiKey: "re_clave_de_prueba", desde: "Daybook Travel <avisos@obra.test>" };
const mensaje = { para: ["katy@obra.test"], asunto: "Asunto", texto: "Texto", html: "<p>Texto</p>" };

test("envía a Resend con la clave en el encabezado y el cuerpo esperado", async () => {
  let pedido: { url: string; init: RequestInit } | null = null;
  await enviarConResend(configuracion, mensaje, (async (url: string, init: RequestInit) => {
    pedido = { url, init };
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch);
  assert.ok(pedido);
  const { url, init } = pedido as { url: string; init: RequestInit };
  assert.equal(url, ENDPOINT_DE_RESEND);
  assert.equal(init.method, "POST");
  assert.equal((init.headers as Record<string, string>).Authorization, "Bearer re_clave_de_prueba");
  assert.deepEqual(JSON.parse(String(init.body)), {
    from: configuracion.desde, to: mensaje.para, subject: "Asunto", text: "Texto", html: "<p>Texto</p>",
  });
});

test("un rechazo de Resend falla diciendo solo el código, sin repetir su respuesta", async () => {
  const respuesta = '{"message":"clave re_clave_de_prueba inválida para katy@obra.test"}';
  await assert.rejects(
    enviarConResend(configuracion, mensaje, (async () => new Response(respuesta, { status: 403 })) as unknown as typeof fetch),
    (error: Error) => {
      assert.match(error.message, /HTTP 403/);
      assert.doesNotMatch(error.message, /re_clave|katy@/);
      return true;
    },
  );
});

test("sin destinatarios no llama a nadie", async () => {
  let llamadas = 0;
  await assert.rejects(
    enviarConResend(configuracion, { ...mensaje, para: [] }, (async () => { llamadas++; return new Response("{}"); }) as unknown as typeof fetch),
    /destinatarios/,
  );
  assert.equal(llamadas, 0);
});
