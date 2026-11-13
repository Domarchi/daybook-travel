// Los nombres de las personas no salen hacia Anthropic.
//
// Cada persona y cada viaje tienen un seudónimo corto y estable ("P-3f2a",
// "V-91c0") que sale de su id: es el mismo en todas las preguntas, así que una
// conversación de varios mensajes sigue hablando de la misma persona. El modelo
// solo ve seudónimos; el servidor vuelve a poner los nombres en la respuesta
// antes de mostrarla. Lo que escribe la persona también pasa por aquí: «¿cuándo
// sube Juan Pérez?» viaja como «¿cuándo sube P-3f2a?».
//
// Además se enmascaran correos, teléfonos y RUT que alguien haya escrito en una
// pregunta o en las notas de un viaje.
//
// Puro: sin red, sin base, sin reloj.

export type ConNombre = { id: string; name: string };
export type ConId = { id: string };

/** FNV-1a de 32 bits en hexadecimal. Basta para separar unos cientos de ids; los choques se resuelven alargando. */
function huella(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Un seudónimo por id, con el prefijo dado. Si dos ids chocan en 4 cifras, ambos usan 8. */
function seudonimosPara(ids: string[], prefijo: string): Map<string, string> {
  const ordenados = [...new Set(ids)].sort();
  const cortos = new Map<string, string[]>();
  for (const id of ordenados) {
    const corto = huella(id).slice(0, 4);
    cortos.set(corto, [...(cortos.get(corto) ?? []), id]);
  }
  const resultado = new Map<string, string>();
  for (const [corto, grupo] of cortos)
    for (const id of grupo) resultado.set(id, `${prefijo}-${grupo.length === 1 ? corto : huella(id)}`);
  return resultado;
}

const sinTildes = (texto: string) =>
  texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Una expresión que encuentra el texto como palabras completas, con o sin tildes y mayúsculas. */
function patronDe(texto: string): RegExp {
  const partes = sinTildes(texto)
    .split(/\s+/)
    .filter(Boolean)
    .map((parte) =>
      [...parte]
        .map((letra) => {
          const variantes: Record<string, string> = {
            a: "aáàä", e: "eéèë", i: "iíìï", o: "oóòö", u: "uúùü", n: "nñ",
          };
          return variantes[letra] ? `[${variantes[letra]}]` : escapar(letra);
        })
        .join(""),
    );
  return new RegExp(`(?<![\\p{L}\\p{N}])${partes.join("\\s+")}(?![\\p{L}\\p{N}])`, "giu");
}

const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TELEFONO = /(?:\+?56\s?)?(?:\(?\d\)?[\s-]?)?\d{4}[\s-]?\d{4}\b/g;
const RUT = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g;

/** Correos, teléfonos y RUT fuera, con una marca que dice qué se quitó. */
export function enmascarar(texto: string): string {
  return texto
    .replace(CORREO, "[correo omitido]")
    .replace(RUT, "[RUT omitido]")
    .replace(TELEFONO, "[teléfono omitido]");
}

/** Partes de nombres que también son palabras de todos los días: no se tapan solas. */
const COMUNES = new Set(["del", "las", "los", "san", "santa", "paz", "luz", "sol", "mar", "rosa", "flor"]);

export type Seudonimos = {
  persona: (id: string) => string;
  viaje: (id: string) => string;
  /** El id real detrás de un seudónimo de persona, o null si no existe. */
  idDePersona: (token: string) => string | null;
  idDeViaje: (token: string) => string | null;
  /** Nombres → seudónimos y datos de contacto enmascarados, en un texto escrito por una persona. */
  ocultar: (texto: string) => string;
  /** Seudónimos de persona → nombres, en la respuesta del modelo. Los de viaje se dejan: la pantalla los vuelve enlaces. */
  restaurar: (texto: string) => string;
};

export const PATRON_PERSONA = /\bP-[0-9a-f]{4}(?:[0-9a-f]{4})?\b/g;
export const PATRON_VIAJE = /\bV-[0-9a-f]{4}(?:[0-9a-f]{4})?\b/g;

export function crearSeudonimos(personas: ConNombre[], viajes: ConId[]): Seudonimos {
  const dePersona = seudonimosPara(personas.map((p) => p.id), "P");
  const deViaje = seudonimosPara(viajes.map((v) => v.id), "V");
  const personaPorToken = new Map([...dePersona].map(([id, token]) => [token, id]));
  const viajePorToken = new Map([...deViaje].map(([id, token]) => [token, id]));
  const nombrePorId = new Map(personas.map((p) => [p.id, p.name.trim()]));

  // Nombres completos primero (los más largos antes), después nombres sueltos
  // que solo tiene una persona. Un nombre de pila compartido no se adivina: se
  // dice entre quiénes está la duda.
  const completos = [...personas]
    .filter((p) => p.name.trim().length >= 3)
    .sort((a, b) => b.name.length - a.name.length);
  const porPalabra = new Map<string, string[]>();
  for (const p of personas)
    for (const palabra of new Set(sinTildes(p.name).split(/\s+/).filter((w) => w.length >= 3 && !COMUNES.has(w))))
      porPalabra.set(palabra, [...(porPalabra.get(palabra) ?? []), p.id]);

  const persona = (id: string) => dePersona.get(id) ?? "P-????";
  const ocultar = (texto: string) => {
    let resultado = enmascarar(texto);
    for (const p of completos) resultado = resultado.replace(patronDe(p.name), persona(p.id));
    for (const [palabra, ids] of porPalabra) {
      const unicos = [...new Set(ids)];
      resultado = resultado.replace(patronDe(palabra), (encontrado) =>
        unicos.length === 1
          ? persona(unicos[0])
          : `«${encontrado.charAt(0).toUpperCase()}…» (puede ser ${unicos.slice(0, 4).map(persona).join(", ")})`,
      );
    }
    return resultado;
  };
  const restaurar = (texto: string) =>
    texto.replace(PATRON_PERSONA, (token) => {
      const id = personaPorToken.get(token);
      return id ? nombrePorId.get(id) || token : token;
    });

  return {
    persona,
    viaje: (id) => deViaje.get(id) ?? "V-????",
    idDePersona: (token) => personaPorToken.get(token.trim()) ?? null,
    idDeViaje: (token) => viajePorToken.get(token.trim()) ?? null,
    ocultar,
    restaurar,
  };
}
