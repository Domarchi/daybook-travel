// Lo que la pantalla de Accesos necesita saber sin tocar la base: cómo se
// normaliza un correo, qué roles hay y qué mensajes del servidor se pueden
// mostrar tal cual.
//
// La verdad vive en `supabase/009_accesos.sql`; esto es solo la cara visible.

export type RolDeAcceso = "admin" | "member";

export type Miembro = {
  email: string;
  role: RolDeAcceso;
  active: boolean;
  created_at: string;
};

export const ETIQUETA_DE_ROL: Record<RolDeAcceso, string> = {
  admin: "Administrador",
  member: "Miembro",
};

export const normalizarCorreo = (valor: string) => valor.trim().toLowerCase();

/** Lo mismo que exige la base, para avisar antes de enviar. */
export function correoValido(valor: string): boolean {
  const correo = normalizarCorreo(valor);
  return correo.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

/**
 * Los mensajes que la base levanta a propósito (`raise exception` en 009).
 * Son los únicos que se muestran tal cual; cualquier otro error del servidor
 * puede traer detalles internos y se reemplaza por uno genérico.
 */
export const MENSAJES_DE_ACCESOS = [
  "Acceso no autorizado",
  "El rol debe ser admin o member",
  "Escribe un correo válido",
  "Ese correo ya tiene acceso",
  "Indica si el acceso queda activo o no",
  "No puedes quitarte tu propio acceso",
  "No puedes quitarte tu propio rol de administrador",
  "Ese correo no está en la lista",
  "Debe quedar al menos un administrador",
] as const;

export const MENSAJE_GENERICO =
  "No pudimos completar el cambio. Revisa la conexión e inténtalo nuevamente.";

export function mensajeDeError(error: { message?: string } | null | undefined): string {
  const mensaje = error?.message ?? "";
  return (MENSAJES_DE_ACCESOS as readonly string[]).includes(mensaje)
    ? mensaje
    : MENSAJE_GENERICO;
}

export function resumenDeAccesos(miembros: Miembro[]) {
  const activos = miembros.filter((miembro) => miembro.active);
  return {
    activos: activos.length,
    administradores: activos.filter((miembro) => miembro.role === "admin").length,
    desactivados: miembros.length - activos.length,
  };
}
