"use client";

// Pagina de prueba de la migracion. No es parte de la aplicacion: existe para
// comparar, uno al lado del otro, lo viejo y lo traducido. Se borra cuando la
// migracion termine.
import { Plane } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";

const ESTADOS = [
  "Planificado",
  "Solicitado",
  "Emitido",
  "Completado",
  "Anulado",
  "No presentado",
];

export default function PruebaTailwind() {
  return (
    <main style={{ padding: "48px", display: "grid", gap: "40px" }}>
      <div>
        <h1>Migración a Tailwind: comparación</h1>
        <p className="page-description">
          Cada par tiene que verse idéntico. Si se ve distinto, la traducción
          está mal, no el diseño.
        </p>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px" }}
      >
        <section style={{ display: "grid", gap: "14px", alignContent: "start" }}>
          <span className="section-kicker">CSS de siempre</span>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="primary">Guardar viaje</button>
            <button>Cancelar</button>
            <button disabled>Deshabilitado</button>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {ESTADOS.map((e) => (
              <span
                key={e}
                className={"status-pill status-" + e.toLowerCase().replaceAll(" ", "-")}
              >
                {e}
              </span>
            ))}
          </div>
          <label>
            Correo
            <input placeholder="nombre@empresa.cl" />
          </label>
          <label>
            Estado
            <select defaultValue="Planificado">
              <option>Planificado</option>
            </select>
          </label>
          <label>
            Observaciones
            <textarea placeholder="Restricciones horarias." />
          </label>
          <p className="page-description">
            El estado vacío ya está migrado y en uso, así que aquí no queda
            versión vieja con qué compararlo.
          </p>
        </section>

        <section style={{ display: "grid", gap: "14px", alignContent: "start" }}>
          <span className="section-kicker">Traducido a Tailwind</span>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Button variant="primary">Guardar viaje</Button>
            <Button>Cancelar</Button>
            <Button disabled>Deshabilitado</Button>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {ESTADOS.map((e) => (
              <StatusPill key={e} status={e} />
            ))}
          </div>
          <Label>
            Correo
            <Input placeholder="nombre@empresa.cl" />
          </Label>
          <Label>
            Estado
            <Select defaultValue="Planificado">
              <option>Planificado</option>
            </Select>
          </Label>
          <Label>
            Observaciones
            <Textarea placeholder="Restricciones horarias." />
          </Label>
          <EmptyState
            icon={<Plane size={20} />}
            title="No hay viajes"
            description="Cuando planifiques turnos van a aparecer aquí."
            action="Crear calendario"
            onAction={() => {}}
          />
        </section>
      </div>
    </main>
  );
}
