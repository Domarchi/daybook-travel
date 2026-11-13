"use client";

import { useEffect, useRef } from "react";
import { CalendarDays, Coins, LogOut, Monitor, Moon, Plane, ShieldCheck, Sun, Users, X } from "lucide-react";
import { OPCIONES_DE_TEMA, type PreferenciaDeTema } from "@/lib/tema";
import BrandLogo from "@/components/ui/brand-logo";
import { cn } from "@/lib/utils";
import { useApp } from "../app/store";
import { db } from "../lib/supabase";

const navItems = [
  { label: "Agenda", icon: CalendarDays },
  { label: "Personas", icon: Users },
  { label: "Viajes", icon: Plane },
  { label: "Costos", icon: Coins },
];

// Solo la ve quien administra los accesos.
const accesosItem = { label: "Accesos", icon: ShieldCheck };

// El hover va con `[&:hover]:` y no con `hover:` a propósito: en Tailwind 4,
// `hover:` solo aplica donde hay mouse, y la barra lo aplicaba siempre. Traducir,
// no rediseñar; si se quiere cambiar, es un paso aparte.
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-rail-focus";

// Debajo de 820 px el riel pasa a ser una franja superior y el enlace ya no se
// corre al pasar el mouse ni se hunde al apretarlo: de ahí los `min-[820px]:`.
const ENLACE = cn(
  "flex min-h-[var(--db-rail-item-height)] w-full cursor-pointer items-center gap-3 rounded-sm border-none px-3 text-left",
  "text-rail-link transition-[translate,scale,color,background-color] duration-[160ms] ease-out",
  "min-[820px]:[&:hover:not(:active)]:translate-x-[2px] min-[820px]:active:scale-[0.98]",
  FOCO,
);

const BOTON_RIEL = cn(
  "grid size-[34px] flex-none cursor-pointer place-items-center rounded-sm border-none bg-transparent",
  "text-rail-link [&:hover]:bg-rail-hover [&:hover]:text-rail-link-hover",
  FOCO,
);

