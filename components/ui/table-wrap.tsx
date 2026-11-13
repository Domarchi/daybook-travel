"use client";

// El marco de las tablas: el borde, el radio y el desplazamiento horizontal
// cuando la tabla no cabe.
//
// `relative` no es decorativo: sin él, lo que va con posición absoluta dentro de
// la tabla (el "Acciones" solo para lectores de pantalla, la cabecera escondida
// del modo tarjeta) se ubica respecto de la página y no del marco, así que se
// escapa del desplazamiento y la página entera se podía correr de costado.
import * as React from "react";
import { cn } from "@/lib/utils";

export function TableWrap({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative overflow-x-auto rounded-lg border border-line bg-surface",
        "focus-visible:outline-2 focus-visible:outline-offset-[3px]",
        "focus-visible:outline-[var(--focus)]",
        className,
      )}
      {...props}
    />
  );
}
