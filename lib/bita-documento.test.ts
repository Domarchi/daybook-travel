// Bita lee documentos: los tres formatos, el enmascarado y la propuesta.
// Los archivos de prueba se arman aquí mismo (write-excel-file, fflate y jsPDF).
import assert from "node:assert/strict";
import test from "node:test";
import { jsPDF } from "jspdf";
import { strToU8, zipSync } from "fflate";
import writeXlsxFile from "write-excel-file/node";
import {
  ErrorDeDocumento,
  MAX_ARCHIVO_BYTES,
  MAX_TEXTO,
  aTexto,
  celdaATexto,
  detectarFormato,
  extraerDocumento,
  textoDeDocx,
} from "./bita-documento.ts";
import { crearMascara } from "./bita-documento-mascara.ts";
import { MAX_VIAJES, armarPropuesta, horaValida, sentidoPorRuta } from "./bita-documento-propuesta.ts";
import type { DatosBita } from "./bita-herramientas.ts";
import { crearSeudonimos } from "./bita-seudonimos.ts";
import type { Person, Trip } from "./types.ts";

const HOY = "2026-11-17";

const persona = (id: string, name: string, extra: Partial<Person> = {}): Person => ({
  id, name, origin: "Santiago", destination: "Copiapó", shift: "4×3", start_date: "2026-01-05", end_date: null, baggage: "Mochila", active: true, ...extra,
});
const personas: Person[] = [
  persona("p-juan", "Juan Pérez Soto", { employee_code: "E-1001" }),
  persona("p-ana", "Ana Rojas Díaz", { employee_code: "E-1002" }),
  persona("p-luis", "Luis Vega Mora", { end_date: "2026-11-30" }),
  persona("p-pedro", "Pedro Olmos Ibáñez", { active: false }),
  persona("p-juant", "Juan Torres Vega"),
];
const viaje = (id: string, person_id: string, date: string, direction = "SUBIDA"): Trip => ({
  id, person_id, date, direction, origin: "Santiago", destination: "Copiapó", requested_time: null, baggage: "Mochila", status: "Planificado", pnr: "DJVHQQ", flight: "LA123", amount: 85000, notes: "",
});
const viajes = [viaje("t-ana", "p-ana", "2026-11-24")];
const datos: DatosBita = { hoy: HOY, ventana: 21, personas, viajes, tipos: [], documentos: [] };

// ── Archivos de prueba ────────────────────────────────────────────────────

async function xlsx(filas: unknown[][], hoja = "Vuelos"): Promise<Uint8Array> {
  const data = filas.map((fila) =>
    fila.map((v) =>
      v === null ? null : v instanceof Date ? { value: v, type: Date, format: "dd/mm/yyyy" } : typeof v === "number" ? { value: v, type: Number } : { value: String(v) },
    ),
  );
  return new Uint8Array(await writeXlsxFile(data as never, { buffer: true, sheet: hoja }));
}

