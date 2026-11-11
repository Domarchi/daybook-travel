// La acreditación por documentos: qué viajes del manifiesto quedan pendientes y los
// tipos de documento que se exigen.
//
// El texto de las funciones es el mismo que tenían dentro de `store.tsx`; solo
// cambió dónde viven. Lo que usan de los otros hooks lo reciben en `e`.

import { useMemo, useState } from "react";
import {
  hayExigencias,
  limpiarNombreDeTipo,
  motivosDeAcreditacion,
  nombreDeTipoValido,
  tipoRepetido,
} from "../../lib/accreditation";
import { db } from "../../lib/supabase";
import type { Avisos } from "./use-avisos";
import type { Datos } from "./use-datos";
import type { Navegacion } from "./use-navegacion";
import type { Derivados } from "./use-derivados";

type Entrada = Avisos & Datos & Navegacion & Derivados;

export function useAcreditacion(e: Entrada) {
  const {
    documents,
    documentTypes,
    reload,
    requestableTrips,
    runAction,
    selectedTrips,
    setNotice,
  } = e;

  // Viajes del manifiesto que Katy o Tamara decidieron incluir aunque la persona
  // tenga documentos pendientes. Vale solo mientras el manifiesto está abierto.
  const [conAcreditacionAprobada, setConAcreditacionAprobada] = useState<string[]>([]);

  // Los viajes que van al manifiesto. Si Katy ya marcó algunos, el manifiesto es
  // de esos y de nadie más: lo que ve en la pantalla es lo que va en el correo.
  // Si no marcó ninguno, son todos los que están por solicitar.
  const manifestCandidates = useMemo(() => {
    const marcados = requestableTrips.filter((trip) =>
      selectedTrips.includes(trip.id),
    );
    return marcados.length ? marcados : requestableTrips;
  }, [requestableTrips, selectedTrips]);

  // Acreditación: de los viajes del manifiesto, los de personas con documentos
  // faltantes o vencidos para la fecha del viaje. Nunca se ocultan: salen del
  // manifiesto a la vista, con su motivo, salvo que alguien decida incluirlos.
  const exigeAcreditacion = hayExigencias(documentTypes);
  const manifestPendientesDeAcreditacion = useMemo(
    () =>
      manifestCandidates
        .map((trip) => ({
          trip,
          motivos: motivosDeAcreditacion(
            trip.person_id,
            trip.date,
            documentTypes,
            documents,
          ),
          incluido: conAcreditacionAprobada.includes(trip.id),
        }))
        .filter((fila) => fila.motivos.length > 0),
    [manifestCandidates, documentTypes, documents, conAcreditacionAprobada],
  );
  const manifestTrips = useMemo(() => {
    const fuera = new Set(
      manifestPendientesDeAcreditacion
        .filter((fila) => !fila.incluido)
        .map((fila) => fila.trip.id),
    );
    return manifestCandidates.filter((trip) => !fuera.has(trip.id));
  }, [manifestCandidates, manifestPendientesDeAcreditacion]);

  function motivosDeAcreditacionDe(personId: string, fecha: string) {
    return motivosDeAcreditacion(personId, fecha, documentTypes, documents);
  }

  function alternarAcreditacionAprobada(tripId: string) {
    setConAcreditacionAprobada((actual) =>
      actual.includes(tripId)
        ? actual.filter((id) => id !== tripId)
        : [...actual, tripId],
    );
  }

  // Las fechas de documentos del formulario de la persona que difieren de lo
  // guardado. Solo los cambios: reenviar lo mismo ensuciaría el historial.
  function fechasDeDocumentosCambiadas(form: FormData, personId: string) {
    return documentTypes.flatMap((tipo) => {
      const campo = form.get("doc_" + tipo.id);
      if (campo === null) return [];
      const nueva = String(campo) || null;
      const actual =
        documents.find(
          (documento) =>
            documento.person_id === personId && documento.type_id === tipo.id,
        )?.expires_on ?? null;
      return nueva === actual
        ? []
        : [{ person_id: personId, type_id: tipo.id, expires_on: nueva }];
    });
  }

  // Los tipos de documento que se exigen. Solo un administrador puede (lo
  // vuelve a comprobar la base). Nunca se borran: dejar de exigir es desactivar.
  async function addDocumentType(nombre: string): Promise<boolean> {
    const limpio = limpiarNombreDeTipo(nombre);
    if (!nombreDeTipoValido(limpio)) {
      setNotice("Escribe el nombre del documento (entre 2 y 80 letras).");
      return false;
    }
    if (tipoRepetido(limpio, documentTypes)) {
      setNotice("Ese documento ya está en la lista.");
      return false;
    }
    let guardado = false;
    await runAction(async () => {
      const resultado = await db().from("document_types").insert({ name: limpio });
      if (resultado.error) {
        throw new Error(
          resultado.error.code === "23505"
            ? "Ese documento ya está en la lista."
            : resultado.error.code === "42501"
              ? "Solo un administrador puede cambiar los documentos exigidos."
              : "No pudimos guardar el documento. Inténtalo nuevamente.",
        );
      }
      await reload();
      guardado = true;
      setNotice(`${limpio} ahora se exige para viajar.`);
    });
    return guardado;
  }

  async function setDocumentTypeActive(id: string, active: boolean) {
    const tipo = documentTypes.find((fila) => fila.id === id);
    if (!tipo) return;
    await runAction(async () => {
      const resultado = await db()
        .from("document_types")
        .update({ active })
        .eq("id", id)
        .select("id");
      if (resultado.error || !resultado.data?.length) {
        throw new Error(
          "No pudimos cambiar el documento. Solo un administrador puede hacerlo.",
        );
      }
      await reload();
      setNotice(
        active
          ? `${tipo.name} se vuelve a exigir.`
          : `${tipo.name} ya no se exige. Puedes volver a activarlo.`,
      );
    });
  }

  return {
    conAcreditacionAprobada,
    setConAcreditacionAprobada,
    manifestCandidates,
    exigeAcreditacion,
    manifestPendientesDeAcreditacion,
    manifestTrips,
    motivosDeAcreditacionDe,
    alternarAcreditacionAprobada,
    fechasDeDocumentosCambiadas,
    addDocumentType,
    setDocumentTypeActive,
  };
}

export type Acreditacion = ReturnType<typeof useAcreditacion>;
