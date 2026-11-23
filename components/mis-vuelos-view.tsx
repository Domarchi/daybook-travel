"use client";

// Mis vuelos: la pantalla del trabajador. Entra con su RUT y un código de
// cuatro dígitos, y ve solo sus viajes. No usa el store de la coordinación ni
// la sesión de Supabase Auth: habla con la base como `anon`, y la base (las
// funciones worker_* de la migración 016) decide qué devolver.
//
// El teléfono recuerda la sesión: el token va en localStorage. Si la base dice
// que ya no vale (código nuevo, acceso quitado, 180 días), se vuelve a entrar.

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowUpRight, CalendarPlus, LogOut, Plane } from "lucide-react";
import BrandIdentity from "@/components/ui/brand-identity";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { LoadingMark } from "@/components/ui/dialog-parts";
import { BotonCopiar } from "@/components/ui/copy-button";
import { useCopiar } from "@/components/ui/use-copiar";
import { cn } from "@/lib/utils";
import { db } from "@/lib/supabase";
import { localDate } from "@/lib/format";
import { makeDemoPeople, makeDemoTrips } from "@/lib/demo";
import {
  CLAVE_DE_SESION,
  enlacesDeCalendario,
  estadoParaTrabajador,
  fechaParaTrabajador,
  leerMisVuelos,
  mensajeDeFalla,
  misVuelosDesdeFicha,
  sentidoParaTrabajador,
  separarViajes,
  type MisVuelos,
  type ViajeDelTrabajador,
} from "@/lib/mis-vuelos";

type Estado = "cargando" | "entrar" | "listo";

const leerToken = () => {
  try {
    return localStorage.getItem(CLAVE_DE_SESION);
  } catch {
    return null;
  }
};
const guardarToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(CLAVE_DE_SESION, token);
    else localStorage.removeItem(CLAVE_DE_SESION);
  } catch {}
};

const AVISO =
  "rounded-md border px-3 py-[11px] text-meta [overflow-wrap:anywhere]";
const AVISO_ERROR =
  "border-[color-mix(in_srgb,var(--danger)_45%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] text-danger";

export default function MisVuelosView() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [datos, setDatos] = useState<MisVuelos | null>(null);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async (token: string) => {
    try {
      const { data, error: fallo } = await db().rpc("worker_trips", { p_token: token });
      if (fallo) throw fallo;
      const leidos = leerMisVuelos(data);
      if (!leidos) {
        guardarToken(null);
        setDatos(null);
        setEstado("entrar");
        setError("Tu sesión terminó. Vuelve a entrar con tu RUT y tu código.");
        return;
      }
      setDatos(leidos);
      setError("");
      setEstado("listo");
    } catch (causa) {
      // Sin señal no se pierde la sesión: se muestra lo último que se vio.
      setError(mensajeDeFalla(causa, "No se pudieron cargar tus vuelos. Revisa la conexión."));
      setEstado((actual) => (actual === "cargando" ? "entrar" : actual));
    }
  }, []);

  useEffect(() => {
    const token = leerToken();
    if (token) void cargar(token);
    else setEstado("entrar");
    // Al volver a la pestaña (el teléfono la dejó en segundo plano) se recarga:
    // la coordinación pudo cargar el código de reserva mientras tanto.
    const alVolver = () => {
      const vigente = leerToken();
      if (document.visibilityState === "visible" && vigente) void cargar(vigente);
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [cargar]);

  async function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    setOcupado(true);
    setError("");
    try {
      const { data, error: fallo } = await db().rpc("worker_sign_in", {
        p_rut: String(form.get("rut") ?? ""),
        p_pin: String(form.get("codigo") ?? "").trim(),
      });
      if (fallo) throw fallo;
      const respuesta = data as { ok?: boolean; motivo?: string; token?: string } | null;
      if (!respuesta?.ok || !respuesta.token) {
        setError(
          respuesta?.motivo === "bloqueado"
            ? "Tu acceso quedó bloqueado por intentos fallidos. Pide un código nuevo a la coordinación de la obra."
            : "RUT o código incorrecto. Revisa los dos e intenta de nuevo.",
        );
        return;
      }
      guardarToken(respuesta.token);
      await cargar(respuesta.token);
    } catch (causa) {
      setError(mensajeDeFalla(causa, "No se pudo entrar. Revisa la conexión e intenta de nuevo."));
    } finally {
      setOcupado(false);
    }
  }

  async function salir() {
    const token = leerToken();
    guardarToken(null);
    setDatos(null);
    setDemo(false);
    setEstado("entrar");
    setError("");
    if (token) {
      try {
        await db().rpc("worker_sign_out", { p_token: token });
      } catch {}
    }
  }

  function verDemostracion() {
    const personas = makeDemoPeople();
    const persona = { ...personas[0], phone: "+56900000000" };
    const viajes = makeDemoTrips(personas)
      .filter((viaje) => viaje.person_id === persona.id)
      .map((viaje, indice) => (indice === 0 ? { ...viaje, flight: "LA 340", status: "Emitido", pnr: "DEMO01" } : viaje));
    setDatos(misVuelosDesdeFicha(persona, viajes, localDate(), "0".repeat(64)));
    setDemo(true);
    setError("");
    setEstado("listo");
  }

  return (
    <main className="grid min-h-screen grid-rows-[auto_1fr] bg-bg px-4 pb-8">
      <header className="mx-auto flex w-full max-w-[560px] min-h-16 items-center justify-between gap-4 border-b border-line py-3">
        <BrandIdentity />
        {estado === "listo" && (
          <Button type="button" onClick={salir} className="px-3" data-mis-vuelos-salir>
            <LogOut size={16} /> Salir
          </Button>
        )}
      </header>
      <section className="mx-auto w-full max-w-[560px] pt-5">
        {estado === "cargando" ? (
          <p className="flex items-center gap-3 text-muted" aria-live="polite">
            <LoadingMark /> Cargando tus vuelos…
          </p>
        ) : estado === "entrar" ? (
          <FormularioDeEntrada entrar={entrar} ocupado={ocupado} error={error} verDemostracion={verDemostracion} />
        ) : datos ? (
          <ListaDeVuelos datos={datos} demo={demo} error={error} />
        ) : null}
      </section>
    </main>
  );
}

