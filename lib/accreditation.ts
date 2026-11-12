// Acreditación: qué documentos le faltan o tiene vencidos una persona para un
// viaje, y por qué.
//
// Es una regla de lectura: no impide guardar nada. El manifiesto la usa para
// mostrar el motivo y para que quien lo arma decida, a la vista, si incluye a la
// persona igual. Un documento vale para un viaje si no vence antes de ese día;
// el día de vencimiento todavía vale.
//
// Este archivo no sabe de React ni de Supabase.

import { formatDate } from "./format.ts";

export type TipoDeDocumento = {
  id: string;
  name: string;
  active: boolean;
};

export type DocumentoDePersona = {
  /** Lo trae la base; los documentos de la demostración no lo tienen. */
  id?: string;
  person_id: string;
  type_id: string;
  /** null = el documento todavía no está registrado. */
  expires_on: string | null;
};

export type MotivoDeAcreditacion = {
  tipo: string;
  /** Sin fecha registrada. Si es false, `venceEl` trae la fecha que no alcanza. */
  falta: boolean;
  venceEl: string | null;
};

const comparar = (a: string, b: string) =>
  a.localeCompare(b, "es-CL", { sensitivity: "base" });

/**
 * Los documentos que no sirven para viajar la `fecha` indicada. Vacío = al día.
 * Solo cuentan los tipos activos: desactivar un tipo es dejar de exigirlo.
 */
export function motivosDeAcreditacion(
  personaId: string,
  fecha: string,
  tipos: TipoDeDocumento[],
  documentos: DocumentoDePersona[],
): MotivoDeAcreditacion[] {
  const vencimientos = new Map<string, string | null>();
  for (const documento of documentos) {
    if (documento.person_id === personaId) {
      vencimientos.set(documento.type_id, documento.expires_on);
    }
  }
  const motivos: MotivoDeAcreditacion[] = [];
  for (const tipo of tipos) {
    if (!tipo.active) continue;
    const vence = vencimientos.get(tipo.id) ?? null;
    if (vence === null) {
      motivos.push({ tipo: tipo.name, falta: true, venceEl: null });
    } else if (vence < fecha) {
      motivos.push({ tipo: tipo.name, falta: false, venceEl: vence });
    }
  }
  return motivos.sort((a, b) => comparar(a.tipo, b.tipo));
}

/** "Examen médico: sin registrar" / "Inducción: vence el 12 mar 2026". */
export const textoDeMotivo = (motivo: MotivoDeAcreditacion) =>
  motivo.falta || motivo.venceEl === null
    ? `${motivo.tipo}: sin registrar`
    : `${motivo.tipo}: vence el ${formatDate(motivo.venceEl)}`;

/** Todos los motivos en una línea, para una celda o una columna del CSV. */
export const resumenDeMotivos = (motivos: MotivoDeAcreditacion[]) =>
  motivos.map(textoDeMotivo).join("; ");

/**
 * Cuántos documentos se exigen hoy. Sin ninguno la acreditación no aplica y la
 * pantalla no debe hablar de ella.
 */
export const hayExigencias = (tipos: TipoDeDocumento[]) =>
  tipos.some((tipo) => tipo.active);

/**
 * El nombre tal como se guarda: sin espacios de más. Así el índice único de la
 * base (minúsculas y sin espacios en los bordes) ve el mismo nombre que la
 * pantalla.
 */
export const limpiarNombreDeTipo = (nombre: string) =>
  nombre.trim().replace(/\s+/g, " ");

/** ¿Ya existe un tipo con ese nombre, sin distinguir mayúsculas? */
export const tipoRepetido = (nombre: string, tipos: TipoDeDocumento[]) => {
  const buscado = limpiarNombreDeTipo(nombre).toLocaleLowerCase("es-CL");
  return tipos.some(
    (tipo) => limpiarNombreDeTipo(tipo.name).toLocaleLowerCase("es-CL") === buscado,
  );
};

export const MENSAJE_TIPO_REPETIDO = "Ese documento ya está en la lista.";

export const nombreDeTipoValido = (nombre: string) => {
  const largo = nombre.trim().length;
  return largo >= 2 && largo <= 80;
};
