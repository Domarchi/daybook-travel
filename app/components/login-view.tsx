"use client";

import { FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import ThemeToggle from "./theme-toggle";

// Pantalla que se ve mientras la aplicación decide si hay sesión abierta.
export function LoadingView() {
  return (
    <main className="login-state" aria-live="polite">
      <span className="loading-mark" aria-hidden="true" />
      <p>Cargando FCC TRAVEL…</p>
    </main>
  );
}

// Pantalla de entrada: acceso con correo y acceso a la demostracion.
// Todo lo que antes leia del ambito de App() entra ahora por props, con los
// mismos nombres, para que el JSX quede igual.
export function LoginView({
  theme,
  toggleTheme,
  login,
  busy,
  notice,
  enterDemo,
}: {
  theme: string;
  toggleTheme: () => void;
  login: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  notice: string;
  enterDemo: () => void;
}) {
  return (
    <main className="entry">
      <header className="entry-top">
        <span className="brand">FCC TRAVEL</span>
        <div className="entry-tools">
          <span>FCC / COPIAPÓ</span>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>
      <section className="entry-center">
        <div className="entry-heading">
          <p className="eyebrow">COORDINACIÓN DE VIAJES</p>
          <h1>
            Tu equipo viaja.
            <br />
            La obra continúa.
          </h1>
          <p className="entry-copy">
            Personas, turnos y pasajes organizados en una sola agenda para
            Copiapó.
          </p>
          <div
            className="entry-route"
            role="group"
            aria-label="Rutas habituales"
          >
            <span>Santiago</span>
            <ArrowUpRight size={17} />
            <strong>Copiapó</strong>
            <ArrowDownLeft size={17} />
            <span>Concepción</span>
          </div>
        </div>
        <div className="entry-form">
          <span className="section-kicker">Acceso al equipo</span>
          <h2>Entra a tu agenda</h2>
          <p>Usa el correo habilitado para FCC TRAVEL.</p>
          <form onSubmit={login} aria-busy={busy}>
            <label>
              Correo
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="nombre@empresa.cl"
              />
            </label>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
              />
            </label>
            <button disabled={busy} className="primary">
              {busy ? "Ingresando…" : "Entrar"}
              {!busy && <ArrowUpRight size={18} />}
            </button>
          </form>
          {notice && (
            <p role="alert" className="message error-message">
              {notice}
            </p>
          )}
          <div className="try-demo">
            <span>¿Quieres conocerla primero?</span>
            <button type="button" onClick={enterDemo}>
              Abrir demostración <ArrowUpRight size={18} />
            </button>
          </div>
          <small>
            El responsable de la aplicación debe habilitar tu correo.
          </small>
        </div>
      </section>
      <footer className="entry-footer">
        <span>FCC TRAVEL</span>
        <span>Coordinación de viajes de obra</span>
      </footer>
    </main>
  );
}
