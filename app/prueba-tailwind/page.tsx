// Pagina de prueba de la migracion. No es parte de la aplicacion: existe para
// comparar, uno al lado del otro, el componente viejo y el traducido. Se borra
// cuando la migracion termine.
import { Button } from "@/components/ui/button";

export default function PruebaTailwind() {
  return (
    <main style={{ padding: "48px", display: "grid", gap: "36px" }}>
      <div>
        <h1>Migración a Tailwind: comparación</h1>
        <p className="page-description">
          Cada par tiene que verse idéntico. Si se ve distinto, la traducción
          está mal, no el diseño.
        </p>
      </div>

      <section style={{ display: "grid", gap: "12px" }}>
        <span className="section-kicker">Botones — CSS de siempre</span>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button className="primary">Guardar viaje</button>
          <button>Cancelar</button>
          <button disabled>Deshabilitado</button>
        </div>
      </section>

      <section style={{ display: "grid", gap: "12px" }}>
        <span className="section-kicker">Botones — traducidos a Tailwind</span>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Button variant="primary">Guardar viaje</Button>
          <Button>Cancelar</Button>
          <Button disabled>Deshabilitado</Button>
        </div>
      </section>
    </main>
  );
}
