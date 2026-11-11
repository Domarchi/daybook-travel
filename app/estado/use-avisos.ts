// Los mensajes (aviso global y error de formulario), el indicador de «ocupado» y
// `runAction`, que envuelve toda operación que escribe.
//
// El texto de las funciones es el mismo que tenían dentro de `store.tsx`; solo
// cambió dónde viven. Lo que usan de los otros hooks lo reciben en `e`.

import { useRef, useState } from "react";

export function useAvisos() {
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const busyRef = useRef(false);

  function clearMessages() {
    setNotice("");
    setFormError("");
  }

  async function runAction(
    operation: () => Promise<void>,
    destination: "form" | "global" = "global",
  ) {
    setBusy(true);
    busyRef.current = true;
    setFormError("");
    if (destination === "global") setNotice("");
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
      } else setNotice(message);
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
