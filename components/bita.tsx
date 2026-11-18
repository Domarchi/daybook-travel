"use client";
// Bita, la asistente de Travel: un botón flotante abajo a la derecha y un panel
// que se abre en el mismo rincón, como en Daybook Parte Diario y Daybook Ticket.
//
// Al abrirse muestra un resumen que NO usa IA ni gasta mensajes (lib/bita-resumen,
// con los datos que la pantalla ya cargó). Las preguntas van al servidor
// (/api/bita) con el token de la sesión; Bita lee con ese token, así que ve lo
// mismo que la persona. En la demostración solo está el resumen.
//
// También lee documentos (Excel, Word, PDF con texto): /api/bita/documento devuelve
// una propuesta de viajes y la persona elige cuáles crear. El servidor no escribe
// nada; los viajes los inserta esta pantalla con la sesión de quien confirma
// (app/estado/use-acciones-documento.ts).
//
// Solo se muestra si el servidor dice que Bita está encendida (/api/bita/estado).
// Capas: el botón (z-[25]) queda bajo el menú lateral del teléfono (z-30); el
// panel (z-[40]) sobre la página y bajo los diálogos (z-100), así un viaje
// abierto desde Bita aparece encima.
import { ChevronRight, Paperclip, Send, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { useApp } from "../app/store";
import { lineasDeResumen, resumenDeBita, type LineaResumen } from "../lib/bita-resumen";
import {
  ACEPTA_ARCHIVOS,
  MAX_ARCHIVO_PANTALLA,
  NOMBRE_DE_BITA,
  PREGUNTAS_SUGERIDAS,
  esRespuestaChat,
  esRespuestaDocumento,
  horaEnChile,
  presentacion,
  problemaDeArchivo,
  textoDeHistorial,
  trozosConViajes,
  type ViajeElegido,
} from "../lib/bita-ui";
import { mensajeDeError } from "../lib/errores";
import { localDate } from "../lib/format";
import { db } from "../lib/supabase";
import { BitaAvatar } from "./bita-avatar";
import { PropuestaDeViajes, type EstadoPropuesta } from "./bita-propuesta";

// `texto` es lo que viaja en las preguntas siguientes. Para un documento es una frase fija o cifras,
// nunca el nombre del archivo ni lo que dijo el modelo: ahí pueden venir nombres de personas sin ficha.
type Entrada = {
  id: number;
  rol: "user" | "assistant";
  texto: string;
  viajes?: Record<string, string>;
  /** El nombre del archivo que se adjuntó, solo para mostrarlo. */
  archivo?: string;
  propuesta?: EstadoPropuesta;
};

const MENSAJES_ENVIADOS = 12;

async function tokenDeSesion(): Promise<string | null> {
  try {
    const { data } = await db().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function leerJson(respuesta: Response): Promise<unknown> {
  return respuesta.json().catch(() => ({}));
}

export default function Bita() {
  const { demo, people, trips, documentTypes, documents, purchaseWindow, navigate, showPurchaseQueue, openTrip, crearViajesDeDocumento, reload } = useApp();
  const [disponible, setDisponible] = useState(false);
  // Encendida pero sin llave de Anthropic: solo el resumen, como en la demostración.
  const [conPreguntas, setConPreguntas] = useState(false);
  const soloResumen = demo || !conPreguntas;
  const [abierto, setAbierto] = useState(false);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  /** Qué se está esperando, para decirlo: una pregunta o la lectura de un documento. */
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState("");
  const siguiente = useRef(1);
  const boton = useRef<HTMLButtonElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const cerrar = useRef<HTMLButtonElement>(null);
  const registro = useRef<HTMLDivElement>(null);
  const selectorDeArchivo = useRef<HTMLInputElement>(null);
  const creando = useRef<number[]>([]);
  const estuvoAbierto = useRef(false);
  const panelId = useId();

  useEffect(() => {
    const control = new AbortController();
    fetch("/api/bita/estado", { cache: "no-store", signal: control.signal })
      .then(async (r) => {
        setDisponible(r.ok);
        const datos = r.ok ? await r.json().catch(() => ({})) : {};
        setConPreguntas(Boolean((datos as { disponible?: unknown }).disponible));
      })
      .catch(() => setDisponible(false));
    return () => control.abort();
  }, []);

  useEffect(() => {
    if (abierto) {
      estuvoAbierto.current = true;
      // En la demostración no hay campo: el foco entra igual al panel, para que Escape funcione.
      (campo.current ?? cerrar.current)?.focus();
    } else if (estuvoAbierto.current) boton.current?.focus();
  }, [abierto]);

  // Una propuesta de viajes llega entera: se muestra desde su encabezado, no desde sus botones. El resto va al
  // final. Depende de CUÁNTAS entradas hay y no de su contenido: marcar una casilla no debe mover la conversación.
  useEffect(() => {
    const log = registro.current;
    if (!log) return;
    const ultima = entradas[entradas.length - 1];
    const tarjeta = ultima?.propuesta && !enviando ? log.querySelector<HTMLElement>(`[data-entrada="${ultima.id}"]`) : null;
    log.scrollTop = tarjeta ? tarjeta.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop - 12 : log.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entradas.length, enviando, error]);

  const resumen = useMemo(
    () =>
      lineasDeResumen(
        resumenDeBita({ hoy: localDate(), personas: people, viajes: trips, ventana: purchaseWindow, tipos: documentTypes, documentos: documents }),
      ),
    [people, trips, purchaseWindow, documentTypes, documents],
  );
  const saludo = useMemo(() => (abierto ? presentacion(horaEnChile(), demo, soloResumen) : ""), [abierto, demo, soloResumen]);

  // El campo crece con lo que se escribe, hasta un tope; vacío vuelve a una línea.
  useEffect(() => {
    const c = campo.current;
    if (!c) return;
    c.style.height = "auto";
    c.style.height = `${Math.min(c.scrollHeight, 120)}px`;
  }, [texto, abierto]);

  if (!disponible) return null;

  const enTelefono = () => window.matchMedia("(max-width: 760px)").matches;
  const irA = (accion: LineaResumen["accion"]) => {
    if (enTelefono()) setAbierto(false);
    if (accion === "por_comprar") showPurchaseQueue("abiertos");
    else if (accion === "sin_cerrar") showPurchaseQueue("sin_cerrar");
    else if (accion === "personas") navigate("Personas");
    else navigate("Agenda");
  };
  const abrirViaje = (id: string) => {
    const viaje = trips.find((v) => v.id === id);
    if (viaje) openTrip(viaje);
  };

  const cambiarPropuesta = (id: number, cambios: Partial<EstadoPropuesta>) =>
    setEntradas((actual) => actual.map((e) => (e.id === id && e.propuesta ? { ...e, propuesta: { ...e.propuesta, ...cambios } } : e)));

  async function subirDocumento(archivo: File) {
    if (enviando || soloResumen) return;
    const problema = problemaDeArchivo(archivo);
    if (problema) {
      setError(problema);
      return;
    }
    const mia: Entrada = { id: siguiente.current++, rol: "user", texto: "Adjunté un documento.", archivo: archivo.name };
    setEntradas((actual) => [...actual, mia]);
    setError("");
    setEnviando(true);
    setLeyendo(true);
    try {
      const token = await tokenDeSesion();
      if (!token) throw new Error("Tu sesión venció. Vuelve a entrar.");
      const formulario = new FormData();
      formulario.append("archivo", archivo);
      const r = await fetch("/api/bita/documento", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formulario }).catch(() => {
        throw new Error(`${NOMBRE_DE_BITA} no pudo leer el documento: se cortó la conexión. Intenta de nuevo.`);
      });
      const datos = await leerJson(r);
      if (!r.ok) {
        const mensaje = datos && typeof (datos as { error?: unknown }).error === "string" ? (datos as { error: string }).error : "";
        throw new Error(mensaje || `${NOMBRE_DE_BITA} no pudo leer el documento. Intenta de nuevo.`);
      }
      if (!esRespuestaDocumento(datos)) throw new Error(`La respuesta de ${NOMBRE_DE_BITA} no se pudo leer. Intenta de nuevo.`);
      setEntradas((actual) => [
        ...actual,
        {
          id: siguiente.current++,
          rol: "assistant",
          texto: textoDeHistorial(datos),
          propuesta: { datos, elegidas: datos.filas.filter((f) => f.estado === "nuevo").map((f) => f.clave), fase: "lista" },
        },
      ]);
    } catch (fallo) {
      // El documento que no se pudo leer sale de la conversación: se elige de nuevo.
      setEntradas((actual) => actual.filter((e) => e.id !== mia.id));
      setError(fallo instanceof Error ? fallo.message : `${NOMBRE_DE_BITA} no pudo leer el documento.`);
    } finally {
      setEnviando(false);
      setLeyendo(false);
    }
  }

  async function crearDeLaPropuesta(id: number) {
    const propuesta = entradas.find((e) => e.id === id)?.propuesta;
    if (!propuesta || propuesta.fase !== "lista" || creando.current.includes(id)) return;
    creando.current = [...creando.current, id];
    cambiarPropuesta(id, { fase: "creando", error: undefined });
    try {
      const elegidos: ViajeElegido[] = propuesta.datos.filas.flatMap((f) =>
        f.estado === "nuevo" && f.sentido && propuesta.elegidas.includes(f.clave)
          ? [{ personaId: f.personaId, fecha: f.fecha, sentido: f.sentido, origen: f.origen, destino: f.destino, hora: f.hora }]
          : [],
      );
      const resultado = await crearViajesDeDocumento(elegidos, propuesta.datos.archivo);
      cambiarPropuesta(id, { fase: "creada", creados: resultado.creados, yaExistian: resultado.yaExistian });
    } catch (fallo) {
      // Nada quedó a medias de forma silenciosa: se recarga lo que hay y la propuesta sigue disponible.
      void reload();
      cambiarPropuesta(id, { fase: "lista", error: mensajeDeError(fallo, "global") });
    } finally {
      creando.current = creando.current.filter((x) => x !== id);
    }
  }

  const alElegirArchivo = (evento: ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (archivo) void subirDocumento(archivo);
  };

  async function enviar(contenido: string) {
    const limpio = contenido.trim();
    if (!limpio || enviando || soloResumen) return;
    const mia: Entrada = { id: siguiente.current++, rol: "user", texto: limpio };
    const conversacion = [...entradas, mia];
    setEntradas(conversacion);
    setTexto("");
    setError("");
    setEnviando(true);
    try {
      const token = await tokenDeSesion();
      if (!token) throw new Error("Tu sesión venció. Vuelve a entrar.");
      const r = await fetch("/api/bita", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: conversacion.slice(-MENSAJES_ENVIADOS).map((e) => ({ role: e.rol, content: e.texto.slice(0, 2000) })),
        }),
      }).catch(() => {
        throw new Error(`${NOMBRE_DE_BITA} no pudo responder: se cortó la conexión. Intenta de nuevo.`);
      });
      const datos = await leerJson(r);
      if (!r.ok) {
        const mensaje = datos && typeof (datos as { error?: unknown }).error === "string" ? (datos as { error: string }).error : "";
        throw new Error(mensaje || `${NOMBRE_DE_BITA} no pudo responder. Intenta de nuevo.`);
      }
      if (!esRespuestaChat(datos)) throw new Error(`La respuesta de ${NOMBRE_DE_BITA} no se pudo leer. Intenta de nuevo.`);
      setEntradas((actual) => [...actual, { id: siguiente.current++, rol: "assistant", texto: datos.respuesta, viajes: datos.viajes }]);
    } catch (fallo) {
      // La pregunta sin respuesta sale de la conversación y vuelve al campo, para reenviarla con un toque.
      setEntradas((actual) => actual.filter((e) => e.id !== mia.id));
      setTexto(limpio);
      setError(fallo instanceof Error ? fallo.message : `${NOMBRE_DE_BITA} no pudo responder.`);
    } finally {
      setEnviando(false);
      if (window.matchMedia("(pointer: fine)").matches) campo.current?.focus();
    }
  }

  const alEnviar = (evento: FormEvent) => {
    evento.preventDefault();
    void enviar(texto);
  };
  const alTeclear = (evento: KeyboardEvent<HTMLTextAreaElement>) => {
    if (evento.key === "Enter" && !evento.shiftKey && !evento.nativeEvent.isComposing) {
      evento.preventDefault();
      void enviar(texto);
    }
  };
  const alTeclearPanel = (evento: KeyboardEvent<HTMLElement>) => {
    if (evento.key === "Escape") {
      evento.stopPropagation();
      setAbierto(false);
    }
  };

  if (!abierto)
    return (
      <button
        ref={boton}
        type="button"
        aria-expanded={false}
        aria-label={`Abrir el chat con ${NOMBRE_DE_BITA}`}
        data-bita-boton
        onClick={() => {
          setError("");
          setAbierto(true);
        }}
        className="fixed right-6 bottom-6 z-[25] inline-flex min-h-12 items-center gap-2 rounded-full border border-primary bg-primary py-0 pr-4 pl-2 text-meta font-bold text-primary-foreground shadow-[0_10px_28px_rgb(17_18_15/0.2)] max-[760px]:right-4 max-[760px]:bottom-[calc(16px+env(safe-area-inset-bottom))]"
      >
        <BitaAvatar size={30} thinking={enviando} />
        {NOMBRE_DE_BITA}
      </button>
    );

  const etiqueta = "m-0 mb-2 text-xs font-bold tracking-wide !text-muted uppercase";
  return (
    <section
      id={panelId}
      role="dialog"
      aria-label={`${NOMBRE_DE_BITA}, asistente de Daybook Travel`}
      onKeyDown={alTeclearPanel}
      className="fixed right-6 bottom-6 z-[40] flex h-[min(720px,calc(100dvh-48px))] w-[min(440px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-foreground shadow-[0_24px_64px_rgb(17_18_15/0.28)] motion-safe:animate-[bita-entra_180ms_ease-out] max-[760px]:inset-0 max-[760px]:h-dvh max-[760px]:w-full max-[760px]:rounded-none max-[760px]:border-0"
    >
      <header className="flex items-center justify-between gap-3 bg-[#1c1d1a] py-3 pr-2 pl-4 text-[#f3efe4] max-[760px]:pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-3">
          <BitaAvatar size={40} thinking={enviando} />
          <div className="min-w-0">
            <h2 className="m-0 text-base leading-tight font-bold !text-[#f3efe4]">{NOMBRE_DE_BITA}</h2>
            <small className="block text-xs text-[#f3efe4]/70">Viajes, compras y costos</small>
          </div>
        </div>
        <button
          ref={cerrar}
          type="button"
          onClick={() => setAbierto(false)}
          aria-label={`Cerrar el chat con ${NOMBRE_DE_BITA}`}
          className="inline-flex size-11 items-center justify-center rounded-full text-[#f3efe4]/80 outline-offset-0 focus-visible:outline-2 focus-visible:outline-[#f6d16f] raton:hover:bg-white/10 raton:hover:text-[#f3efe4]"
        >
          <X size={18} />
        </button>
      </header>

      <div
        ref={registro}
        role="log"
        aria-live="polite"
        aria-label="Conversación"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4"
      >
        <div className="flex flex-col gap-3.5 text-sm leading-relaxed">
          <div className="flex items-start gap-2">
            <BitaAvatar size={28} />
            <p className="m-0 min-w-0 rounded-lg rounded-tl-[4px] border border-line bg-surface-soft px-3 py-2 text-meta leading-relaxed text-foreground">{saludo}</p>
          </div>
          <div>
            <h3 className={etiqueta}>Ahora</h3>
            <ul aria-label="Cómo vienen los viajes" className="m-0 flex list-none flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface p-0">
              {resumen.map((linea) => (
                <li key={linea.texto}>
                  <button
                    type="button"
                    onClick={() => irA(linea.accion)}
                    className={`flex min-h-10 w-full items-center gap-3 border-l-[3px] max-[760px]:min-h-11 px-3 py-2 text-left text-meta leading-snug text-foreground raton:hover:bg-surface-hover ${
                      linea.tono === "alerta" ? "border-l-warning bg-urgente-soft" : "border-l-transparent"
                    }`}
                  >
                    <span className="min-w-0 flex-1">{linea.texto}</span>
                    <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {!soloResumen && (
            <>
              <div>
                <h3 className={etiqueta}>Pregúntale</h3>
                <div className="flex flex-wrap gap-2">
                  {PREGUNTAS_SUGERIDAS.map((pregunta) => (
                    <button
                      key={pregunta}
                      type="button"
                      disabled={enviando}
                      onClick={() => void enviar(pregunta)}
                      className="min-h-9 rounded-full border border-line bg-surface px-3.5 text-left max-[760px]:min-h-11 text-meta text-foreground disabled:opacity-60 raton:hover:border-line-strong raton:hover:bg-surface-hover"
                    >
                      {pregunta}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={enviando}
                onClick={() => selectorDeArchivo.current?.click()}
                className="flex w-full items-start gap-3 rounded-lg border border-dashed border-line-strong bg-surface p-3 text-left disabled:opacity-60 raton:hover:bg-surface-hover"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-soft text-foreground">
                  <Paperclip size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-meta font-bold text-foreground">Planificar vuelos desde un documento</span>
                  <span className="mt-0.5 block text-xs leading-normal text-muted">
                    Excel, Word o PDF con texto, hasta {MAX_ARCHIVO_PANTALLA / 1024 / 1024} MB. Antes de leerlo cambio los nombres por seudónimos y quito RUT, correos, teléfonos, reservas, vuelos y montos.
                  </span>
                </span>
              </button>
            </>
          )}
        </div>

        {entradas.map((entrada) =>
          entrada.rol === "user" ? (
            <div
              key={entrada.id}
              className="max-w-[88%] self-end rounded-2xl rounded-br-[4px] bg-primary px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap text-primary-foreground [overflow-wrap:anywhere]"
            >
              <span className="sr-only">Tú: </span>
              {entrada.archivo ? (
                <span className="inline-flex items-center gap-2">
                  <Paperclip size={14} aria-hidden="true" className="shrink-0" />
                  {entrada.archivo}
                </span>
              ) : (
                entrada.texto
              )}
            </div>
          ) : entrada.propuesta ? (
            <div key={entrada.id} data-entrada={entrada.id} className="w-full min-w-0">
              <div className="rounded-lg border border-line bg-surface-soft p-3 text-sm leading-relaxed [overflow-wrap:anywhere]">
                <span className="sr-only">{NOMBRE_DE_BITA}: </span>
                <PropuestaDeViajes
                  estado={entrada.propuesta}
                  alAlternar={(clave) =>
                    cambiarPropuesta(entrada.id, {
                      elegidas: entrada.propuesta!.elegidas.includes(clave)
                        ? entrada.propuesta!.elegidas.filter((c) => c !== clave)
                        : [...entrada.propuesta!.elegidas, clave],
                    })
                  }
                  alMarcarTodas={(marcar) =>
                    cambiarPropuesta(entrada.id, {
                      elegidas: marcar ? entrada.propuesta!.datos.filas.filter((f) => f.estado === "nuevo").map((f) => f.clave) : [],
                    })
                  }
                  alCrear={() => void crearDeLaPropuesta(entrada.id)}
                  alDescartar={() => cambiarPropuesta(entrada.id, { fase: "descartada", error: undefined })}
                  alAbrirViaje={abrirViaje}
                  alVerAgenda={() => {
                    if (enTelefono()) setAbierto(false);
                    navigate("Agenda");
                  }}
                />
              </div>
            </div>
          ) : (
            <div key={entrada.id} data-entrada={entrada.id} className="flex max-w-[94%] items-start gap-2 self-start">
              <BitaAvatar size={28} />
              <div className="min-w-0 rounded-lg rounded-tl-[4px] border border-line bg-surface-soft px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
                <span className="sr-only">{NOMBRE_DE_BITA}: </span>
                {trozosConViajes(entrada.texto, entrada.viajes ?? {}).map((trozo, i) =>
                  trozo.tipo === "texto" ? (
                    <span key={i}>{trozo.texto}</span>
                  ) : (
                    <button
                      key={i}
                      type="button"
                      onClick={() => abrirViaje(trozo.id)}
                      className="font-bold text-primary underline underline-offset-2"
                    >
                      ver viaje
                    </button>
                  ),
                )}
              </div>
            </div>
          ),
        )}
        {enviando && (
          <p role="status" className="m-0 flex items-center gap-2 self-start text-meta text-muted">
            <span aria-hidden="true" className="inline-flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 rounded-full bg-muted motion-safe:animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </span>
            {leyendo ? `${NOMBRE_DE_BITA} está leyendo el documento…` : `${NOMBRE_DE_BITA} está revisando los viajes…`}
          </p>
        )}
        {error && (
          <p role="alert" className="m-0 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-meta text-danger">
            {error}
          </p>
        )}
      </div>

      {!soloResumen && (
        <form onSubmit={alEnviar} className="border-t border-line px-3 pt-3">
          <input
            ref={selectorDeArchivo}
            type="file"
            accept={ACEPTA_ARCHIVOS}
            tabIndex={-1}
            aria-hidden="true"
            data-bita-archivo
            className="hidden"
            onChange={alElegirArchivo}
          />
          <div className="flex items-end gap-1 rounded-2xl border border-line-strong bg-surface p-1 focus-within:border-transparent focus-within:outline-2 focus-within:outline-ring">
            <button
              type="button"
              disabled={enviando}
              onClick={() => selectorDeArchivo.current?.click()}
              aria-label="Adjuntar un documento: Excel, Word o PDF con texto"
              title="Adjuntar un documento (Excel, Word o PDF)"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted disabled:opacity-60 raton:hover:bg-surface-hover raton:hover:text-foreground"
            >
              <Paperclip size={18} aria-hidden="true" />
            </button>
            <textarea
              ref={campo}
              value={texto}
              rows={1}
              maxLength={2000}
              aria-label="Tu pregunta"
              placeholder={`Escríbele a ${NOMBRE_DE_BITA}`}
              onChange={(evento) => setTexto(evento.target.value)}
              onKeyDown={alTeclear}
              className="max-h-[120px] min-h-11 min-w-0 flex-1 resize-none bg-transparent px-1 py-[11px] text-sm outline-none max-[760px]:text-base"
            />
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send size={16} aria-hidden="true" />
              <span className="sr-only">Enviar</span>
            </button>
          </div>
        </form>
      )}
      <p
        className={`m-0 px-4 pt-2 pb-3 text-center text-xs leading-normal text-muted max-[760px]:pb-[max(12px,env(safe-area-inset-bottom))] ${soloResumen ? "border-t border-line pt-3" : ""}`}
      >
        {demo
          ? "Demostración: el resumen sale de los datos ficticios."
          : soloResumen
            ? "El resumen no usa IA ni gasta mensajes."
            : `${NOMBRE_DE_BITA} puede equivocarse: revisa el viaje antes de actuar.`}
      </p>
    </section>
  );
}