function FormularioDeEntrada({
  entrar,
  ocupado,
  error,
  verDemostracion,
}: {
  entrar: (evento: FormEvent<HTMLFormElement>) => void;
  ocupado: boolean;
  error: string;
  verDemostracion: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow)]">
        <h1 className="text-display leading-[1.15] font-semibold tracking-[-0.035em] text-foreground">
          Mis vuelos
        </h1>
        <p className="mt-2 mb-5 text-meta text-muted">
          Entra con tu RUT y el código de 4 dígitos que te mandó la coordinación de la obra.
        </p>
        <form onSubmit={entrar} aria-busy={ocupado} className="grid gap-[15px]">
          <Label>
            RUT
            <Input
              name="rut"
              autoComplete="username"
              autoCapitalize="characters"
              required
              placeholder="12.345.678-9"
            />
          </Label>
          <Label>
            Código
            <Input
              name="codigo"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              title="Los 4 dígitos del código"
              className="tracking-[0.3em]"
            />
          </Label>
          <Button type="submit" variant="primary" disabled={ocupado} className="mt-[3px] w-full justify-between">
            {ocupado ? "Entrando…" : "Ver mis vuelos"}
            {!ocupado && <ArrowUpRight size={18} />}
          </Button>
        </form>
        {error && (
          <p role="alert" className={cn(AVISO, AVISO_ERROR, "mt-3")}>
            {error}
          </p>
        )}
        <small className="mt-3 block text-muted">
          Este teléfono te recordará: no tendrás que escribirlo cada vez. ¿No tienes código? Pídelo a la coordinación.
        </small>
      </div>
      <Button type="button" onClick={verDemostracion} className="w-full justify-between" data-mis-vuelos-demo>
        Ver demostración <ArrowUpRight size={18} />
      </Button>
    </div>
  );
}

