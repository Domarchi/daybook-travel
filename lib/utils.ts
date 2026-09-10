import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// El ayudante que esperan todos los componentes de shadcn y de 21st: junta
// clases y resuelve los choques de Tailwind quedandose con la ultima.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
