// Abrir y guardar una persona, con sus documentos.
//
// El texto de las funciones es el mismo que tenían dentro de `store.tsx`; solo
// cambió dónde viven. Lo que usan de los otros hooks lo reciben en `e`.

import { FormEvent } from "react";
import { db } from "../../lib/supabase";
import { Person } from "../../lib/types";
import type { Avisos } from "./use-avisos";
import type { Sesion } from "./use-sesion";
import type { Datos } from "./use-datos";
import type { Dialogos } from "./use-dialogos";
import type { Acreditacion } from "./use-acreditacion";
import type { AccionesViajes } from "./use-acciones-viajes";

type Entrada = Avisos & Sesion & Datos & Dialogos & Acreditacion & AccionesViajes;

export function useAccionesPersonas(e: Entrada) {
  const {
    abrirModal,
    clearMessages,
    closeModal,
    demo,
    editPerson,
    fechasDeDocumentosCambiadas,
    openTrip,
    pendingTripDate,
    reload,
    runAction,
    setDocuments,
    setEditPerson,
    setNotice,
    setPendingTripDate,
    setPeople,
  } = e;

  function openPerson(person: Person | null = null) {
    clearMessages();
    setPendingTripDate(null);
    setEditPerson(person);
    abrirModal("person");
  }

  async function savePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(async () => {
      const person = {
        name: String(form.get("name")).trim(),
        origin: String(form.get("origin")).trim(),
        destination: String(form.get("destination")).trim(),
        shift: String(form.get("shift")),
        start_date: String(form.get("start_date")),
        end_date: String(form.get("end_date")) || null,
        // Solo el 4×3 usa días de la semana. El resto conserva valores válidos
        // para la base y el motor los ignora.
        up_weekday: Number(form.get("up_weekday") ?? 1) || 1,
        down_weekday: Number(form.get("down_weekday") ?? 4) || 4,
        baggage: String(form.get("baggage")),
        active: form.get("active") === "on",
      };
      if (person.end_date && person.end_date < person.start_date) {
        throw new Error("La fecha de término debe ser posterior al inicio.");
      }
      if (person.shift === "4×3" && person.up_weekday === person.down_weekday) {
        throw new Error("La subida y la bajada no pueden ser el mismo día.");
      }
      let savedId = editPerson?.id ?? "";
      let avisoDeDocumentos = "";
      if (demo) {
        savedId ||= crypto.randomUUID();
        setPeople((current) =>
          editPerson
            ? current.map((row) =>
                row.id === editPerson.id ? { ...person, id: row.id } : row,
              )
            : [...current, { ...person, id: savedId }].sort((a, b) =>
                a.name.localeCompare(b.name, "es"),
              ),
        );
        const cambios = fechasDeDocumentosCambiadas(form, savedId);
        if (cambios.length) {
          setDocuments((current) => [
            ...current.filter(
              (documento) =>
                !cambios.some(
                  (cambio) =>
                    cambio.person_id === documento.person_id &&
                    cambio.type_id === documento.type_id,
                ),
            ),
            ...cambios,
          ]);
        }
      } else {
        const result = editPerson
          ? await db().from("people").update(person).eq("id", editPerson.id)
          : await db().from("people").insert(person).select("id").single();
        if (result.error) throw result.error;
        if (!editPerson) savedId = String(result.data?.id ?? "");
        // Los documentos van aparte de la persona. Si fallan, la persona ya
        // quedó guardada: se avisa, no se deja el diálogo abierto, porque
        // guardar de nuevo crearía una persona repetida.
        const cambios = fechasDeDocumentosCambiadas(form, savedId);
        if (cambios.length) {
          const documentos = await db()
            .from("person_documents")
            .upsert(cambios, { onConflict: "person_id,type_id" });
          if (documentos.error) {
            avisoDeDocumentos =
              "La persona se guardó, pero no pudimos guardar sus documentos. Ábrela de nuevo e inténtalo otra vez.";
          }
        }
        await reload();
      }
      const resumeDate = pendingTripDate;
      closeModal();
      setPendingTripDate(null);
      if (!editPerson && resumeDate && savedId) {
        openTrip(null, resumeDate, savedId);
      } else {
        setNotice(
          avisoDeDocumentos ||
            "Persona guardada. Sus viajes existentes conservaron sus fechas.",
        );
      }
    }, "form");
  }

  return {
    openPerson,
    savePerson,
  };
}

export type AccionesPersonas = ReturnType<typeof useAccionesPersonas>;
