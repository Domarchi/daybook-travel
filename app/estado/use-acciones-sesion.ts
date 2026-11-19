// Entrar con correo y contraseña, o a la demostración.
//
// El texto de las funciones es el mismo que tenían dentro de `store.tsx`; solo
// cambió dónde viven. Lo que usan de los otros hooks lo reciben en `e`.

import { FormEvent } from "react";
import {
  makeDemoDocuments,
  makeDemoDocumentTypes,
  makeDemoPeople,
  makeDemoTrips,
} from "../../lib/demo";
import { localDate } from "../../lib/format";
import { db } from "../../lib/supabase";
import type { Avisos } from "./use-avisos";
import type { Sesion } from "./use-sesion";
import type { Datos } from "./use-datos";
import type { Navegacion } from "./use-navegacion";

type Entrada = Avisos & Sesion & Datos & Navegacion;

export function useAccionesSesion(e: Entrada) {
  const {
    clearMessages,
    clearTripFilters,
    demo,
    runAction,
    setAccessStatus,
    setCalendarMonth,
    setCalendarShift,
    setCostCategory,
    setCostMonth,
    setCostStatus,
    setDemo,
    setDocuments,
    setDocumentTypes,
    setMenuAbierto,
    setPeople,
    setPeopleFilter,
    setPeopleQuery,
    setSelectedDay,
    setTrips,
    setView,
  } = e;

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(async () => {
      const { error } = await db().auth.signInWithPassword({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (error) {
        throw new Error(
          "No pudimos iniciar sesión. Comprueba tu correo y contraseña.",
        );
      }
    });
  }

  function enterDemo() {
    const demoPeople = makeDemoPeople();
    setView("Agenda");
    setDemo(true);
    setAccessStatus("allowed");
    setPeople(demoPeople);
    setTrips(makeDemoTrips(demoPeople));
    const tiposDeDemo = makeDemoDocumentTypes();
    setDocumentTypes(tiposDeDemo);
    setDocuments(makeDemoDocuments(demoPeople, tiposDeDemo));
    setCalendarMonth(localDate().slice(0, 7));
    setSelectedDay(null);
    setCalendarShift("Todos");
    setPeopleQuery("");
    setPeopleFilter("Activas");
    clearTripFilters();
    setCostMonth("");
    setCostStatus("Todos");
    setCostCategory("");
    clearMessages();
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }

  // Salir: desde Configuración, después de confirmar. En la demostración no hay
  // sesión que cerrar; se descartan los datos ficticios. Se vuelve a la Agenda
  // para que la próxima entrada no parta en Configuración.
  async function salir() {
    setMenuAbierto(false);
    if (!demo) await db().auth.signOut();
    setDemo(false);
    setAccessStatus("checking");
    setPeople([]);
    setTrips([]);
    setView("Agenda");
  }

  return {
    login,
    enterDemo,
    salir,
  };
}

export type AccionesSesion = ReturnType<typeof useAccionesSesion>;
