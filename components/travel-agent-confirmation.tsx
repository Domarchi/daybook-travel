"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ControlConfirmacionHumana,
  crearIdentidadPropuestaConfirmacion,
  crearModeloConfirmacionTravel,
  type ConfirmacionLocal,
  type ModeloConfirmacionTravel,
} from "@/lib/travel-agent-confirmation";

type ModeloConfirmacionListo = Extract<ModeloConfirmacionTravel, { kind: "ready" }>;

export function TravelAgentConfirmation({
  result,
  current,
  onConfirm,
}: {
  result: unknown;
  current: unknown;
  onConfirm: (confirmation: ConfirmacionLocal) => void;
}) {
  const model = crearModeloConfirmacionTravel({ result, current });

  if (model.kind !== "ready") {
    return (
      <section
        aria-live="polite"
        aria-labelledby="travel-agent-confirmation-title"
        className="grid gap-3 rounded-lg border border-line bg-surface p-5"
      >
        <h2 id="travel-agent-confirmation-title" className="text-[18px] font-semibold text-foreground">
          No se puede revisar esta propuesta
        </h2>
        <p className="text-[13px] text-muted">
          El diagnóstico es seguro: no se mostrará ni aplicará ningún cambio del viaje.
        </p>
      </section>
    );
  }

  return (
    <TravelAgentConfirmationReady
      key={crearIdentidadPropuestaConfirmacion(model)}
      model={model}
      onConfirm={onConfirm}
    />
  );
}

function TravelAgentConfirmationReady({
  model,
  onConfirm,
}: {
  model: ModeloConfirmacionListo;
  onConfirm: (confirmation: ConfirmacionLocal) => void;
}) {
  const control = useRef(new ControlConfirmacionHumana()).current;
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleConfirmation(checked: boolean) {
    control.setConfirmed(checked);
    setConfirmed(checked);
  }

  function handleApply() {
    const confirmation = control.confirm();
    if (!confirmation) return;
    setSubmitted(true);
    onConfirm(confirmation);
  }

  const reason = submitted
    ? "La confirmación local ya fue enviada. El viaje no se ha aplicado."
    : "Confirma que revisaste los cambios para habilitar esta acción local.";

  return (
    <section
      aria-live="polite"
      aria-labelledby="travel-agent-confirmation-title"
      className="grid w-full max-w-2xl gap-5 rounded-lg border border-line bg-surface p-[clamp(18px,4vw,28px)]"
    >
      <header className="grid gap-2 border-b border-line pb-4">
        <p className="text-[11px] font-[750] tracking-[0.08em] text-muted uppercase">
          pending_confirmation
        </p>
        <h2 id="travel-agent-confirmation-title" className="text-[20px] font-semibold text-foreground">
          Revisión de propuesta
        </h2>
        <p className="text-[13px] text-muted">Esta propuesta requiere confirmación humana.</p>
      </header>

      <dl className="grid gap-3">
        {model.fields.map((field) => (
          <div key={field.key} className="grid gap-2 border-b border-line pb-3 last:border-b-0 last:pb-0 sm:grid-cols-2">
            <dt className="text-[13px] font-[650] text-foreground-soft">{field.label}</dt>
            <dd className="grid gap-2 text-[13px] text-muted">
              <span>Antes: {field.before}</span>
              <span className="text-foreground">Propuesto: {field.after}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-3 border-t border-line pt-4">
        <label htmlFor="travel-agent-human-confirmation" className="flex items-start gap-3 text-[13px] text-foreground-soft">
          <input
            id="travel-agent-human-confirmation"
            type="checkbox"
            checked={confirmed}
            disabled={submitted}
            onChange={(event) => handleConfirmation(event.currentTarget.checked)}
            onKeyDown={(event) => {
              if (event.key !== " " && event.key !== "Spacebar") return;
              event.preventDefault();
              handleConfirmation(!confirmed);
            }}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          Confirmo que revisé la propuesta y que requiere confirmación humana.
        </label>
        <p id="travel-agent-confirmation-reason" className="text-[12px] text-muted">
          {reason}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="primary"
            disabled={!confirmed || submitted}
            aria-describedby="travel-agent-confirmation-reason"
            onClick={handleApply}
          >
            Aplicar propuesta
          </Button>
        </div>
      </div>
    </section>
  );
}
