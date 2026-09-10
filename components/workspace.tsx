"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import AccessState from "@/components/access-state";
import CostsView from "@/components/costs-view";
import DotField from "@/components/dot-field";
import AgendaPanel from "@/components/agenda-panel";
import { LoadingView, LoginView } from "@/components/login-view";
import ModalLayer from "@/components/modal-layer";
import PageHead from "@/components/ui/page-head";
import PeopleView from "@/components/people-view";
import TopBar from "@/components/top-bar";
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
    return <LoadingView theme={theme} />;
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
      {/* La misma textura de la entrada, quieta y apagada. La fuerza la decide
          el CSS, distinta en cada tema, porque aquí hay texto encima y el
          fondo no puede comerle contraste. */}
      <DotField theme={theme} estatico />
      <div
        className="app-content"
        inert={modal ? true : undefined}
        aria-hidden={modal ? true : undefined}
      >
        <TopBar />

        <main className="mx-auto min-h-[calc(100vh-70px)] w-[min(100%,1480px)] px-[clamp(18px,3vw,44px)] pt-7 pb-6 max-[820px]:pt-[22px] max-[760px]:px-[14px]">
          {demo && (
            <div className="mb-[22px] flex min-h-[42px] items-center gap-[10px] rounded-md border border-line bg-surface px-[13px] py-2 text-[12px] text-foreground-soft">
              <span
                className="size-[7px] shrink-0 rounded-[999px] bg-success shadow-[0_0_0_4px_color-mix(in_srgb,var(--success)_16%,transparent)]"
                aria-hidden="true"
              />
              <span>
                Demostración con datos ficticios. Los cambios duran hasta que
                cierres esta sesión.
              </span>
            </div>
          )}

          {notice && (
            <div
              className="mb-[22px] flex min-h-12 translate-y-0 items-center justify-between gap-4 rounded-md border border-[color-mix(in_srgb,var(--success)_35%,var(--border))] bg-surface py-[7px] pr-2 pl-[14px] text-[13px] text-foreground-soft opacity-100 transition-[opacity,transform] duration-[220ms] ease-[var(--ease-out)] starting:-translate-y-[6px] starting:opacity-0"
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
              ) : (
                <TripsView />
              )}
            </>
          )}
          <footer className="mt-9 flex items-center justify-between gap-5 border-t border-line pt-[18px] text-[10px] font-[750] tracking-[0.06em] text-muted uppercase max-[430px]:flex-col max-[430px]:items-start max-[430px]:gap-[5px]">
            <span>FCC TRAVEL / Copiapó</span>
            <span>Personas · Planificación · Pasajes</span>
          </footer>
        </main>
      </div>

      <ModalLayer />
    </div>
  );
}

