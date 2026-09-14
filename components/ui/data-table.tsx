"use client";

// La tabla de FCC TRAVEL, traducida a Tailwind clase por clase desde las reglas
// `table`, `th` y `td` de la capa fcc.
//
// Lo importante de esta tabla no es como se ve ancha, es que a 760 px deja de
// ser una tabla: la cabecera se esconde, cada fila se vuelve una tarjeta de dos
// columnas y cada celda muestra su propio titulo sacado de `data-label`. Por eso
// cada celda TIENE que llevar `data-label`: sin el, en el telefono queda un dato
// suelto sin decir de que es.
//
// Mientras dure la migracion convive con las reglas `table/th/td` de la capa
// fcc, que siguen vistiendo las tablas de Costos y del panel de Excel. Las
// utilidades de Tailwind les ganan porque van en una capa posterior.
import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <table
      className={cn(
        "w-full min-w-[980px] border-collapse",
        "max-[760px]:block max-[760px]:w-full max-[760px]:min-w-0",
        className,
      )}
      {...props}
    />
  );
}

// En angosto la cabecera no se borra: se esconde de la vista pero sigue ahi para
// quien navega con lector de pantalla.
export function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn(
        "max-[760px]:absolute max-[760px]:h-px max-[760px]:w-px",
        "max-[760px]:overflow-hidden max-[760px]:[clip:rect(0,0,0,0)]",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      className={cn(
        "max-[760px]:grid max-[760px]:w-full max-[760px]:min-w-0 max-[760px]:gap-[9px]",
        className,
      )}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        // La ultima fila no lleva raya abajo: ya la pone el marco.
        "last:[&>td]:border-b-0",
        // El resaltado al pasar el mouse, solo donde hay mouse de verdad.
        "raton:[&:hover>td]:bg-row-hover",
        "max-[760px]:grid max-[760px]:w-full max-[760px]:min-w-0 max-[760px]:grid-cols-2",
        "max-[760px]:overflow-hidden max-[760px]:rounded-md max-[760px]:border",
        "max-[760px]:border-line max-[760px]:bg-surface",
        // A 430 px ya no caben dos columnas.
        "max-[430px]:grid-cols-1",
        className,
      )}
      {...props}
    />
  );
}

export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-11 border-b border-line bg-table-head px-[13px] py-[9px]",
        "text-left align-middle text-[10px] font-extrabold tracking-[0.05em]",
        "text-muted uppercase",
        "transition-[background-color] duration-[120ms] ease-[ease]",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn(
        "border-b border-line px-[13px] py-[14px]",
        "text-left align-middle text-[13px] text-foreground-soft",
        "transition-[background-color] duration-[120ms] ease-[ease]",
        // Tarjeta: la celda pasa a ser una fila con su titulo a la izquierda.
        "max-[760px]:flex max-[760px]:min-h-12 max-[760px]:w-full max-[760px]:min-w-0",
        "max-[760px]:items-center max-[760px]:justify-between max-[760px]:gap-3",
        "max-[760px]:px-3 max-[760px]:py-[10px]",
        "max-[760px]:before:flex-[0_0_auto] max-[760px]:before:text-[9px]",
        "max-[760px]:before:font-extrabold max-[760px]:before:tracking-[0.05em]",
        "max-[760px]:before:text-muted max-[760px]:before:uppercase",
        "max-[760px]:before:content-[attr(data-label)]",
        className,
      )}
      {...props}
    />
  );
}

/** Casilla angosta en tabla; en tarjeta ocupa toda la franja de selección. */
export const CELDA_SELECCION = [
  "w-[46px] text-center",
  "max-[760px]:col-span-full max-[760px]:w-full max-[760px]:min-h-[44px]",
  "max-[760px]:justify-start max-[760px]:bg-surface-soft",
].join(" ");

/** La celda de acciones: botones a la derecha y sin raya abajo en tarjeta. */
export const CELDA_ACCIONES = [
  "flex items-center justify-end gap-[6px]",
  "max-[760px]:col-span-full max-[760px]:justify-end max-[760px]:gap-[6px]",
  "max-[760px]:border-b-0 max-[760px]:before:mr-auto",
].join(" ");

/** La celda principal: en tarjeta ocupa toda la fila y no muestra titulo. */
export const CELDA_PRINCIPAL = [
  "max-[760px]:col-span-full max-[760px]:min-h-[68px] max-[760px]:flex-col",
  "max-[760px]:items-start max-[760px]:justify-center max-[760px]:gap-[3px]",
  "max-[760px]:before:hidden",
].join(" ");

/** El area de pinchado de la casilla: 44x44 sin agrandar la celda. */
export const CASILLA_TOQUE =
  "inline-flex size-11 cursor-pointer items-center justify-center -m-2.5";
