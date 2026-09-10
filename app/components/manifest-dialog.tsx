"use client";

// El manifiesto para la agencia: texto agrupado por día y ruta, con un botón
// para copiarlo. Copiar no cambia nada en la base; marcar como solicitados sí,
// y por eso es un paso aparte que Katy da cuando ya mandó el correo.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { localDate } from "../../lib/format";
import { agruparManifiesto, textoDeManifiesto } from "../../lib/manifest";
import { useApp } from "../store";

export default function ManifestDialog() {
  const {
    busy,
    closeModal,
    exportCsv,
    manifestTrips,
    markSelectedRequested,
    personName,
    requestableTrips,
  } = useApp();

  const bloques = useMemo(
    () => agruparManifiesto(manifestTrips, personName),
    [manifestTrips, personName],
  );
  const texto = useMemo(() => textoDeManifiesto(bloques, localDate()), [bloques]);
  const pasajes = manifestTrips.length;
  // Cuando Katy marcó solo algunos, se lo decimos: el correo lleva menos de lo
  // que hay pendiente, y eso tiene que estar a la vista, no adivinarse.
  const esParcial = pasajes < requestableTrips.length;

  const [copiado, setCopiado] = useState(false);
  const [fallo, setFallo] = useState(false);
  const textoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!copiado) return;
    const timer = setTimeout(() => setCopiado(false), 1500);
    return () => clearTimeout(timer);
  }, [copiado]);

  async function copiar() {
    setFallo(false);
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      return;
    } catch {
      // Sin permiso de portapapeles: se intenta el método antiguo y, si
      // tampoco, se deja el texto seleccionado para Cmd+C.
    }
    textoRef.current?.focus();
    textoRef.current?.select();
    let copiadoALaAntigua = false;
    try {
      copiadoALaAntigua = document.execCommand("copy");
    } catch {}
    if (copiadoALaAntigua) setCopiado(true);
    else setFallo(true);
  }

  return (
    <div className="manifest-view">
      <div className="dialog-body">
        <div className="manifest-summary">
          <span>
            <strong>{pasajes}</strong> {pasajes === 1 ? "pasaje" : "pasajes"} en{" "}
            <strong>{bloques.length}</strong> {bloques.length === 1 ? "vuelo" : "vuelos"}
            {esParcial && (
              <em className="manifest-parcial">
                {" "}
                · de {requestableTrips.length} pendientes
              </em>
            )}
          </span>
          <button
            type="button"
            className={copiado ? "copy-button copied" : "copy-button"}
            onClick={() => void copiar()}
            aria-live="polite"
          >
            {copiado ? <Check size={16} /> : <Copy size={16} />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>
        {fallo && (
          <p className="message error-message" role="alert">
            No se pudo copiar solo. El texto quedó seleccionado: cópialo con ⌘C
            (o Ctrl+C).
          </p>
        )}
        <textarea
          ref={textoRef}
          className="manifest-text"
          aria-label="Manifiesto para la agencia"
          readOnly
          value={texto}
          rows={Math.min(24, texto.split("\n").length + 1)}
        />
        <p className="manifest-hint">
          Pega este texto en el correo a la agencia. Cuando lo envíes, marca
          los viajes como solicitados para que la agenda lo refleje.
        </p>
      </div>
      <div className="dialog-actions">
        <button type="button" onClick={exportCsv} disabled={busy}>
          <Download size={16} /> Descargar CSV
        </button>
        <button type="button" onClick={closeModal} disabled={busy}>
          Cerrar
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || pasajes === 0}
          onClick={() => void markSelectedRequested().then(closeModal)}
        >
          {busy
            ? "Actualizando…"
            : `Marcar ${pasajes} como ${pasajes === 1 ? "solicitado" : "solicitados"}`}
        </button>
      </div>
    </div>
  );
}
