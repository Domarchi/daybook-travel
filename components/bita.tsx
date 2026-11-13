"use client";
// Bita, la asistente de Travel: un botón flotante abajo a la derecha y un panel
// que se abre en el mismo rincón, como en Daybook Parte Diario y Daybook Ticket.
//
// Al abrirse muestra un resumen que NO usa IA ni gasta mensajes (lib/bita-resumen,
// con los datos que la pantalla ya cargó). Las preguntas van al servidor
// (/api/bita) con el token de la sesión; Bita lee con ese token, así que ve lo
// mismo que la persona. En la demostración solo está el resumen.
//
// Solo se muestra si el servidor dice que Bita está encendida (/api/bita/estado).
// Capas: el botón (z-[25]) queda bajo el menú lateral del teléfono (z-30); el
// panel (z-[40]) sobre la página y bajo los diálogos (z-100), así un viaje
// abierto desde Bita aparece encima.
import { Send, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useApp } from "../app/store";
import { lineasDeResumen, resumenDeBita, type LineaResumen } from "../lib/bita-resumen";
import {
  NOMBRE_DE_BITA,
  PREGUNTAS_SUGERIDAS,
  esRespuestaChat,
  esRespuestaCupo,
  horaEnChile,
  presentacion,
  trozosConViajes,
} from "../lib/bita-ui";
import { localDate } from "../lib/format";
import { db } from "../lib/supabase";
import { BitaAvatar } from "./bita-avatar";

