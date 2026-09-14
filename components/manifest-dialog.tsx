"use client";

// El manifiesto para la agencia: texto agrupado por día y ruta, con un botón
// para copiarlo. Copiar no cambia nada en la base; marcar como solicitados sí,
// y por eso es un paso aparte que Katy da cuando ya mandó el correo.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogBody } from "@/components/ui/dialog-parts";
import { localDate } from "../lib/format";
import { agruparManifiesto, textoDeManifiesto } from "../lib/manifest";
import { useApp } from "../app/store";
import { cargarLogo } from "@/lib/brand";
import BrandLogo from "@/components/ui/brand-logo";

export default function ManifestDialog() {
  const {
    busy,
    demo,
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
  const texto = useMemo(
    () => textoDeManifiesto(bloques, localDate()),
    [bloques],
  );
  const pasajes = manifestTrips.length;
  // Cuando Katy marcó solo algunos, se lo decimos: el correo lleva menos de lo
  // que hay pendiente, y eso tiene que estar a la vista, no adivinarse.
  const esParcial = pasajes < requestableTrips.length;

  const [copiado, setCopiado] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
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

  async function descargarPdf() {
    setPdfBusy(true);
    setPdfError("");
    try {
      const [{ crearManifiestoPdf }, logo] = await Promise.all([
        import("@/lib/manifest-pdf"),
        cargarLogo(),
      ]);
      const date = localDate();
      const pdf = await crearManifiestoPdf(bloques, date, logo, demo);
      pdf.save(`FCC-TRAVEL-solicitud-${date}.pdf`);
    } catch {
      setPdfError("No pudimos crear el PDF. Inténtalo nuevamente.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* El cuerpo se reparte: el texto crece o se encoge, y la frase de abajo
          queda siempre visible. Antes el textarea imponía su alto y cortaba esa
          frase por la mitad. */}
      <DialogBody className="flex flex-col">
        <div className="mb-4 flex shrink-0 items-center gap-3">
          <BrandLogo />
          <span className="text-[12px] font-semibold text-muted">Solicitud de pasajes</span>
        </div>
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 text-[13px] text-foreground-soft">
          <span>
            <strong className="text-foreground">{pasajes}</strong>{" "}
            {pasajes === 1 ? "pasaje" : "pasajes"} en{" "}
            <strong className="text-foreground">{bloques.length}</strong>{" "}
            {bloques.length === 1 ? "vuelo" : "vuelos"}
            {esParcial && (
              <em className="font-semibold text-[var(--warning)] not-italic">
                {" "}
                · de {requestableTrips.length} pendientes
              </em>
            )}
          </span>
          {/* "Copiado" mantiene el mismo ancho que "Copiar" para que nada salte. */}
          <Button
            type="button"
            className={
              "min-w-[112px]" +
              (copiado
                ? " border-[color-mix(in_srgb,var(--success)_45%,var(--border))] bg-[color-mix(in_srgb,var(--success)_12%,var(--surface-raised))] text-success"
                : "")
            }
            onClick={() => void copiar()}
            aria-live="polite"
          >
            {copiado ? <Check size={16} /> : <Copy size={16} />}
            {copiado ? "Copiado" : "Copiar"}
          </Button>
        </div>
        {fallo && (
          <p
            className="mb-3 shrink-0 rounded-md border border-[color-mix(in_srgb,var(--danger)_45%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-[10px] text-[13px] text-danger"
            role="alert"
          >
            No se pudo copiar solo. El texto quedó seleccionado: cópialo con ⌘C
            (o Ctrl+C).
          </p>
        )}
        {pdfError && <p role="alert" className="mb-3 shrink-0 text-[13px] text-danger">{pdfError}</p>}
        <textarea
          ref={textoRef}
          className="min-h-40 w-full min-w-0 flex-auto resize-none overflow-auto rounded-sm border border-line-strong bg-surface transition-[border-color,box-shadow,background-color] duration-[140ms] ease-[var(--ease-out)] px-4 py-[14px] font-mono text-[13px] leading-[1.55] tab-2 whitespace-pre text-foreground focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--focus)]"
          aria-label="Manifiesto para la agencia"
          readOnly
          value={texto}
          rows={Math.min(24, texto.split("\n").length + 1)}
        />
        <p className="mt-3 shrink-0 text-[12px] text-muted">
          Pega este texto en el correo a la agencia. Cuando lo envíes, marca los
          viajes como solicitados para que la agenda lo refleje.
        </p>
      </DialogBody>
      <div className="flex min-h-[72px] shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-6 py-3 max-[760px]:px-4">
        <Button type="button" onClick={() => void descargarPdf()} disabled={busy || pdfBusy || pasajes === 0}>
          <FileText size={16} /> {pdfBusy ? "Creando PDF…" : "Descargar PDF"}
        </Button>
        <Button type="button" onClick={exportCsv} disabled={busy}>
          <Download size={16} /> Descargar CSV
        </Button>
        <Button type="button" onClick={closeModal} disabled={busy}>
          Cerrar
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={busy || pasajes === 0}
          onClick={() => void markSelectedRequested().then(closeModal)}
        >
          {busy
            ? "Actualizando…"
            : `Marcar ${pasajes} como ${pasajes === 1 ? "solicitado" : "solicitados"}`}
        </Button>
      </div>
    </div>
  );
}
