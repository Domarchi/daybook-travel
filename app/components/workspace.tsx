"use client";

import { X } from "lucide-react";
import AccessState from "@/components/access-state";
import CostsView from "./costs-view";
import DotField from "./dot-field";
import AgendaPanel from "@/components/agenda-panel";
import { LoadingView, LoginView } from "./login-view";
import ModalLayer from "@/components/modal-layer";
import PageHead from "@/components/ui/page-head";
import PeopleView from "./people-view";
import TopBar from "./top-bar";
import TripsView from "./trips-view";
import { useApp } from "../store";

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

        <main className="workspace">
          {demo && (
            <div className="demo-banner">
              <span className="demo-dot" aria-hidden="true" />
              <span>
                Demostración con datos ficticios. Los cambios duran hasta que
                cierres esta sesión.
              </span>
            </div>
          )}

          {notice && (
            <div className="message global-message" role="status">
              <span>{notice}</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Cerrar aviso"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
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
          <footer className="workspace-footer">
            <span>FCC TRAVEL / Copiapó</span>
            <span>Personas · Planificación · Pasajes</span>
          </footer>
        </main>
      </div>

      <ModalLayer />
    </div>
  );
}

