"use client";

import { Moon, Sun } from "lucide-react";

// Antes era una constante con JSX (`themeButton`) que se reusaba en el login y
// en la topbar. Como componente hace exactamente lo mismo: no guarda estado.
export default function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={
        theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"
      }
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      <span>{theme === "dark" ? "Claro" : "Oscuro"}</span>
    </button>
  );
}
