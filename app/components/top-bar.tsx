"use client";

import { CalendarDays, Coins, LogOut, Plane, Users } from "lucide-react";
import ThemeToggle from "./theme-toggle";
import { useApp } from "../store";
import { db } from "../../lib/supabase";

const navItems = [
  { label: "Agenda", icon: CalendarDays },
  { label: "Personas", icon: Users },
  { label: "Viajes", icon: Plane },
  { label: "Costos", icon: Coins },
];

export default function TopBar() {
  const {
    view,
    navigate,
    theme,
    toggleTheme,
    demo,
    email,
    setDemo,
    setAccessStatus,
    setPeople,
    setTrips,
  } = useApp();

  return (
    <header className="topbar">
      <div className="brand-block">
        <span className="brand">FCC TRAVEL</span>
        <span className="worksite">Copiapó</span>
      </div>
      <nav aria-label="Navegación principal">
        {navItems.map(({ label, icon: Icon }) => (
          <button
            type="button"
            key={label}
            className={view === label ? "selected" : ""}
            aria-current={view === label ? "page" : undefined}
            onClick={() => navigate(label)}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="account">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <span className="account-name">
          {demo ? "Demostración" : email}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={demo ? "Salir de la demostración" : "Cerrar sesión"}
          onClick={async () => {
            if (!demo) await db.auth.signOut();
            setDemo(false);
            setAccessStatus("checking");
            setPeople([]);
            setTrips([]);
          }}
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
