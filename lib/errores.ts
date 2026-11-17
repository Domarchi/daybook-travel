// Qué decir cuando una acción que escribe no resulta.
//
// `runAction` mostraba el `message` del error tal cual llegaba. Sin señal en
// faena eso era «TypeError: Failed to fetch», y un rechazo de Postgres llegaba
// en inglés («duplicate key value violates unique constraint…»): quien lo leía
// no sabía si se había guardado ni qué hacer. Como en Parte Diario
// (`errores-de-carga.ts`), la conexión se dice primero y se dice qué pasa con lo
// escrito.
//
// Lo que sí pasa tal cual: los mensajes de la pantalla (`throw new Error("…")`,
// que ya están en español) y los de los triggers de la base (`raise exception`,
// código P0001), que también están en español.
//
// Sin React ni Supabase.

export type DestinoDelError = "form" | "global";

const SIN_CONEXION = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|err_network/i;

function texto(error: unknown): string {
  const message =
    typeof error === "object" && error !== null ? (error as { message?: unknown }).message : undefined;
  return typeof message === "string" ? message.trim() : "";
}

function codigo(error: unknown): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : "";
}

const conPunto = (mensaje: string) => (/[.!?…»]$/.test(mensaje) ? mensaje : `${mensaje}.`);

export function mensajeDeError(error: unknown, destino: DestinoDelError = "global"): string {
  const mensaje = texto(error);
  const code = codigo(error);
  const queHacer =
    destino === "form"
      ? "No se pudo guardar; lo escrito sigue en el formulario. Intenta de nuevo cuando vuelva la señal."
      : "No se pudo completar la acción. Intenta de nuevo cuando vuelva la señal.";

  if (SIN_CONEXION.test(mensaje)) {
    return `Sin conexión. ${queHacer}`;
  }
  // El trigger explica en español por qué no deja: eso es lo útil.
  if (code === "P0001" && mensaje) return conPunto(mensaje);
  if (code === "23505") {
    return "No se pudo guardar: ya hay un registro igual. Revisa los datos e intenta de nuevo.";
  }
  if (code.startsWith("23")) {
    return "No se pudo guardar: falta un dato o uno no cumple las reglas. Revisa los datos e intenta de nuevo.";
  }
  if (code === "42501") return "No se pudo guardar: tu acceso no permite este cambio.";
  if (code === "PGRST301" || /jwt expired/i.test(mensaje)) {
    return "No se pudo guardar: la sesión venció. Vuelve a entrar e intenta de nuevo.";
  }
  // Un error con código que no se conoce viene de la base, en inglés, y un
  // TypeError o parecido es un defecto del programa: ninguno se muestra. Un
  // `Error` sin código es de la pantalla y ya está escrito para leerse.
  const delPrograma = error instanceof Error && error.name !== "Error";
  if (code || delPrograma || !mensaje) return "No se pudo completar la acción. Intenta de nuevo.";
  return mensaje;
}
