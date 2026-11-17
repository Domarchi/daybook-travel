import test from "node:test";
import assert from "node:assert/strict";
import { letrasDe, problemaDeMotivo, MINIMO_LETRAS } from "./motivo.ts";

test("el caso real: un punto no es un motivo", () => {
  assert.match(problemaDeMotivo(".") ?? "", /al menos 5 letras/);
});

test("lo vacío pide motivo, y lo demasiado corto pide uno que se entienda", () => {
  assert.match(problemaDeMotivo("   ") ?? "", /Escribe el motivo/);
  for (const corto of ["ok", "x", "----", "1234567", "si.", "asdf"]) {
    assert.ok(problemaDeMotivo(corto), `«${corto}» no debía pasar`);
  }
});

test("los motivos cortos pero claros pasan", () => {
  for (const bueno of ["Duplicado", "No viajó", "Cambio de turno", "Licencia médica", "Pasaje comprado por la agencia"]) {
    assert.equal(problemaDeMotivo(bueno), null, `«${bueno}» debía pasar`);
  }
});

test("se cuentan letras con tilde y eñe, no signos ni números", () => {
  assert.equal(letrasDe("Ñuñoa, 2026."), 5);
  assert.equal(letrasDe("¿¡…!?"), 0);
  assert.equal(MINIMO_LETRAS, 5);
});

// El motivo automático: registrar un dato que faltaba no pide explicación.
import { motivoAutomatico, MOTIVOS_RAPIDOS, type CamposDelViaje } from "./motivo.ts";
import { readFile } from "node:fs/promises";

const guardado = {
  date: "2026-12-01",
  origin: "Santiago",
  destination: "Copiapó",
  requested_time: null as string | null,
  baggage: "Mano",
  status: "Solicitado",
  pnr: "",
  flight: "",
  amount: null as number | null,
  notes: "Va con su hija.\nMotivo del cambio: Solicitud enviada.",
};
const formulario = (cambios: Partial<CamposDelViaje> = {}): CamposDelViaje => ({
  date: "2026-12-01",
  origin: "Santiago",
  destination: "Copiapó",
  requested_time: "",
  baggage: "Mano",
  status: "Solicitado",
  pnr: "",
  flight: "",
  amount: "",
  notes: "Va con su hija.",
  ...cambios,
});

test("cargar solo el código, el vuelo, el monto o la hora anota el motivo solo", () => {
  assert.equal(motivoAutomatico(guardado, formulario({ amount: "85990" })), "Se registró el monto.");
  assert.equal(motivoAutomatico(guardado, formulario({ requested_time: "07:30" })), "Se registró la hora requerida.");
  assert.equal(
    motivoAutomatico(guardado, formulario({ pnr: "ABC123", flight: "LA 112", amount: "85990" })),
    "Se registró la reserva ABC123, el vuelo LA 112 y el monto.",
  );
  // Como en la reserva en bloque: el solicitado que recibe su código pasa a Emitido.
  assert.equal(
    motivoAutomatico(guardado, formulario({ pnr: "ABC123", status: "Emitido" })),
    "Se registró la reserva ABC123.",
  );
  // Desde Costos › Reservas sin monto: ya tiene código, falta el monto.
  assert.equal(
    motivoAutomatico({ ...guardado, status: "Emitido", pnr: "XYZ9" }, formulario({ status: "Emitido", pnr: "XYZ9", amount: "120000" })),
    "Se registró el monto.",
  );
});

test("el resto del cambio sigue pidiendo motivo escrito", () => {
  for (const cambio of [
    {},
    { date: "2026-12-02" },
    { status: "Anulado" },
    { status: "Emitido", flight: "LA 112" },
    { origin: "La Serena" },
    { baggage: "Bodega" },
    { notes: "Otra observación" },
    { amount: "85990", date: "2026-12-02" },
  ] as Partial<CamposDelViaje>[]) {
    assert.equal(motivoAutomatico(guardado, formulario(cambio)), null, JSON.stringify(cambio));
  }
  // Corregir o borrar un dato que ya estaba es una decisión.
  const conDatos = { ...guardado, status: "Emitido", pnr: "ABC123", amount: 85990 };
  assert.equal(motivoAutomatico(conDatos, formulario({ status: "Emitido", pnr: "ABC124", amount: "85990" })), null);
  assert.equal(motivoAutomatico(conDatos, formulario({ status: "Emitido", pnr: "ABC123", amount: "" })), null);
  assert.equal(motivoAutomatico(conDatos, formulario({ status: "Emitido", pnr: "ABC123", amount: "85990.0" })), null, "el mismo monto no es un cambio");
});

test("el diálogo esconde el motivo cuando se anota solo y avisa del mínimo junto al campo", async () => {
  assert.deepEqual([...MOTIVOS_RAPIDOS], ["No viajó", "Cambio de fecha", "Corrección"]);
  const dialogo = await readFile(new URL("../components/trip-dialog.tsx", import.meta.url), "utf8");
  assert.match(dialogo, /motivoAutomatico\(editTrip, camposDelFormulario\(new FormData\(form\)\)\)/);
  assert.match(dialogo, /No hace falta escribir un motivo: queda anotado «\{motivoSolo\}»/);
  assert.match(dialogo, /onBlur=\{\(event\) => \{[\s\S]{0,160}problemaDeMotivo\(event\.target\.value\)/);
  assert.match(dialogo, /id="motivo-error" role="alert"/);
  assert.doesNotMatch(dialogo, /name="change_reason"\s*required/, "el navegador no ataja el motivo con su globo en inglés");
  const acciones = await readFile(new URL("../app/estado/use-acciones-viajes.ts", import.meta.url), "utf8");
  assert.match(acciones, /const changeReason = escrito \|\| automatico \|\| "";/);
});
