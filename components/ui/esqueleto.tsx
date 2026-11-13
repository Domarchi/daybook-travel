"use client";

// La carga con la forma del contenido (Fase 5c del estándar Daybook). El dibujo
// es `.db-skeleton` de `@daybook/design/estados.css`, el mismo de Parte Diario y
// Ticket. El contenedor es `role="status"` y lleva «Cargando X…» oculto a la
// vista: el lector de pantalla lo sigue anunciando. El «…» visible queda solo en
// los botones.
import type { CSSProperties, ReactNode } from "react";

// Fijos y no al azar: el servidor y el cliente tienen que dibujar lo mismo.
const ANCHOS = ["72%", "48%", "86%", "60%", "40%", "78%"];

function RegionDeCarga({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="db-skeleton-region" role="status" aria-live="polite" aria-busy="true">
      <span className="db-visually-hidden">{etiqueta}</span>
      {children}
    </div>
  );
}

/** Las filas de una tabla que todavía no llegó. */
export function EsqueletoDeTabla({
  etiqueta,
  filas = 4,
  columnas = 4,
}: {
  etiqueta: string;
  filas?: number;
  columnas?: number;
}) {
  return (
    <RegionDeCarga etiqueta={etiqueta}>
      {Array.from({ length: filas }, (_, fila) => (
        <div
          className="db-skeleton-row"
          key={fila}
          style={{ "--db-skeleton-columns": columnas } as CSSProperties}
        >
          {Array.from({ length: columnas }, (_, columna) => (
            <span
              key={columna}
              className="db-skeleton db-skeleton--text"
              style={{ width: ANCHOS[(fila + columna) % ANCHOS.length] }}
            />
          ))}
        </div>
      ))}
    </RegionDeCarga>
  );
}

/** Tarjetas de una lista: un título y una o dos líneas. */
export function EsqueletoDeLista({
  etiqueta,
  filas = 3,
  lineas = 2,
}: {
  etiqueta: string;
  filas?: number;
  lineas?: number;
}) {
  return (
    <RegionDeCarga etiqueta={etiqueta}>
      {Array.from({ length: filas }, (_, fila) => (
        <div className="db-skeleton-card" key={fila}>
          <span
            className="db-skeleton db-skeleton--title"
            style={{ width: ANCHOS[fila % ANCHOS.length] }}
          />
          {Array.from({ length: lineas }, (_, linea) => (
            <span
              key={linea}
              className="db-skeleton db-skeleton--text"
              style={{ width: ANCHOS[(fila + linea + 2) % ANCHOS.length] }}
            />
          ))}
        </div>
      ))}
    </RegionDeCarga>
  );
}
