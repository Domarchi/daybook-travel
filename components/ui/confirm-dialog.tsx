"use client";

// La confirmación de la familia Daybook (Fase 5): lo que no tiene vuelta atrás
// se pregunta en una caja propia, con el botón rojo que nombra la acción
// («Descartar cambios», «Cerrar sesión») y el foco en la salida segura, que es
// la que recibe quien tocó sin querer. Es la misma caja que `ConfirmDialog` de
// Ticket y `DialogoDeConfirmacion` de Parte Diario.
//
// Va en un portal sobre todo lo demás (también sobre el diálogo lateral y el
// cajón del teléfono, cuyo `translate` atraparía a un hijo `fixed`). Mientras
// está abierta se queda con Escape y Tab: los escucha en `window` en la fase de
// captura y no los deja seguir, así Escape cierra solo la pregunta y no el
// diálogo o el cajón que hay detrás.
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tituloId = useId();
  const descripcionId = useId();
  const caja = useRef<HTMLDivElement>(null);
  const cancelar = useRef<HTMLButtonElement>(null);
  const alCancelar = useRef(onCancel);
  alCancelar.current = onCancel;

  useEffect(() => {
    const anterior =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelar.current?.focus();
    function teclas(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        alCancelar.current();
        return;
      }
      if (event.key !== "Tab") return;
      event.stopPropagation();
      const botones = Array.from(
        caja.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [],
      );
      const primero = botones[0];
      const ultimo = botones[botones.length - 1];
      const dentro = botones.includes(document.activeElement as HTMLButtonElement);
      if (!dentro) {
        event.preventDefault();
        primero?.focus();
      } else if (event.shiftKey && document.activeElement === primero) {
        event.preventDefault();
        ultimo?.focus();
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault();
        primero?.focus();
      }
    }
    window.addEventListener("keydown", teclas, true);
    return () => {
      window.removeEventListener("keydown", teclas, true);
      if (anterior?.isConnected) anterior.focus();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-[rgba(0,0,0,0.5)] p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={caja}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descripcionId}
        className="grid w-full max-w-[440px] gap-3 rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow)] max-[760px]:p-5"
      >
        <h2 id={tituloId} className="text-title leading-[1.2] tracking-[-0.02em] text-foreground">
          {title}
        </h2>
        <p id={descripcionId} className="text-meta leading-[1.5] text-foreground-soft">
          {description}
        </p>
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button ref={cancelar} type="button" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
