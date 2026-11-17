// Contratos de código de Bita: lo que no puede cambiar sin que una prueba avise.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const raiz = new URL("../", import.meta.url);
const leer = (ruta: string) => readFile(new URL(ruta, raiz), "utf8");

async function archivosDeBita() {
  const lib = (await readdir(new URL("lib/", raiz))).filter((n) => n.startsWith("bita-") && !n.endsWith(".test.ts")).map((n) => `lib/${n}`);
  return [
    ...lib,
    "app/api/bita/route.ts",
    "app/api/bita/estado/route.ts",
    "app/api/bita/documento/route.ts",
    "app/api/bita/_dependencias.ts",
    "components/bita.tsx",
    "components/bita-avatar.tsx",
    "components/bita-propuesta.tsx",
  ];
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
  assert.match(await leer("app/api/bita/documento/route.ts"), /manejarDocumento\(/);
  const manejador = await leer("lib/bita-handler.ts");
  for (const funcion of ["manejarPregunta", "manejarCupo", "manejarEstado"]) {
    const cuerpo = manejador.slice(manejador.indexOf(`function ${funcion}`));
    assert.ok(cuerpo.indexOf("bitaHabilitada(env)") < cuerpo.indexOf("deps."), `${funcion}: el interruptor va primero`);
  }
  const documento = await leer("lib/bita-documento-handler.ts");
  const cuerpoDocumento = documento.slice(documento.indexOf("function manejarDocumento"));
  assert.ok(cuerpoDocumento.indexOf("bitaHabilitada(env)") < cuerpoDocumento.indexOf("deps."), "manejarDocumento: el interruptor va primero");
  assert.ok(
    cuerpoDocumento.indexOf("extraerDocumento(") < cuerpoDocumento.indexOf("cupo.reservar("),
    "un archivo que no se puede leer no gasta un mensaje: el cupo se reserva después de abrirlo",
  );
  assert.ok(cuerpoDocumento.indexOf("cupo.reservar(") < cuerpoDocumento.indexOf("cargarDatos("), "el cupo va antes de leer la operación");
  assert.ok(cuerpoDocumento.indexOf("mascara.bloques(") < cuerpoDocumento.indexOf("leerConModelo("), "el texto sale al modelo ya enmascarado");
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

test("los viajes de un documento los crea el navegador de quien confirma, igual que «Planificar turnos»; el servidor solo propone", async () => {
  const hook = await leer("app/estado/use-acciones-documento.ts");
  const generar = await leer("app/estado/use-acciones-generar.ts");
  const opciones = /onConflict:\s*"person_id,date,direction",\s*ignoreDuplicates:\s*true/;
  assert.match(hook, opciones, "no pisa lo que ya existe");
  assert.match(generar, opciones, "es la misma vía que Planificar turnos");
  assert.ok(!/\.(update|delete)\(|\.rpc\(/.test(hook), "solo inserta");
  assert.ok(!/service_role|SERVICE_ROLE/.test(hook));
  // Lo que el servidor devuelve es una propuesta: ninguna de sus piezas conoce la base.
  for (const archivo of ["lib/bita-documento.ts", "lib/bita-documento-handler.ts", "lib/bita-documento-modelo.ts", "lib/bita-documento-propuesta.ts", "lib/bita-documento-mascara.ts"]) {
    const fuente = await leer(archivo);
    assert.ok(!/@supabase|supabase\.ts|\.from\(\s*["'`]/.test(fuente), `${archivo} no toca la base`);
  }
});

test("el navegador no carga lo que es solo del servidor: lectores de archivos, pdf.js ni el SDK", async () => {
  for (const archivo of ["components/bita.tsx", "components/bita-propuesta.tsx", "lib/bita-ui.ts", "app/estado/use-acciones-documento.ts"]) {
    const fuente = await leer(archivo);
    assert.ok(!/from "(\.\.?\/)+(lib\/)?bita-documento(-[a-z]+)?(\.ts)?"/.test(fuente), `${archivo} importa un módulo de servidor`);
    assert.ok(!/read-excel-file|unpdf|fflate|@anthropic-ai/.test(fuente), `${archivo} importa una librería de servidor`);
  }
});
