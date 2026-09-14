"use client";

// El interruptor de tema. Es el boton de siempre con dos cambios: sin fondo y
// un poco mas angosto. Nada mas, y por eso se apoya en la primitiva.
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ThemeToggle({
  theme,
  onToggle,
  compact = false,
}: {
  theme: string;
  onToggle: () => void;
  compact?: boolean;
}) {
  const oscuro = theme === "dark";
  return (
    <Button
      type="button"
      variant={compact ? "icon" : "default"}
      className={compact ? "border-transparent bg-transparent" : "bg-transparent px-3"}
      onClick={onToggle}
      aria-label={oscuro ? "Activar modo claro" : "Activar modo oscuro"}
    >
      {oscuro ? <Sun size={17} /> : <Moon size={17} />}
      {!compact && <span>{oscuro ? "Claro" : "Oscuro"}</span>}
    </Button>
  );
}
