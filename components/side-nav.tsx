"use client";

import { useEffect, useRef } from "react";
import {
  CalendarDays,
  Coins,
  History,
  Contrast,
  Moon,
  Plane,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { etiquetaDeTema, siguientePreferenciaDeTema, type PreferenciaDeTema } from "@/lib/tema";
import BrandLogo from "@/components/ui/brand-logo";
import { CONSULTA_TELEFONO, useMedia } from "@/components/ui/use-media";
import { cn } from "@/lib/utils";
import { useApp } from "../app/store";
import { inicialDeLaCuenta, nombreDeLaCuenta, rolEnElRiel } from "../lib/cuenta";
import { cifraDeNovedades, textoDeNovedades } from "../lib/novedades";

type Destino = { label: string; icon: LucideIcon };

// Dos grupos cortos, como en Parte Diario: lo del día a día y lo de mirar o
// ajustar. Accesos solo lo ve quien administra los accesos.
const OPERACION: Destino[] = [
  { label: "Agenda", icon: CalendarDays },
  { label: "Personas", icon: Users },
  { label: "Viajes", icon: Plane },
  { label: "Costos", icon: Coins },
];
const ACTIVIDAD: Destino = { label: "Actividad", icon: History };
const ACCESOS: Destino = { label: "Accesos", icon: ShieldCheck };
const CONFIGURACION: Destino = { label: "Configuración", icon: Settings };

const ICONO_DE_TEMA: Record<PreferenciaDeTema, LucideIcon> = { system: Contrast, light: Sun, dark: Moon };

// El riel lateral de Daybook: marca arriba, navegación en medio, quién está
// abajo. Las filas, los títulos de grupo, el pie y el cajón del teléfono son los
// comunes de la familia (`@daybook/design/riel.css`); aquí solo queda qué
// destinos hay y cuándo se abre el cajón. Salir y la cuenta viven en
// Configuración, como en Parte Diario.
export default function SideNav() {
  const {
    view,
    navigate,
    preferenciaTema,
    elegirTema,
    menuAbierto,
    setMenuAbierto,
    demo,
    email,
    isAdmin,
    accessStatus,
    novedades,
  } = useApp();

  const telefono = useMedia(CONSULTA_TELEFONO);
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

  // Si el cajón quedó abierto y la ventana se ensancha, se cierra: en escritorio
  // no hay ☰ para cerrarlo y la página seguiría sin desplazarse.
  useEffect(() => {
    if (!telefono) setMenuAbierto(false);
  }, [telefono, setMenuAbierto]);

  const cuenta = { demo, email, isAdmin, accessStatus };
  const quien = nombreDeLaCuenta(cuenta);
  const administracion = [ACTIVIDAD, ...(isAdmin && !demo ? [ACCESOS] : []), CONFIGURACION];

  const temaSiguiente = siguientePreferenciaDeTema(preferenciaTema);
  const IconoTema = ICONO_DE_TEMA[preferenciaTema];

  function fila({ label, icon: Icon }: Destino, primera = false) {
    const actual = view === label;
    return (
      <button
        type="button"
        key={label}
        ref={primera ? primerDestino : undefined}
        className="db-rail-link"
        aria-current={actual ? "page" : undefined}
        onClick={() => navigate(label)}
      >
        <Icon aria-hidden="true" />
        <span className="db-rail-link__label">{label}</span>
        {/* Cambios de otras personas desde la última visita (lib/novedades.ts).
            Cuenta, no pide atención: va en la pastilla gris. */}
        {label === "Actividad" && novedades > 0 && !actual && (
          <span className="db-rail-count" data-novedades>
            <span aria-hidden="true">{cifraDeNovedades(novedades)}</span>
            <span className="sr-only">{`, ${textoDeNovedades(novedades)}`}</span>
          </span>
        )}
      </button>
    );
  }

  return (
    <aside
      id="menu-principal"
      data-open={telefono ? String(menuAbierto) : undefined}
      className={cn(
        // Hasta 1024 px (tableta) el riel es el compacto de la familia, 214 px; `max-[1025px]` es «menos de 1025», como el `max-width: 1024px` de Parte Diario y Ticket.
        "fixed inset-y-0 left-0 z-30 flex w-[var(--db-rail-width)] flex-col max-[1025px]:w-[var(--db-rail-width-compact)]",
        "border-r border-r-[var(--db-rail-border)] bg-[var(--db-rail-bg)] text-[var(--db-rail-text)]",
        // En el teléfono el riel es el menú: un cajón de 232 px que entra desde
        // la izquierda con el ☰ de la cabecera. Cómo entra y sale lo pone
        // `.db-rail-drawer`, igual en las tres apps; cerrado queda invisible y
        // no se recorre con Tab.
        "max-[820px]:z-50 max-[820px]:w-[var(--db-rail-width)]",
        // Mientras sale (200 ms) sigue visible sobre el ☰: sin esto, volver a
        // tocar el ☰ en ese momento caía en el cajón que se iba y no abría nada.
        telefono && "db-rail-drawer data-[open=false]:pointer-events-none",
      )}
    >
      {telefono && (
        <button
          type="button"
          className="db-rail-icon-button absolute top-2 right-2"
          aria-label="Cerrar menú"
          onClick={() => {
            setMenuAbierto(false);
            document.getElementById("boton-menu")?.focus();
          }}
        >
          <X aria-hidden="true" />
        </button>
      )}
      {/* El bloque de marca de la familia (`@daybook/design/marca.css`): mismo
          alto, aire y línea que en Ticket y Parte Diario. El riel es oscuro
          aunque el tema sea claro, por eso `db-on-dark`. */}
      <div className="db-brand-block db-on-dark">
        <BrandLogo />
        <span className="db-lockup-descriptor">Traslados · Copiapó</span>
      </div>

      {/* La lista ocupa el alto libre y se desplaza ella; el pie queda siempre a
          la vista. La sombra de arriba o abajo avisa que hay más filas. */}
      <div className="db-rail-scroll">
        <nav className="db-rail-nav" aria-label="Navegación principal">
          <p className="db-rail-section">Operación</p>
          {OPERACION.map((destino, indice) => fila(destino, indice === 0))}
          <p className="db-rail-section">Administración</p>
          {administracion.map((destino) => fila(destino))}
        </nav>
      </div>

      {/* Quién está y el tema, en una fila, como en Parte Diario y Ticket. */}
      <div className="db-rail-footer">
        <div className="db-rail-account">
          <span className="db-rail-avatar" aria-hidden="true">
            {inicialDeLaCuenta(cuenta)}
          </span>
          <span className="db-rail-account__text">
            <strong className="db-rail-account__name" title={quien}>
              {quien}
            </strong>
            <small className="db-rail-account__role">{rolEnElRiel(cuenta)}</small>
          </span>
          {/* Recorre Sistema → Claro → Oscuro. El ícono es el de ahora y se
              vuelve a montar al cambiar (key), así entra con su fundido: es la
              única señal de que el toque llegó. */}
          <button
            type="button"
            className="db-rail-icon-button"
            aria-label={`Tema: ${etiquetaDeTema(preferenciaTema)}`}
            title={`Cambiar a ${etiquetaDeTema(temaSiguiente)}`}
            onClick={() => elegirTema(temaSiguiente)}
          >
            <IconoTema key={preferenciaTema} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
