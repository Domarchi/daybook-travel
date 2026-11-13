// El tema: Sistema, Claro u Oscuro, y su memoria en el navegador.
//
// La regla vive en lib/tema.ts (con pruebas); aquí solo se conecta con React y
// con el cambio de tema del sistema mientras la página está abierta.

import { useEffect, useState } from "react";
import { CLAVE_DEL_TEMA, leerPreferenciaDeTema, temaEfectivo, type PreferenciaDeTema } from "@/lib/tema";

export function useTema() {
  const [preferenciaTema, setPreferenciaTema] = useState<PreferenciaDeTema>("system");
  const [sistemaOscuro, setSistemaOscuro] = useState(true);
  // Hasta leer lo guardado no se toca `data-theme`: ya lo puso el script del
  // <head>, y escribir el valor inicial de React lo haría parpadear.
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    try {
      setPreferenciaTema(leerPreferenciaDeTema(localStorage.getItem(CLAVE_DEL_TEMA)));
    } catch {}
    const consulta = window.matchMedia("(prefers-color-scheme: dark)");
    const alCambiar = () => setSistemaOscuro(consulta.matches);
    alCambiar();
    consulta.addEventListener("change", alCambiar);
    setCargado(true);
    return () => consulta.removeEventListener("change", alCambiar);
  }, []);

  const theme = temaEfectivo(preferenciaTema, sistemaOscuro);

  useEffect(() => {
    if (cargado) document.documentElement.dataset.theme = theme;
  }, [cargado, theme]);

  function elegirTema(preferencia: PreferenciaDeTema) {
    setPreferenciaTema(preferencia);
    try {
      localStorage.setItem(CLAVE_DEL_TEMA, preferencia);
    } catch {}
  }

  // El botón compacto (acceso y teléfono) alterna entre claro y oscuro a partir
  // de lo que se ve; deja de seguir al sistema hasta que se elija «Sistema».
  function toggleTheme() {
    elegirTema(theme === "dark" ? "light" : "dark");
  }

  return {
    theme,
    preferenciaTema,
    elegirTema,
    toggleTheme,
  };
}

export type Tema = ReturnType<typeof useTema>;
