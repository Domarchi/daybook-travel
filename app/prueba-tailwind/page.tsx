// Pagina de prueba. No es parte de la aplicacion: existe solo para mirar si un
// componente de shadcn/21st convive bien con el CSS que ya tiene FCC TRAVEL.
// Se borra junto con la rama si la respuesta es que no.
import { Button } from "@/components/ui/button";

export default function PruebaTailwind() {
  return (
    <main style={{ padding: "48px", display: "grid", gap: "36px" }}>
      <div>
        <h1>Tailwind y shadcn, al lado del CSS de siempre</h1>
        <p className="page-description">
          Arriba los botones de la aplicacion. Abajo, los mismos hechos con
          shadcn. Si se ven iguales, conviven. Si no, se nota el parche.
        </p>
      </div>

      <section style={{ display: "grid", gap: "12px" }}>
        <span className="section-kicker">Los de FCC TRAVEL</span>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button className="primary">Guardar viaje</button>
          <button>Cancelar</button>
          <button disabled>Deshabilitado</button>
        </div>
      </section>

      <section style={{ display: "grid", gap: "12px" }}>
        <span className="section-kicker">Los de shadcn con tus colores</span>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Button>Guardar viaje</Button>
          <Button variant="outline">Cancelar</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button disabled>Deshabilitado</Button>
        </div>
      </section>

      <section style={{ display: "grid", gap: "12px" }}>
        <span className="section-kicker">Utilidades sueltas de Tailwind</span>
        <div className="flex gap-3 rounded-xl border border-line bg-surface p-4">
          <div className="size-10 rounded-lg bg-primary" />
          <div className="flex flex-col justify-center">
            <span className="text-sm font-semibold text-foreground">
              Esta caja es Tailwind puro
            </span>
            <span className="text-xs text-muted">
              Si los colores calzan con el resto, el puente funciona.
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
