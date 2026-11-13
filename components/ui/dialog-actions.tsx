"use client";

// La barra de botones al pie de los dialogos.
//
// La clase .dialog-actions sigue existiendo en la capa daybook porque hay dialogos
// que arman esta barra a mano en vez de usar este componente. Se borra cuando
// no quede ninguno.
import { Button } from "@/components/ui/button";

export default function DialogActions({
  busy,
  busyLabel,
  submitLabel,
  submitDisabled = false,
  submitVariant = "primary",
  onCancel,
}: {
  busy: boolean;
  busyLabel: string;
  submitLabel: string;
  submitDisabled?: boolean;
  /** `danger` cuando lo que se confirma no se puede deshacer (Fase 5). */
  submitVariant?: "primary" | "danger";
  onCancel: () => void;
}) {
  return (
    <div className="flex min-h-[72px] shrink-0 items-center justify-end gap-2 border-t border-line bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-6 py-3 backdrop-blur-[14px]">
      <Button type="button" onClick={onCancel} disabled={busy}>
        Cancelar
      </Button>
      <Button variant={submitVariant} disabled={busy || submitDisabled}>
        {busy ? busyLabel : submitLabel}
      </Button>
    </div>
  );
}
