import { cn } from "@/lib/utils";

// El sello de la familia Daybook (`@daybook/design/marca.css`): símbolo + DAYBOOK
// + producto, con las mismas clases y medidas en Parte Diario, Travel y Ticket,
// para que se lean como herramientas de una misma batería. DAYBOOK y TRAVEL son
// texto, no parte de una imagen; el nombre accesible lo da aria-label.
//
// El tamaño lo pone el paquete: quien lo usa solo lo ubica. El símbolo cambia
// solo con el tema. Sobre el riel (oscuro en los dos temas) el contenedor lleva
// `db-on-dark`.
export default function BrandLogo({ className }: { className?: string }) {
  return (
    <span data-brand-logo className={cn("db-lockup", className)} role="img" aria-label="Daybook Travel">
      <span className="db-mark" aria-hidden="true" />
      <span className="db-lockup__type" aria-hidden="true">
        <span className="db-lockup__name">Daybook</span>
        <span className="db-lockup__product">Travel</span>
      </span>
    </span>
  );
}
