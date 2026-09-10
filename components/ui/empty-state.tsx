"use client";

// La pantalla de "aqui no hay nada". Comparte la caja con la pantalla de
// acceso, igual que compartian la regla de CSS.
import { Button } from "@/components/ui/button";
import { StatePanel, StateText, StateTitle } from "@/components/ui/state-panel";

export default function EmptyState({
  icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <StatePanel>
      <span className="mb-[3px] inline-flex size-11 items-center justify-center rounded-[12px] bg-surface-soft text-muted">
        {icon}
      </span>
      <StateTitle>{title}</StateTitle>
      <StateText>{description}</StateText>
      {action && onAction && (
        <Button type="button" onClick={onAction}>
          {action}
        </Button>
      )}
    </StatePanel>
  );
}
