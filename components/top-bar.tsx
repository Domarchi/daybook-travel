"use client";

import { CalendarDays, Coins, LogOut, Plane, Users } from "lucide-react";
import ThemeToggle from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApp } from "../app/store";
import { db } from "../lib/supabase";

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
    <header className="sticky top-0 z-30 grid min-h-[70px] grid-cols-[minmax(185px,1fr)_auto_minmax(185px,1fr)] items-center gap-6 border-b border-line bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-[clamp(18px,3vw,44px)] py-[10px] backdrop-blur-[18px] max-[1120px]:grid-cols-[auto_1fr_auto] max-[820px]:grid-cols-[1fr_auto] max-[820px]:gap-x-[14px] max-[820px]:gap-y-2 max-[820px]:px-4 max-[820px]:py-2">
      <div className="flex items-center gap-3">
        <span className="text-[17px] font-[850] tracking-[-0.02em] whitespace-nowrap text-foreground">
          FCC TRAVEL
        </span>
        <span className="inline-flex min-h-7 items-center border-l border-line-strong pl-3 text-[12px] font-bold text-muted">
          Copiapó
        </span>
      </div>
      <nav
        aria-label="Navegación principal"
        className="flex gap-1 rounded-[11px] border border-line bg-surface p-1 max-[820px]:col-span-full max-[820px]:row-start-2 max-[820px]:w-full"
      >
        {navItems.map(({ label, icon: Icon }) => (
          <Button
            type="button"
            key={label}
            className={cn(
              "min-h-11 px-[15px] max-[820px]:flex-1 max-[430px]:px-2 max-[430px]:text-[12px] max-[430px]:[&_svg]:hidden",
              view === label
                ? "border-line bg-surface-soft text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                : "border-transparent bg-transparent text-muted",
            )}
            aria-current={view === label ? "page" : undefined}
            onClick={() => navigate(label)}
          >
            <Icon size={17} />
            <span>{label}</span>
          </Button>
        ))}
      </nav>
      <div className="flex min-w-0 items-center justify-end gap-2">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <span className="max-w-[180px] overflow-hidden text-[12px] text-ellipsis whitespace-nowrap text-muted">
          {demo ? "Demostración" : email}
        </span>
        <Button
          type="button"
          variant="icon"
          aria-label={demo ? "Salir de la demostración" : "Cerrar sesión"}
          onClick={async () => {
            if (!demo) await db().auth.signOut();
            setDemo(false);
            setAccessStatus("checking");
            setPeople([]);
            setTrips([]);
          }}
        >
          <LogOut size={18} />
        </Button>
      </div>
    </header>
  );
}
