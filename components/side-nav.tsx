"use client";

import { CalendarDays, Coins, LogOut, Moon, Plane, ShieldCheck, Sun, Users } from "lucide-react";
import BrandLogo from "@/components/ui/brand-logo";
import BrandMark from "@/components/ui/brand-mark";
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
    <aside className="sidebar">
      <div className="sidebar-brand">
        <BrandLogo />
        <BrandMark />
        <span className="sidebar-caption">Traslados · Copiapó</span>
      </div>

      <nav className="side-nav" aria-label="Navegación principal">
        {(isAdmin && !demo ? [...navItems, accesosItem] : navItems).map(({ label, icon: Icon }) => (
          <button
            type="button"
            key={label}
            className={view === label ? "nav-link active" : "nav-link"}
            aria-current={view === label ? "page" : undefined}
            onClick={() => navigate(label)}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-rail">
          <div className="avatar" aria-hidden="true">
            {inicial}
          </div>
          <div className="user-rail-text">
            <strong title={quien}>{quien}</strong>
            <small>{demo ? "Datos ficticios" : "Sesión activa"}</small>
          </div>
          <button
            type="button"
            className="rail-button"
            onClick={toggleTheme}
            aria-label={oscuro ? "Activar modo claro" : "Activar modo oscuro"}
          >
            {oscuro ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button
            type="button"
            className="rail-button"
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
