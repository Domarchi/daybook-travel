"use client";

// El vacío común de las tres apps (Fase 5c del estándar Daybook): ícono, título,
// una frase y, si la hay, una acción. El dibujo es `.db-empty` de
// `@daybook/design/estados.css`, el mismo archivo que importan Parte Diario y
// Ticket; aquí solo se pone el marcado.
//
// Suelto en una vista va dentro de una tarjeta con borde (como antes con
// StatePanel). `bare` lo deja sin caja, para dentro de una tabla, una lista o un
// diálogo que ya tienen la suya.
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function EmptyState({
  icon,
  title,
  description,
  action,
  onAction,
  bare = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
  bare?: boolean;
}) {
  return (
    <div className={cn("db-empty", !bare && "rounded-lg border border-line bg-surface")}>
      <span className="db-empty__icon [&>svg]:size-[22px]" aria-hidden="true">
        {icon}
      </span>
      <h3 className="db-empty__title">{title}</h3>
      <p className="db-empty__text">{description}</p>
      {action && onAction && (
        <div className="db-empty__action">
          <Button type="button" onClick={onAction}>
            {action}
          </Button>
        </div>
      )}
    </div>
  );
}
