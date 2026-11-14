import { cn } from "@/lib/utils";

// Solo el símbolo Daybook (`@daybook/design/marca.css`): 48 px, o 56 px con
// `grande` (la tarjeta de entrada). El dibujo viene en el CSS y sigue al tema.
export default function BrandMark({ className, grande = false }: { className?: string; grande?: boolean }) {
  return (
    <span
      data-brand-mark
      role="img"
      aria-label="Daybook"
      className={cn("db-mark", grande && "db-mark--large", className)}
    />
  );
}
