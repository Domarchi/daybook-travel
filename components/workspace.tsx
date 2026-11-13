"use client";

import { Check, ChevronRight, Menu, TriangleAlert, X } from "lucide-react";
import BrandMark from "@/components/ui/brand-mark";
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
import { cn } from "@/lib/utils";

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
    menuAbierto,
    setMenuAbierto,
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
        notice={notice?.mensaje ?? ""}
        enterDemo={enterDemo}
      />
    );
  }

  return (
    <div className="shell">
      <div
        className="app-content ml-[var(--db-rail-width)] max-[1025px]:ml-[var(--db-rail-width-compact)] max-[820px]:ml-0"
        inert={modal ? true : undefined}
        aria-hidden={modal ? true : undefined}
      >
        <SideNav />
        {/* El velo detrás del menú del teléfono: tocarlo lo cierra. */}
        {menuAbierto && (
          <div
            className="fixed inset-0 z-40 bg-black/50 min-[821px]:hidden"
            aria-hidden="true"
            onClick={() => setMenuAbierto(false)}
          />
        )}

        {/* La cabecera fija de la familia Daybook (64 px, negra en oscuro), con
            el lugar donde uno está. En el teléfono lleva además el botón ☰ que
            abre el riel como cajón, y el símbolo. */}
        <header className="sticky top-0 z-20 flex h-[var(--db-topbar-height)] items-center gap-3 border-b border-line bg-[color-mix(in_srgb,var(--bg)_91%,transparent)] px-[max(var(--db-content-gutter),calc((100%_-_var(--db-content-max))/2_+_var(--db-content-gutter)))] backdrop-blur-[18px] max-[760px]:px-4">
          <Button
            id="boton-menu"
            type="button"
            variant="icon"
            className="min-[821px]:hidden"
            aria-label="Abrir menú"
            aria-controls="menu-principal"
            aria-expanded={menuAbierto}
            onClick={() => setMenuAbierto(true)}
          >
            <Menu size={20} />
          </Button>
          <BrandMark className="max-[820px]:block max-[820px]:w-8" />
          <nav aria-label="Ubicación" className="flex min-w-0 items-center gap-2 text-meta">
            <span className="text-muted max-[820px]:hidden">Traslados · Copiapó</span>
            <ChevronRight size={14} aria-hidden="true" className="flex-none text-muted max-[820px]:hidden" />
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

      {/* El aviso tras una acción (Fase 5): flota abajo al centro del contenido,
          como en Parte Diario y Ticket. Va fuera de `.app-content`, que queda
          `inert` con un diálogo abierto, y dentro de una región viva que ya
          estaba montada, para que el lector de pantalla lo anuncie. El número
          del aviso en la `key` hace que uno repetido se vuelva a anunciar. */}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        {notice && (
          <div className={cn("toast", notice.tono === "error" && "error")} key={notice.id}>
            <span aria-hidden="true">
              {notice.tono === "error" ? <TriangleAlert size={18} /> : <Check size={18} />}
            </span>
            {notice.mensaje}
            {notice.deshacer && (
              <button
                type="button"
                className="toast-undo"
                onClick={() => {
                  const deshacer = notice.deshacer;
                  setNotice(null);
                  deshacer?.();
                }}
              >
                Deshacer
              </button>
            )}
            {notice.tono === "error" && (
              <button type="button" className="toast-close" aria-label="Cerrar aviso" onClick={() => setNotice(null)}>
                <X size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      <ModalLayer />
    </div>
  );
}
