"use client";

// El boton de FCC TRAVEL, escrito en Tailwind.
//
// Esto NO es el boton de shadcn tal cual viene: es una traduccion fiel del que
// ya existia en globals.css, clase por clase, para que la migracion no cambie
// como se ve nada. Rediseñar y migrar a la vez es la forma mas segura de no
// saber cual de los dos rompio algo.
//
// Mientras dure la migracion convive con la regla `button { ... }` de la capa
// fcc: esa sigue vistiendo a los botones que todavia no se migraron, y estas
// clases le ganan porque las utilidades de Tailwind van por encima de la capa.
// Cuando no quede ningun boton sin migrar, esa regla se borra.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex cursor-pointer items-center justify-center gap-2",
    "rounded-sm border text-[13px] leading-[1.2]",
    "transition-[transform,background-color,border-color,color,opacity]",
    "duration-[140ms] ease-[var(--ease-out)]",
    "active:not-disabled:scale-[0.97]",
    "disabled:cursor-not-allowed disabled:opacity-[0.48]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "min-h-11 border-line bg-surface-raised px-[14px] font-[650] text-foreground-soft",
        primary:
          "min-h-[46px] border-primary bg-primary px-[18px] font-[750] text-primary-foreground",
        icon: "size-11 min-w-11 border-line bg-surface-raised p-0 font-[650] text-foreground-soft",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Button({
  className,
  variant,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button className={cn(buttonVariants({ variant }), className)} {...props} />
  );
}

export { buttonVariants };
