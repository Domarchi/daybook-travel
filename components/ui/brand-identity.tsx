import BrandLogo from "@/components/ui/brand-logo";
import { cn } from "@/lib/utils";

// La identidad de la cabecera de entrada: el logo de la familia y, debajo y
// fuera del logo, el descriptor. No se achica al símbolo en pantalla angosta: la
// entrada quiere el nombre entero a la vista.
export default function BrandIdentity({ className }: { className?: string }) {
  return (
    <div data-brand-identity className={cn("grid justify-items-start gap-2", className)}>
      <BrandLogo />
      <span className="db-lockup-descriptor">Gestión de traslados</span>
    </div>
  );
}
