import { FCC_LOGO } from "@/lib/brand";
import { cn } from "@/lib/utils";

export default function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn("fcc-logo", className)}>
      <span className="fcc-logo-window">
        {/* El recorte respeta las proporciones. La transparencia y el contraste
            se aplican al mostrar la imagen, sin modificar el archivo original. */}
        <img src={FCC_LOGO} alt="FCC Construcción" width={550} height={279} />
      </span>
    </span>
  );
}