// El riel lateral de Daybook: marca arriba, navegación en medio, usuario abajo.
// Reemplaza a la barra superior; la lógica de sesión y de tema es la misma.
export default function SideNav() {
  const {
    view,
    navigate,
    theme,
    preferenciaTema,
    elegirTema,
    menuAbierto,
    setMenuAbierto,
    demo,
    email,
    isAdmin,
    setDemo,
    setAccessStatus,
    setPeople,
    setTrips,
  } = useApp();

  const oscuro = theme === "dark";
  const primerDestino = useRef<HTMLButtonElement>(null);

  // El cajón del teléfono: al abrirse el foco entra al primer destino; Escape lo
  // cierra y devuelve el foco al botón del menú. Mientras está abierto, la página
  // de atrás no se desplaza.
  useEffect(() => {
    if (!menuAbierto) return;
    // Un cuadro después de abrir, cuando el cajón ya se pintó visible.
    const cuadro = requestAnimationFrame(() => primerDestino.current?.focus());
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      setMenuAbierto(false);
      document.getElementById("boton-menu")?.focus();
    };
    document.addEventListener("keydown", cerrarConEscape);
    const desborde = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(cuadro);
      document.removeEventListener("keydown", cerrarConEscape);
      document.documentElement.style.overflow = desborde;
    };
  }, [menuAbierto, setMenuAbierto]);
  const quien = demo ? "Demostración" : email || "";
  const inicial = (quien[0] || "D").toUpperCase();

  return (
    <aside
      id="menu-principal"
      className={cn(
        // Hasta 1024 px (tableta) el riel es el compacto de la familia, 214 px; `max-[1025px]` es «menos de 1025», como el `max-width: 1024px` de Parte Diario y Ticket.
        "fixed inset-y-0 left-0 z-30 flex w-[var(--db-rail-width)] flex-col max-[1025px]:w-[var(--db-rail-width-compact)] border-r border-r-rail-line bg-rail text-rail-foreground",
        // En el teléfono el riel es el menú: un cajón de 232 px que entra desde la
        // izquierda con el botón ☰ de la cabecera, como en Ticket y Parte Diario.
        // Cerrado queda invisible, así que no se recorre con Tab.
        // Al abrir, `visibility` cambia en el acto (si se anima, el primer cuadro
        // sigue oculto y el foco no entra); al cerrar sí se anima, para que el
        // cajón se vea mientras sale.
        "max-[820px]:z-50 max-[820px]:w-[var(--db-rail-width)] max-[820px]:duration-[220ms] max-[820px]:ease-[var(--ease-drawer)]",
        menuAbierto
          ? "max-[820px]:translate-x-0 max-[820px]:transition-[translate] max-[820px]:shadow-[0_16px_48px_rgba(0,0,0,0.4)]"
          : "max-[820px]:invisible max-[820px]:-translate-x-full max-[820px]:transition-[translate,visibility]",
      )}
    >
      <button
        type="button"
        className={cn(BOTON_RIEL, "absolute top-3 right-3 size-11 min-[821px]:hidden")}
        aria-label="Cerrar menú"
        onClick={() => {
          setMenuAbierto(false);
          document.getElementById("boton-menu")?.focus();
        }}
      >
        <X size={18} />
      </button>
      <div
        className={cn(
          "flex min-h-[108px] flex-none flex-col items-start gap-[2px] border-b border-b-rail-line px-[22px] py-[18px]",
        )}
      >
        {/* El riel es oscuro aunque el tema sea claro: siempre la variante para fondo oscuro. */}
        <BrandLogo tono="oscuro" className="w-[168px]" />
        <span className="ml-[5px] text-overline leading-[1.4] font-semibold tracking-[0.12em] text-rail-caption uppercase">
          Traslados · Copiapó
        </span>
      </div>

      <nav
        className={cn(
          "flex flex-1 flex-col gap-1 overflow-auto px-3 pt-4",
        )}
        aria-label="Navegación principal"
      >
        {(isAdmin && !demo ? [...navItems, accesosItem] : navItems).map(({ label, icon: Icon }, indice) => {
          const actual = view === label;
          return (
            <button
              type="button"
              key={label}
              ref={indice === 0 ? primerDestino : undefined}
              className={cn(
                ENLACE,
                // El marcado le gana al hover: la pestaña actual no cambia de color al pasarle encima.
                // El activo lleva además la barra dorada de la familia Daybook.
                actual
                  ? "bg-rail-active text-rail-foreground [box-shadow:inset_var(--db-rail-indicator-width)_0_0_var(--db-rail-indicator)]"
                  : "bg-transparent [&:hover]:bg-rail-hover [&:hover]:text-rail-link-hover",
              )}
              aria-current={actual ? "page" : undefined}
              onClick={() => navigate(label)}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="flex-1 text-meta leading-[1.4] font-medium">
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex-none px-3 py-4">
        <div className="flex items-center gap-2 border-t border-t-rail-divider pt-3">
          <div
            className="grid size-[34px] flex-[0_0_34px] place-items-center rounded-sm bg-rail-avatar text-caption font-bold text-rail-avatar-foreground"
            aria-hidden="true"
          >
            {inicial}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <strong title={quien} className="overflow-hidden text-caption leading-[1.4] text-ellipsis whitespace-nowrap text-rail-name">
              {quien}
            </strong>
            <small className="mt-[2px] text-caption leading-[1.4] text-rail-sub">
              {demo ? "Datos ficticios" : "Sesión activa"}
            </small>
          </div>
          <button
            type="button"
            className={BOTON_RIEL}
            aria-label={demo ? "Salir de la demostración" : "Cerrar sesión"}
            onClick={async () => {
              if (!demo) await db().auth.signOut();
              setDemo(false);
              setAccessStatus("checking");
              setPeople([]);
              setTrips([]);
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
        {/* El tema, en el pie del riel junto a la persona, como en Parte Diario y
            Daybook Ticket: Sistema, Claro u Oscuro. */}
        <label className="mt-3 flex items-center gap-2 text-rail-caption">
          {preferenciaTema === "system" ? <Monitor size={15} aria-hidden="true" /> : oscuro ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}
          <span className="sr-only">Tema</span>
          <select
            aria-label="Tema"
            value={preferenciaTema}
            onChange={(evento) => elegirTema(evento.target.value as PreferenciaDeTema)}
            className={cn(
              "min-h-9 flex-1 cursor-pointer rounded-sm border border-rail-line bg-transparent px-2 text-caption text-rail-foreground",
              FOCO,
            )}
          >
            {OPCIONES_DE_TEMA.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor} className="text-black">
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>
    </aside>
  );
}
