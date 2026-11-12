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
  "inline-flex w-fit min-h-[25px] items-center gap-[5px] whitespace-nowrap rounded-pill border px-2 py-1 text-overline font-bold",
  {
    variants: {
      tono: {
        neutro: "border-line-strong bg-surface-soft text-foreground-soft",
        aviso: "border-info-line bg-info-soft text-info",
        bien: "border-success-line bg-success-soft text-success",
        malo: "border-danger-line bg-danger-soft text-danger",
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
