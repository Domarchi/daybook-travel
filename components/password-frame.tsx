"use client";

import { useEffect, useState, type ReactNode } from 'react';
import BrandIdentity from '@/components/ui/brand-identity';
import BrandMark from '@/components/ui/brand-mark';
import ThemeToggle from '@/components/ui/theme-toggle';

export const passwordLink = 'inline-flex min-h-11 items-center text-[13px] text-foreground-soft underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]';

export default function PasswordFrame({ title, children }: { title: string; children: ReactNode }) {
  const [theme, setTheme] = useState('dark');
  useEffect(() => { setTheme(document.documentElement.dataset.theme ?? 'dark'); }, []);
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('daybook-travel-theme', next); } catch {}
  }
  return (
    <main className="relative isolate grid min-h-screen grid-rows-[auto_1fr_auto] bg-bg px-[clamp(22px,5vw,74px)] pb-[22px] max-[760px]:px-[18px]">
      <header className="relative z-[1] flex min-h-[92px] items-center justify-between gap-5 border-b border-line py-3">
        <BrandIdentity />
        <ThemeToggle theme={theme} onToggle={toggleTheme} compact />
      </header>
      <section className="relative z-[1] mx-auto my-8 grid w-[min(100%,430px)] content-center max-[760px]:my-4">
        <div className="rounded-lg border border-line bg-surface p-[clamp(28px,4vw,40px)] shadow-[var(--shadow)] max-[760px]:p-6">
          <BrandMark className="mb-4 inline-block w-14" />
          <h1 tabIndex={-1} className="text-[28px] leading-[1.15] font-semibold tracking-[-0.035em] text-foreground">{title}</h1>
          <p className="mt-2 mb-[22px] text-[13px] text-muted">La nueva contraseña también se usará en Daybook Asistencia. Recuperar tu cuenta no cambia tus permisos de acceso.</p>
          {children}
        </div>
      </section>
      <footer className="relative z-[1] border-t border-line pt-[18px] text-[10px] font-[750] tracking-[0.06em] text-muted uppercase">Daybook Travel · Coordinación de viajes de obra</footer>
    </main>
  );
}
