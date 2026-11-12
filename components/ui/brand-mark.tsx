import { cn } from "@/lib/utils";
import type { Tono } from "@/components/ui/brand-logo";

// El isotipo parte escondido: quien lo usa dice cuándo se ve (la tarjeta de
// entrada siempre, la barra lateral solo en pantalla angosta).
export default function BrandMark({ className, tono = "tema" }: { className?: string; tono?: Tono }) {
  return (
    <span data-brand-mark className={cn("hidden w-[42px] shrink-0", className)}>
      <img
        className={cn("block h-auto w-full", tono === "tema" && "claro:hidden")}
        src="/brand/daybook-mark-on-dark.svg"
        alt="Daybook"
        width={96}
        height={96}
      />
      <img
        className={cn("hidden h-auto w-full", tono === "tema" && "claro:block")}
        src="/brand/daybook-mark-on-light.svg"
        alt=""
        aria-hidden="true"
        width={96}
        height={96}
      />
    </span>
  );
}
