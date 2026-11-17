"use client";

// Las piezas de una ventana de «texto para copiar»: el botón, el aviso cuando
// el navegador no deja copiar y el recuadro con el texto. Las usan el
// manifiesto para la agencia y la lista para el campamento.

import type { RefObject } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** «Copiado» mantiene el mismo ancho que «Copiar» para que nada salte. */
export function BotonCopiar({ copiado, onClick }: { copiado: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      className={
        "min-w-[112px]" +
        (copiado
          ? " border-[color-mix(in_srgb,var(--success)_45%,var(--border))] bg-[color-mix(in_srgb,var(--success)_12%,var(--surface-raised))] text-success"
          : "")
      }
      onClick={onClick}
      aria-live="polite"
    >
      {copiado ? <Check size={16} /> : <Copy size={16} />}
      {copiado ? "Copiado" : "Copiar"}
    </Button>
  );
}

export function AvisoNoCopiado() {
  return (
    <p
      className="mb-3 shrink-0 rounded-md border border-[color-mix(in_srgb,var(--danger)_45%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-[10px] text-meta text-danger"
      role="alert"
    >
      No se pudo copiar solo. El texto quedó seleccionado: cópialo con ⌘C
      (o Ctrl+C).
    </p>
  );
}

// El recuadro crece con `flex-auto` (ver «El recuadro del manifiesto» en
// CLAUDE.md): con el alto del texto queda un hueco antes de los botones, y si
// impone su alto con `rows`, la frase de abajo se corta.
export function TextoParaCopiar({
  texto,
  etiqueta,
  textoRef,
}: {
  texto: string;
  etiqueta: string;
  textoRef: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <textarea
      ref={textoRef}
      className="min-h-40 w-full min-w-0 flex-auto resize-none overflow-auto rounded-sm border border-line-strong bg-surface transition-[border-color,box-shadow,background-color] duration-[140ms] ease-[var(--ease-out)] px-4 py-[14px] font-mono text-meta leading-[1.55] tab-2 whitespace-pre text-foreground focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--focus)]"
      aria-label={etiqueta}
      readOnly
      value={texto}
      rows={Math.min(24, texto.split("\n").length + 1)}
    />
  );
}
