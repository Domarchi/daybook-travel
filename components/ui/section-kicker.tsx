"use client";

// El renglon en mayusculas y espaciado que va sobre un titulo. Se usa en la
// cabecera de los dialogos y en varias secciones de las vistas.
import * as React from "react";
import { cn } from "@/lib/utils";

export function SectionKicker({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "mb-2 block text-[10px] leading-[1.2] font-extrabold tracking-[0.14em] text-muted uppercase",
        className,
      )}
      {...props}
    />
  );
}
