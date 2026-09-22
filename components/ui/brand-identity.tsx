import BrandLogo from "@/components/ui/brand-logo";
import BrandMark from "@/components/ui/brand-mark";
import { cn } from "@/lib/utils";

export default function BrandIdentity({ className }: { className?: string }) {
  return (
    <div className={cn("brand-identity", className)}>
      <BrandLogo />
      <BrandMark />
      <span className="brand-identity-caption">Coordinación de viajes</span>
    </div>
  );
}
