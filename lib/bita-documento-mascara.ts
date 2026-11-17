// Lo que sale del documento hacia el modelo, ya sin datos personales.
//
// Mismas reglas que el chat de Bita (ver bita-seudonimos.ts y docs/bita.md):
// Anthropic no recibe nombres, RUT, correos, teléfonos, códigos de reserva,
// números de vuelo ni montos. Un documento trae todo eso junto, así que aquí:
//
//   1. Las personas con ficha en Travel pasan a su seudónimo (P-xxxx), por
//      nombre completo, por apellido o nombre que solo tiene una persona, y por
//      código de persona.
//   2. En las tablas, las columnas se reconocen por su encabezado: las de nombre
//      se reemplazan entera (persona con ficha → seudónimo; sin ficha →
//      «Persona sin ficha N»), y las de reserva, vuelo, monto o contacto se
//      vacían.
//   3. En el texto suelto se quitan los patrones de RUT, correo, teléfono,
//      monto, reserva y vuelo, y las rachas de dos o más palabras con
//      mayúscula inicial que no son lugares ni palabras de tabla se tratan como
//      un nombre sin ficha.
//
// Límite que se dice en voz alta: en texto libre (Word y PDF) un nombre de una
// sola palabra, o una reserva de seis letras sin etiqueta, puede pasar. Un
// archivo con esos datos hay que revisarlo antes de subirlo.
//
// Una persona se reconoce solo si TODAS las palabras de lo escrito están en el nombre
// de una única ficha («Pérez Soto, Juan» sí; «Carlos Díaz Mena» no, aunque haya una
// ficha que se apellide Díaz): lo demás es una persona sin ficha. Así un apellido
// común no le atribuye el viaje a otra persona ni deja salir el resto del nombre.
//
// Puro: sin red, sin base, sin reloj.
import { enmascarar, type Seudonimos } from "./bita-seudonimos.ts";
import type { Bloque, Fila } from "./bita-documento.ts";
import type { Person, Trip } from "./types.ts";

