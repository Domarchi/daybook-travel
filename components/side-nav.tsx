"use client";

import { CalendarDays, Coins, History, LogOut, Moon, Plane, ShieldCheck, Sun, Users } from "lucide-react";
import BrandLogo from "@/components/ui/brand-logo";
import BrandMark from "@/components/ui/brand-mark";
import { cn } from "@/lib/utils";
import { useApp } from "../app/store";
import { db } from "../lib/supabase";

const navItems = [
  { label: "Agenda", icon: CalendarDays },
  { label: "Personas", icon: Users },
  { label: "Viajes", icon: Plane },
  { label: "Costos", icon: Coins },
  { label: "Actividad", icon: History },
];

// Solo la ve quien administra los accesos.
const accesosItem = { label: "Accesos", icon: ShieldCheck };

// El hover solo donde hay mouse de verdad (`raton:`), como el resto de la
// aplicación. En la traducción a Tailwind quedó con `[&:hover]:`, que en un
// teléfono deja el resaltado pegado después de tocar.
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-rail-focus";

// Debajo de 820 px el riel pasa a ser una franja superior y el enlace ya no se
// corre al pasar el mouse ni se hunde al apretarlo: de ahí los `min-[820px]:`.
const ENLACE = cn(
  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-sm border-none px-3 text-left",
  "text-rail-link transition-[translate,scale,color,background-color] duration-[160ms] ease-out",
  "min-[820px]:raton:hover:[&:not(:active)]:translate-x-[2px] min-[820px]:active:scale-[0.98]",
  "max-[820px]:flex-1 max-[820px]:justify-center max-[820px]:gap-1.5 max-[820px]:px-1.5",
  FOCO,
);

const BOTON_RIEL = cn(
  "grid size-[34px] flex-none cursor-pointer place-items-center rounded-sm border-none bg-transparent",
  "text-rail-link raton:hover:bg-rail-hover raton:hover:text-rail-link-hover",
  FOCO,
);

// El riel lateral de Daybook: marca arriba, navegación en medio, usuario abajo.
// Reemplaza a la barra superior; la lógica de sesión y de tema es la misma.
export default function SideNav() {
  const {
    view,
    navigate,
    theme,
    toggleTheme,
    demo,
    email,
    isAdmin,
    setDemo,
    setAccessStatus,
    setPeople,
    setTrips,
  } = useApp();

  const oscuro = theme === "dark";
  const quien = demo ? "Demostración" : email || "";
  const inicial = (quien[0] || "D").toUpperCase();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex w-[232px] flex-col border-r border-r-rail-line bg-rail text-rail-foreground",
        "max-[820px]:sticky max-[820px]:inset-x-0 max-[820px]:top-0 max-[820px]:bottom-auto",
        "max-[820px]:w-auto max-[820px]:flex-row max-[820px]:flex-wrap max-[820px]:items-center",
        "max-[820px]:border-r-0 max-[820px]:border-b max-[820px]:border-b-rail-line max-[820px]:px-[14px] max-[820px]:py-[10px]",
      )}
    >
      <div
        className={cn(
          "flex min-h-[108px] flex-none flex-col items-start gap-[2px] border-b border-b-rail-line px-[22px] py-[18px]",
          "max-[820px]:min-h-0 max-[820px]:border-b-0 max-[820px]:p-0",
        )}
      >
        {/* El riel es oscuro aunque el tema sea claro: siempre la variante para fondo oscuro. */}
        <BrandLogo tono="oscuro" className="w-[168px] max-[820px]:hidden" />
        <BrandMark tono="oscuro" className="max-[820px]:block max-[820px]:w-10" />
        <span className="ml-[5px] text-[11px] leading-[1.4] font-[650] tracking-[0.12em] text-rail-caption uppercase max-[820px]:hidden">
          Traslados · Copiapó
        </span>
      </div>

      <nav
        className={cn(
          "flex flex-1 flex-col gap-1 overflow-auto px-3 pt-4",
          "max-[820px]:order-3 max-[820px]:flex-[1_0_100%] max-[820px]:flex-row max-[820px]:overflow-visible max-[820px]:px-0 max-[820px]:pt-2",
        )}
        aria-label="Navegación principal"
      >
        {(isAdmin && !demo ? [...navItems, accesosItem] : navItems).map(({ label, icon: Icon }) => {
          const actual = view === label;
          return (
            <button
              type="button"
              key={label}
              className={cn(
                ENLACE,
                // El marcado le gana al hover: la pestaña actual no cambia de color al pasarle encima.
                actual
                  ? "bg-rail-active text-rail-foreground"
                  : "bg-transparent raton:hover:bg-rail-hover raton:hover:text-rail-link-hover",
              )}
              aria-current={actual ? "page" : undefined}
              onClick={() => navigate(label)}
            >
              <Icon size={18} aria-hidden="true" className="max-[430px]:hidden" />
              <span className="flex-1 text-[13px] leading-[1.4] font-medium max-[430px]:text-center max-[430px]:text-[12px]">
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex-none px-3 py-4 max-[820px]:ml-auto max-[820px]:p-0">
        <div className="flex items-center gap-2 border-t border-t-rail-divider pt-3 max-[820px]:border-t-0 max-[820px]:pt-0">
          <div
            className="grid size-[34px] flex-[0_0_34px] place-items-center rounded-sm bg-rail-avatar text-[12px] font-bold text-rail-avatar-foreground"
            aria-hidden="true"
          >
            {inicial}
          </div>
          <div className="flex min-w-0 flex-1 flex-col max-[820px]:hidden">
            <strong title={quien} className="overflow-hidden text-[12px] leading-[1.4] text-ellipsis whitespace-nowrap text-rail-name">
              {quien}
            </strong>
            <small className="mt-[2px] text-[12px] leading-[1.4] text-rail-sub">
              {demo ? "Datos ficticios" : "Sesión activa"}
            </small>
          </div>
          <button
            type="button"
            className={BOTON_RIEL}
            onClick={toggleTheme}
            aria-label={oscuro ? "Activar modo claro" : "Activar modo oscuro"}
          >
            {oscuro ? <Sun size={17} /> : <Moon size={17} />}
          </button>
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
      </div>
    </aside>
  );
}
