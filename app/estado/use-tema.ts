// El tema claro u oscuro y su memoria en el navegador.
//
// El texto de las funciones es el mismo que tenían dentro de `store.tsx`; solo
// cambió dónde viven.

import { useEffect, useState } from "react";

export function useTema() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("fcc-travel-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("fcc-travel-theme", next);
    } catch {}
  }

  return {
    theme,
    setTheme,
    toggleTheme,
  };
}

export type Tema = ReturnType<typeof useTema>;