type Entrada = { id: number; rol: "user" | "assistant"; texto: string; viajes?: Record<string, string> };

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
  const { demo, people, trips, documentTypes, documents, purchaseWindow, navigate, showPurchaseQueue, openTrip } = useApp();
  const [disponible, setDisponible] = useState(false);
  // Encendida pero sin llave de Anthropic: solo el resumen, como en la demostración.
  const [conPreguntas, setConPreguntas] = useState(false);
  const soloResumen = demo || !conPreguntas;
  const [abierto, setAbierto] = useState(false);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [restantes, setRestantes] = useState<number | null>(null);
  const siguiente = useRef(1);
  const boton = useRef<HTMLButtonElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const cerrar = useRef<HTMLButtonElement>(null);
  const registro = useRef<HTMLDivElement>(null);
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

  // Al abrir, cuántos mensajes quedan. No gasta ninguno.
  useEffect(() => {
    if (!abierto || soloResumen) return;
    let vigente = true;
    void (async () => {
      const token = await tokenDeSesion();
      if (!token) return;
      const r = await fetch("/api/bita", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
      const datos = r?.ok ? await leerJson(r) : null;
      if (vigente && esRespuestaCupo(datos) && datos.restantes !== null) setRestantes(datos.restantes);
    })();
    return () => {
      vigente = false;
    };
  }, [abierto, soloResumen]);

  useEffect(() => {
    if (registro.current) registro.current.scrollTop = registro.current.scrollHeight;
  }, [entradas, enviando, error]);

  const resumen = useMemo(
    () =>
      lineasDeResumen(
        resumenDeBita({ hoy: localDate(), personas: people, viajes: trips, ventana: purchaseWindow, tipos: documentTypes, documentos: documents }),
      ),
    [people, trips, purchaseWindow, documentTypes, documents],
  );
  const saludo = useMemo(() => (abierto ? presentacion(horaEnChile(), demo, soloResumen) : ""), [abierto, demo, soloResumen]);

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
        throw new Error(`${NOMBRE_DE_BITA} no pudo contestar: se cortó la conexión. Intenta de nuevo.`);
      });
      const datos = await leerJson(r);
      if (!r.ok) {
        const mensaje = datos && typeof (datos as { error?: unknown }).error === "string" ? (datos as { error: string }).error : "";
        throw new Error(mensaje || `${NOMBRE_DE_BITA} no pudo contestar. Intenta de nuevo.`);
      }
      if (!esRespuestaChat(datos)) throw new Error(`${NOMBRE_DE_BITA} respondió algo que no entiendo. Intenta de nuevo.`);
      setEntradas((actual) => [...actual, { id: siguiente.current++, rol: "assistant", texto: datos.respuesta, viajes: datos.viajes }]);
      setRestantes(datos.restantes);
    } catch (fallo) {
      // La pregunta sin respuesta sale de la conversación y vuelve al campo, para reenviarla con un toque.
      setEntradas((actual) => actual.filter((e) => e.id !== mia.id));
      setTexto(limpio);
      setError(fallo instanceof Error ? fallo.message : `${NOMBRE_DE_BITA} no pudo contestar.`);
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
        className="fixed right-6 bottom-6 z-[25] inline-flex min-h-12 items-center gap-2 rounded-full border border-primary bg-primary py-0 pr-4 pl-2 text-[13px] font-[750] text-primary-foreground shadow-[0_10px_28px_rgb(17_18_15/0.2)] max-[760px]:right-4 max-[760px]:bottom-[calc(16px+env(safe-area-inset-bottom))]"
      >
        <BitaAvatar size={30} thinking={enviando} />
        {NOMBRE_DE_BITA}
      </button>
    );

  return (
    <section
      id={panelId}
      role="dialog"
      aria-label={`${NOMBRE_DE_BITA}, asistente de Daybook Travel`}
      onKeyDown={alTeclearPanel}
      className="fixed right-6 bottom-6 z-[40] flex h-[min(620px,calc(100dvh-48px))] w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-line bg-surface text-foreground shadow-[0_18px_48px_rgb(17_18_15/0.22)] max-[760px]:inset-0 max-[760px]:h-dvh max-[760px]:w-full max-[760px]:rounded-none max-[760px]:border-0"
    >
      <header className="flex items-center justify-between gap-3 border-b border-line py-3 pr-3 pl-4 max-[760px]:pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-3">
          <BitaAvatar size={36} thinking={enviando} />
          <div className="min-w-0">
            <h2 className="m-0 text-base leading-tight font-[700]">{NOMBRE_DE_BITA}</h2>
            <small className="block text-xs text-muted">Viajes, compras y costos</small>
          </div>
        </div>
        <button
          ref={cerrar}
          type="button"
          onClick={() => setAbierto(false)}
          aria-label={`Cerrar el chat con ${NOMBRE_DE_BITA}`}
          className="inline-flex size-11 items-center justify-center rounded-md text-muted raton:hover:bg-surface-hover raton:hover:text-foreground"
        >
          <X size={18} />
        </button>
      </header>

      <div
        ref={registro}
        role="log"
        aria-live="polite"
        aria-label="Conversación"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4"
      >
        <div className="text-sm leading-relaxed">
          <p className="mt-0 mb-3">{saludo}</p>
          <ul aria-label="Cómo vienen los viajes" className="m-0 mb-3 flex list-none flex-col gap-2 p-0">
            {resumen.map((linea) => (
              <li key={linea.texto}>
                <button
                  type="button"
                  onClick={() => irA(linea.accion)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-[13px] leading-snug ${
                    linea.tono === "alerta"
                      ? "border-urgente-line bg-urgente-soft text-foreground"
                      : "border-line bg-surface-soft text-foreground"
                  } raton:hover:border-line-strong`}
                >
                  {linea.texto}
                </button>
              </li>
            ))}
          </ul>
          {!soloResumen && (
            <div className="flex flex-col gap-2">
              {PREGUNTAS_SUGERIDAS.map((pregunta) => (
                <button
                  key={pregunta}
                  type="button"
                  disabled={enviando}
                  onClick={() => void enviar(pregunta)}
                  className="min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-left text-[13px] raton:hover:border-line-strong"
                >
                  {pregunta}
                </button>
              ))}
            </div>
          )}
        </div>

        {entradas.map((entrada) =>
          entrada.rol === "user" ? (
            <div
              key={entrada.id}
              className="max-w-[88%] self-end rounded-[10px] rounded-br-[4px] bg-primary px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-primary-foreground [overflow-wrap:anywhere]"
            >
              <span className="sr-only">Tú: </span>
              {entrada.texto}
            </div>
          ) : (
            <div key={entrada.id} className="flex max-w-[94%] items-start gap-2 self-start">
              <BitaAvatar size={26} />
              <div className="rounded-[10px] rounded-bl-[4px] border border-line bg-surface-soft px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
                <span className="sr-only">{NOMBRE_DE_BITA}: </span>
                {trozosConViajes(entrada.texto, entrada.viajes ?? {}).map((trozo, i) =>
                  trozo.tipo === "texto" ? (
                    <span key={i}>{trozo.texto}</span>
                  ) : (
                    <button
                      key={i}
                      type="button"
                      onClick={() => abrirViaje(trozo.id)}
                      className="font-[700] text-primary underline underline-offset-2"
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
          <p role="status" className="m-0 self-start text-[13px] text-muted">
            {NOMBRE_DE_BITA} está revisando los viajes…
          </p>
        )}
        {error && (
          <p role="alert" className="m-0 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>

      {!soloResumen && (
        <form onSubmit={alEnviar} className="flex items-end gap-2 border-t border-line p-3 max-[760px]:pb-[max(12px,env(safe-area-inset-bottom))]">
          <textarea
            ref={campo}
            value={texto}
            rows={1}
            maxLength={2000}
            aria-label="Tu pregunta"
            placeholder={`Escríbele a ${NOMBRE_DE_BITA}`}
            onChange={(evento) => setTexto(evento.target.value)}
            onKeyDown={alTeclear}
            className="max-h-[120px] min-h-11 min-w-0 flex-1 resize-none rounded-md border border-line-strong bg-surface px-3 py-[11px] text-sm max-[760px]:text-base"
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            className="inline-flex min-h-11 items-center gap-1 rounded-md border border-primary bg-primary px-3 text-[13px] font-[750] text-primary-foreground disabled:opacity-60"
          >
            <Send size={15} /> Enviar
          </button>
        </form>
      )}
      <p className="m-0 px-4 pb-3 text-xs leading-normal text-muted">
        {demo
          ? "Demostración: el resumen sale de los datos ficticios."
          : soloResumen
            ? "El resumen no usa IA ni gasta mensajes."
            : `${restantes === null ? "" : `Te quedan ${restantes} ${restantes === 1 ? "mensaje" : "mensajes"} hoy. `}${NOMBRE_DE_BITA} puede equivocarse: revisa el viaje antes de actuar.`}
      </p>
    </section>
  );
}
