"use client";

import { FormEvent, useState } from "react";

const CAMPOS_MOSTRABLES = ["date", "requested_time", "baggage", "notes"] as const;
type CampoMostrable = (typeof CAMPOS_MOSTRABLES)[number];
type Propuesta = Partial<Record<CampoMostrable, string | null>>;
type Resultado = { status: "pending_confirmation"; requiresHumanConfirmation: true; proposal: Propuesta };

const initialContext = { date: "2026-11-12", requested_time: "08:00", baggage: "Mochila", notes: "Ejemplo sintético" };

export function TravelQwenDemo() {
  const [request, setRequest] = useState("Mover la hora solicitada a las 09:30.");
  const [context, setContext] = useState(initialContext);
  const [result, setResult] = useState<Resultado | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setUnavailable(false);
    try {
      const response = await fetch("/api/internal/qwen-demo", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request, context }),
      });
      const data: unknown = await response.json();
      if (!response.ok || !esResultado(data)) throw new Error("unavailable");
      setResult(data);
    } catch {
      setUnavailable(true);
    }
  }

  return (
    <main className="mx-auto grid max-w-2xl gap-6 p-8">
      <header className="grid gap-2"><p className="text-sm text-muted">Demo interna · datos sintéticos</p><h1 className="text-2xl font-semibold">Propuesta Qwen pendiente</h1><p>Esta demo nunca cambia datos de viaje.</p></header>
      <form onSubmit={submit} className="grid gap-3">
        <label>Solicitud sintética<textarea value={request} maxLength={500} onChange={(event) => setRequest(event.currentTarget.value)} /></label>
        {CAMPOS_MOSTRABLES.map((field) => <label key={field}>{field}<input value={context[field] ?? ""} onChange={(event) => setContext({ ...context, [field]: event.currentTarget.value })} /></label>)}
        <button type="submit">Solicitar propuesta</button>
      </form>
      {unavailable && <p role="status">No se pudo generar una propuesta segura.</p>}
      {result && <section aria-live="polite"><p>requiresHumanConfirmation: {String(result.requiresHumanConfirmation)}</p><dl>{CAMPOS_MOSTRABLES.filter((field) => Object.hasOwn(result.proposal, field)).map((field) => <div key={field}><dt>{field}</dt><dd>{result.proposal[field] ?? "Sin hora"}</dd></div>)}</dl><button type="button" disabled aria-disabled="true">Confirmación deshabilitada: esta demo nunca cambia datos de viaje</button></section>}
    </main>
  );
}

function esResultado(value: unknown): value is Resultado {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return result.status === "pending_confirmation" && result.requiresHumanConfirmation === true &&
    !!result.proposal && typeof result.proposal === "object" && !Array.isArray(result.proposal) &&
    Object.keys(result.proposal as object).every((key) => CAMPOS_MOSTRABLES.includes(key as CampoMostrable));
}
