"use client";

import { RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingMark } from "@/components/ui/dialog-parts";
import { StatePanel, StateText, StateTitle } from "@/components/ui/state-panel";
import { useApp } from "../app/store";

export default function AccessState() {
  const { accessStatus, reload } = useApp();

  return (
    <StatePanel as="section" aria-live="polite">
      {accessStatus === "checking" ? (
        <>
          <LoadingMark />
          <StateTitle as="h1">Comprobando tu acceso…</StateTitle>
          <StateText>Estamos conectando con la agenda del proyecto.</StateText>
        </>
      ) : accessStatus === "error" ? (
        <>
          <RefreshCw size={25} />
          <StateTitle as="h1">No pudimos comprobar tu acceso</StateTitle>
          <StateText>Revisa la conexión y vuelve a intentarlo.</StateText>
          <Button type="button" variant="primary" onClick={reload}>
            Intentar nuevamente
          </Button>
        </>
      ) : (
        <>
          <Users size={25} />
          <StateTitle as="h1">Tu cuenta todavía no está habilitada</StateTitle>
          <StateText>
            Solicita al responsable de Daybook Travel que agregue tu correo al
            equipo.
          </StateText>
          <Button type="button" onClick={reload}>
            Volver a comprobar
          </Button>
        </>
      )}
    </StatePanel>
  );
}
