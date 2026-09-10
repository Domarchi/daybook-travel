"use client";

// La pantalla de "aqui no hay nada", traducida a Tailwind.
//
// Primer componente de verdad de la migracion: no tiene logica, solo forma, y
// aparece en cuatro lugares. El boton de accion usa la primitiva ya traducida,
// que es justamente para lo que se hicieron primero.
import { Button } from "@/components/ui/button";

export default function EmptyState({
  icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-[280px] translate-y-0 flex-col items-center justify-center gap-[9px] rounded-lg border border-line bg-surface px-5 py-[42px] text-center opacity-100 transition-[opacity,transform] duration-[240ms] ease-[var(--ease-out)] starting:translate-y-2 starting:opacity-0">
      <span className="mb-[3px] inline-flex size-11 items-center justify-center rounded-[12px] bg-surface-soft text-muted">
        {icon}
      </span>
      <h3 className="text-[19px] tracking-[-0.02em] text-foreground">
        {title}
      </h3>
      <p className="mb-[6px] max-w-[430px] text-[13px] text-muted">
        {description}
      </p>
      {action && onAction && (
        <Button type="button" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}
