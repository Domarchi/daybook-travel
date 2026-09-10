"use client";

// Las tarjetas grandes del resumen: proximo movimiento, por comprar, pendientes
// y personas activas. Tambien la usa Costos, ahi en version quieta.
//
// Las que llevan a alguna parte son botones y heredan la primitiva, pisandole lo
// que cambia: pasa de fila a rejilla, crece y el texto se alinea a la izquierda.
// La de Costos NO es un boton -en el CSS tampoco lo era, era un div- porque no
// lleva a ninguna parte; por eso trae su propio borde y su propio fondo.
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const forma = [
  "relative grid min-h-[112px] min-w-0 grid-cols-[1fr_auto] grid-rows-[auto_1fr_auto]",
  "items-start justify-items-start gap-x-3 gap-y-[3px] rounded-md p-[17px] text-left",
  // El rotulo y la nota van en la primera columna; la flecha ocupa toda la
  // altura de la segunda.
  "[&>span]:col-start-1 [&>small]:col-start-1",
  "[&>span]:text-[11px] [&>span]:font-[750] [&>span]:text-muted",
  "[&>strong]:self-end [&>strong]:text-[28px] [&>strong]:leading-[1.1] [&>strong]:tracking-[-0.035em]",
  "[&>svg]:col-start-2 [&>svg]:row-span-full [&>svg]:self-center [&>svg]:text-muted",
  "max-[760px]:min-h-[118px] max-[760px]:p-[14px] max-[760px]:[&>strong]:text-[24px]",
].join(" ");

const variantes = {
  normal: "",
  // La primera tarjeta lleva una fecha, no un numero, asi que va mas chica.
  next: "[&>strong]:text-[18px] max-[760px]:col-span-full max-[760px]:min-h-[102px]",
  urgente:
    "border-[color-mix(in_srgb,var(--warning)_40%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_7%,var(--surface))] [&>strong]:text-[var(--warning)]",
} as const;

export function OverviewCard({
  className,
  variante = "normal",
  ...props
}: React.ComponentProps<typeof Button> & {
  variante?: keyof typeof variantes;
}) {
  return (
    <Button
      className={cn(forma, variantes[variante], className)}
      {...props}
    />
  );
}

/** La version de Costos: no se aprieta, asi que no es un boton. */
export function StaticOverviewCard({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        forma,
        "cursor-default border border-line bg-surface text-[13px] text-foreground-soft",
        className,
      )}
      {...props}
    />
  );
}
