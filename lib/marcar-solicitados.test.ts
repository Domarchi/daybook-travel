// «Marcar como solicitados»: el aviso con Deshacer y lo que dice cuando una
// tanda falla después de que otras ya se guardaron.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  porTandas,
  textoDeDeshacerParcial,
  textoDeSolicitados,
  textoDeSolicitudDeshecha,
  textoDeSolicitudParcial,
} from "./marcar-solicitados.ts";

const leer = (ruta: string) => readFile(new URL(`../${ruta}`, import.meta.url), "utf8");

test("el éxito dice cuántos y Deshacer dice cuántos volvieron", () => {
  assert.equal(textoDeSolicitados(1), "1 viaje marcado como solicitado.");
  assert.equal(textoDeSolicitados(12), "12 viajes marcados como solicitados.");
  assert.equal(textoDeSolicitudDeshecha(1), "1 viaje volvió a Planificado.");
  assert.equal(textoDeSolicitudDeshecha(12), "12 viajes volvieron a Planificado.");
});

test("si falla a medias, dice cuántos quedaron y cuántos siguen seleccionados", () => {
  assert.equal(
    textoDeSolicitudParcial(10, 15, true),
    "10 de 15 viajes quedaron marcados como solicitados. No se pudieron marcar los otros 5, que siguen seleccionados. Uno de ellos cambió mientras trabajabas: actualiza la lista e intenta de nuevo.",
  );
  assert.equal(
    textoDeSolicitudParcial(1, 2, false),
    "1 de 2 viajes quedó marcado como solicitado. No se pudo marcar el otro, que sigue seleccionado. Intenta de nuevo.",
  );
  assert.match(textoDeSolicitudParcial(14, 15, true), /el otro, que sigue seleccionado\. Cambió mientras trabajabas/);
});

test("deshacer que no alcanza a todos lo dice", () => {
  assert.equal(
    textoDeDeshacerParcial(0, 3, true),
    "No se pudo deshacer: los viajes cambiaron mientras tanto. Revísalos en la lista.",
  );
  assert.equal(textoDeDeshacerParcial(0, 1, false), "No se pudo deshacer: el viaje sigue como solicitado.");
  assert.equal(
    textoDeDeshacerParcial(2, 5, true),
    "2 de 5 viajes volvieron a Planificado. Los otros 3 siguen como solicitados: revísalos en la lista.",
  );
});

test("marcar ofrece Deshacer, deja seleccionados los que faltan y el manifiesto solo se cierra si salió bien", async () => {
  const [manifiesto, dialogo] = await Promise.all([
    leer("app/estado/use-manifiesto.ts"),
    leer("components/manifest-dialog.tsx"),
  ]);
  assert.match(manifiesto, /avisoConDeshacer\(textoDeSolicitados\(ids\.length\)/);
  assert.match(manifiesto, /setSelectedTrips\(ids\.filter\(\(id\) => !marcados\.has\(id\)\)\)/);
  assert.match(manifiesto, /return porTandas\(filas,/, "se sigue cambiando de a diez");
  assert.match(dialogo, /\.then\(\(listo\) => \{[\s\S]{0,120}if \(listo\) closeModal\(\);/);
  assert.doesNotMatch(dialogo, /\.then\(closeModal\)/);
});

test("de a diez: si falla la segunda tanda, la primera queda contada y la tercera no se intenta", async () => {
  const filas = Array.from({ length: 25 }, (_, i) => ({ trip: { id: `v${i}` } }));
  const pedidos: string[] = [];
  const { hechos, fallo, porConflicto } = await porTandas(filas, async ({ trip }) => {
    pedidos.push(trip.id);
    // En la segunda tanda, el v12 lo cambió otra persona; el resto sale.
    if (trip.id === "v12") return { error: null };
    return { error: null, fila: { updated_at: `t-${trip.id}` } };
  });
  assert.equal(pedidos.length, 20, "la tercera tanda no se manda");
  assert.equal(hechos.length, 19);
  assert.deepEqual(hechos[0], { id: "v0", updatedAt: "t-v0" });
  assert.ok(!hechos.some((h) => h.id === "v12"));
  assert.equal(porConflicto, true);
  assert.match(String((fallo as Error).message), /cambió mientras trabajabas/);
});

test("un error de la base se devuelve tal cual y no cuenta como conflicto", async () => {
  const error = { message: "sin conexión" };
  const { hechos, fallo, porConflicto } = await porTandas([{ trip: { id: "a" } }, { trip: { id: "b" } }], async ({ trip }) =>
    trip.id === "a" ? { error } : { error: null, fila: { updated_at: "t" } },
  );
  assert.equal(fallo, error);
  assert.equal(porConflicto, false);
  assert.deepEqual(hechos, [{ id: "b", updatedAt: "t" }]);
});
