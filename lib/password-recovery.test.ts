import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRecoveryAccess, createPasswordUpdate, MIN_PASSWORD_LENGTH } from './password-recovery.ts';

function localAccess(now = Date.now) {
  const access = createRecoveryAccess(now);
  // El SDK debe confirmar que está procesando un callback en este documento.
  access.beginLocalCallback();
  return access;
}
const user = { id: randomUUID() };
const session = () => ({ user, expires_at: Date.now()/1000 + 3600 });
const password = () => randomUUID();
function fixture() {
  const access=localAccess(); access.record('PASSWORD_RECOVERY',session());
  const calls={verify:0,update:0,logout:0,clear:0};
  const auth={
    getUser:async()=>{calls.verify++;return {data:{user},error:null}},
    updateUser:async()=>{calls.update++;return {error:null}},
    signOut:async()=>{calls.logout++;return {error:null}},
  };
  const update=createPasswordUpdate(()=>auth,access,()=>{calls.clear++});
  return {access,calls,auth,update};
}
test('solo PASSWORD_RECOVERY con usuario y vencimiento válidos autoriza', () => {
  for(const event of ['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED']) {
    const access=localAccess(); access.record(event,session());access.finish();assert.equal(access.valid(),false);
  }
  for(const bad of [null,{}, {user}, {user,expires_at:0},{user,expires_at:NaN},{user:{},expires_at:Date.now()/1000+3600}]) {
    const access=localAccess();access.record('PASSWORD_RECOVERY',bad as never);assert.equal(access.valid(),false);
  }
  const access=localAccess();access.record('PASSWORD_RECOVERY',session());assert.equal(access.valid(),true);
});
test('evento anterior al montaje se conserva; INITIAL_SESSION no promueve ni borra recovery', () => {
  const access=localAccess();access.record('PASSWORD_RECOVERY',session());access.record('INITIAL_SESSION',session());access.finish();
  assert.equal(access.snapshot(),'ready');let updates=0;const stop=access.subscribe(()=>updates++);
  access.record('SIGNED_OUT',null);assert.equal(access.valid(),false);assert.equal(updates,1);stop();
});
test('visibilidad conserva sólo el grant local original sin extender su vencimiento', () => {
  let now = 1000;
  const access = localAccess(() => now);
  access.record('INITIAL_SESSION', {user, expires_at: 2});
  assert.equal(access.snapshot(), 'checking');
  access.record('PASSWORD_RECOVERY', {user, expires_at: 2});
  for (const event of ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'INITIAL_SESSION']) {
    access.record(event, {user, expires_at: 100});
    assert.equal(access.valid(), true, event);
  }
  now = 2001;
  assert.equal(access.valid(), false);
  access.record('PASSWORD_RECOVERY', session());
  assert.equal(access.valid(), false, 'expiración no rearma');
});
test('broadcast sin callback local, otra identidad, signout y consumo nunca rearman', () => {
  const foreign = createRecoveryAccess();
  foreign.record('PASSWORD_RECOVERY', session());
  assert.equal(foreign.valid(), false, 'broadcast sin callback');
  for (const event of ['SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED','INITIAL_SESSION','PASSWORD_RECOVERY','SIGNED_OUT']) {
    const access = localAccess();
    access.record('PASSWORD_RECOVERY', session());
    access.record(event, {...session(), user: {id: randomUUID()}});
    assert.equal(access.valid(), false, event);
    access.record('PASSWORD_RECOVERY', session());
    assert.equal(access.valid(), false, 'revocación definitiva');
  }
  const consumed = localAccess();
  consumed.record('PASSWORD_RECOVERY', session()); consumed.consume();
  consumed.record('PASSWORD_RECOVERY', session());
  assert.equal(consumed.valid(), false);
});
test('validación bloquea llamadas auth y no modifica contraseña', async () => {
  const {access,calls,update}=fixture();const value=password();
  assert.equal(await update.submit(value,value+'x'),'mismatch');
  const short=password().slice(0,MIN_PASSWORD_LENGTH-1);
  assert.equal(await update.submit(short,short),'policy');
  access.invalidate();assert.equal(await update.submit(value,value),'invalid');
  assert.deepEqual(calls,{verify:0,update:0,logout:0,clear:0});
});
test('revalida identidad con proveedor; error, ausencia o cambio de usuario impide update', async () => {
  for(const result of [{data:{user:null},error:{}},{data:{user:{id:randomUUID()}},error:null}]) {
    const {auth,calls,update}=fixture();auth.getUser=async()=>result as never;const value=password();
    assert.equal(await update.submit(value,value),'invalid');assert.equal(calls.update,0);
  }
});
test('éxito limpia ambas claves antes de signOut, consume recovery y bloquea segundo update', async () => {
  const {auth,calls,update,access}=fixture();const value=password();
  auth.signOut=async()=>{assert.equal(calls.clear,1);assert.equal(access.valid(),false);calls.logout++;return {error:null}};
  assert.equal(await update.submit(value,value),'success');
  assert.equal(await update.submit(value,value),'invalid');
  assert.deepEqual(calls,{verify:1,update:1,logout:1,clear:1});
});
test('una actualización en vuelo, incluso antes de terminar verificación', {timeout: 1000}, async () => {
  const {auth,calls,update}=fixture();
  const releases: Array<(value: {data: {user: typeof user}; error: null}) => void> = [];
  auth.getUser=()=>{calls.verify++;return new Promise(resolve=>releases.push(resolve))};
  const value=password();
  const first=update.submit(value,value);
  const second=update.submit(value,value);
  try {
    assert.equal(calls.verify,1,'segunda actualización no inicia otra verificación');
    assert.equal(await second,'busy');
  } finally {
    for (const release of releases) release({data:{user},error:null});
    await Promise.all([first,second]);
  }
  assert.equal(calls.update,1);
});
test('error update no limpia ni cierra sesión; rechazo de sesión invalida acceso', async () => {
  for(const code of ['weak_password','same_password','session_not_found']) {
    const {auth,calls,access,update}=fixture();auth.updateUser=async()=>({error:{code,message:'private'}} as never);const value=password();
    assert.equal(await update.submit(value,value),code==='session_not_found'?'invalid':'update-error');
    assert.equal(calls.clear,0);assert.equal(calls.logout,0);assert.equal(access.valid(),code!=='session_not_found');
  }
});
test('signOut fallido nunca anuncia éxito; reintento cierra sin volver a actualizar', async () => {
  const {auth,calls,update}=fixture();const value=password();
  auth.signOut=async()=>({error:{message:'private'}} as never);
  assert.equal(await update.submit(value,value),'signout-error');assert.equal(calls.clear,1);
  auth.signOut=async()=>{calls.logout++;return {error:null}};
  assert.equal(await update.retrySignOut(),'success');assert.equal(calls.update,1);assert.equal(calls.logout,1);
});
test('excepciones de transporte/config son resultados genéricos', async () => {
  const {auth,update}=fixture();const value=password();auth.getUser=async()=>{throw new Error('private')};
  assert.equal(await update.submit(value,value),'invalid');
});

