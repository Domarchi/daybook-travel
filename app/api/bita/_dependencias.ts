// Lo que las rutas de Bita necesitan de afuera, conectado de verdad. La lógica
// está en lib/bita-handler.ts y se prueba sin esto.
//
// Dos clientes de Supabase, con papeles separados:
//   - el de la PERSONA: llave publicable + el token de su sesión. Todo lo que
//     Bita lee pasa por él, así que rigen las mismas políticas que en pantalla.
//   - el de SERVICIO: solo llama a las tres funciones del contador (migración
//     014). No lee personas, viajes ni nada más.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { crearCliente } from "@/lib/bita-agente";
import type { DependenciasBita } from "@/lib/bita-handler";
import type { DocumentoDePersona, TipoDeDocumento } from "@/lib/accreditation";
import { localDate } from "@/lib/format";
import { VENTANA_POR_OMISION } from "@/lib/purchase";
import type { HistoryItem, Person, Trip } from "@/lib/types";

const SIN_SESION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

function deLaPersona(token: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !llave) throw new Error("Falta la URL o la llave publicable de Supabase.");
  return createClient(url, llave, { auth: SIN_SESION, global: { headers: { Authorization: `Bearer ${token}` } } });
}

function deServicio(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !llave) throw new Error("Falta la llave de servicio de Supabase.");
  return createClient(url, llave, { auth: SIN_SESION });
}

async function todas<T>(cliente: SupabaseClient, tabla: string, columnas: string): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await cliente.from(tabla).select(columnas).order("id").range(desde, desde + 999);
    if (error) throw error;
    filas.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return filas;
  }
}

export function dependenciasReales(): DependenciasBita {
  return {
    async verificarSesion(token) {
      const { data, error } = await deLaPersona(token).auth.getUser(token);
      return error || !data.user ? null : { userId: data.user.id };
    },
    async esMiembro(token) {
      const { data, error } = await deLaPersona(token).rpc("is_member");
      return !error && data === true;
    },
    async cargarDatos(token) {
      const db = deLaPersona(token);
      const [personas, viajes, ajustes, acreditacion] = await Promise.all([
        todas<Person>(db, "people", "id,name,origin,destination,shift,start_date,end_date,up_weekday,down_weekday,baggage,active"),
        // pnr se lee solo para saber si el viaje tiene reserva; nunca sale hacia el modelo.
        todas<Trip>(db, "trips", "id,person_id,date,direction,origin,destination,requested_time,baggage,status,pnr,amount,notes"),
        db.from("settings").select("purchase_window_days").maybeSingle(),
        // Sin la migración 010 no hay acreditación: Bita sigue sin ella.
        Promise.all([
          db.from("document_types").select("id,name,active").order("name"),
          todas<DocumentoDePersona>(db, "person_documents", "id,person_id,type_id,expires_on"),
        ]).catch(() => null),
      ]);
      const tipos = acreditacion && !acreditacion[0].error ? ((acreditacion[0].data ?? []) as TipoDeDocumento[]) : [];
      return {
        personas,
        viajes,
        ventana: Number(ajustes.data?.purchase_window_days) || VENTANA_POR_OMISION,
        tipos,
        documentos: acreditacion ? acreditacion[1] : [],
      };
    },
    async leerHistorial(token, tripId) {
      const { data, error } = await deLaPersona(token)
        .from("history")
        .select("id,entity,record_id,action,created_at,before_data,after_data")
        .eq("entity", "trips")
        .eq("record_id", tripId)
        .order("created_at")
        .limit(50);
      if (error) throw error;
      return (data ?? []) as HistoryItem[];
    },
    cupo: {
      async reservar(userId, limite) {
        const { data, error } = await deServicio().rpc("bita_reserve_message", { p_user: userId, p_limit: limite });
        if (error) throw error;
        const fila = Array.isArray(data) ? data[0] : data;
        return { permitido: fila?.allowed === true, usados: Number(fila?.used ?? limite) };
      },
      async devolver(userId) {
        const { error } = await deServicio().rpc("bita_refund_message", { p_user: userId });
        if (error) throw error;
      },
      async usados(userId) {
        const { data, error } = await deServicio().rpc("bita_messages_today", { p_user: userId });
        if (error) throw error;
        return Number(data ?? 0);
      },
    },
    cliente: () => crearCliente(process.env.ANTHROPIC_API_KEY),
    hoy: localDate,
  };
}
