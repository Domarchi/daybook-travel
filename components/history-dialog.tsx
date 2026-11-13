"use client";

import EmptyState from "@/components/ui/empty-state";
import { EsqueletoDeLista } from "@/components/ui/esqueleto";
import { Button } from "@/components/ui/button";
import { DialogBody } from "@/components/ui/dialog-parts";
import { ArrowDownLeft, ArrowRight, Clock } from "lucide-react";
import { formatDateTime } from "../lib/format";
import { cambiosDe, notaDelCambio, type Entidad } from "../lib/historial";
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

// El historial de un viaje o de una persona: el mismo diálogo, con lo que
// cambió en cada entrada (lib/historial.ts) en vez de solo "actualizado".
export default function HistoryDialog() {
  const {
    closeModal,
    demo,
    documentTypes,
    editPerson,
    editTrip,
    history,
    historyLoading,
    openPerson,
    openTrip,
  } = useApp();

  const entidad: Entidad = editTrip ? "trips" : "people";
  const deLaFicha = editTrip ? "del viaje" : "de la persona";
  const creado = editTrip ? "Viaje creado" : "Persona creada";
  const actualizado = editTrip ? "Viaje actualizado" : "Persona actualizada";

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
        {!editTrip && editPerson && (
          <Button
            type="button"
            className="mb-[18px] w-fit border-transparent bg-transparent"
            onClick={() => openPerson(editPerson)}
          >
            <ArrowDownLeft size={16} /> Volver a la persona
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
            {history.map((item) => {
              const esAlta = item.action === "INSERT";
              // En el historial de una persona también vienen sus documentos.
              const esDocumento = item.entity === "person_documents";
              const tipo = esDocumento
                ? documentTypes.find((t) => t.id === item.after_data?.type_id)?.name ?? "Documento"
                : "";
              const cambios = esAlta
                ? esDocumento
                  ? cambiosDe("person_documents", { expires_on: null }, item.after_data)
                  : []
                : cambiosDe(esDocumento ? "person_documents" : entidad, item.before_data, item.after_data);
              const nota = esDocumento ? "" : notaDelCambio(esAlta ? null : item.before_data, item.after_data);
              const estadoInicial = esAlta && editTrip ? String(item.after_data?.status ?? "") : "";
              return (
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
                      {esDocumento
                        ? `${tipo}: ${esAlta ? "registrado" : "actualizado"}`
                        : esAlta
                          ? creado
                          : actualizado}
                    </strong>
                    <small className="text-muted">
                      {formatDateTime(item.created_at)} · {autorDe(item)}
                    </small>
                    {cambios.length > 0 && (
                      <ul className="mt-1 grid gap-[3px] text-caption text-foreground-soft">
                        {cambios.map((cambio) => (
                          <li key={cambio.campo} className="flex flex-wrap items-center gap-x-[6px]">
                            <span className="font-[650] text-foreground">{cambio.campo}:</span>
                            <span className={cambio.antes === "—" ? "text-muted" : "line-through decoration-muted"}>
                              {cambio.antes}
                            </span>
                            <ArrowRight size={12} aria-label="cambió a" className="text-muted" />
                            <span>{cambio.despues}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(nota || estadoInicial) && (
                      <p className="mt-1 rounded-sm bg-surface-soft px-3 py-[10px] text-caption whitespace-pre-wrap text-foreground-soft">
                        {[nota, estadoInicial].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {!esAlta && !cambios.length && !nota && (
                      <small className="text-muted">
                        Sin cambios en los datos que muestra la ficha {deLaFicha}.
                      </small>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Clock />}
            title="Sin cambios anteriores"
            description={
              editTrip
                ? "Este viaje todavía no tiene cambios registrados."
                : "Esta persona todavía no tiene cambios registrados."
            }
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
