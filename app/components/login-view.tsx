"use client";

import { FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import DotField from "./dot-field";
import ThemeToggle from "./theme-toggle";

// Pantalla que se ve mientras la aplicación decide si hay sesión abierta.
// Lleva el mismo campo de puntos que la entrada, quieto: dura un instante y
// arrancar una animación para eso sería un parpadeo, no un detalle.
export function LoadingView({ theme = "dark" }: { theme?: string }) {
  return (
    <main className="login-state" aria-live="polite">
      <DotField theme={theme} estatico intensidad={0.55} />
      <span className="loading-mark" aria-hidden="true" />
      <p>Cargando FCC TRAVEL…</p>
    </main>
  );
}

// Pantalla de entrada: acceso con correo y acceso a la demostracion.
//
// Antes tenía dos columnas: a la izquierda un titular grande ("Tu equipo viaja.
// La obra continúa.") con las rutas, y a la derecha el formulario. Se quitó por
// decisión de Joaquín: quien entra aquí ya sabe qué es esto y viene a entrar,
// no a que le expliquen el producto. Queda el formulario solo, centrado, sobre
// el fondo de puntos.
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
      <DotField theme={theme} />
      <header className="entry-top">
        <span className="brand">FCC TRAVEL</span>
        <div className="entry-tools">
          <span>FCC / COPIAPÓ</span>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>
      <section className="entry-center">
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
