// Contratos de código de Bita: lo que no puede cambiar sin que una prueba avise.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const raiz = new URL("../", import.meta.url);
const leer = (ruta: string) => readFile(new URL(ruta, raiz), "utf8");

async function archivosDeBita() {
  const lib = (await readdir(new URL("lib/", raiz))).filter((n) => n.startsWith("bita-") && !n.endsWith(".test.ts")).map((n) => `lib/${n}`);
  return [...lib, "app/api/bita/route.ts", "app/api/bita/estado/route.ts", "app/api/bita/_dependencias.ts", "components/bita.tsx", "components/bita-avatar.tsx"];
}

test("la llave de Anthropic vive solo en el servidor y se lee en dos sitios", async () => {
  for (const archivo of await archivosDeBita()) {
    const fuente = await leer(archivo);
    if (archivo === "lib/bita-config.ts" || archivo === "app/api/bita/_dependencias.ts") continue;
    assert.ok(!fuente.includes("ANTHROPIC_API_KEY"), `${archivo} no debe leer la llave`);
  }
  const pantalla = await leer("components/bita.tsx");
  assert.ok(!/ANTHROPIC|SERVICE_ROLE|bita_reserve|@anthropic-ai/.test(pantalla), "nada de llaves ni del SDK en el navegador");
  for (const archivo of await archivosDeBita()) assert.ok(!/NEXT_PUBLIC_(ANTHROPIC|BITA)/.test(await leer(archivo)), archivo);
});

test("Bita solo lee: ninguna escritura en tablas, y la llave de servicio solo cuenta mensajes", async () => {
  for (const archivo of await archivosDeBita()) {
    const fuente = await leer(archivo);
    assert.ok(!/\.(insert|update|upsert|delete)\(/.test(fuente), `${archivo} escribe en una tabla`);
  }
  const dependencias = await leer("app/api/bita/_dependencias.ts");
  const usos = dependencias.match(/deServicio\(\)\.[a-z]+\("[a-z_]+"/g) ?? [];
  assert.deepEqual(usos, [
    'deServicio().rpc("bita_reserve_message"',
    'deServicio().rpc("bita_refund_message"',
    'deServicio().rpc("bita_messages_today"',
  ]);
  // Todo lo demás se lee con el token de la persona.
  assert.match(dependencias, /Authorization: `Bearer \$\{token\}`/);
  assert.ok(!/deServicio\(\)\.from\(/.test(dependencias));
});

test("las rutas pasan por el manejador, que revisa el interruptor antes que nada", async () => {
  assert.match(await leer("app/api/bita/route.ts"), /manejarCupo\(|manejarPregunta\(/);
  assert.match(await leer("app/api/bita/estado/route.ts"), /manejarEstado\(/);
  const manejador = await leer("lib/bita-handler.ts");
  for (const funcion of ["manejarPregunta", "manejarCupo", "manejarEstado"]) {
    const cuerpo = manejador.slice(manejador.indexOf(`function ${funcion}`));
    assert.ok(cuerpo.indexOf("bitaHabilitada(env)") < cuerpo.indexOf("deps."), `${funcion}: el interruptor va primero`);
  }
});

test("la migración 014 solo le da el contador a la llave de servicio y no toca nada existente", async () => {
  const sql = await leer("supabase/014_bita_uso.sql");
  assert.ok(!/grant[^;]*to (anon|authenticated)/i.test(sql), "nada para el navegador");
  assert.equal((sql.match(/grant execute on function public\.bita_\w+\([^)]*\) to service_role/g) ?? []).length, 3);
  assert.ok(!/alter table public\.(people|trips|history|members|settings)/i.test(sql));
  assert.ok(!/\bdelete\b/i.test(sql.replace(/^--.*$/gm, "")), "nadie borra nada");
});

test("el modelo nunca ve el código de reserva, el vuelo ni el monto de un viaje", async () => {
  const herramientas = await leer("lib/bita-herramientas.ts");
  const linea = herramientas.slice(herramientas.indexOf("export function lineaDeViaje"), herramientas.indexOf("function rango"));
  assert.ok(!/viaje\.(pnr|flight|amount)\b(?!\s*\?\?)/.test(linea.replace("(viaje.pnr ?? \"\")", "")), "solo si tiene reserva");
  assert.ok(!/pnr:|flight:|amount:|monto:/.test(linea));
});
