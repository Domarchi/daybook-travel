// Quién tiene la sesión abierta y si se está en modo demostración.
//
// El texto de las funciones es el mismo que tenían dentro de `store.tsx`; solo
// cambió dónde viven. Lo que usan de los otros hooks lo reciben en `e`.

import { useEffect, useState } from "react";
import { db } from "../../lib/supabase";
import type { Avisos } from "./use-avisos";
import { avisoDeError } from "@/lib/avisos";

type Entrada = Avisos;

export function useSesion(e: Entrada) {
  const {
    setNotice,
  } = e;

  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let sesion;
    try {
      sesion = db().auth;
    } catch (error) {
      // Sin variables de entorno no hay a quién preguntarle por la sesión. Se
      // muestra la pantalla de entrada con el motivo, en vez de una página en
      // blanco, y la demostración sigue funcionando sin credenciales.
      setNotice(
        avisoDeError(
          error instanceof Error
            ? error.message
            : "Falta configurar el acceso a la base de datos.",
        ),
      );
      setReady(true);
      return;
    }
    sesion.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });
    const { data } = sesion.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return {
    ready,
    setReady,
    email,
    setEmail,
    demo,
    setDemo,
  };
}

export type Sesion = ReturnType<typeof useSesion>;
