// Lo primero que se ve en cada pantalla es para lo que se entra (tanda 4 del
// estudio de uso): en Viajes los filtros no tapan la lista en el teléfono y se
// puede marcar todo sin la cabecera; en la Agenda lo pendiente de hoy va antes
// del calendario; en Personas la configuración va plegada y lo ocasional en
// «Más»; en el teléfono la leyenda dice qué significan las abreviaturas.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const leer = (ruta: string) => readFile(new URL(`../${ruta}`, import.meta.url), "utf8");

test("Viajes: interruptores con texto fijo, Filtros (n) en el teléfono y el modo como pastilla", async () => {
  const vista = await leer("components/trips-view.tsx");
  assert.match(vista, /aria-pressed=\{onlyUpcoming\}[\s\S]{0,200}Solo próximos\s*<\/Button>/);
  assert.match(vista, /aria-pressed=\{purchaseFilter === "abiertos"\}[\s\S]{0,300}Solo por comprar\s*<\/Button>/);
  assert.doesNotMatch(vista, /Todos los periodos|"Por comprar"/, "el botón no describe el estado");
  assert.match(vista, /aria-expanded=\{filtrosAbiertos\}\s*aria-controls="filtros-viajes"/);
  assert.match(vista, /filtrosActivos \? `Filtros \(\$\{filtrosActivos\}\)` : "Filtros"/);
  assert.match(vista, /id="filtros-viajes"[\s\S]{0,120}className="contents max-\[760px\]:col-span-2 max-\[760px\]:hidden/);
  assert.match(vista, /sin_cerrar: "Pasados sin reserva",\s*revisar: "Para revisar",/);
  assert.match(vista, /aria-label=\{`Quitar el filtro «\$\{modo\}»`\}/);
});

test("Viajes: en el teléfono una fila marca todos los que se pueden marcar", async () => {
  const vista = await leer("components/trips-view.tsx");
  assert.match(vista, /`Seleccionar los \$\{seleccionables\.length\} \$\{varios\} visibles`/);
  assert.match(vista, /\["viaje sin cerrar", "viajes sin cerrar"\][\s\S]{0,80}\["solicitado sin reserva", "solicitados sin reserva"\][\s\S]{0,40}\["planificado", "planificados"\]/);
  // La misma lógica que la casilla de la cabecera, que en el teléfono no se ve.
  assert.equal(vista.match(/onChange=\{\(event\) => marcarTodos\(event\.target\.checked\)\}/g)?.length, 2);
  assert.match(vista, /className="mb-\[9px\] hidden min-h-11 [^"]*max-\[760px\]:flex"/);
});

test("Agenda: la entrega de coordinación va antes del calendario y muestra solo lo pendiente", async () => {
  const [vista, panel, entrega] = await Promise.all([
    leer("components/agenda-view.tsx"),
    leer("components/agenda-panel.tsx"),
    leer("components/operational-handoff.tsx"),
  ]);
  assert.ok(vista.indexOf("{entrega}") < vista.indexOf("Planificar turnos"), "antes de la fila del calendario");
  assert.ok(vista.indexOf("{entrega}") < vista.indexOf("{children}"));
  assert.match(panel, /entrega=\{<OperationalHandoff \/>\}/);
  assert.match(entrega, /const pendientes = rows\.filter\(\(trip\) => pendientesDelMovimiento\(trip\)\.length\);/);
  assert.match(entrega, /\{listos\.length === 1 \? "1 listo" : `\$\{listos\.length\} listos`\}/);
});

test("Personas: documentos exigidos plegados en una línea y Excel en «Más»", async () => {
  const [personas, documentos] = await Promise.all([
    leer("components/people-view.tsx"),
    leer("components/document-types-panel.tsx"),
  ]);
  assert.match(documentos, /<details[\s\S]{0,200}<summary/);
  assert.match(documentos, /Documentos exigidos:\s*<\/strong>\{" "\}\s*\{exigidos\.length \? exigidos\.join\(", "\) : "ninguno"\}/);
  assert.match(documentos, /\{puedeEditar \? "Editar" : "Ver"\}/);
  assert.match(personas, /aria-expanded=\{abierto\}\s*aria-controls="personas-mas"/);
  assert.match(personas, /if \(evento\.key !== "Escape"\) return;\s*setAbierto\(false\);\s*boton\.current\?\.focus\(\);/);
  // «Gestionar con Excel» ya no está en la barra: solo dentro del menú.
  assert.equal(personas.match(/Gestionar con Excel/g)?.length, 2, "el comentario y el botón del menú");
});

test("Calendario: en el teléfono la leyenda explica las abreviaturas", async () => {
  const calendario = await leer("app/year-view.tsx");
  const leyenda = calendario.slice(calendario.indexOf('aria-label="Leyenda del calendario"'), calendario.indexOf('id="calendar-keyboard-help"'));
  assert.doesNotMatch(leyenda, /inline-flex items-center gap-\[7px\] max-\[760px\]:hidden/, "ninguna entrada se esconde en el teléfono");
  assert.match(leyenda, /S\/T = sin turno/);
  assert.match(leyenda, /\? = por confirmar/);
  assert.match(leyenda, /<span className="hidden max-\[430px\]:inline">10 = <\/span>10×10/);
});
