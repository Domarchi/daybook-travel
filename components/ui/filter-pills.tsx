"use client";

// El grupo de filtros en forma de pastillas: Activas, 4×3, 10×10, etc.
// Se desplaza a lo ancho cuando no caben, y en pantalla angosta ocupa todo.
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FilterPills({
  opciones,
  valor,
  onCambio,
  label,
  className,
}: {
  opciones: string[];
  valor: string;
  onCambio: (opcion: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      aria-label={label}
      className={cn(
        "flex items-center gap-[3px] overflow-x-auto rounded-[10px] border border-line bg-bg p-[3px]",
        "max-[760px]:w-full",
        className,
      )}
    >
      {opciones.map((opcion) => (
        <Button
          type="button"
          key={opcion}
          aria-pressed={valor === opcion}
          onClick={() => onCambio(opcion)}
          className={cn(
            "min-h-11 px-[11px] text-[12px] max-[760px]:flex-[0_0_auto]",
            valor === opcion
              ? "border-line bg-surface-soft text-foreground"
              : "border-transparent bg-transparent text-muted",
          )}
        >
          {opcion}
        </Button>
      ))}
    </div>
  );
}
