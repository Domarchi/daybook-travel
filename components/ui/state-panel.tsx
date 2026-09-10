"use client";

// La caja centrada que usan el estado vacio y la pantalla de acceso. En el CSS
// eran una sola regla (`.empty-state, .access-state`), asi que aqui tambien es
// una sola pieza: si cambia el borde de una, cambia el de la otra.
import * as React from "react";
import { cn } from "@/lib/utils";

export function StatePanel({
  className,
  as: Etiqueta = "div",
  ...props
}: React.ComponentProps<"div"> & { as?: "div" | "section" }) {
  return (
    <Etiqueta
      className={cn(
        "flex min-h-[280px] translate-y-0 flex-col items-center justify-center gap-[9px]",
        "rounded-lg border border-line bg-surface px-5 py-[42px] text-center opacity-100",
        "transition-[opacity,transform] duration-[240ms] ease-[var(--ease-out)]",
        "starting:translate-y-2 starting:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * El titulo de esas cajas. En el CSS eran dos selectores con el mismo estilo,
 * `.empty-state h3` y `.access-state h1`, porque el nivel del encabezado
 * depende de donde este la caja. Por eso se puede elegir la etiqueta.
 */
export function StateTitle({
  className,
  as: Etiqueta = "h3",
  ...props
}: React.ComponentProps<"h3"> & { as?: "h1" | "h2" | "h3" }) {
  return (
    <Etiqueta
      className={cn("text-[19px] tracking-[-0.02em] text-foreground", className)}
      {...props}
    />
  );
}

/** El texto de esas cajas. */
export function StateText({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("mb-[6px] max-w-[430px] text-[13px] text-muted", className)}
      {...props}
    />
  );
}
