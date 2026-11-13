// El tema de Daybook Travel: Sistema, Claro u Oscuro, como en Parte Diario y
// Daybook Ticket. Sin elección guardada, sigue al sistema operativo (antes
// arrancaba siempre en oscuro). Sin React ni navegador: lo usan el hook, el
// script que corre antes de pintar y las pruebas.

export type PreferenciaDeTema = "system" | "light" | "dark";
export type Tema = "light" | "dark";

export const CLAVE_DEL_TEMA = "daybook-travel-theme";

export const OPCIONES_DE_TEMA: ReadonlyArray<{ valor: PreferenciaDeTema; etiqueta: string }> = [
  { valor: "system", etiqueta: "Sistema" },
  { valor: "light", etiqueta: "Claro" },
  { valor: "dark", etiqueta: "Oscuro" },
];

/** Lo guardado en el navegador; cualquier otra cosa (o nada) es «Sistema». */
export function leerPreferenciaDeTema(guardado: string | null | undefined): PreferenciaDeTema {
  return guardado === "light" || guardado === "dark" || guardado === "system" ? guardado : "system";
}

/** El tema que se pinta: la elección, o el del sistema si la elección es «Sistema». */
export function temaEfectivo(preferencia: PreferenciaDeTema, sistemaOscuro: boolean): Tema {
  if (preferencia === "system") return sistemaOscuro ? "dark" : "light";
  return preferencia;
}

/**
 * El script del <head>: pone `data-theme` antes de la primera pintada, con la
 * misma regla que temaEfectivo. Va como texto porque corre antes que React.
 */
export const SCRIPT_TEMA_INICIAL = `
  try {
    var guardado = window.localStorage.getItem(${JSON.stringify(CLAVE_DEL_TEMA)});
    var preferencia = guardado === "light" || guardado === "dark" ? guardado : "system";
    document.documentElement.dataset.theme = preferencia === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preferencia;
  } catch (e) {}
`;
