// Lo simulado para probar a Bita con documentos sin Supabase ni Anthropic reales:
// las fechas, las fichas, una Supabase mínima, un Anthropic que responde
// `proponer_viajes` según el texto que recibe, y los archivos de prueba. Lo usan
// scripts/browser-bita-documento.mjs (con navegador) y la prueba de la ruta contra
// la compilación de producción.
import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { jsPDF } from "jspdf";
import { strToU8, zipSync } from "fflate";
import writeXlsxFile from "write-excel-file/node";

// ── Fechas ─────────────────────────────────────────────────────────────────
export const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
export const mas = (n) => {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ── Datos de la prueba ─────────────────────────────────────────────────────
const persona = (id, name, code, extra = {}) => ({
  id, version: 1, employee_code: code, name, origin: "Santiago", destination: "Copiapó", shift: "4×3", start_date: "2026-01-05",
  end_date: null, up_weekday: 1, down_weekday: 4, baggage: "Mochila", active: true, updated_at: "2026-11-01T00:00:00Z", ...extra,
});
export const personas = [
  persona("p-ana", "Ana Rojas Díaz", "E-1002"),
  persona("p-juan", "Juan Pérez Soto", "E-1001"),
  persona("p-luis", "Luis Vega Mora", "E-1003", { end_date: mas(3) }),
  persona("p-pedro", "Pedro Olmos Ibáñez", "E-1004", { active: false }),
];
const viaje = (id, person_id, date, direction) => ({
  id, version: 1, person_id, date, planned_date: null, direction, origin: direction === "SUBIDA" ? "Santiago" : "Copiapó",
  destination: direction === "SUBIDA" ? "Copiapó" : "Santiago", requested_time: null, baggage: "Mochila", status: "Planificado",
  pnr: "", flight: "", amount: null, notes: "", updated_at: "2026-11-01T00:00:00Z",
});

// ── Supabase falsa ─────────────────────────────────────────────────────────
export const TOKEN = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(
  JSON.stringify({ sub: "u-prueba", role: "authenticated", exp: 4102444800 }),
).toString("base64url")}.firma`;

function leerCuerpo(request) {
  return new Promise((resolve) => {
    const partes = [];
    request.on("data", (p) => partes.push(p));
    request.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
  });
}

export async function crearSupabase() {
  const estado = { viajes: [viaje("t-ana", "p-ana", mas(7), "SUBIDA")], usados: 0, inserciones: [], fallarProxima: false, consultasDeViajes: 0, siguiente: 1 };
  const servidor = createServer(async (request, response) => {
    const url = new URL(request.url, "http://x");
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": request.headers["access-control-request-headers"] ?? "*",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "access-control-expose-headers": "*",
    };
    const responder = (codigo, cuerpo) => {
      response.writeHead(codigo, { ...cors, "content-type": "application/json" });
      response.end(JSON.stringify(cuerpo));
    };
    if (request.method === "OPTIONS") {
      response.writeHead(204, cors);
      response.end();
      return;
    }
    const cuerpo = await leerCuerpo(request);
    const ruta = url.pathname;
    if (ruta === "/auth/v1/token") {
      return responder(200, {
        access_token: TOKEN, token_type: "bearer", expires_in: 3600, expires_at: 4102444800, refresh_token: "refresco",
        user: { id: "u-prueba", aud: "authenticated", role: "authenticated", email: "katy@fcc.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
      });
    }
    if (ruta === "/auth/v1/user")
      return responder(200, { id: "u-prueba", aud: "authenticated", role: "authenticated", email: "katy@fcc.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
    if (ruta === "/auth/v1/logout") return responder(204, {});
    if (ruta === "/rest/v1/rpc/is_member" || ruta === "/rest/v1/rpc/is_admin") return responder(200, true);
    if (ruta === "/rest/v1/rpc/bita_reserve_message") {
      const limite = Number(JSON.parse(cuerpo || "{}").p_limit);
      if (estado.usados >= limite) return responder(200, [{ allowed: false, used: estado.usados }]);
      estado.usados += 1;
      return responder(200, [{ allowed: true, used: estado.usados }]);
    }
    if (ruta === "/rest/v1/rpc/bita_refund_message") {
      estado.usados = Math.max(0, estado.usados - 1);
      return responder(200, null);
    }
    if (ruta === "/rest/v1/rpc/bita_messages_today") return responder(200, estado.usados);
    if (ruta.startsWith("/rest/v1/rpc/")) return responder(200, []);
    if (ruta === "/rest/v1/trips" && request.method === "POST") {
      const filas = JSON.parse(cuerpo);
      estado.inserciones.push({ filas, prefer: request.headers.prefer ?? "", conflicto: url.searchParams.get("on_conflict") });
      if (estado.fallarProxima) {
        estado.fallarProxima = false;
        return responder(403, { code: "42501", message: "permission denied for table trips" });
      }
      const nuevos = [];
      for (const fila of filas) {
        const p = personas.find((x) => x.id === fila.person_id);
        // validate_trip: el viaje debe caer dentro de la vigencia de una persona activa.
        if (!p || !p.active || fila.date < p.start_date || (p.end_date && fila.date > p.end_date))
          return responder(400, { code: "P0001", message: "El viaje debe estar dentro de la vigencia de una persona activa" });
        if (estado.viajes.some((v) => v.person_id === fila.person_id && v.date === fila.date && v.direction === fila.direction)) continue;
        const nuevo = { ...fila, id: `t-nuevo-${estado.siguiente++}`, version: 1, planned_date: null, updated_at: new Date().toISOString() };
        estado.viajes.push(nuevo);
        nuevos.push({ id: nuevo.id });
      }
      return responder(201, nuevos);
    }
    if (ruta === "/rest/v1/people") return responder(200, personas);
    if (ruta === "/rest/v1/trips") {
      estado.consultasDeViajes += 1;
      return responder(200, estado.viajes);
    }
    if (ruta === "/rest/v1/settings") return responder(200, (request.headers.accept ?? "").includes("pgrst.object") ? { purchase_window_days: 21 } : [{ purchase_window_days: 21 }]);
    return responder(200, []);
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return { estado, puerto: servidor.address().port, cerrar: () => servidor.close() };
}

// ── Anthropic falso ────────────────────────────────────────────────────────
export async function crearAnthropic() {
  const recibido = [];
  const servidor = createServer(async (request, response) => {
    const cuerpo = JSON.parse((await leerCuerpo(request)) || "{}");
    recibido.push(cuerpo);
    const texto = String(cuerpo.messages?.[0]?.content ?? "");
    const viajes = [];
    const sinIdentificar = [];
    for (const linea of texto.split("\n")) {
      const fecha = /\b(\d{4}-\d{2}-\d{2})\b/.exec(linea)?.[1];
      if (!fecha) continue;
      const fila = /^\[fila (\d+)\]/.exec(linea)?.[1];
      const ficha = /\bP-[0-9a-f]{4,8}\b/.exec(linea)?.[0];
      const sin = /Persona sin ficha \d+/.exec(linea)?.[0];
      const ciudades = [...linea.matchAll(/(?<!\p{L})(Santiago|Copiapó|Calama)(?!\p{L})/gu)].map((m) => m[1]);
      if (ficha)
        viajes.push({ persona: ficha, fecha, origen: ciudades[0] ?? null, destino: ciudades[1] ?? null, hora: /\b(\d{2}:\d{2})\b/.exec(linea)?.[1] ?? null, fila: fila ? Number(fila) : null });
      else if (sin) sinIdentificar.push({ referencia: sin, motivo: "No tiene ficha en Travel" });
    }
    const salida = { resumen: `Encontré ${viajes.length + sinIdentificar.length} filas con vuelos.`, viajes, sin_identificar: sinIdentificar };
    response.writeHead(200, { "content-type": "application/json", "request-id": "req_prueba" });
    response.end(
      JSON.stringify({
        id: "msg_prueba", type: "message", role: "assistant", model: cuerpo.model, stop_reason: "tool_use", stop_sequence: null,
        content: [{ type: "tool_use", id: "toolu_prueba", name: "proponer_viajes", input: salida }],
        usage: { input_tokens: 1200, output_tokens: 350, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }),
    );
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return { recibido, puerto: servidor.address().port, cerrar: () => servidor.close() };
}

// ── Documentos de prueba ───────────────────────────────────────────────────
const celda = (v) => (typeof v === "number" ? { value: v, type: Number } : { value: String(v) });
export async function excel(carpeta) {
  const filas = [
    ["Fecha", "Pasajero", "RUT", "Origen", "Destino", "Hora", "Vuelo", "PNR", "Monto", "Observaciones"],
    [mas(7), "Ana Rojas Díaz", "12.345.678-5", "Santiago", "Copiapó", "08:30", "LA123", "DJVHQQ", 85000, ""],
    [mas(8), "Juan Pérez Soto", "9.876.543-K", "Santiago", "Copiapó", "07:15", "H2 4567", "XYZ987", 90000, "Avisar a juan.perez@fcc.cl o al +56 9 8765 4321"],
    [mas(9), "Juan Pérez Soto", "9.876.543-K", "Copiapó", "Santiago", "18:40", "LA 801", "QWE456", 70000, ""],
    [mas(12), "Luis Vega Mora", "8.111.222-3", "Santiago", "Copiapó", "09:00", "LA 205", "ABC789", 65000, ""],
    [mas(10), "Carlos Díaz Mena", "7.654.321-0", "Santiago", "Copiapó", "10:00", "LA 333", "RTY654", 60000, ""],
    [mas(-3), "Ana Rojas Díaz", "12.345.678-5", "Copiapó", "Santiago", "17:00", "LA 410", "UIO321", 55000, ""],
    [mas(11), "Pedro Olmos Ibáñez", "6.543.210-9", "Santiago", "Copiapó", "11:30", "LA 515", "ZXC852", 58000, ""],
  ].map((f) => f.map(celda));
  const ruta = join(carpeta, "manifiesto.xlsx");
  await writeFile(ruta, new Uint8Array(await writeXlsxFile(filas, { buffer: true, sheet: "Vuelos" })));
  return ruta;
}
export async function word(carpeta) {
  const p = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  const fila = (...c) => `<w:tr>${c.map((x) => `<w:tc>${p(x)}</w:tc>`).join("")}</w:tr>`;
  const cuerpo =
    p("Itinerario de la semana") +
    `<w:tbl>${fila("Fecha", "Pasajero", "Origen", "Destino", "Hora")}${fila(mas(20), "Ana Rojas Díaz", "Santiago", "Copiapó", "08:00")}${fila(mas(21), "Juan Pérez Soto", "Copiapó", "Santiago", "19:10")}</w:tbl>`;
  const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}</w:body></w:document>`;
  const ruta = join(carpeta, "itinerario.docx");
  await writeFile(ruta, zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "word/document.xml": strToU8(xml) }));
  return ruta;
}
export async function pdf(carpeta) {
  const doc = new jsPDF();
  doc.text("Pasajes confirmados", 10, 15);
  doc.text(`${mas(22)}  Ana Rojas Díaz  Santiago  Copiapó  06:45`, 10, 30);
  doc.text(`${mas(23)}  Juan Pérez Soto  Copiapó  Santiago  20:15`, 10, 38);
  const ruta = join(carpeta, "pasajes.pdf");
  await writeFile(ruta, new Uint8Array(doc.output("arraybuffer")));
  return ruta;
}

