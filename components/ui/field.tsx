"use client";

// Las primitivas de formulario de Daybook Travel, traducidas a Tailwind.
//
// Igual que el boton: no son las de shadcn tal cual vienen, son las reglas que
// ya existian en globals.css escritas clase por clase. Los cinco dialogos las
// usan, asi que van antes que ellos.
//
// La base la comparten input, select y textarea, tal como la compartian en el
// CSS. Si cambia una, cambian las tres.
import * as React from "react";
import { cn } from "@/lib/utils";

const base = [
  // Campo común de @daybook/design (Fase 3): 44 px, borde 3:1 y 14 px; en el
  // teléfono 16 px, para que iOS no haga zoom al tocarlo (como Parte Diario y Ticket).
  "w-full min-w-0 min-h-[var(--db-field-height)] rounded-[var(--db-field-radius)] border border-[var(--db-border-strong)]",
  "bg-surface px-[var(--db-field-padding-x)] py-[10px] font-[inherit] text-[length:var(--db-field-font-size)] text-foreground",
  "max-[760px]:text-[length:var(--db-text-emphasis)]",
  "transition-[border-color,box-shadow,background-color]",
  "duration-[140ms] ease-[var(--ease-out)]",
  "placeholder:text-muted placeholder:opacity-80",
  "focus-visible:outline-2 focus-visible:outline-offset-[3px]",
  "focus-visible:outline-[var(--focus)]",
].join(" ");

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(base, className)} {...props} />;
}

export function Select({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return <select className={cn(base, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  // El alto minimo y el poder estirarlo solo a lo alto vienen de la regla
  // `textarea { min-height: 96px; resize: vertical }`.
  return (
    <textarea className={cn(base, "min-h-24 resize-y", className)} {...props} />
  );
}

// La casilla no usa la base de arriba: la regla `input[type="checkbox"]` la
// achicaba a 18px, le sacaba el relleno y le ponia el color de acento. Sin esto
// saldria del ancho completo y con 44px de alto.
export function Checkbox({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-[18px] min-h-[18px] min-w-[18px] bg-surface p-0 text-foreground accent-[var(--action)]",
        "focus-visible:outline-2 focus-visible:outline-offset-[3px]",
        "focus-visible:outline-[var(--focus)]",
        className,
      )}
      {...props}
    />
  );
}

// La etiqueta envuelve al campo, no lo precede: por eso es grid con separacion,
// igual que la regla `label { display: grid }` de siempre.
export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "grid gap-[7px] text-meta font-semibold text-foreground-soft",
        className,
      )}
      {...props}
    />
  );
}
