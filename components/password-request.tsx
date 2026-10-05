"use client";

import { useEffect, useState, type FormEvent } from 'react';
import { db } from '@/lib/supabase';
import { createPasswordRequest, REQUEST_SENT } from '@/lib/password-request';
import PasswordFrame, { passwordLink } from '@/components/password-frame';
import { Input, Label } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

// Sólo un timestamp, sin correos ni credenciales; también sobrevive navegación completa.
const request = createPasswordRequest(() => db().auth, Date.now, {
  read: () => Number(sessionStorage.getItem('travel-password-retry-at')),
  write: value => sessionStorage.setItem('travel-password-retry-at', String(value)),
});

export default function PasswordRequest() {
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    setBlocked(request.blocked());
    const timer = setInterval(() => setBlocked(request.blocked()), 500);
    return () => clearInterval(timer);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.blocked()) return;
    const email = String(new FormData(event.currentTarget).get('email'));
    setBusy(true); setBlocked(true); setMessage('');
    const result = await request.send(email, window.location.origin);
    if (result) setMessage(result);
    setBusy(false);
    setBlocked(request.blocked());
  }
  return (
    <PasswordFrame title="Recuperar contraseña">
      <form onSubmit={submit} aria-busy={busy} className="grid gap-[15px]">
        <Label>Correo<Input name="email" type="email" autoComplete="username" required autoFocus /></Label>
        <Button type="submit" variant="primary" disabled={blocked}>{busy ? 'Enviando…' : 'Enviar enlace'}</Button>
      </form>
      {message && <p role={message === REQUEST_SENT ? 'status' : 'alert'} className="mt-3 text-[13px] text-foreground-soft">{message}</p>}
      {blocked && !busy && <p className="mt-2 text-[13px] text-muted">Espera un minuto antes de solicitar otro enlace.</p>}
      <a href="/" data-back-login className={passwordLink}>Volver a iniciar sesión</a>
    </PasswordFrame>
  );
}
