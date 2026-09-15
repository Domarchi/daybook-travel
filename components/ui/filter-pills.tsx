"use client";

// El grupo de filtros en forma de pastillas: Activas, 4×3, 10×10, etc.
// Se desplaza a lo ancho cuando no caben, y en pantalla angosta ocupa todo.
//
// Hay dos variantes, y la diferencia no es capricho: viene del CSS viejo, donde
// `.filter-pills` (Personas) y `.shift-filter` (el calendario) compartían la
// caja pero no los botones.
//
//   lista     el filtro de Personas. La pastilla encendida va en gris, y en
//             pantalla angosta cada una conserva su ancho y la fila se desliza.
//
//   jornadas  el filtro del calendario. La pastilla encendida toma el color de
//             su turno —naranja el 4×3, azul el 10×10— porque ahí el color
//             significa algo: es el mismo con el que están pintados los días.
//             En angosto se reparten el ancho en partes iguales.
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tonoDeJornada } from "@/components/ui/shift-badge";

const ENCENDIDA = {
  neutro: "border-line bg-surface-soft text-foreground",
  four: "border-four-line bg-four-soft text-four",
  ten: "border-ten-line bg-ten-soft text-ten",
  manual: "border-line-strong bg-surface-raised text-foreground",
};

export function FilterPills({
  opciones,
  valor,
  onCambio,
  label,
  className,
  variante = "lista",
}: {
  opciones: string[];
  valor: string;
  onCambio: (opcion: string) => void;
  label: string;
  className?: string;
  variante?: "lista" | "jornadas";
}) {
  const jornadas = variante === "jornadas";
  return (
    <div
      aria-label={label}
      className={cn(
        "flex items-center gap-[3px] rounded-[10px] border border-line bg-bg p-[3px]",
        "overflow-x-auto",
        "max-[760px]:w-full",
        className,
      )}
    >
      {opciones.map((opcion) => {
        const tono = jornadas ? tonoDeJornada(opcion) : "pending";
        const encendida =
          jornadas && tono !== "pending" ? ENCENDIDA[tono] : ENCENDIDA.neutro;
        return (
          <Button
            type="button"
            key={opcion}
            aria-pressed={valor === opcion}
            onClick={() => onCambio(opcion)}
            className={cn(
              "min-h-11 px-[11px] text-[12px] leading-[1.2]",
              "max-[760px]:flex-[0_0_auto]",
              valor === opcion
                ? encendida
                : "border-transparent bg-transparent text-muted",
            )}
          >
            {opcion}
          </Button>
        );
      })}
    </div>
  );
}
