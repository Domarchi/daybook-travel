"use client";

import { FormEvent, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import BrandIdentity from "@/components/ui/brand-identity";
import BrandMark from "@/components/ui/brand-mark";
import ThemeToggle from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Label } from "@/components/ui/field";
import { LoadingMark } from "@/components/ui/dialog-parts";
import { SectionKicker } from "@/components/ui/section-kicker";

// El pie es el mismo de la aplicación, así que las clases son las mismas.
const PIE =
  "mt-6 flex items-center justify-between gap-5 border-t border-line pt-[18px] max-[760px]:pt-3 text-[10px] font-[750] tracking-[0.06em] text-muted uppercase max-[430px]:mt-4 max-[430px]:flex-col max-[430px]:items-start max-[430px]:gap-[5px]";

// Pantalla que se ve mientras la aplicación decide si hay sesión abierta.
// Comparte el fondo estático de la entrada para evitar un cambio visual de fondo.
export function LoadingView() {
  return (
    <main
      className="relative isolate flex min-h-screen items-center justify-center gap-3 text-muted"
      aria-live="polite"
    >
      <LoadingMark className="relative z-[1]" />
      <p className="relative z-[1]">Cargando Daybook Travel…</p>
    </main>
  );
}

// Pantalla de entrada: acceso con correo y acceso a la demostracion.
//
// Antes tenía dos columnas: a la izquierda un titular grande ("Tu equipo viaja.
// La obra continúa.") con las rutas, y a la derecha el formulario. Se quitó por
// decisión de Joaquín: quien entra aquí ya sabe qué es esto y viene a entrar,
// no a que le expliquen el producto. Queda el formulario solo, centrado, sobre
// el fondo institucional.
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
  // Quien escribe en un celular se equivoca de letra y no lo ve. Es una casilla
  // y no un icono dentro del campo para que `form button` siga siendo el botón
  // de entrar, y para que lectores de pantalla y teclado la usen sin ayuda.
  const [mostrarClave, setMostrarClave] = useState(false);
  return (
    <main className="relative isolate grid min-h-screen grid-rows-[auto_1fr_auto] bg-bg px-[clamp(22px,5vw,74px)] pb-[22px] max-[760px]:px-[18px] max-[760px]:pb-4">
      <header className="relative z-[1] flex min-h-[76px] max-[760px]:min-h-16 items-center justify-between gap-5 border-b border-line py-3">
        <BrandIdentity />
        <div className="flex items-center gap-[14px] text-[10px] font-[750] tracking-[0.09em] text-muted">
          <ThemeToggle theme={theme} onToggle={toggleTheme} compact />
        </div>
      </header>
      <section className="relative z-[1] mx-auto my-5 grid w-[min(100%,430px)] content-center gap-3 max-[760px]:my-2">
        <div
          data-login-card
          className="rounded-lg border border-line bg-surface p-[clamp(24px,3.5vw,34px)] text-center shadow-[var(--shadow)] max-[760px]:px-6 max-[760px]:py-4"
        >
          <BrandMark className="mb-4 inline-block w-14" />
          <SectionKicker className="text-[12px] tracking-[0.08em] text-[color:var(--focus)]">
            Acceso seguro
          </SectionKicker>
          <h1 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.035em] text-foreground">
            Bienvenido a Daybook Travel
          </h1>
          <p className="mt-2 mb-[22px] text-[13px] text-muted max-[760px]:mb-4">
            Usa el mismo correo y contraseña de Daybook Asistencia.
          </p>
          <form onSubmit={login} aria-busy={busy} className="grid gap-[15px] text-left max-[760px]:gap-3">
            <Label>
              Correo
              <Input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="nombre@empresa.cl"
              />
            </Label>
            <Label>
              Contraseña
              <Input
                name="password"
                type={mostrarClave ? "text" : "password"}
                autoComplete="current-password"
                required
                minLength={6}
              />
            </Label>
            <Label className="min-h-11 grid-cols-[18px_1fr] items-center gap-[10px] font-normal">
              <Checkbox
                data-show-password
                checked={mostrarClave}
                onChange={(evento) => setMostrarClave(evento.target.checked)}
              />
              Mostrar contraseña
            </Label>
            <Button
              type="submit"
              disabled={busy}
              variant="primary"
              className="mt-[3px] w-full justify-between"
            >
              {busy ? "Ingresando…" : "Entrar"}
              {!busy && <ArrowUpRight size={18} />}
            </Button>
          </form>
          <a href="/recuperar-clave" data-recovery-action className="flex min-h-11 items-center justify-center text-[13px] text-foreground-soft underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
            ¿Olvidaste tu contraseña?
          </a>
          {notice && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-[color-mix(in_srgb,var(--danger)_45%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-[11px] text-[13px] text-danger"
            >
              {notice}
            </p>
          )}
          <small className="block text-muted">
            El responsable de la aplicación debe habilitar tu correo.
          </small>
        </div>
        <Button
          data-demo-action
          type="button"
          onClick={enterDemo}
          className="w-full justify-between"
        >
          Abrir demostración <ArrowUpRight size={18} />
        </Button>
      </section>
      <footer className={"relative z-[1] " + PIE}>
        <span>Daybook Travel</span>
        <span>Coordinación de viajes de obra</span>
      </footer>
    </main>
  );
}
