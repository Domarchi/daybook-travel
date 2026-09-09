"use client";

import { X } from "lucide-react";
import AccessState from "./access-state";
import AgendaPanel from "./agenda-panel";
import { LoadingView, LoginView } from "./login-view";
import ModalLayer from "./modal-layer";
import PageHead from "./page-head";
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

