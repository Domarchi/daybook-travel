"use client";

// El marco de las tablas: el borde, el radio y el desplazamiento horizontal
// cuando la tabla no cabe. Las reglas de `table`, `th` y `td` siguen en la capa
// daybook hasta que se migre la vista de Viajes, que es la que las usa de verdad.
import * as React from "react";
import { cn } from "@/lib/utils";

export function TableWrap({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border border-line bg-surface",
        "focus-visible:outline-2 focus-visible:outline-offset-[3px]",
        "focus-visible:outline-[var(--focus)]",
        className,
      )}
      {...props}
    />
  );
}
