"use client";

// Si una media query se cumple, leído al pintar y seguido mientras cambia.
//
// Lo usa el riel: en el teléfono es un cajón y lleva `.db-rail-drawer` de
// @daybook/design, una clase que no trae su propia media query. Con
// `useSyncExternalStore` el primer pintado en el cliente ya sabe el ancho; si
// la clase llegara en un efecto, el cajón se vería salir al cargar la página.
import { useCallback, useSyncExternalStore } from "react";

export function useMedia(consulta: string): boolean {
  const suscribir = useCallback(
    (avisar: () => void) => {
      const lista = window.matchMedia(consulta);
      lista.addEventListener("change", avisar);
      return () => lista.removeEventListener("change", avisar);
    },
    [consulta],
  );
  return useSyncExternalStore(suscribir, () => window.matchMedia(consulta).matches, () => false);
}

/** El ancho en el que el riel pasa a ser el cajón del ☰ (el `max-[820px]` del armazón). */
export const CONSULTA_TELEFONO = "(width < 820px)";
