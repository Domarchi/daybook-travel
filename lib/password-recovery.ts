// Mínimo local de la nueva clave; el login conserva su mínimo existente. La política configurada en RELEVO sigue siendo autoritativa.
export const MIN_PASSWORD_LENGTH = 8;
type Identity = { id: string };
type RecoverySession = { user?: Identity; expires_at?: number };
type RecoveryStatus = 'checking' | 'ready' | 'invalid' | 'consumed';

// Sólo metadatos en memoria. Los tokens y su almacenamiento pertenecen al SDK.
export function createRecoveryAccess(now = Date.now) {
  let status: RecoveryStatus = 'checking';
  let localCallback = false;
  let identity: string | null = null;
  let expiresAt = 0;
  const listeners = new Set<() => void>();
  function set(next: RecoveryStatus) {
    if (status === next) return;
    status = next;
    for (const notify of listeners) notify();
  }
  const invalidate = () => {
    localCallback = false;
    identity = null; expiresAt = 0;
    if (status !== 'consumed') set('invalid');
  };
  return {
    // Sólo el detector de callback del SDK llama esto, antes de su validación.
    beginLocalCallback() { if (status === 'checking') localCallback = true; },
    snapshot: () => status,
    userId: () => identity,
    valid: () => status === 'ready' && expiresAt > now(),
    subscribe(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify); }; },
    finish() { if (status === 'checking') invalidate(); },
    invalidate,
    consume() { localCallback = false; identity = null; expiresAt = 0; set('consumed'); },
    // Síncrono: nunca espera llamadas auth dentro de onAuthStateChange.
    record(event: string, session: RecoverySession | null) {
      if (status === 'consumed' || status === 'invalid') return;
      const liveSession = session?.user?.id && typeof session.expires_at === 'number' &&
        Number.isFinite(session.expires_at) && session.expires_at * 1000 > now();
      if (status === 'ready') {
        // Visibilidad/refresh conservan el grant original, nunca amplían su plazo.
        if (event === 'SIGNED_OUT' || !liveSession || session?.user?.id !== identity || expiresAt <= now()) invalidate();
        return;
      }
      if (event === 'PASSWORD_RECOVERY') {
        if (!localCallback || !liveSession) { invalidate(); return; }
        identity = session!.user!.id;
        expiresAt = session!.expires_at! * 1000;
        set('ready');
      } else if (event === 'SIGNED_OUT') invalidate();
      // INITIAL_SESSION puede anteceder PASSWORD_RECOVERY: mantener checking.
    },
  };
}

export type RecoveryAccess = ReturnType<typeof createRecoveryAccess>;
type UpdateAuth = {
  getUser(): Promise<{ data: { user: Identity | null }; error: unknown }>;
  updateUser(attributes: { password: string }): Promise<{ error: { code?: string } | null }>;
  signOut(options: { scope: 'global' }): Promise<{ error: unknown }>;
};
export type UpdateResult = 'busy' | 'policy' | 'mismatch' | 'invalid' | 'update-error' | 'signout-error' | 'success';

export function createPasswordUpdate(getAuth: () => UpdateAuth, access: RecoveryAccess, clearFields: () => void) {
  let busy = false;
  let changed = false;
  let signedOut = false;
  async function closeSession(): Promise<UpdateResult> {
    try {
      const { error } = await getAuth().signOut({ scope: 'global' });
      if (error) return 'signout-error';
      signedOut = true;
      return 'success';
    } catch { return 'signout-error'; }
  }
  return {
    async submit(password: string, confirmation: string): Promise<UpdateResult> {
      if (busy) return 'busy';
      if (changed || !access.valid()) return 'invalid';
      if (password.length < MIN_PASSWORD_LENGTH) return 'policy';
      if (password !== confirmation) return 'mismatch';
      busy = true;
      try {
        const auth = getAuth();
        const { data, error } = await auth.getUser();
        if (error || !data.user || data.user.id !== access.userId() || !access.valid()) {
          access.invalidate(); return 'invalid';
        }
        const result = await auth.updateUser({ password });
        if (result.error) {
          if (['weak_password', 'same_password'].includes(result.error.code ?? '')) return 'update-error';
          access.invalidate(); return 'invalid';
        }
        changed = true;
        clearFields();
        access.consume();
        return await closeSession();
      } catch {
        access.invalidate();
        return 'invalid';
      } finally { busy = false; }
    },
    async retrySignOut(): Promise<UpdateResult> {
      if (busy) return 'busy';
      if (!changed || signedOut) return 'invalid';
      busy = true;
      try { return await closeSession(); } finally { busy = false; }
    },
  };
}
