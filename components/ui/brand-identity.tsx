import BrandLogo from "@/components/ui/brand-logo";
import { cn } from "@/lib/utils";

// La identidad de la cabecera de entrada: el logo completo con su descriptor.
// No se achica al isotipo en pantalla angosta: la entrada quiere el nombre
// entero a la vista. El isotipo para espacios compactos lo usa la barra lateral.
export default function BrandIdentity({ className }: { className?: string }) {
  return (
    <div data-brand-identity className={cn("grid w-[168px] justify-items-start gap-[5px]", className)}>
      <BrandLogo className="w-full" />
      <span className="text-overline leading-[1.3] font-medium tracking-[0.025em] whitespace-nowrap text-muted">
        Gestión de traslados
      </span>
    </div>
  );
}
