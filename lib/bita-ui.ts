// Piezas puras de la pantalla de Bita: saludo, enlaces a viajes y validación de
// lo que responde el servidor. Sin React, para probarlas con node --test.

export const NOMBRE_DE_BITA = "Bita";

export const PREGUNTAS_SUGERIDAS = [
  "¿Quién sube esta semana?",
  "¿Qué hay que comprar ahora?",
  "¿Cuánto llevamos gastado este mes?",
] as const;

export function horaEnChile(ahora: Date = new Date()): number {
  const texto = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", hour: "numeric", hourCycle: "h23" }).format(ahora);
  return Number.parseInt(texto, 10) % 24;
}

export const saludoPara = (hora: number) => (hora < 12 ? "Buenos días" : hora < 20 ? "Buenas tardes" : "Buenas noches");

export function presentacion(hora: number, demo: boolean, soloResumen = demo): string {
  return (
    `${saludoPara(hora)}. Soy ${NOMBRE_DE_BITA} y llevo la bitácora de los viajes: te cuento quién sube y baja, qué hay que comprar y cuánto se ha gastado. ` +
    (demo
      ? "En la demostración solo muestro este resumen; las preguntas funcionan con una cuenta real."
      : soloResumen
        ? "Por ahora solo muestro este resumen: las preguntas todavía no están configuradas."
        : "No compro pasajes ni cambio viajes: eso lo haces tú en la pantalla.")
  );
}

export type Trozo = { tipo: "texto"; texto: string } | { tipo: "viaje"; texto: string; id: string };

/** Separa los seudónimos de viaje (V-xxxx) que el servidor sabe abrir; el resto queda como texto. */
export function trozosConViajes(texto: string, viajes: Record<string, string>): Trozo[] {
  const trozos: Trozo[] = [];
  let desde = 0;
  for (const m of texto.matchAll(/\bV-[0-9a-f]{4}(?:[0-9a-f]{4})?\b/g)) {
    const id = viajes[m[0]];
    if (!id) continue;
    if (m.index > desde) trozos.push({ tipo: "texto", texto: texto.slice(desde, m.index) });
    trozos.push({ tipo: "viaje", texto: m[0], id });
    desde = m.index + m[0].length;
  }
  if (desde < texto.length) trozos.push({ tipo: "texto", texto: texto.slice(desde) });
  return trozos.length ? trozos : [{ tipo: "texto", texto }];
}

const entero = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;

export type RespuestaChat = { respuesta: string; viajes: Record<string, string>; restantes: number; limite: number };

export function esRespuestaChat(v: unknown): v is RespuestaChat {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  const viajes = r.viajes;
  return (
    typeof r.respuesta === "string" &&
    !!viajes &&
    typeof viajes === "object" &&
    Object.entries(viajes as Record<string, unknown>).every(
      ([token, id]) => /^V-[0-9a-f]{4}([0-9a-f]{4})?$/.test(token) && typeof id === "string" && id.length <= 64,
    ) &&
    entero(r.restantes) &&
    entero(r.limite)
  );
}

export function esRespuestaCupo(v: unknown): v is { restantes: number | null; limite: number } {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (r.restantes === null || entero(r.restantes)) && entero(r.limite);
}
