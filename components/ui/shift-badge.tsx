"use client";

// La pastilla de jornada: 4×3, 10×10, sin turno o por confirmar. Aparece en Personas, en
// la Agenda y en el calendario, en dos tamanos: la grande de las fichas y la
// chica que va dentro de los dias del calendario.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Ojo con `leading-none`: va DENTRO de cada tamano, despues del tamano de
// letra, y no en la base. tailwind-merge cree que una clase `text-<tamano>`
// tambien fija el interlineado —en Tailwind 3 era asi— y borra en silencio
// cualquier `leading-*` anterior. Puesto en la base, se perdia: las pastillas
// quedaban con interlineado 1,2 en vez de 1, y la pastilla crecia un pixel.
const shiftVariants = cva(
  "inline-flex w-fit items-center gap-1 rounded-pill border font-extrabold whitespace-nowrap",
  {
    variants: {
      tono: {
        four: "border-four-line bg-four-soft text-four",
        ten: "border-ten-line bg-ten-soft text-ten",
        manual: "border-line-strong bg-surface-raised text-foreground",
        pending: "border-dashed border-line-strong bg-surface-soft text-muted",
      },
      tamano: {
        // .shift-badge
        normal: "min-h-[25px] px-2 py-[5px] text-overline leading-none",
        // .shift-tag, la que va dentro de un dia del calendario. En pantalla
        // angosta se estrecha y encoge, porque el dia mide 44 px de ancho.
        chica: [
          "min-h-[18px] px-[5px] py-[2px] text-[8px] leading-none",
          "max-[760px]:max-w-full max-[760px]:px-1",
          "max-[430px]:text-[7px]",
        ].join(" "),
      },
    },
    defaultVariants: { tono: "pending", tamano: "normal" },
  },
);

/** Que tono le toca a cada jornada. Lo que no reconoce va en "por confirmar". */
export const tonoDeJornada = (shift: string) =>
  shift === "4×3"
    ? "four"
    : shift === "10×10"
      ? "ten"
      : shift === "Sin turno"
        ? "manual"
        : "pending";

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
