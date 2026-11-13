"use client";

// Las dos pastillas de la tabla de viajes.
//
// La de movimiento dice si la persona sube a la obra o baja de vuelta. La de
// compra dice cuanto falta para ese vuelo, y es la que hace que Katy sepa que
// mirar primero: cuando se pone amarilla queda poco, cuando se pone roja la
// fecha ya paso.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { EstadoCompra } from "@/lib/purchase";

const movimientoVariants = cva(
  [
    // Medidas de la pastilla común (Fase 3); lleva flecha en vez de punto.
    "inline-flex min-h-[var(--db-badge-height)] w-fit items-center gap-[5px] rounded-[var(--db-badge-radius)]",
    "px-[var(--db-badge-padding-x)] py-0 text-[length:var(--db-badge-font-size)] [font-weight:var(--db-badge-weight)] whitespace-nowrap",
  ].join(" "),
  {
    variants: {
      sentido: {
        SUBIDA: "bg-subida-soft text-subida",
        BAJADA: "bg-bajada-soft text-bajada",
      },
    },
    defaultVariants: { sentido: "SUBIDA" },
  },
);

export function DirectionPill({
  direction,
  className,
  ...props
}: React.ComponentProps<"span"> & { direction: string }) {
  const sentido = direction === "BAJADA" ? "BAJADA" : "SUBIDA";
  return (
    <span
      className={cn(movimientoVariants({ sentido }), className)}
      {...props}
    />
  );
}

const compraVariants = cva(
  [
    "block w-fit rounded-pill border px-[7px] py-[2px]",
    "mt-1 text-overline font-bold whitespace-nowrap",
  ].join(" "),
  {
    variants: {
      estado: {
        // "Con reserva" y "faltan tantos dias" van en el tono neutro.
        normal: "border-line-strong bg-surface-soft text-foreground-soft",
        urgente: "border-urgente-line bg-urgente-soft text-warning",
        vencido: "border-vencido-line bg-vencido-soft text-danger",
        // Un viaje anulado conserva la pastilla, apagada.
        cerrado:
          "border-line-strong bg-surface-soft text-foreground-soft opacity-[0.55]",
      },
    },
    defaultVariants: { estado: "normal" },
  },
);

type Tono = NonNullable<VariantProps<typeof compraVariants>["estado"]>;

const TONO_POR_ESTADO: Record<string, Tono> = {
  urgente: "urgente",
  vencido: "vencido",
  cerrado: "cerrado",
};

export function PurchasePill({
  estado,
  className,
  ...props
}: React.ComponentProps<"small"> & { estado: EstadoCompra }) {
  return (
    <small
      className={cn(
        compraVariants({ estado: TONO_POR_ESTADO[estado] }),
        className,
      )}
      {...props}
    />
  );
}

export { movimientoVariants, compraVariants };
