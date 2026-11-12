import { cn } from "@/lib/utils";

// El logo trae dos dibujos, uno para fondo oscuro y otro para fondo claro, y se
// muestra el que corresponde al tema. `tono="oscuro"` es para lo que tiene fondo
// oscuro en los dos temas (la barra lateral): ahí siempre va el de fondo oscuro.
export type Tono = "tema" | "oscuro";

export default function BrandLogo({ className, tono = "tema" }: { className?: string; tono?: Tono }) {
  return (
    <span data-brand-logo className={cn("inline-block w-[164px] shrink-0", className)}>
      <img
        className={cn("block h-auto w-full", tono === "tema" && "claro:hidden")}
        src="/brand/daybook-travel-logo-on-dark.svg"
        alt="Daybook Travel"
        width={328}
        height={96}
      />
      <img
        className={cn("hidden h-auto w-full", tono === "tema" && "claro:block")}
        src="/brand/daybook-travel-logo-on-light.svg"
        alt=""
        aria-hidden="true"
        width={328}
        height={96}
      />
    </span>
  );
}
