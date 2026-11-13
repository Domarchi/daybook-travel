import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge solo conoce los tamaños y radios de fábrica de Tailwind. Los
// de @daybook/design (text-overline … text-display, rounded-pill) los tomaba
// por colores: en cn("text-meta", "text-success") borraba el tamaño y dejaba
// el color. Aquí se le dice cuáles son tamaños de letra y cuáles radios.
export const TAMANOS_DAYBOOK = ["overline", "caption", "meta", "body", "emphasis", "heading", "title", "display"];

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: TAMANOS_DAYBOOK,
      radius: ["pill"],
    },
  },
});

// El ayudante que esperan todos los componentes de shadcn y de 21st: junta
// clases y resuelve los choques de Tailwind quedandose con la ultima.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
