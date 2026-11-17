// Bita lee Excel, Word y PDF con la compilación de producción (`next build` + `next start`).
//
// En desarrollo todo funciona aunque el empaquetado de producción rompa pdf.js o el
// lector de Excel (archivos que no entran en la función, módulos que se resuelven
// distinto). Esta prueba arranca lo compilado, con una Supabase y un Anthropic
// falsos (scripts/bita-simulados.mjs), y sube un archivo de cada formato a
// POST /api/bita/documento. Requiere haber corrido `npm run build`.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOKEN, crearAnthropic, crearSupabase, excel, pdf, word } from "./bita-simulados.mjs";

const raiz = fileURLToPath(new URL("..", import.meta.url));

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

const supabase = await crearSupabase();
const anthropic = await crearAnthropic();
const puerto = await puertoLibre();
const salida = [];
const next = spawn(process.execPath, [join(raiz, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(puerto)], {
  cwd: raiz,
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${supabase.puerto}`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "llave-publicable-de-prueba",
    SUPABASE_SERVICE_ROLE_KEY: "llave-de-servicio-de-prueba",
    BITA_ENABLED: "1",
    BITA_DAILY_LIMIT: "10",
    ANTHROPIC_API_KEY: "sk-ant-de-prueba",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${anthropic.puerto}`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
next.stdout.on("data", (d) => salida.push(String(d)));
next.stderr.on("data", (d) => salida.push(String(d)));

try {
  const base = `http://127.0.0.1:${puerto}`;
  const limite = Date.now() + 60_000;
  while (true) {
    if (next.exitCode !== null) throw new Error(`next start terminó antes de estar listo:\n${salida.join("")}`);
    const listo = await fetch(`${base}/api/bita/estado`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false);
    if (listo) break;
    if (Date.now() > limite) throw new Error(`next start no estuvo listo en 60 s:\n${salida.join("")}`);
    await new Promise((r) => setTimeout(r, 300));
  }

  const carpeta = await mkdtemp(join(tmpdir(), "bita-build-"));
  const subir = async (ruta, nombre) => {
    const f = new FormData();
    f.append("archivo", new File([await readFile(ruta)], nombre));
    const r = await fetch(`${base}/api/bita/documento`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: f });
    return { estado: r.status, cuerpo: await r.json() };
  };

  const casos = [
    ["xlsx", await excel(carpeta), "manifiesto.xlsx", { nuevos: 2, existen: 1, problemas: 3 }],
    ["docx", await word(carpeta), "itinerario.docx", { nuevos: 2, existen: 0, problemas: 0 }],
    ["pdf", await pdf(carpeta), "pasajes.pdf", { nuevos: 2, existen: 0, problemas: 0 }],
  ];
  for (const [formato, ruta, nombre, esperado] of casos) {
    const { estado, cuerpo } = await subir(ruta, nombre);
    assert.equal(estado, 200, `${formato}: ${JSON.stringify(cuerpo)}\n${salida.join("").slice(-1500)}`);
    assert.equal(cuerpo.formato, formato);
    const por = (e) => cuerpo.filas.filter((f) => f.estado === e).length;
    assert.deepEqual({ nuevos: por("nuevo"), existen: por("existe"), problemas: por("problema") }, esperado, formato);
    console.log(`✓ ${formato}: ${cuerpo.filas.length} filas desde la compilación de producción`);
  }
  // Nada identificable salió hacia el modelo, tampoco con lo compilado.
  const enviado = JSON.stringify(anthropic.recibido);
  for (const dato of ["Ana", "Rojas", "Juan", "Pérez", "Carlos", "12.345.678", "DJVHQQ", "LA123", "85000", "juan.perez"]) assert.ok(!enviado.includes(dato), `«${dato}» salió hacia el modelo`);
  // Un archivo dañado no gasta un mensaje.
  const usadosAntes = supabase.estado.usados;
  const roto = new FormData();
  roto.append("archivo", new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])], "roto.xlsx"));
  const r = await fetch(`${base}/api/bita/documento`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: roto });
  assert.ok([415, 422].includes(r.status), `archivo dañado: ${r.status}`);
  assert.equal(supabase.estado.usados, usadosAntes);
  console.log("✓ un archivo dañado no gasta mensajes");
} finally {
  next.kill("SIGTERM");
  supabase.cerrar();
  anthropic.cerrar();
}
