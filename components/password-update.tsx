"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { db, recoveryAccess } from '@/lib/supabase';
import { createPasswordUpdate, MIN_PASSWORD_LENGTH, type UpdateResult } from '@/lib/password-recovery';
import PasswordFrame, { passwordLink } from '@/components/password-frame';
import { Input, Label } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

const messages: Partial<Record<UpdateResult, string>> = {
  policy: `Usa al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
  mismatch: 'Las contraseñas no coinciden.',
  invalid: 'El enlace no es válido o ha vencido. Solicita uno nuevo.',
  'update-error': 'No pudimos usar esa contraseña. Elige una distinta y más larga e inténtalo de nuevo.',
  'signout-error': 'La contraseña cambió. No pudimos cerrar la sesión. Reintenta el cierre antes de volver a iniciar sesión.',
};

export default function PasswordUpdate() {
  const status = useSyncExternalStore(recoveryAccess.subscribe, recoveryAccess.snapshot, () => 'checking');
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [update] = useState(() => createPasswordUpdate(() => db().auth, recoveryAccess, () => form.current?.reset()));
  useEffect(() => {
    try { db(); } catch { recoveryAccess.invalidate(); }
    const timer = setInterval(() => {
      if (recoveryAccess.snapshot() === 'ready' && !recoveryAccess.valid()) recoveryAccess.invalidate();
    }, 500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    // Esperar al SDK; también limpiar si rechaza un callback tras una validación lenta.
    // Reemplazar la URL completa sin leer ni extraer parámetros o tokens.
    if (status !== 'checking') history.replaceState(history.state, '', '/actualizar-clave');
  }, [status]);
  function finish(value: UpdateResult) {
    setBusy(false); setResult(value);
    if (value === 'success') window.location.replace('/');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setResult(null);
    finish(await update.submit(String(data.get('new-password')), String(data.get('confirm-password'))));
  }
  async function retrySignOut() {
    if (busy) return;
    setBusy(true);
    finish(await update.retrySignOut());
  }
  return (
    <PasswordFrame title="Actualizar contraseña">
      {status === 'checking' && <p role="status">Comprobando enlace…</p>}
      {status === 'ready' && (
        <form ref={form} onSubmit={submit} aria-busy={busy} className="grid gap-[15px]">
          <Label>Nueva contraseña<Input name="new-password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} aria-describedby="password-policy" autoFocus disabled={busy} /></Label>
          <p id="password-policy" className="text-[13px] text-muted">Al menos {MIN_PASSWORD_LENGTH} caracteres. Usa una contraseña larga y única; el servicio puede exigir mayor seguridad.</p>
          <Label>Confirmar contraseña<Input name="confirm-password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} disabled={busy} /></Label>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Actualizando…' : 'Guardar nueva contraseña'}</Button>
        </form>
      )}
      {status === 'invalid' && <><p role="alert">El enlace no es válido o ha vencido. Solicita uno nuevo.</p><a href="/recuperar-clave" className={passwordLink}>Pedir un nuevo enlace</a></>}
      {result && messages[result] && status !== 'invalid' && <p role="alert" className="mt-3 text-[13px] text-foreground-soft">{messages[result]}</p>}
      {status === 'consumed' && result !== 'signout-error' && <p role="status">Contraseña actualizada. Cerrando sesión…</p>}
      {result === 'signout-error' && <Button data-retry-signout type="button" onClick={retrySignOut} disabled={busy}>Reintentar cierre de sesión</Button>}
      {status !== 'consumed' && <a href="/" data-back-login className={passwordLink}>Volver a iniciar sesión</a>}
    </PasswordFrame>
  );
}