test('nueva clave exige ocho caracteres y cierre global también al reintentar', async () => {
  const {auth, calls, update} = fixture();
  const short = password().slice(0, 7);
  assert.equal(await update.submit(short, short), 'policy');
  assert.equal(calls.verify, 0);
  const scopes: string[] = [];
  auth.signOut = async (options?: {scope: string}) => {
    scopes.push(options!.scope);
    return {error: scopes.length === 1 ? {} : null} as never;
  };
  const value = password().slice(0, 8);
  assert.equal(await update.submit(value, value), 'signout-error');
  assert.equal(await update.retrySignOut(), 'success');
  assert.deepEqual(scopes, ['global', 'global']);
  assert.equal(calls.update, 1);
});
test('expiración o revocación mientras getUser espera impide update', {timeout: 1000}, async () => {
  for (const revoke of ['expiry', 'signout', 'identity']) {
    let now = 1000;
    const access = localAccess(() => now);
    access.record('PASSWORD_RECOVERY', {user, expires_at: 2});
    let updates = 0;
    const update = createPasswordUpdate(() => ({
      getUser: async () => {
        if (revoke === 'expiry') now = 2001;
        else access.record(revoke === 'signout' ? 'SIGNED_OUT' : 'SIGNED_IN', {...session(), user: {id: randomUUID()}});
        return {data: {user}, error: null};
      },
      updateUser: async () => { updates++; return {error: null}; },
      signOut: async () => ({error: null}),
    }), access, () => {});
    const value = password();
    assert.equal(await update.submit(value, value), 'invalid');
    assert.equal(updates, 0);
  }
});
