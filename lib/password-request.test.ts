import test from 'node:test';
import assert from 'node:assert/strict';
import { createPasswordRequest, REQUEST_SENT, REQUEST_ERROR } from './password-request.ts';

test('solicita callback exacto desde cada origen conservando correo como login', async () => {
  for (const origin of ['https://relevo-chi.vercel.app','http://localhost:3000','https://preview.example.invalid']) {
    let call;
    const request = createPasswordRequest(() => ({ resetPasswordForEmail: async (...args) => {call=args; return {error:null};} }));
    assert.equal(await request.send('Synthetic.Mixed@example.invalid',origin),REQUEST_SENT);
    assert.deepEqual(call,['Synthetic.Mixed@example.invalid',{redirectTo:origin+'/actualizar-clave'}]);
  }
});
test('respuesta idéntica para cuenta existente o ausente; errores privados genéricos', async () => {
  for (const error of [null,{code:'user_not_found',message:'private',status:404},{message:'private',status:429}]) {
    const request=createPasswordRequest(()=>({resetPasswordForEmail:async()=>({error})}));
    assert.equal(await request.send('synthetic@example.invalid','https://example.invalid'),error && error.code !== 'user_not_found' ? REQUEST_ERROR : REQUEST_SENT);
  }
  for (const getAuth of [()=>{throw new Error('private config')},()=>({resetPasswordForEmail:async()=>{throw new Error('private network')}})]) {
    assert.equal(await createPasswordRequest(getAuth).send('synthetic@example.invalid','https://example.invalid'),REQUEST_ERROR);
  }
});
test('bloquea doble envío y enfriamiento incluso si hay error; permite reintento después', async () => {
  let now=1000,calls=0,resolve;
  const request=createPasswordRequest(()=>({resetPasswordForEmail:()=>{calls++;return new Promise(r=>{resolve=r})}}),()=>now);
  const first=request.send('synthetic@example.invalid','https://example.invalid');
  assert.equal(request.blocked(),true);
  assert.equal(await request.send('synthetic@example.invalid','https://example.invalid'),null);
  resolve({error:{status:429}}); await first;
  assert.equal(await request.send('synthetic@example.invalid','https://example.invalid'),null);
  assert.equal(calls,1);
  now+=60001;
  assert.equal(request.blocked(),false);
  const second=request.send('synthetic@example.invalid','https://example.invalid');resolve({error:null});await second;
  assert.equal(calls,2);
});
test('el enfriamiento sobrevive remontaje/navegación con sólo un timestamp', async () => {
  let saved=0,calls=0;
  const store={read:()=>saved,write:(value:number)=>{saved=value}};
  const auth=()=>({resetPasswordForEmail:async()=>{calls++;return {error:null}}});
  await createPasswordRequest(auth,()=>1000,store).send('synthetic@example.invalid','https://example.invalid');
  const remounted=createPasswordRequest(auth,()=>1100,store);
  assert.equal(remounted.blocked(),true);
  assert.equal(await remounted.send('synthetic@example.invalid','https://example.invalid'),null);
  assert.equal(calls,1);assert.equal(saved,61000);
});
