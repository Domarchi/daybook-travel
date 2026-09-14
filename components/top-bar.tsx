"use client";

import { CalendarDays, Coins, LogOut, Plane, Users } from "lucide-react";
import ThemeToggle from "@/components/ui/theme-toggle";
import BrandIdentity from "@/components/ui/brand-identity";
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
    <header className="sticky top-0 z-30 grid min-h-[84px] grid-cols-[minmax(185px,1fr)_auto_minmax(185px,1fr)] items-center gap-6 border-b border-line bg-bg px-[clamp(18px,3vw,44px)] py-3 max-[1120px]:grid-cols-[auto_1fr_auto] max-[820px]:grid-cols-[1fr_auto] max-[820px]:gap-x-[14px] max-[820px]:gap-y-2 max-[820px]:px-4 max-[820px]:py-3">
      <BrandIdentity />
      <nav
        aria-label="Navegación principal"
        className="flex gap-1 max-[820px]:col-span-full max-[820px]:row-start-2 max-[820px]:w-full"
      >
        {navItems.map(({ label, icon: Icon }) => (
          <Button
            type="button"
            key={label}
            className={cn(
              "min-h-11 rounded-md px-[15px] font-medium active:scale-100 max-[820px]:flex-1 max-[430px]:px-2 max-[430px]:text-[12px] max-[430px]:[&_svg]:hidden",
              view === label
                ? "border-line bg-surface-soft text-foreground"
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
        <ThemeToggle theme={theme} onToggle={toggleTheme} compact />
        <span className="max-w-[180px] overflow-hidden text-[12px] text-ellipsis whitespace-nowrap text-muted max-[760px]:hidden">
          {demo ? "Demostración" : email}
        </span>
        <Button
          type="button"
          variant="icon"
          className="border-transparent bg-transparent"
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
