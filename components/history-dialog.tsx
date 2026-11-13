"use client";

import EmptyState from "@/components/ui/empty-state";
import { EsqueletoDeLista } from "@/components/ui/esqueleto";
import { Button } from "@/components/ui/button";
import { DialogBody } from "@/components/ui/dialog-parts";
import { ArrowDownLeft, Clock } from "lucide-react";
import { formatDateTime } from "../lib/format";
import { useApp } from "../app/store";
import type { HistoryItem } from "../lib/types";

// Quién hizo el cambio. El correo, si la base lo tradujo; si no, el número
// corto de la cuenta, que al menos permite distinguir a dos personas. Sin
// autor es un cambio hecho por fuera de la aplicación (una migración, la
// consola de Supabase).
function autorDe(item: HistoryItem) {
  if (item.actor_email) return item.actor_email;
  if (item.actor) return `Usuario ${item.actor.slice(0, 8)}`;
  return "Cambio interno";
}

export default function HistoryDialog() {
  const {
    closeModal,
    demo,
    editTrip,
    history,
    historyLoading,
    openTrip,
  } = useApp();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogBody>
        {editTrip && (
          <Button
            type="button"
            className="mb-[18px] w-fit border-transparent bg-transparent"
            onClick={() => openTrip(editTrip)}
          >
            <ArrowDownLeft size={16} /> Volver al viaje
          </Button>
        )}
        {historyLoading ? (
          <EsqueletoDeLista etiqueta="Cargando cambios…" filas={3} />
        ) : demo ? (
          <EmptyState
            icon={<Clock />}
            title="Historial disponible en la operación"
            description="La demostración no guarda cambios permanentes."
            bare
          />
        ) : history.length ? (
          <div className="grid">
            {history.map((item) => (
              // La línea vertical que une los puntos es el ::before, y por eso
              // el último elemento no la lleva: si no, colgaría en el vacío.
              <article
                className="relative grid grid-cols-[14px_1fr] gap-[10px] pb-[25px] not-last:before:absolute not-last:before:top-[14px] not-last:before:bottom-0 not-last:before:left-[5px] not-last:before:w-px not-last:before:bg-line-strong not-last:before:content-['']"
                key={item.id}
              >
                <span
                  aria-hidden="true"
                  className="mt-[5px] size-[11px] rounded-pill border-2 border-surface bg-foreground-soft shadow-[0_0_0_1px_var(--border-strong)]"
                />
                <div className="grid gap-1">
                  <strong className="text-foreground">
                    {item.action === "INSERT"
                      ? "Viaje creado"
                      : "Viaje actualizado"}
                  </strong>
                  <small className="text-muted">
                    {formatDateTime(item.created_at)} · {autorDe(item)}
                  </small>
                  <p className="mt-1 rounded-sm bg-surface-soft px-3 py-[10px] text-caption whitespace-pre-wrap text-foreground-soft">
                    {String(item.after_data?.notes || "Sin observaciones")} ·{" "}
                    {String(item.after_data?.status || "")}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Clock />}
            title="Sin cambios anteriores"
            description="Este viaje todavía no tiene cambios registrados."
            bare
          />
        )}
      </DialogBody>
      <div className="flex min-h-[72px] shrink-0 items-center justify-end gap-2 border-t border-line bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-6 py-3 backdrop-blur-[14px]">
        <Button type="button" onClick={closeModal}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
