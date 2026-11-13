"use client";

// La pastilla de estado de un viaje, traducida a Tailwind.
//
// El estado llega como texto de la base ("Planificado", "Emitido"...), asi que
// el mapa vive aqui y no en quien la usa. Los estados que no estan en el mapa
// caen en la pastilla neutra, que es lo que pasaba antes con Planificado.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pillVariants = cva(
  // Pastilla común de @daybook/design (Fase 3): 24 px, 12 px semibold, píldora
  // con punto del color del estado y el fondo suave del estado del paquete (el
  // mismo que Parte Diario), sin borde: sin borde, la mezcla al 10% de antes casi
  // no se veía sobre negro.
  [
    "inline-flex w-fit min-h-[var(--db-badge-height)] items-center gap-[5px] whitespace-nowrap",
    "rounded-[var(--db-badge-radius)] px-[var(--db-badge-padding-x)] py-0",
    "text-[length:var(--db-badge-font-size)] [font-weight:var(--db-badge-weight)]",
    "before:size-[var(--db-badge-dot)] before:shrink-0 before:rounded-full before:bg-current before:content-['']",
  ].join(" "),
  {
    variants: {
      tono: {
        neutro: "bg-[var(--db-surface-muted)] text-foreground-soft",
        aviso: "bg-[var(--db-info-soft)] text-info",
        bien: "bg-[var(--db-success-soft)] text-success",
        malo: "bg-[var(--db-danger-soft)] text-danger",
      },
    },
    defaultVariants: { tono: "neutro" },
  },
);

type Tono = NonNullable<VariantProps<typeof pillVariants>["tono"]>;

/** Que color le toca a cada estado. Lo que no esta aqui va en neutro. */
const TONO_POR_ESTADO: Record<string, Tono> = {
  Solicitado: "aviso",
  Emitido: "bien",
  Completado: "bien",
  Anulado: "malo",
  "No presentado": "malo",
  // Accesos: la pastilla no es de un viaje, pero el mapa es el mismo.
  Activo: "bien",
  Desactivado: "malo",
  Administrador: "aviso",
};

export function StatusPill({
  status,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { status: string }) {
  return (
    <span
      className={cn(pillVariants({ tono: TONO_POR_ESTADO[status] }), className)}
      {...props}
    >
      {children ?? status}
    </span>
  );
}

export { pillVariants, TONO_POR_ESTADO };
