"use client";

// Copiar un texto al portapapeles, con los tres intentos que necesita el
// manifiesto y la lista del campamento: portapapeles moderno, método antiguo
// y, si ninguno anda, dejar el texto seleccionado para que la persona copie.
// El navegador integrado bloquea el primero; en Chrome sobre HTTPS anda.

import { useEffect, useRef, useState } from "react";

export function useCopiar(texto: string) {
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

  return { copiado, fallo, copiar, textoRef };
}
