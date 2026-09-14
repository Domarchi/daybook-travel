import BrandLogo from "@/components/ui/brand-logo";
import { cn } from "@/lib/utils";

export default function BrandIdentity({ className }: { className?: string }) {
  return (
    <div className={cn("brand-identity", className)}>
      <BrandLogo />
      <span className="brand-identity-caption">FCC Travel <span aria-hidden="true">·</span> Copiapó</span>
    </div>
  );
}
