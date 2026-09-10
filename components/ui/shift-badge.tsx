"use client";

// La pastilla de jornada: 4×3, 10×10 o por confirmar. Aparece en Personas, en
// la Agenda y en el calendario, en dos tamanos: la grande de las fichas y la
// chica que va dentro de los dias del calendario.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const shiftVariants = cva(
  "inline-flex w-fit items-center gap-1 rounded-[999px] border leading-none font-extrabold whitespace-nowrap",
  {
    variants: {
      tono: {
        four: "border-four-line bg-four-soft text-four",
        ten: "border-ten-line bg-ten-soft text-ten",
        pending: "border-line-strong bg-surface-soft text-foreground-soft",
      },
      tamano: {
        // .shift-badge
        normal: "min-h-[25px] px-2 py-[5px] text-[10px]",
        // .shift-tag, la que va dentro de un dia del calendario
        chica: "min-h-[18px] px-[5px] py-[2px] text-[8px]",
      },
    },
    defaultVariants: { tono: "pending", tamano: "normal" },
  },
);

/** Que tono le toca a cada jornada. Lo que no reconoce va en "por confirmar". */
export const tonoDeJornada = (shift: string) =>
  shift === "4×3" ? "four" : shift === "10×10" ? "ten" : "pending";

export function ShiftBadge({
  className,
  tono,
  tamano,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof shiftVariants>) {
  return (
    <span
      className={cn(shiftVariants({ tono, tamano }), className)}
      {...props}
    />
  );
}

export { shiftVariants };
