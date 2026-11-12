// Los datos que vienen de la base (personas, viajes, documentos, ventana de compra),
// el acceso del usuario y la recarga: al entrar, cada minuto y a pedido.
//
// El texto de las funciones es el mismo que tenían dentro de `store.tsx`; solo
// cambió dónde viven. Lo que usan de los otros hooks lo reciben en `e`.

import { useEffect, useState } from "react";
import { DocumentoDePersona, TipoDeDocumento } from "../../lib/accreditation";
import { VENTANA_POR_OMISION } from "../../lib/purchase";
import { db } from "../../lib/supabase";
import { AccessStatus, Person, Trip } from "../../lib/types";
import type { Avisos } from "./use-avisos";
import type { Sesion } from "./use-sesion";

type Entrada = Avisos & Sesion;

export function useDatos(e: Entrada) {
  const {
    demo,
    email,
    setNotice,
  } = e;

  const [accessStatus, setAccessStatus] = useState<AccessStatus>("checking");
  const [isAdmin, setIsAdmin] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [documentTypes, setDocumentTypes] = useState<TipoDeDocumento[]>([]);
  const [documents, setDocuments] = useState<DocumentoDePersona[]>([]);

  const [loading, setLoading] = useState(false);

  // Dias de anticipacion con que se compran los pasajes. Es una politica de la
  // obra: vive en la base, no en el navegador. Mientras carga vale la de siempre.
  const [purchaseWindow, setPurchaseWindow] = useState(VENTANA_POR_OMISION);

  async function allRows(table: string) {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db()
        .from(table)
        .select("*")
        .order("id")
        .range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) return rows;
    }
  }

  async function reload() {
    setLoading(true);
    setAccessStatus((current) =>
      current === "allowed" ? current : "checking",
    );
    try {
      const { data: member, error } = await db().rpc("is_member");
      if (error) throw error;
      if (!member) {
        setAccessStatus("denied");
        setPeople([]);
        setTrips([]);
        setDocumentTypes([]);
        setDocuments([]);
        return;
      }
      // Todo lo que sigue es independiente entre sí, así que se pide junto.
      // Antes iba en cadena (personas y viajes, ajustes, tipos de documento,
      // documentos, rol): cada consulta tarda unos 200 ms, y en producción eran
      // más de un segundo solo esperando. Lo opcional sigue siendo opcional:
      // si los ajustes, la acreditación o el rol fallan, la aplicación carga igual.
      const acreditacion = (async () => {
        // Si las tablas todavía no existen (la migración 010 sin aplicar)
        // nada se exige y la aplicación sigue como antes.
        try {
          const [tipos, filas] = await Promise.all([
            db().from("document_types").select("id,name,active").order("name"),
            allRows("person_documents"),
          ]);
          if (tipos.error) throw tipos.error;
          return { tipos: (tipos.data ?? []) as TipoDeDocumento[], filas };
        } catch {
          return null;
        }
      })();
      const [peopleRows, tripRows, ajustes, documentos, admin] = await Promise.all([
        allRows("people"),
        allRows("trips"),
        // Si la tabla todavia no existe, se sigue con la ventana por omision en
        // vez de dejar la aplicacion sin cargar.
        db().from("settings").select("purchase_window_days").maybeSingle(),
        acreditacion,
        // El rol decide si aparece "Accesos". Si la función todavía no existe en
        // la base (la migración 009 sin aplicar) simplemente no se es administrador.
        db().rpc("is_admin"),
      ]);
      setPeople(
        (peopleRows as unknown as Person[]).sort((a, b) =>
          a.name.localeCompare(b.name, "es"),
        ),
      );
      setTrips(
        (tripRows as unknown as Trip[]).sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      );
      if (!ajustes.error && ajustes.data) {
        setPurchaseWindow(
          Number(ajustes.data.purchase_window_days) || VENTANA_POR_OMISION,
        );
      }
      setDocumentTypes(documentos?.tipos ?? []);
      setDocuments((documentos?.filas ?? []) as unknown as DocumentoDePersona[]);
      setIsAdmin(!admin.error && admin.data === true);
      setAccessStatus("allowed");
    } catch {
      setAccessStatus((current) => (current === "allowed" ? current : "error"));
      setNotice(
        "No pudimos cargar la información. Revisa la conexión e inténtalo nuevamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (email && !demo) void reload();
  }, [email, demo]);

  useEffect(() => {
    if (!email || demo) return;
    const timer = setInterval(() => void reload(), 60_000);
    return () => clearInterval(timer);
  }, [email, demo]);

  // Al cerrar sesión, o si se pierde el rol (se recalcula cada minuto junto con
  // los datos), "Accesos" deja de existir y no se puede quedar la pantalla abierta.
  useEffect(() => {
    if (!email || demo) setIsAdmin(false);
  }, [email, demo]);

  return {
    accessStatus,
    setAccessStatus,
    isAdmin,
    setIsAdmin,
    people,
    setPeople,
    trips,
    setTrips,
    documentTypes,
    setDocumentTypes,
    documents,
    setDocuments,
    loading,
    setLoading,
    purchaseWindow,
    setPurchaseWindow,
    allRows,
    reload,
  };
}

export type Datos = ReturnType<typeof useDatos>;
