"use client";

// Registrar una misma reserva en varios viajes solicitados del mismo vuelo. La
// regla está en lib/reserva.ts; aquí solo se piden el código y lo opcional.
import { useState } from "react";
import DialogActions from "@/components/ui/dialog-actions";
import { DialogBody, FormSection, Hint } from "@/components/ui/dialog-parts";
import { Input, Label } from "@/components/ui/field";
import { formatDate } from "../lib/format";
import { mismoVuelo } from "../lib/cierre";
import { avisoDePrecio, formatoCLP } from "../lib/costs";
import { useApp } from "../app/store";

export default function ReserveDialog() {
  const { busy, closeModal, personName, referenciaDe, reserveSelectedTrips, viajesPorReservar } =
    useApp();
  // Se fija al abrir, como en el cierre: al terminar la selección se vacía
  // mientras el diálogo todavía sale.
  const [viajes] = useState(viajesPorReservar);
  const unVuelo = mismoVuelo(viajes);
  const [pnr, setPnr] = useState("");
  const [vuelo, setVuelo] = useState("");
  const [monto, setMonto] = useState("");

  const n = viajes.length;
  const viajesTexto = `${n} ${n === 1 ? "viaje" : "viajes"}`;
  const primero = viajes[0];
  const { referencia, viajes: conMonto } = primero
    ? referenciaDe(primero)
    : { referencia: null, viajes: 0 };
  const aviso = monto.trim() ? avisoDePrecio(Number(monto), referencia) : null;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        void reserveSelectedTrips(pnr, vuelo, monto);
      }}
    >
      <DialogBody>
        <FormSection>
          {unVuelo && primero ? (
            <p className="text-muted">
              {formatDate(primero.date)}, {primero.origin} → {primero.destination}.{" "}
              {n === 1 ? "Pasajero" : `${n} pasajeros`}:{" "}
              <strong className="text-foreground-soft">
                {viajes.map((viaje) => personName(viaje.person_id)).join(", ")}
              </strong>
              . Quedan como Emitido.
            </p>
          ) : (
            <p role="alert" className="font-bold text-warning">
              Una misma reserva solo sirve para viajes del mismo día y la misma ruta. Si cada
              uno tiene su código, ábrelos de a uno desde la lista.
            </p>
          )}
          {unVuelo && (
            <>
              <Label>
                Código de reserva
                <Input
                  data-autofocus
                  name="pnr"
                  required
                  autoComplete="off"
                  className="uppercase"
                  value={pnr}
                  onChange={(event) => setPnr(event.target.value)}
                />
              </Label>
              <Label>
                Vuelo <small className="text-muted">(opcional)</small>
                <Input
                  name="flight"
                  autoComplete="off"
                  className="uppercase"
                  placeholder="Por ejemplo: LA 342"
                  value={vuelo}
                  onChange={(event) => setVuelo(event.target.value)}
                />
              </Label>
              <Label>
                Monto por pasajero (CLP) <small className="text-muted">(opcional)</small>
                <Input
                  name="amount"
                  type="number"
                  min="0"
                  step="1"
                  aria-describedby="reserva-monto-ayuda"
                  value={monto}
                  onChange={(event) => setMonto(event.target.value)}
                />
              </Label>
              <Hint
                id="reserva-monto-ayuda"
                aria-live="polite"
                className={aviso === "caro" ? "font-bold text-warning" : undefined}
              >
                {aviso === "caro"
                  ? "Más caro de lo habitual. "
                  : aviso === "barato"
                    ? "Más barato de lo habitual. "
                    : ""}
                {referencia !== null
                  ? `Esta ruta ha costado ${formatoCLP(referencia)} en ${conMonto} ${conMonto === 1 ? "viaje" : "viajes"}. `
                  : ""}
                Cada pasajero queda con este monto; Costos solo suma los viajes con monto.
              </Hint>
            </>
          )}
          <Hint>Queda en el historial de cada viaje, con el código. Nada se borra.</Hint>
        </FormSection>
      </DialogBody>
      <DialogActions
        busy={busy}
        busyLabel="Registrando…"
        submitLabel={`Registrar en ${viajesTexto}`}
        submitDisabled={!n || !unVuelo}
        onCancel={closeModal}
      />
    </form>
  );
}