function ListaDeVuelos({ datos, demo, error }: { datos: MisVuelos; demo: boolean; error: string }) {
  const { proximos, anteriores } = separarViajes(datos.viajes, datos.hoy);
  const [siguiente, ...despues] = proximos;
  const primerNombre = datos.persona.nombre.split(/\s+/)[0];
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-title leading-[1.2] font-semibold text-foreground">Hola, {primerNombre}</h1>
        <p className="mt-1 text-meta text-muted">
          {datos.persona.origen} ↔ {datos.persona.destino}
          {demo ? " · demostración" : ""}
        </p>
      </div>
      {error && (
        <p role="alert" className={cn(AVISO, AVISO_ERROR)}>
          {error}
        </p>
      )}
      {siguiente ? (
        <section aria-labelledby="proximo-vuelo" className="grid gap-2">
          <h2 id="proximo-vuelo" className="text-overline font-bold tracking-[0.08em] text-muted uppercase">
            Tu próximo viaje
          </h2>
          <TarjetaDeViaje viaje={siguiente} hoy={datos.hoy} destacada />
        </section>
      ) : (
        <p className="rounded-lg border border-line bg-surface p-5 text-meta text-foreground-soft">
          No tienes viajes por delante. Cuando la coordinación te programe uno, aparecerá aquí.
        </p>
      )}
      {despues.length > 0 && (
        <section aria-labelledby="mas-adelante" className="grid gap-2">
          <h2 id="mas-adelante" className="text-overline font-bold tracking-[0.08em] text-muted uppercase">
            Más adelante
          </h2>
          {despues.map((viaje) => (
            <TarjetaDeViaje key={viaje.id} viaje={viaje} hoy={datos.hoy} />
          ))}
        </section>
      )}
      <Recordatorios datos={datos} demo={demo} />
      {anteriores.length > 0 && (
        <details className="group rounded-lg border border-line bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 text-meta font-semibold text-foreground-soft">
            Viajes anteriores ({anteriores.length})
            <span aria-hidden="true" className="transition-[rotate] group-open:rotate-90">›</span>
          </summary>
          <div className="grid gap-2 border-t border-line p-3">
            {anteriores.map((viaje) => (
              <TarjetaDeViaje key={viaje.id} viaje={viaje} hoy={datos.hoy} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

const TONO: Record<ReturnType<typeof estadoParaTrabajador>["tono"], string> = {
  listo: "bg-[var(--db-success-soft)] text-success",
  pendiente: "bg-[var(--db-info-soft)] text-info",
  pasado: "bg-[var(--db-surface-muted)] text-foreground-soft",
  problema: "bg-[var(--db-danger-soft)] text-danger",
};

function TarjetaDeViaje({ viaje, hoy, destacada = false }: { viaje: ViajeDelTrabajador; hoy: string; destacada?: boolean }) {
  const estado = estadoParaTrabajador(viaje);
  return (
    <article
      data-viaje-trabajador
      className={cn(
        "grid gap-3 rounded-lg border border-line bg-surface p-4",
        destacada && "border-line-strong shadow-[var(--shadow)]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-[2px]">
          <strong className={cn("text-foreground", destacada ? "text-title leading-[1.2]" : "text-body")}>
            {fechaParaTrabajador(viaje.fecha, hoy)}
          </strong>
          <span className="text-meta text-foreground-soft">
            {sentidoParaTrabajador(viaje.sentido)} · {viaje.origen} → {viaje.destino}
          </span>
        </div>
        <span
          className={cn(
            "inline-flex min-h-[var(--db-badge-height)] items-center gap-[5px] rounded-[var(--db-badge-radius)] px-[var(--db-badge-padding-x)] text-[length:var(--db-badge-font-size)] [font-weight:var(--db-badge-weight)] whitespace-nowrap",
            "before:size-[var(--db-badge-dot)] before:rounded-full before:bg-current before:content-['']",
            TONO[estado.tono],
          )}
        >
          {estado.etiqueta}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-meta max-[380px]:grid-cols-2">
        <Dato termino="Hora" valor={viaje.hora ?? "Por confirmar"} />
        <Dato termino="Vuelo" valor={viaje.vuelo || "Por confirmar"} />
        <Dato termino="Código de reserva" valor={viaje.reserva || "—"} fuerte={Boolean(viaje.reserva)} />
      </dl>
    </article>
  );
}

function Dato({ termino, valor, fuerte = false }: { termino: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="grid gap-[2px]">
      <dt className="text-caption text-muted">{termino}</dt>
      <dd className={cn("text-foreground-soft", fuerte && "font-mono text-body font-semibold tracking-[0.06em] text-foreground")}>
        {valor}
      </dd>
    </div>
  );
}

function Recordatorios({ datos, demo }: { datos: MisVuelos; demo: boolean }) {
  const origen = typeof window === "undefined" ? "" : window.location.origin;
  const enlaces = datos.calendario ? enlacesDeCalendario(origen, datos.calendario) : null;
  const { copiado, copiar } = useCopiar(enlaces?.https ?? "");
  const canales = [
    datos.persona.tieneTelefono && "WhatsApp",
    datos.persona.tieneCorreo && "correo",
  ].filter(Boolean);
  return (
    <section aria-labelledby="recordatorios" className="grid gap-3 rounded-lg border border-line bg-surface p-4">
      <h2 id="recordatorios" className="flex items-center gap-2 text-body font-semibold text-foreground">
        <Plane size={17} aria-hidden="true" /> Recordatorios
      </h2>
      <p className="text-meta text-foreground-soft">
        {canales.length
          ? `El día antes de cada vuelo con pasaje te llega un aviso por ${canales.join(" y por ")}.`
          : "Para recibir un aviso el día antes, pide a la coordinación que agregue tu teléfono o tu correo."}
      </p>
      {enlaces && (
        <>
          <p className="text-meta text-foreground-soft">
            Agrega tus vuelos al calendario del teléfono: se actualizan solos y te avisan la víspera.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={demo ? undefined : enlaces.webcal}
              aria-disabled={demo || undefined}
              data-mis-vuelos-calendario
              className={cn(buttonVariants({ variant: "primary" }), demo && "pointer-events-none opacity-[0.48]")}
            >
              <CalendarPlus size={17} /> Agregar a mi calendario
            </a>
            {!demo && <BotonCopiar copiado={copiado} onClick={copiar} />}
          </div>
          <small className="text-muted">
            {demo
              ? "En la demostración el calendario no se puede agregar."
              : "En Google Calendar: «Otros calendarios» → «Desde URL» y pega el enlace copiado."}
          </small>
        </>
      )}
    </section>
  );
}
