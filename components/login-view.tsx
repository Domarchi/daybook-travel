"use client";

import { FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import BrandBackground from "@/components/brand-background";
import BrandIdentity from "@/components/ui/brand-identity";
import ThemeToggle from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { LoadingMark } from "@/components/ui/dialog-parts";
import { SectionKicker } from "@/components/ui/section-kicker";

// El pie es el mismo de la aplicación, así que las clases son las mismas.
const PIE =
  "mt-9 flex items-center justify-between gap-5 border-t border-line pt-[18px] text-[10px] font-[750] tracking-[0.06em] text-muted uppercase max-[430px]:flex-col max-[430px]:items-start max-[430px]:gap-[5px]";

// Pantalla que se ve mientras la aplicación decide si hay sesión abierta.
// Comparte el fondo estático de la entrada para evitar un cambio visual de fondo.
export function LoadingView() {
  return (
    <main
      className="relative isolate flex min-h-screen items-center justify-center gap-3 text-muted"
      aria-live="polite"
    >
      <BrandBackground />
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
  return (
    <main className="relative isolate grid min-h-screen grid-rows-[auto_1fr_auto] bg-bg px-[clamp(22px,5vw,74px)] pb-[22px] max-[760px]:px-[18px]">
      <BrandBackground />
      <header className="relative z-[1] flex min-h-[92px] items-center justify-between gap-5 border-b border-line py-3">
        <BrandIdentity />
        <div className="flex items-center gap-[14px] text-[10px] font-[750] tracking-[0.09em] text-muted">
          <ThemeToggle theme={theme} onToggle={toggleTheme} compact />
        </div>
      </header>
      <section className="relative z-[1] mx-auto my-10 grid w-[min(100%,430px)] content-center max-[760px]:my-[34px]">
        <div className="rounded-lg border border-line bg-surface p-[clamp(28px,4vw,40px)] shadow-[var(--shadow)] max-[760px]:px-6 max-[760px]:py-7">
          <SectionKicker>Acceso al equipo</SectionKicker>
          <h2 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.035em] text-foreground">
            Entra a tu agenda
          </h2>
          <p className="mt-2 mb-[22px] text-[13px] text-muted">
            Usa el correo habilitado para Daybook Travel.
          </p>
          <form onSubmit={login} aria-busy={busy} className="grid gap-[15px]">
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
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
              />
            </Label>
            <Button disabled={busy} variant="primary" className="mt-[3px]">
              {busy ? "Ingresando…" : "Entrar"}
              {!busy && <ArrowUpRight size={18} />}
            </Button>
          </form>
          {notice && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-[color-mix(in_srgb,var(--danger)_45%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-[11px] text-[13px] text-danger"
            >
              {notice}
            </p>
          )}
          <div className="mt-[22px] mb-[14px] grid gap-[7px] border-t border-line pt-[18px] text-[11px] text-muted">
            <span>¿Quieres conocerla primero?</span>
            <Button
              type="button"
              onClick={enterDemo}
              className="justify-between"
            >
              Abrir demostración <ArrowUpRight size={18} />
            </Button>
          </div>
          <small className="text-muted">
            El responsable de la aplicación debe habilitar tu correo.
          </small>
        </div>
      </section>
      <footer className={"relative z-[1] " + PIE}>
        <span>Daybook Travel</span>
        <span>Coordinación de viajes de obra</span>
      </footer>
    </main>
  );
}