const sinTildes = (texto: string) => texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MONTO = /(?:\$|\b(?:CLP|USD|UF)\b)\s?\d[\d.,]*|\b\d[\d.,]*\s?(?:CLP|USD|UF|pesos)\b/gi;
const CON_ETIQUETA = /\b(pnr|reserva|localizador|booking|ticket|boleto|c[oó]digo(?: de reserva)?)\b(\s*[:#-]?\s*)([A-Za-z0-9]{5,8})\b/gi;
const RESERVA_MIXTA = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6}\b/g;
const VUELO = /\b(?!DE\s?\d)(?:[A-Z]{2}|[A-Z]\d|\d[A-Z])\s?\d{2,4}\b/g;
const PALABRA = String.raw`(?:\p{Lu}\p{Ll}+|\p{Lu}{3,})`;
const RACHA = new RegExp(String.raw`(?<![\p{L}\p{N}])${PALABRA}(?:[ \t]+${PALABRA})+(?![\p{L}\p{N}])`, "gu");

const ES_FECHA = /\b(fecha|hora|dia|mes|ano)\b/;
const COLUMNA_NOMBRE = /\b(nombres?|pasajeros?|personas?|trabajadores?|colaboradores?|empleados?|apellidos?)\b/;
const COLUMNA_SENSIBLE =
  /\b(pnr|reserva|localizador|boleto|ticket|monto|valor|tarifa|precio|costo|rut|run|dni|pasaporte|correo|email|mail|telefono|celular|fono|contacto)\b/;
const COLUMNA_VUELO = /^(n[°ºo.]?\s*(de\s*)?vuelo|nro\.?\s*(de\s*)?vuelo|numero\s*(de\s*)?vuelo|codigo\s*(de\s*)?vuelo|vuelo)$/;
const COLUMNA_CODIGO = /^(codigo|cod\.?|code|id)$/;

/** Palabras de tabla, de calendario y de la operación: un par de ellas no es un nombre. */
const PALABRAS_BASE = [
  "fecha", "hora", "vuelo", "vuelos", "origen", "destino", "pasajero", "pasajeros", "nombre", "nombres", "apellido", "apellidos",
  "subida", "bajada", "sube", "baja", "estado", "equipaje", "mochila", "maleta", "cabina", "bodega", "itinerario", "manifiesto",
  "aeropuerto", "aerolinea", "aerolineas", "terminal", "salida", "llegada", "ida", "regreso", "retorno", "total", "pagina", "hoja",
  "tabla", "reserva", "observaciones", "observacion", "notas", "nota", "planificado", "solicitado", "emitido", "confirmado", "viaje",
  "viajes", "persona", "personas", "turno", "chile", "latam", "sky", "jetsmart", "daybook", "travel", "fcc", "mina", "obra",
  "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo",
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

export type Mascara = {
  bloques: (bloques: Bloque[]) => Bloque[];
  texto: (texto: string) => string;
  /** «Persona sin ficha N» → lo que decía el archivo, para lo que vuelve a la pantalla de quien lo subió. */
  restaurar: (texto: string) => string;
  /** Cuántas personas distintas sin ficha se encontraron. */
  sinFicha: () => number;
};

type Contexto = {
  personas: Pick<Person, "id" | "name" | "employee_code" | "origin" | "destination">[];
  viajes: Pick<Trip, "origin" | "destination">[];
  seud: Seudonimos;
};

/** «P-1a2b, P-1a2b P-1a2b» → «P-1a2b»: apellido y nombre de la misma persona escritos aparte. */
const colapsar = (texto: string) => texto.replace(/\b(P-[0-9a-f]{4}(?:[0-9a-f]{4})?)(?:[\s,.;-]+\1\b)+/g, "$1");

export function crearMascara({ personas, viajes, seud }: Contexto): Mascara {
  // Lugares conocidos: no se confunden con nombres.
  const conocidas = new Set(PALABRAS_BASE);
  for (const lugar of [...personas, ...viajes].flatMap((x) => [x.origin, x.destination]))
    for (const palabra of sinTildes(lugar ?? "").split(/[^\p{L}]+/u)) if (palabra.length >= 2) conocidas.add(palabra);

  // Códigos de persona, en una sola pasada.
  const porCodigo = new Map<string, string>();
  for (const p of personas) {
    const codigo = (p.employee_code ?? "").trim();
    if (codigo.length >= 3) porCodigo.set(codigo.toUpperCase(), p.id);
  }
  const patronCodigos = porCodigo.size
    ? new RegExp(
        String.raw`(?<![\p{L}\p{N}])(?:${[...porCodigo.keys()].sort((a, b) => b.length - a.length).map(escapar).join("|")})(?![\p{L}\p{N}])`,
        "giu",
      )
    : null;

  const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "e"]);
  const palabrasDe = (t: string) => sinTildes(t).split(/[^\p{L}]+/u).filter((w) => w.length >= 2 && !PARTICULAS.has(w));
  const delasPersonas = personas.map((p) => ({ id: p.id, palabras: new Set(palabrasDe(p.name)) }));
  /** La única ficha cuyo nombre contiene todas las palabras, o null si no hay ninguna o hay varias. */
  const fichaUnica = (palabras: string[]) => {
    if (!palabras.length) return null;
    const candidatas = delasPersonas.filter((p) => palabras.every((w) => p.palabras.has(w)));
    return candidatas.length === 1 ? candidatas[0].id : null;
  };

  const sinFicha = new Map<string, number>();
  const original: string[] = [];
  const sinFichaDe = (texto: string) => {
    const clave = sinTildes(texto).replace(/\s+/g, " ").trim();
    let n = sinFicha.get(clave);
    if (!n) {
      n = sinFicha.size + 1;
      sinFicha.set(clave, n);
      original[n] = texto.replace(/\s+/g, " ").trim();
    }
    return `Persona sin ficha ${n}`;
  };

  const personaOSinFicha = (escrito: string) => {
    const id = fichaUnica(palabrasDe(escrito.replace(/\([^)]*\)/g, " ")));
    return id ? seud.persona(id) : sinFichaDe(escrito);
  };

  /** Rachas de dos o más palabras con mayúscula: una persona con ficha o una sin ficha, nunca a medias. */
  const rachas = (texto: string) =>
    texto.replace(RACHA, (racha) => {
      const salida: string[] = [];
      let actual: string[] = [];
      const cerrar = () => {
        if (actual.length >= 2) salida.push(personaOSinFicha(actual.join(" ")));
        else salida.push(...actual);
        actual = [];
      };
      for (const palabra of racha.split(/[ \t]+/)) {
        if (conocidas.has(sinTildes(palabra))) {
          cerrar();
          salida.push(palabra);
        } else actual.push(palabra);
      }
      cerrar();
      return salida.join(" ");
    });

  const texto = (entrada: string): string => {
    // Sin letras no puede haber nombre ni etiqueta: solo contacto y montos.
    if (!/\p{L}/u.test(entrada)) return enmascarar(entrada).replace(MONTO, "[monto omitido]");
    // 1) nombres completos y contacto, 2) códigos de persona, 3) rachas de nombres, 4) palabras sueltas
    // de una ficha (un nombre de pila o un apellido que quedó solo).
    let r = seud.ocultarCompletos(entrada);
    if (patronCodigos) r = r.replace(patronCodigos, (c) => seud.persona(porCodigo.get(c.toUpperCase()) ?? ""));
    r = seud.ocultar(rachas(r));
    r = colapsar(r)
      .replace(MONTO, "[monto omitido]")
      .replace(CON_ETIQUETA, (m, etiqueta: string, separador: string, codigo: string) =>
        /^[A-Z0-9]+$/.test(codigo) ? `${etiqueta}${separador}[omitido]` : m,
      )
      .replace(RESERVA_MIXTA, "[reserva omitida]")
      .replace(VUELO, "[vuelo omitido]");
    return r;
  };

  const nombre = (celda: string): string => personaOSinFicha(celda);

  function tabla(filas: Fila[]): Fila[] {
    const cabecera = filas.find((f) => f.celdas.filter(Boolean).length >= 2);
    const tipos = (cabecera?.celdas ?? []).map((c) => {
      const t = sinTildes(c).replace(/\s+/g, " ").trim();
      if (!t || ES_FECHA.test(t)) return "libre" as const;
      if (COLUMNA_VUELO.test(t) || COLUMNA_SENSIBLE.test(t)) return "omitir" as const;
      if (COLUMNA_CODIGO.test(t)) return "codigo" as const;
      if (COLUMNA_NOMBRE.test(t)) return "nombre" as const;
      return "libre" as const;
    });
    return filas.map((fila) => {
      if (fila === cabecera) return { n: fila.n, celdas: fila.celdas.map((c) => texto(c)) };
      if (cabecera && fila.n < cabecera.n) return { n: fila.n, celdas: fila.celdas.map((c) => texto(c)) };
      return {
        n: fila.n,
        celdas: fila.celdas.map((celda, i) => {
          if (!celda) return "";
          const tipo = tipos[i] ?? "libre";
          if (tipo === "omitir") return "[omitido]";
          if (tipo === "nombre") return nombre(celda);
          if (tipo === "codigo") {
            const dePersona = porCodigo.get(celda.trim().toUpperCase());
            return dePersona ? seud.persona(dePersona) : "[omitido]";
          }
          return texto(celda);
        }),
      };
    });
  }

  return {
    bloques: (bloques) =>
      bloques.map((b) =>
        b.tipo === "texto"
          ? { tipo: "texto", lineas: b.lineas.map(texto) }
          : { tipo: "tabla", titulo: texto(b.titulo), filas: tabla(b.filas) },
      ),
    texto,
    restaurar: (entrada) => entrada.replace(/Persona sin ficha (\d+)/g, (m, n: string) => original[Number(n)] ?? m),
    sinFicha: () => sinFicha.size,
  };
}
