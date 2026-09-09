"use client";

import { RefreshCw, Users } from "lucide-react";
import { useApp } from "../store";

export default function AccessState() {
  const {
    accessStatus,
    reload,
  } = useApp();

  return (
    <section className="access-state" aria-live="polite">
      {accessStatus === "checking" ? (
        <>
          <span className="loading-mark" aria-hidden="true" />
          <h1>Comprobando tu acceso…</h1>
          <p>Estamos conectando con la agenda del proyecto.</p>
        </>
      ) : accessStatus === "error" ? (
        <>
          <RefreshCw size={25} />
          <h1>No pudimos comprobar tu acceso</h1>
          <p>Revisa la conexión y vuelve a intentarlo.</p>
          <button type="button" className="primary" onClick={reload}>
            Intentar nuevamente
          </button>
        </>
      ) : (
        <>
          <Users size={25} />
          <h1>Tu cuenta todavía no está habilitada</h1>
          <p>
            Solicita al responsable de FCC TRAVEL que agregue tu correo
            al equipo.
          </p>
          <button type="button" onClick={reload}>
            Volver a comprobar
          </button>
        </>
      )}
    </section>
  );
}
