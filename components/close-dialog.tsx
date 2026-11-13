"use client";

// Cerrar en bloque los viajes que pasaron sin reserva. La regla de qué le pasa
// a cada viaje está en lib/cierre.ts; aquí solo se pregunta qué pasó.
import { useState } from "react";
import DialogActions from "@/components/ui/dialog-actions";
import { DialogBody, FormSection, Hint } from "@/components/ui/dialog-parts";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { formatDate } from "../lib/format";
import { mismoVuelo, type ModoDeCierre } from "../lib/cierre";
import { useApp } from "../app/store";

export default function CloseDialog() {
  const { busy, closeModal, closeSelectedTrips, viajesPorCerrar } = useApp();
  // Se fija al abrir: al terminar, la selección se vacía mientras el diálogo
  // todavía sale, y sin esto se alcanzaría a leer "Estos 0 viajes".
  const [viajes] = useState(viajesPorCerrar);
  const unVuelo = mismoVuelo(viajes);
  const [modo, setModo] = useState<ModoDeCierre>("anular");
  const [motivo, setMotivo] = useState("");
  const [pnr, setPnr] = useState("");
  const [monto, setMonto] = useState("");

  const n = viajes.length;
  const viajesTexto = `${n} ${n === 1 ? "viaje" : "viajes"}`;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        void closeSelectedTrips(modo, motivo, pnr, monto);
      }}
    >
      <DialogBody>
        <FormSection>
          <p className="text-muted">
            {n === 1 ? "Este viaje ya pasó" : `Estos ${n} viajes ya pasaron`} y no{" "}
            {n === 1 ? "tiene" : "tienen"} reserva registrada. No hay nada que comprar: solo
            queda dejar dicho qué pasó.
          </p>
          <Label>
            ¿Qué pasó?
            <Select
              data-autofocus
              name="modo"
              aria-describedby={unVuelo ? undefined : "cierre-modo-ayuda"}
              value={modo}
              onChange={(event) => setModo(event.target.value as ModoDeCierre)}
            >
              <option value="anular">No se volaron: anularlos</option>
              <option value="reserva" disabled={!unVuelo}>
                Se volaron con una misma reserva: registrar el código
              </option>
            </Select>
          </Label>
          {!unVuelo && (
            <Hint id="cierre-modo-ayuda">
              Una misma reserva solo sirve para viajes del mismo día y la misma ruta. Si se
              volaron con códigos distintos, ábrelos de a uno desde la lista.
            </Hint>
          )}
          {modo === "reserva" && unVuelo && (
            <>
              <Label>
                Código de reserva
                <Input
                  name="pnr"
                  required
                  autoComplete="off"
                  aria-describedby="cierre-pnr-ayuda"
                  className="uppercase"
                  value={pnr}
                  onChange={(event) => setPnr(event.target.value)}
                />
              </Label>
              <Hint id="cierre-pnr-ayuda">
                Quedan como Completado, del {formatDate(viajes[0].date)}, {viajes[0].origin} →{" "}
                {viajes[0].destination}.
              </Hint>
              <Label>
                Monto por pasajero (CLP) <small className="text-muted">(opcional)</small>
                <Input
                  name="monto"
                  type="number"
                  min="0"
                  step="1"
                  aria-describedby="cierre-monto-ayuda"
                  value={monto}
                  onChange={(event) => setMonto(event.target.value)}
                />
              </Label>
              <Hint id="cierre-monto-ayuda">
                Si lo tienes, anótalo: Costos solo suma los viajes con monto. Cada pasajero
                queda con este monto.
              </Hint>
            </>
          )}
          <Label>
            Motivo
            <Textarea
              name="motivo"
              required
              aria-describedby="cierre-motivo-ayuda"
              placeholder={
                modo === "anular"
                  ? "Por ejemplo: viajes importados de la planilla que no se realizaron."
                  : "Por ejemplo: pasaje comprado directamente por la agencia."
              }
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
            />
          </Label>
          <Hint id="cierre-motivo-ayuda">Queda en el historial de cada viaje. Nada se borra.</Hint>
        </FormSection>
      </DialogBody>
      <DialogActions
        busy={busy}
        busyLabel="Cerrando…"
        submitLabel={modo === "anular" ? `Anular ${viajesTexto}` : `Cerrar ${viajesTexto}`}
        submitDisabled={!n}
        onCancel={closeModal}
      />
    </form>
  );
}
