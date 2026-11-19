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

  // Mientras cambia el tema nada se anima (`.db-theme-switching` de
  // @daybook/design/riel.css): las filas del riel y los botones tienen un
  // fundido corto y quedaban atrás de las superficies, y el riel parpadeaba.
  // Se fuerza el cálculo de estilos con la clase puesta y se saca al cuadro
  // siguiente; sacarla antes de ese cálculo dispararía las transiciones igual.
  useEffect(() => {
    if (!cargado) return;
    const raiz = document.documentElement;
    if (raiz.dataset.theme === theme) return;
    raiz.classList.add("db-theme-switching");
    raiz.dataset.theme = theme;
    void raiz.offsetHeight;
    const cuadro = requestAnimationFrame(() => raiz.classList.remove("db-theme-switching"));
    return () => {
      cancelAnimationFrame(cuadro);
      raiz.classList.remove("db-theme-switching");
    };
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
