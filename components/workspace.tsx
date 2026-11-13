"use client";

import { ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import AccessState from "@/components/access-state";
import CostsView from "@/components/costs-view";
import AgendaPanel from "@/components/agenda-panel";
import { LoadingView, LoginView } from "@/components/login-view";
import MembersView from "@/components/members-view";
import ModalLayer from "@/components/modal-layer";
import PageHead from "@/components/ui/page-head";
import PeopleView from "@/components/people-view";
import SideNav from "@/components/side-nav";
import TripsView from "@/components/trips-view";
import { useApp } from "../app/store";

// Workspace es el armazon: decide que pantalla se ve y ordena las piezas.
// Cada pieza pide su estado a useApp(); aqui no se pasan props.

export default function Workspace() {
  const {
    theme,
    ready,
    email,
    demo,
    accessStatus,
    isAdmin,
    people,
    trips,
    view,
    modal,
    notice,
    setNotice,
    busy,
    toggleTheme,
    login,
    enterDemo,
  } = useApp();

  if (!ready) {
    return <LoadingView />;
  }

  if (!email && !demo) {
    return (
      <LoginView
        theme={theme}
        toggleTheme={toggleTheme}
        login={login}
        busy={busy}
        notice={notice}
        enterDemo={enterDemo}
      />
    );
  }

  return (
    <div className="shell">
      <div
        className="app-content ml-[var(--db-rail-width)] max-[820px]:ml-0"
        inert={modal ? true : undefined}
        aria-hidden={modal ? true : undefined}
      >
        <SideNav />

        {/* La cabecera fija de la familia Daybook (64 px, negra en oscuro), con
            el lugar donde uno está. En el teléfono el riel ya es la barra de
            arriba, así que no se repite. */}
        <header className="sticky top-0 z-20 flex h-[var(--db-topbar-height)] items-center border-b border-line bg-[color-mix(in_srgb,var(--bg)_91%,transparent)] px-[max(var(--db-content-gutter),calc((100%_-_var(--db-content-max))/2_+_var(--db-content-gutter)))] backdrop-blur-[18px] max-[820px]:hidden">
          <nav aria-label="Ubicación" className="flex min-w-0 items-center gap-2 text-meta">
            <span className="text-muted">Traslados · Copiapó</span>
            <ChevronRight size={14} aria-hidden="true" className="flex-none text-muted" />
            <span aria-current="page" className="truncate font-semibold text-foreground">{view}</span>
          </nav>
        </header>

        {/* Contenido con el tope y el margen de la familia: 1360 px y 32 px. */}
        <main className="mx-auto min-h-screen w-[min(100%,calc(var(--db-content-max)_+_2_*_var(--db-content-gutter)))] px-[var(--db-content-gutter)] pt-7 pb-6 max-[820px]:pt-[22px] max-[760px]:px-4">
          {demo && (
            <div className="mb-4 border-l-2 border-line-strong pl-3 text-meta text-foreground-soft">
              <span>
                Demostración con datos ficticios. Los cambios duran hasta que
                cierres esta sesión.
              </span>
            </div>
          )}

          {notice && (
            <div
              className="mb-[22px] flex min-h-12 translate-y-0 items-center justify-between gap-4 rounded-md border border-[color-mix(in_srgb,var(--success)_35%,var(--border))] bg-surface py-[7px] pr-2 pl-[14px] text-meta text-foreground-soft opacity-100 transition-[opacity,transform] duration-[220ms] ease-[var(--ease-out)] starting:-translate-y-[6px] starting:opacity-0"
              role="status"
            >
              <span>{notice}</span>
              <Button
                type="button"
                variant="icon"
                aria-label="Cerrar aviso"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </Button>
            </div>
          )}

          {accessStatus !== "allowed" && !demo ? (
            <AccessState />
          ) : (
            <>
              <PageHead />

              {view === "Agenda" ? (
                <AgendaPanel />
              ) : view === "Personas" ? (
                <PeopleView />
              ) : view === "Costos" ? (
                <CostsView />
              ) : view === "Accesos" && isAdmin ? (
                <MembersView />
              ) : (
                <TripsView />
              )}
            </>
          )}
          <footer className="mt-9 flex items-center justify-between gap-5 border-t border-line pt-[18px] text-overline font-bold tracking-[0.06em] text-muted uppercase max-[430px]:flex-col max-[430px]:items-start max-[430px]:gap-[5px]">
            <span>Daybook Travel / Copiapó</span>
            <span>Personas · Planificación · Pasajes</span>
          </footer>
        </main>
      </div>

      <ModalLayer />
    </div>
  );
}
