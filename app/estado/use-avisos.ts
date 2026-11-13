// Los mensajes (aviso global y error de formulario), el indicador de «ocupado» y
// `runAction`, que envuelve toda operación que escribe.
//
// El texto de las funciones es el mismo que tenían dentro de `store.tsx`; solo
// cambió dónde viven. Lo que usan de los otros hooks lo reciben en `e`.

import { useCallback, useEffect, useRef, useState } from "react";
import { avisoDeError, duracionDelAviso, type Aviso } from "@/lib/avisos";

export function useAvisos() {
  // El aviso lleva su tono (lib/avisos.ts) y un número: dos avisos iguales
  // seguidos son dos avisos, y el segundo vuelve a anunciarse y a contar sus 4 s.
  const [notice, setNoticeState] = useState<(Aviso & { id: number }) | null>(null);
  const numeroDeAviso = useRef(0);
  const setNotice = useCallback((aviso: Aviso | null) => {
    setNoticeState(aviso ? { ...aviso, id: ++numeroDeAviso.current } : null);
  }, []);
  // Fase 5: el éxito se va solo; el error se queda hasta cerrarlo o hasta el
  // aviso siguiente.
  useEffect(() => {
    if (!notice) return;
    const ms = duracionDelAviso(notice);
    if (ms === null) return;
    const t = setTimeout(() => setNoticeState(null), ms);
    return () => clearTimeout(t);
  }, [notice]);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const busyRef = useRef(false);

  function clearMessages() {
    setNotice(null);
    setFormError("");
  }

  async function runAction(
    operation: () => Promise<void>,
    destination: "form" | "global" = "global",
  ) {
    setBusy(true);
    busyRef.current = true;
    setFormError("");
    if (destination === "global") setNotice(null);
    try {
      await operation();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : ((error as { message?: string })?.message ??
            "No se pudo completar la acción. Inténtalo nuevamente.");
      if (destination === "form") {
        setFormError(message);
        setTimeout(
          () => document.querySelector<HTMLElement>(".dialog-error")?.focus(),
          0,
        );
      } else setNotice(avisoDeError(message));
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  return {
    notice,
    setNotice,
    formError,
    setFormError,
    busy,
    setBusy,
    busyRef,
    clearMessages,
    runAction,
  };
}

export type Avisos = ReturnType<typeof useAvisos>;
