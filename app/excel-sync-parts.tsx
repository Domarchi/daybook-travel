"use client";

// Las piezas chicas del panel de Excel: el paso de la barra de arriba y las
// tarjetas de conteo, con los estilos que comparten con el panel.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Las tarjetas de conteo, en el resumen y en la pantalla final.
export const TARJETA = "grid min-h-[76px] content-center gap-px rounded-sm border border-line bg-surface px-3 py-[10px]";
export const TARJETA_NUMERO = "text-[22px] leading-[1.1] tracking-[-0.03em]";

// Los tonos de las tarjetas y de las pastillas de accion. El gris es el estado
// en reposo: una cuenta en cero no se enciende.
export const TONOS = {
  new: "border-[color-mix(in_srgb,var(--success)_38%,var(--border))] bg-[color-mix(in_srgb,var(--success)_9%,var(--surface))] text-success [&>strong]:text-inherit",
  change: "border-[color-mix(in_srgb,var(--warning)_38%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_9%,var(--surface))] text-warning [&>strong]:text-inherit",
  conflict: "border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_9%,var(--surface))] text-danger [&>strong]:text-inherit",
};

// Un paso de la barra de arriba. El número va en un círculo que cambia de color
// según dónde esté la persona: gris lo que falta, blanco lo que está haciendo,
// verde lo que ya pasó.
export function Paso({
  estado,
  numero,
  children,
}: {
  estado: "pendiente" | "actual" | "hecho";
  numero: number;
  children: ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex min-h-9 items-center gap-2 text-[11px] font-[750]",
        "max-[430px]:gap-[5px] max-[430px]:text-[10px]",
        estado === "actual" ? "text-foreground" : "text-muted",
      )}
    >
      <span
        className={cn(
          "inline-flex size-6 flex-none items-center justify-center rounded-[999px] border text-[10px]",
          "max-[430px]:size-[22px]",
          estado === "actual"
            ? "border-foreground-soft bg-foreground text-surface"
            : estado === "hecho"
              ? "border-[color-mix(in_srgb,var(--success)_48%,var(--border))] bg-[color-mix(in_srgb,var(--success)_12%,var(--surface))] text-success"
              : "border-line-strong bg-surface-soft text-muted",
        )}
      >
        {numero}
      </span>{" "}
      {children}
    </li>
  );
}

// Una de las cinco cajas del resumen. Solo se enciende con color cuando tiene
// algo dentro: un cero en "Conflictos" no debe gritar.
export function Tarjeta({
  numero,
  tono,
  children,
}: {
  numero: number;
  tono?: keyof typeof TONOS;
  children: ReactNode;
}) {
  return (
    <span className={cn(TARJETA, tono && TONOS[tono])}>
      <strong className={TARJETA_NUMERO}>{numero}</strong>
      <small>{children}</small>
    </span>
  );
}
