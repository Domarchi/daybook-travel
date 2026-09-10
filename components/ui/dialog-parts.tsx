"use client";

// Las piezas de armado que comparten los cinco dialogos: el cuerpo que se
// desplaza, las secciones del formulario, la rejilla de dos columnas y la
// nota al margen. Traducidas del CSS de siempre.
import * as React from "react";
import { cn } from "@/lib/utils";

export function DialogBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto px-6 pt-[22px] pb-8",
        className,
      )}
      {...props}
    />
  );
}

// La clase marcadora existe para poder decir "cuando una seccion viene despues
// de otra, ponle la linea de arriba", que era la regla `.form-section +
// .form-section`. Sin una clase estable no hay forma de expresar ese "despues
// de" entre dos componentes distintos.
export function FormSection({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "seccion-form grid gap-[15px] pb-6",
        "[.seccion-form+&]:border-t [.seccion-form+&]:border-line [.seccion-form+&]:pt-[23px]",
        "[&_h3]:text-[14px] [&_h3]:tracking-[-0.01em]",
        className,
      )}
      {...props}
    />
  );
}

export function FormGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-[15px] max-[760px]:grid-cols-1",
        className,
      )}
      {...props}
    />
  );
}

export function Hint({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "border-l-2 border-line-strong px-3 py-[10px] text-[11px] text-muted",
        className,
      )}
      {...props}
    />
  );
}

/** La ruedita de "cargando". El giro sigue siendo el keyframe de la capa fcc. */
export function LoadingMark({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-[18px] shrink-0 animate-[spin_700ms_linear_infinite]",
        "rounded-[999px] border-2 border-line-strong border-t-foreground",
        className,
      )}
      {...props}
    />
  );
}
