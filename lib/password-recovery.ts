// Mínimo del login vigente. La política configurada en RELEVO sigue siendo autoritativa.
export const MIN_PASSWORD_LENGTH = 6;
type Identity = { id: string };
type RecoverySession = { user?: Identity; expires_at?: number };
type RecoveryStatus = 'checking' | 'ready' | 'invalid' | 'consumed';

// Sólo metadatos en memoria. Los tokens y su almacenamiento pertenecen al SDK.
export function createRecoveryAccess(now = Date.now) {
  let status: RecoveryStatus = 'checking';
  let identity: string | null = null;
  let expiresAt = 0;
  const listeners = new Set<() => void>();
  function set(next: RecoveryStatus) {
    if (status === next) return;
    status = next;
    for (const notify of listeners) notify();
  }
  const invalidate = () => {
    identity = null; expiresAt = 0;
    if (status !== 'consumed') set('invalid');
  };
  return {
    snapshot: () => status,
    userId: () => identity,
    valid: () => status === 'ready' && expiresAt > now(),
    subscribe(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify); }; },
    finish() { if (status === 'checking') invalidate(); },
    invalidate,
    consume() { identity = null; expiresAt = 0; set('consumed'); },
    // Síncrono: nunca espera llamadas auth dentro de onAuthStateChange.
    record(event: string, session: RecoverySession | null) {
      if (status === 'consumed') return;
      if (event === 'PASSWORD_RECOVERY') {
        if (!session?.user?.id || !Number.isFinite(session.expires_at) || session.expires_at * 1000 <= now()) {
          invalidate(); return;
        }
        identity = session.user.id;
        expiresAt = session.expires_at * 1000;
        set('ready');
      } else if (['SIGNED_OUT', 'SIGNED_IN', 'TOKEN_REFRESHED'].includes(event)) {
        invalidate();
      }
      // INITIAL_SESSION y USER_UPDATED nunca conceden autorización.
    },
  };
}

export type RecoveryAccess = ReturnType<typeof createRecoveryAccess>;
type UpdateAuth = {
  getUser(): Promise<{ data: { user: Identity | null }; error: unknown }>;
  updateUser(attributes: { password: string }): Promise<{ error: { code?: string } | null }>;
  signOut(options: { scope: 'local' }): Promise<{ error: unknown }>;
};
export type UpdateResult = 'busy' | 'policy' | 'mismatch' | 'invalid' | 'update-error' | 'signout-error' | 'success';

export function createPasswordUpdate(getAuth: () => UpdateAuth, access: RecoveryAccess, clearFields: () => void) {
  let busy = false;
  let changed = false;
  let signedOut = false;
  async function closeSession(): Promise<UpdateResult> {
    try {
      const { error } = await getAuth().signOut({ scope: 'local' });
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
