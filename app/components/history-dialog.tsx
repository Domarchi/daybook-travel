"use client";

import EmptyState from "@/components/ui/empty-state";
import { ArrowDownLeft, Clock } from "lucide-react";
import { formatDateTime } from "../../lib/format";
import { useApp } from "../store";

export default function HistoryDialog() {
  const {
    closeModal,
    demo,
    editTrip,
    history,
    historyLoading,
    loading,
    openTrip,
    view,
  } = useApp();

  return (
    <div className="history-view">
      <div className="dialog-body">
        {editTrip && (
          <button
            type="button"
            className="context-link"
            onClick={() => openTrip(editTrip)}
          >
            <ArrowDownLeft size={16} /> Volver al viaje
          </button>
        )}
        {historyLoading ? (
          <div className="history-loading" aria-live="polite">
            <span className="loading-mark" aria-hidden="true" />
            <p>Cargando cambios…</p>
          </div>
        ) : demo ? (
          <EmptyState
            icon={<Clock />}
            title="Historial disponible en la operación"
            description="La demostración no guarda cambios permanentes."
          />
        ) : history.length ? (
          <div className="history-list">
            {history.map((item) => (
              <article className="history-item" key={item.id}>
                <span className="history-dot" aria-hidden="true" />
                <div>
                  <strong>
                    {item.action === "INSERT"
                      ? "Viaje creado"
                      : "Viaje actualizado"}
                  </strong>
                  <small>
                    {formatDateTime(item.created_at)} · Usuario{" "}
                    {item.actor?.slice(0, 8)}
                  </small>
                  <p>
                    {String(
                      item.after_data?.notes || "Sin observaciones",
                    )}{" "}
                    · {String(item.after_data?.status || "")}
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
          />
        )}
      </div>
      <div className="dialog-actions">
        <button type="button" onClick={closeModal}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