const p = (texto: string) => `<w:p><w:r><w:t xml:space="preserve">${texto}</w:t></w:r></w:p>`;
const tabla = (filas: string[][]) =>
  `<w:tbl>${filas.map((f) => `<w:tr>${f.map((c) => `<w:tc>${p(c)}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`;
function docx(cuerpo: string): Uint8Array {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}</w:body></w:document>`;
  return zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "word/document.xml": strToU8(xml) });
}
function pdf(lineas: [string, number, number][]): Uint8Array {
  const doc = new jsPDF();
  for (const [texto, x, y] of lineas) doc.text(texto, x, y);
  return new Uint8Array(doc.output("arraybuffer"));
}

// ── Leer ──────────────────────────────────────────────────────────────────

test("Excel: hojas, fechas y horas como texto, filas numeradas y vacías fuera", async () => {
  const bytes = await xlsx([
    ["Manifiesto de la semana"],
    ["Fecha", "Pasajero", "Hora", "Monto"],
    [new Date(Date.UTC(2026, 10, 24)), "Ana Rojas Díaz", "08:30", 85000],
    [null, null, null, null],
    ["25-11-2026", "Juan Pérez Soto", new Date(Date.UTC(1899, 11, 30, 14, 5)), null],
  ]);
  const r = await extraerDocumento(bytes);
  assert.equal(r.formato, "xlsx");
  const [hoja] = r.bloques;
  assert.equal(hoja.tipo, "tabla");
  if (hoja.tipo !== "tabla") return;
  assert.equal(hoja.titulo, "Vuelos");
  assert.deepEqual(hoja.filas.map((f) => f.n), [1, 2, 3, 5], "la fila vacía no cuenta pero los números son los del archivo");
  assert.deepEqual(hoja.filas[2].celdas, ["2026-11-24", "Ana Rojas Díaz", "08:30", "85000"]);
  assert.deepEqual(hoja.filas[3].celdas, ["25-11-2026", "Juan Pérez Soto", "14:05"]);
  assert.match(aTexto(r.bloques).texto, /^## Vuelos\n\[fila 1\] Manifiesto de la semana\n\[fila 2\] Fecha \| Pasajero/);
  assert.equal(celdaATexto(new Date(Date.UTC(2026, 10, 24, 9, 0))), "2026-11-24 09:00");
  assert.equal(celdaATexto(true), "sí");
});

test("Word: una tabla sale como una fila por línea, los párrafos como líneas y las entidades se leen", () => {
  const bloques = textoDeDocx(
    p("Viajes de la semana &amp; observaciones") + tabla([["Fecha", "Nombre"], ["24/11/2026", "Ana &lt;Rojas&gt;"]]) + p("Fin"),
  );
  assert.deepEqual(bloques, [
    { tipo: "texto", lineas: ["Viajes de la semana & observaciones"] },
    { tipo: "tabla", titulo: "Tabla", filas: [{ n: 1, celdas: ["Fecha", "Nombre"] }, { n: 2, celdas: ["24/11/2026", "Ana <Rojas>"] }] },
    { tipo: "texto", lineas: ["Fin"] },
  ]);
});

test("Word de verdad (zip): se lee el cuerpo y se ignora lo demás", async () => {
  const r = await extraerDocumento(docx(p("Hola") + tabla([["a", "b"]])));
  assert.equal(r.formato, "docx");
  assert.match(aTexto(r.bloques).texto, /Hola\n## Tabla\n\[fila 1\] a \| b/);
});

test("PDF con texto: una línea por fila; sin texto avisa que no lee escaneos", async () => {
  const r = await extraerDocumento(pdf([["Fecha", 10, 20], ["Pasajero", 50, 20], ["24/11/2026", 10, 28], ["Ana Rojas Díaz", 50, 28]]));
  assert.equal(r.formato, "pdf");
  assert.match(aTexto(r.bloques).texto, /Fecha Pasajero\n24\/11\/2026 Ana Rojas Díaz/);
  await assert.rejects(extraerDocumento(pdf([])), (e: unknown) => e instanceof ErrorDeDocumento && e.codigo === "ilegible" && /escaneo/.test(e.message));
});

test("el formato sale del contenido, no del nombre; lo demás se rechaza con un mensaje que sirve", async () => {
  assert.equal(detectarFormato(strToU8("%PDF-1.7 ...")), "pdf");
  assert.equal(detectarFormato(docx(p("x"))), "docx");
  assert.equal(detectarFormato(await xlsx([["a", "b"]])), "xlsx");
  assert.equal(detectarFormato(zipSync({ "otra.txt": strToU8("hola") })), null);
  const viejo = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]); // .xls / .doc antiguos
  await assert.rejects(extraerDocumento(viejo), (e: unknown) => e instanceof ErrorDeDocumento && e.estado === 415 && /\.xlsx/.test(e.message));
  await assert.rejects(extraerDocumento(strToU8("MZ ejecutable")), (e: unknown) => e instanceof ErrorDeDocumento && e.codigo === "formato");
  await assert.rejects(extraerDocumento(new Uint8Array()), (e: unknown) => e instanceof ErrorDeDocumento && e.codigo === "vacio");
  await assert.rejects(extraerDocumento(new Uint8Array(MAX_ARCHIVO_BYTES + 1)), (e: unknown) => e instanceof ErrorDeDocumento && e.estado === 413);
  await assert.rejects(extraerDocumento(docx("")), (e: unknown) => e instanceof ErrorDeDocumento && e.codigo === "vacio");
});

test("un zip que se expande de más se rechaza sin descomprimirlo", async () => {
  const bomba = zipSync({ "word/document.xml": new Uint8Array(70 * 1024 * 1024) });
  assert.ok(bomba.length < MAX_ARCHIVO_BYTES, "comprime a casi nada");
  await assert.rejects(extraerDocumento(bomba), (e: unknown) => e instanceof ErrorDeDocumento && e.codigo === "grande");
});

test("el texto que va al modelo tiene tope", () => {
  const filas = Array.from({ length: 3000 }, (_, i) => ({ n: i + 1, celdas: ["x".repeat(40), "y".repeat(40)] }));
  const r = aTexto([{ tipo: "tabla", titulo: "Hoja", filas }]);
  assert.equal(r.truncado, true);
  assert.ok(r.texto.length <= MAX_TEXTO);
});

// ── Enmascarar ────────────────────────────────────────────────────────────

const mascara = () => crearMascara({ personas, viajes, seud: crearSeudonimos(personas, viajes) });

test("tabla: la columna de nombres pasa a seudónimo o «sin ficha»; reserva, vuelo, monto y contacto se vacían; la fecha de vuelo no", () => {
  const m = mascara();
  const s = crearSeudonimos(personas, viajes);
  const [b] = m.bloques([
    {
      tipo: "tabla",
      titulo: "Vuelos",
      filas: [
        { n: 1, celdas: ["Fecha vuelo", "Pasajero", "PNR", "Vuelo", "Monto", "Correo", "Código", "Hora"] },
        { n: 2, celdas: ["2026-11-24", "Ana Rojas Díaz", "DJVHQQ", "LA123", "85000", "ana@fcc.cl", "E-1002", "08:30"] },
        { n: 3, celdas: ["2026-11-25", "Carlos Díaz Mena", "XYZ987", "H2 4567", "90000", "c@x.cl", "ZZ-9", "09:00"] },
        { n: 4, celdas: ["2026-11-26", "carlos díaz mena", "", "", "", "", "", ""] },
      ],
    },
  ]);
  assert.equal(b.tipo, "tabla");
  if (b.tipo !== "tabla") return;
  assert.deepEqual(b.filas[1].celdas, ["2026-11-24", s.persona("p-ana"), "[omitido]", "[omitido]", "[omitido]", "[omitido]", s.persona("p-ana"), "08:30"]);
  assert.deepEqual(b.filas[2].celdas, ["2026-11-25", "Persona sin ficha 1", "[omitido]", "[omitido]", "[omitido]", "[omitido]", "[omitido]", "09:00"]);
  assert.equal(b.filas[3].celdas[1], "Persona sin ficha 1", "la misma persona sin ficha es la misma, aunque cambie la escritura");
  assert.equal(m.restaurar("Falta Persona sin ficha 1."), "Falta Carlos Díaz Mena.");
  assert.equal(m.sinFicha(), 1);
});

test("un apellido que comparte con una ficha no le da el viaje a esa ficha ni deja salir el resto del nombre", () => {
  const m = mascara();
  const s = crearSeudonimos(personas, viajes);
  // «Díaz» solo existe en la ficha de Ana, pero «Carlos Díaz Mena» no es Ana.
  assert.equal(m.texto("viaja Carlos Díaz Mena"), "viaja Persona sin ficha 1");
  assert.equal(m.texto("Pérez Soto Juan"), s.persona("p-juan"), "todas las palabras están en una sola ficha");
  assert.equal(m.texto("Juan Vega"), s.persona("p-juant"), "Vega la tienen dos fichas, pero solo una tiene Juan y Vega");
  assert.equal(m.texto("Luis Vega Torres"), "Persona sin ficha 2", "dos fichas comparten partes y ninguna lo contiene entero");
  const [b] = m.bloques([{ tipo: "tabla", titulo: "H", filas: [{ n: 1, celdas: ["Nombre", "Fecha"] }, { n: 2, celdas: ["Ana Rojas Díaz (jefa de turno)", "2026-11-24"] }, { n: 3, celdas: ["Díaz", "2026-11-25"] }, { n: 4, celdas: ["Juan", "2026-11-26"] }] }]);
  if (b.tipo !== "tabla") throw new Error("tabla");
  assert.equal(b.filas[1].celdas[0], s.persona("p-ana"), "una anotación entre paréntesis no cambia quién es");
  assert.equal(b.filas[2].celdas[0], s.persona("p-ana"), "una sola palabra que solo está en una ficha");
  assert.equal(b.filas[3].celdas[0], "Persona sin ficha 3", "un nombre de pila que comparten dos fichas no se adivina");
});

test("nombre y apellido en columnas aparte, o apellido primero, quedan en un solo seudónimo", () => {
  const m = mascara();
  const s = crearSeudonimos(personas, viajes);
  assert.equal(m.texto("ROJAS DÍAZ, ANA"), s.persona("p-ana"));
  assert.equal(m.texto("Ana Rojas Díaz viaja el lunes"), `${s.persona("p-ana")} viaja el lunes`);
  assert.match(m.texto("viaja Juan"), /\(puede ser P-/, "un nombre compartido por dos no se adivina");
});

test("texto suelto: RUT, correo, teléfono, monto, reservas y vuelos salen; fechas, horas y años no", () => {
  const m = mascara();
  const sale = m.texto(
    "Reserva: ABC123 y localizador QWERTY. Tarifa $85.000 o CLP 90000. RUT 12.345.678-5, ana@fcc.cl, +56 9 1234 5678. Vuelo LA 123 / H2 4567. Código E-1001.",
  );
  for (const dato of ["ABC123", "QWERTY", "85.000", "90000", "12.345.678-5", "ana@fcc.cl", "1234 5678", "LA 123", "4567", "E-1001"])
    assert.ok(!sale.includes(dato), `${dato} no debería salir: ${sale}`);
  const queda = m.texto("Sube el 24/11/2026 a las 08:30, el 2026-11-24, NOVIEMBRE DE 2026, en la fila 12.");
  assert.equal(queda, "Sube el 24/11/2026 a las 08:30, el 2026-11-24, NOVIEMBRE DE 2026, en la fila 12.");
  assert.equal(m.texto("12:30 | 08:45 | 85000"), "12:30 | 08:45 | 85000", "sin letras no hay nada que tapar salvo contacto y montos con símbolo");
});

test("dos o más palabras con mayúscula que no son lugares ni palabras de tabla se tratan como un nombre", () => {
  const m = mascara();
  assert.equal(m.texto("viaja Carlos Díaz Mena desde Santiago a Copiapó"), "viaja Persona sin ficha 1 desde Santiago a Copiapó");
  assert.equal(m.texto("FECHA VUELO ORIGEN DESTINO"), "FECHA VUELO ORIGEN DESTINO");
  assert.equal(m.texto("Santiago Copiapó"), "Santiago Copiapó");
  assert.equal(m.texto("Lunes 23 de Noviembre"), "Lunes 23 de Noviembre");
});

test("de punta a punta: un manifiesto realista no deja salir nada identificable", async () => {
  const bytes = await xlsx([
    ["Manifiesto FCC — semana 24 al 30 de noviembre"],
    ["Fecha", "Pasajero", "RUT", "Origen", "Destino", "Vuelo", "PNR", "Monto", "Observaciones"],
    [new Date(Date.UTC(2026, 10, 24)), "Ana Rojas Díaz", "12.345.678-5", "Santiago", "Copiapó", "LA123", "DJVHQQ", 85000, "Avisar a ana.rojas@fcc.cl o al +56 9 8765 4321"],
    [new Date(Date.UTC(2026, 10, 25)), "Juan Pérez Soto", "9.876.543-K", "Copiapó", "Santiago", "H2 4567", "XYZ987", 90000, "Acompaña Carlos Díaz Mena"],
    [new Date(Date.UTC(2026, 10, 25)), "Carlos Díaz Mena", "7.654.321-0", "Santiago", "Copiapó", "LA 801", "QWE456", 70000, ""],
  ]);
  const { texto } = aTexto(mascara().bloques((await extraerDocumento(bytes)).bloques));
  for (const dato of [
    "Ana", "Rojas", "Juan", "Pérez", "Carlos", "Díaz", "Mena", "12.345.678", "9.876.543", "7.654.321", "LA123", "4567", "LA 801", "DJVHQQ", "XYZ987",
    "QWE456", "85000", "90000", "70000", "ana.rojas", "8765 4321",
  ])
    assert.ok(!texto.includes(dato), `«${dato}» salió hacia el modelo:\n${texto}`);
  assert.match(texto, /2026-11-24 \| P-[0-9a-f]{4} \| \[omitido\] \| Santiago \| Copiapó/, "lo útil queda: fecha, persona, ruta");
});

// ── Proponer ──────────────────────────────────────────────────────────────

const s = crearSeudonimos(personas, viajes);
const armar = (viajesDelModelo: unknown[], extra: Record<string, unknown> = {}) =>
  armarPropuesta({ resumen: "Un manifiesto.", viajes: viajesDelModelo, ...extra }, { datos, seud: s, restaurarArchivo: (t) => t });
const juan = s.persona("p-juan");
const ana = s.persona("p-ana");

test("cada viaje sale como nuevo, ya existe o con problema, con su motivo", () => {
  const r = armar([
    { persona: juan, fecha: "2026-11-24", sentido: "SUBIDA", hora: "8:30", fila: 3 },
    { persona: ana, fecha: "2026-11-24", sentido: "SUBIDA" },
    { persona: juan, fecha: "2026-11-10", sentido: "SUBIDA" },
    { persona: juan, fecha: "2026-02-30", sentido: "SUBIDA" },
    { persona: juan, fecha: "2028-01-10", sentido: "SUBIDA" },
    { persona: s.persona("p-luis"), fecha: "2026-12-05", sentido: "SUBIDA" },
    { persona: s.persona("p-pedro"), fecha: "2026-11-24", sentido: "SUBIDA" },
    { persona: juan, fecha: "2026-11-26" },
  ]);
  const por = (f: (x: (typeof r.filas)[number]) => boolean) => r.filas.filter(f);
  assert.equal(por((f) => f.estado === "nuevo").length, 1);
  const nuevo = r.filas.find((f) => f.estado === "nuevo")!;
  assert.deepEqual([nuevo.persona, nuevo.fecha, nuevo.sentido, nuevo.origen, nuevo.destino, nuevo.hora, nuevo.fila], ["Juan Pérez Soto", "2026-11-24", "SUBIDA", "Santiago", "Copiapó", "08:30", 3]);
  const existe = r.filas.find((f) => f.estado === "existe")!;
  assert.deepEqual([existe.persona, existe.viajeId, existe.detalle], ["Ana Rojas Díaz", "t-ana", "Ya está en la agenda."]);
  const motivos = por((f) => f.estado === "problema").map((f) => f.detalle).sort();
  assert.deepEqual(motivos, [
    "Fuera de la vigencia de la ficha (2026-01-05 a 2026-11-30).",
    "La fecha ya pasó.",
    "La fecha está demasiado lejos.",
    "La fecha no es válida.",
    "La persona está inactiva.",
    "No se pudo saber si sube o baja. Créalo desde Nuevo viaje.",
  ].sort());
  assert.deepEqual(r.filas.map((f) => f.estado), ["nuevo", "existe", ...Array(6).fill("problema")], "primero lo que se puede crear, y dentro de cada grupo por fecha");
  const problemas = r.filas.filter((f) => f.estado === "problema").map((f) => f.fecha).filter((f) => f !== "2026-02-30");
  assert.deepEqual(problemas, [...problemas].sort());
});

test("sube o baja sale de la ruta del documento comparada con la ficha, y manda sobre lo que diga el modelo", () => {
  const ficha = { origin: "Santiago", destination: "Copiapó" };
  assert.equal(sentidoPorRuta(ficha, "Santiago", "Copiapó"), "SUBIDA");
  assert.equal(sentidoPorRuta(ficha, "copiapo", "SANTIAGO"), "BAJADA");
  assert.equal(sentidoPorRuta(ficha, "", "Copiapó"), "SUBIDA");
  assert.equal(sentidoPorRuta(ficha, "Calama", "Antofagasta"), null);
  const r = armar([{ persona: juan, fecha: "2026-11-27", sentido: "SUBIDA", origen: "Copiapó", destino: "Santiago" }]);
  assert.equal(r.filas[0].sentido, "BAJADA");
  assert.deepEqual([r.filas[0].origen, r.filas[0].destino], ["Copiapó", "Santiago"]);
});

test("si el documento trae otra ruta se avisa y se usa la de la ficha", () => {
  const r = armar([{ persona: juan, fecha: "2026-11-27", sentido: "SUBIDA", origen: "Concepción", destino: "Copiapó" }]);
  assert.equal(r.filas[0].estado, "nuevo");
  assert.equal(r.filas[0].detalle, "El archivo dice Concepción → Copiapó; se usa la ruta de la ficha.");
  assert.equal(r.filas[0].origen, "Santiago");
});

test("repetidos y sobrantes se dejan fuera y se cuentan; las personas sin ficha se informan una vez", () => {
  const muchos = Array.from({ length: MAX_VIAJES + 5 }, (_, i) => ({
    persona: juan, fecha: `2027-0${1 + (i % 9)}-${String(1 + Math.floor(i / 9)).padStart(2, "0")}`, sentido: "SUBIDA",
  }));
  const r = armar(muchos);
  assert.equal(r.filas.length, MAX_VIAJES);
  assert.equal(r.omitidos, 5);
  const repetido = armar([{ persona: juan, fecha: "2026-11-24", sentido: "SUBIDA" }, { persona: juan, fecha: "2026-11-24", sentido: "SUBIDA" }]);
  assert.equal(repetido.filas.length, 1);
  assert.equal(repetido.omitidos, 1);
  const sin = armar(
    [{ persona: "Persona sin ficha 1", fecha: "2026-11-24" }, { persona: "Persona sin ficha 1", fecha: "2026-11-25" }, { persona: "P-0000", fecha: "2026-11-25" }],
    { sin_identificar: [{ referencia: "Persona sin ficha 2", motivo: "No hay RUT" }] },
  );
  assert.equal(sin.filas.length, 0);
  assert.deepEqual(sin.sinIdentificar.map((x) => x.referencia), ["Persona sin ficha 1", "P-0000", "Persona sin ficha 2"]);
});

test("lo que el modelo devuelva mal formado no rompe nada", () => {
  for (const basura of [null, "texto", 42, [], { viajes: "no" }, { viajes: [null, 3, "x", { persona: 5 }] }])
    assert.deepEqual(armarPropuesta(basura, { datos, seud: s, restaurarArchivo: (t) => t }).filas, []);
  assert.equal(horaValida("24:00"), null);
  assert.equal(horaValida("7:05"), "07:05");
  assert.equal(horaValida("08:30:00"), "08:30");
  const r = armar([{ persona: juan, fecha: "2026-11-24", sentido: "SUBIDA", origen: "Santiago <script>", destino: "P-1234" }]);
  assert.equal(r.filas[0].estado, "nuevo");
});

test("el resumen y las referencias vuelven con los nombres de la ficha y del archivo", () => {
  const m = mascara();
  m.bloques([{ tipo: "tabla", titulo: "H", filas: [{ n: 1, celdas: ["Pasajero", "Fecha"] }, { n: 2, celdas: ["Carlos Díaz Mena", "2026-11-24"] }] }]);
  const r = armarPropuesta(
    { resumen: `Viajes de ${juan}.`, viajes: [], sin_identificar: [{ referencia: "Persona sin ficha 1", motivo: "No tiene ficha" }] },
    { datos, seud: s, restaurarArchivo: m.restaurar },
  );
  assert.equal(r.resumen, "Viajes de Juan Pérez Soto.");
  assert.deepEqual(r.sinIdentificar, [{ referencia: "Carlos Díaz Mena", motivo: "No tiene ficha" }]);
});
