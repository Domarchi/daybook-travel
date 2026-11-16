// Cuántos cambios hicieron otras personas desde tu última visita a Actividad.
//
// La barra lateral muestra la cifra; la pantalla de Actividad marca cuáles son
// nuevos. Las reglas (qué cuenta, cómo se guarda la visita) están en
// lib/novedades.ts.

import { useCallback, useEffect, useState } from "react";
import { ENTIDADES_DE_ACTIVIDAD } from "../../lib/actividad";
import { claveDeVisita, masReciente } from "../../lib/novedades";
import { db } from "../../lib/supabase";
import type { Datos } from "./use-datos";
import type { Navegacion } from "./use-navegacion";
import type { Sesion } from "./use-sesion";

type Entrada = Sesion & Datos & Navegacion;

export function useNovedades(e: Entrada) {
  const { demo, userId, accessStatus, view, trips, people } = e;

  const [novedades, setNovedades] = useState(0);
  // La visita contra la que se marcan las entradas mientras se mira Actividad.
  // Se congela al entrar: si no, lo nuevo dejaría de verse nuevo apenas cargara.
  const [visitaAnterior, setVisitaAnterior] = useState<string | null>(null);

  const leerVisita = useCallback(() => {
    if (!userId) return null;
    try {
      return localStorage.getItem(claveDeVisita(userId));
    } catch {
      return null;
    }
  }, [userId]);

  const guardarVisita = useCallback(
    (instante: string) => {
      if (!userId) return;
      try {
        const siguiente = masReciente(localStorage.getItem(claveDeVisita(userId)), instante);
        if (siguiente) localStorage.setItem(claveDeVisita(userId), siguiente);
      } catch {
        // Sin almacenamiento (navegación privada estricta) no hay novedades: no se rompe nada.
      }
    },
    [userId],
  );

  useEffect(() => {
    if (view !== "Actividad") return;
    setVisitaAnterior(leerVisita());
    setNovedades(0);
  }, [view, leerVisita]);

  // Se vuelve a contar al cambiar de pantalla y en cada recarga de datos (cada
  // minuto): es una consulta de una sola cifra, sin filas.
  useEffect(() => {
    if (demo || accessStatus !== "allowed" || !userId || view === "Actividad") return;
    let vigente = true;
    (async () => {
      const desde = leerVisita();
      if (!desde) {
        // Primera vez en este navegador: se parte del último cambio, sin avisos.
        const { data } = await db()
          .from("history")
          .select("created_at")
          .in("entity", [...ENTIDADES_DE_ACTIVIDAD])
          .order("created_at", { ascending: false })
          .limit(1);
        const ultimo = (data?.[0] as { created_at?: string } | undefined)?.created_at;
        if (ultimo) guardarVisita(ultimo);
        if (vigente) setNovedades(0);
        return;
      }
      const { count, error } = await db()
        .from("history")
        .select("id", { count: "exact", head: true })
        .in("entity", [...ENTIDADES_DE_ACTIVIDAD])
        .gt("created_at", desde)
        .or(`actor.is.null,actor.neq.${userId}`);
      if (!error && vigente) setNovedades(count ?? 0);
    })().catch(() => {
      // Si falla, la cifra queda como estaba: es un aviso, no un dato.
    });
    return () => {
      vigente = false;
    };
  }, [demo, accessStatus, userId, view, trips, people, leerVisita, guardarVisita]);

  return {
    novedades,
    visitaAnterior,
    /** Actividad lo llama con el cambio más reciente que mostró. */
    marcarActividadVista: guardarVisita,
  };
}

export type Novedades = ReturnType<typeof useNovedades>;
