// Solo lo ejecuta el supervisor. SDK real; interceptación exclusivamente en la frontera HTTP.
import assert from 'node:assert/strict';
import { assertCompilationIssues } from '../lib/mcp-compilation.ts';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Cdp, openTarget, waitUntil, delay, teardown, startBrowser, pressTab, pressEnter, assertKeyboardFocus } from './browser-login.mjs';

const EVIDENCE = process.env.RECOVERY_EVIDENCE_DIR ?? join(tmpdir(), 'travel-recovery-evidence');
const AUTH = 'http://127.0.0.1:54321';
const counts = { login: 0, membership: 0, user: 0, recover: 0, update: 0, logout: 0, externalMutations: 0, external: 0, database: 0 };
let scenario = 'known';
let delayedValidation;
let expectedEmail;
let expectedOrigin;
let boundaryErrors = [];
const fixtureUser = { id: randomUUID(), aud: 'authenticated', role: 'authenticated', email: 'fixture-'+randomUUID()+'@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
let fixtureAccess;
let expectedPassword;
function callbackUrl(appUrl, type = 'recovery') {
  const now = Math.floor(Date.now()/1000);
  fixtureAccess = [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'), Buffer.from(JSON.stringify({sub:fixtureUser.id,aud:'authenticated',exp:now+3600,iat:now})).toString('base64url'), Buffer.from(randomUUID()).toString('base64url')].join('.');
  const hash = new URLSearchParams({access_token:fixtureAccess,refresh_token:randomUUID(),expires_in:'3600',expires_at:String(now+3600),token_type:'bearer',type});
  return new URL('/actualizar-clave',appUrl).href+'#'+hash;
}

async function installBoundary(cdp, appUrl) {
  const appOrigin = new URL(appUrl).origin;
  cdp.onEvent(({method, params}) => {
    if (method !== 'Fetch.requestPaused') return;
    void (async () => {
      const {request, requestId} = params;
      const url = new URL(request.url);
      const reply = async (status, body) => cdp.send('Fetch.fulfillRequest', {
        requestId, responseCode: status,
        responseHeaders: [{name:'Content-Type',value:'application/json'}, {name:'X-Supabase-Api-Version',value:'2024-01-01'}, {name:'Access-Control-Expose-Headers',value:'X-Supabase-Api-Version'}, {name:'Access-Control-Allow-Origin',value:appOrigin}, {name:'Access-Control-Allow-Headers',value:'authorization,apikey,content-type,x-client-info,x-supabase-api-version,content-profile,accept-profile'}, {name:'Access-Control-Allow-Methods',value:'GET,POST,PUT,OPTIONS'}],
        body: Buffer.from(JSON.stringify(body)).toString('base64'),
      });
      if (url.origin === appOrigin && !url.pathname.startsWith('/auth/') && !url.pathname.startsWith('/rest/')) {
        await cdp.send('Fetch.continueRequest', {requestId}); return;
      }
      if (url.origin !== AUTH) {
        counts.external++;
        if (!['GET','OPTIONS','HEAD'].includes(request.method)) counts.externalMutations++;
        await cdp.send('Fetch.failRequest', {requestId,errorReason:'BlockedByClient'}); return;
      }
      if (request.method === 'OPTIONS') { await reply(200,{}); return; }
      if (url.pathname === '/auth/v1/recover') {
        counts.recover++;
        const body = JSON.parse(request.postData);
        assert.ok(body.email === expectedEmail, 'correo recibido conserva normalización del login');
        assert.ok(url.searchParams.get('redirect_to') === expectedOrigin + '/actualizar-clave', 'callback exacto por origen');
        await delay(350);
        if (scenario === 'transport') { await cdp.send('Fetch.failRequest',{requestId,errorReason:'ConnectionFailed'}); return; }
        await reply(scenario === 'quota' ? 429 : scenario === 'unknown' ? 404 : 200, scenario === 'quota' ? {code:'over_email_send_rate_limit',msg:'fixture-provider-private'} : scenario === 'unknown' ? {code:'user_not_found',msg:'fixture-provider-private'} : {});
        return;
      }
      if (url.pathname === '/auth/v1/user' && request.method === 'GET') {
        counts.user++;
        const authorization = Object.entries(request.headers).find(([key])=>key.toLowerCase()==='authorization')?.[1];
        assert.ok(authorization === 'Bearer '+fixtureAccess, 'SDK presenta sesión emitida por fixture');
        if (scenario === 'network-callback') { await cdp.send('Fetch.failRequest',{requestId,errorReason:'ConnectionFailed'}); return; }
        if (scenario === 'delayed-expired') await delayedValidation;
        const expired = scenario === 'expired' || scenario === 'delayed-expired' || scenario === 'verify-error';
        await reply(expired ? 401 : 200, expired ? {code:'session_not_found',msg:'fixture-private'} : scenario === 'identity-change' ? {...fixtureUser,id:randomUUID()} : fixtureUser); return;
      }
      if (url.pathname === '/auth/v1/user' && request.method === 'PUT') {
        counts.update++;
        assert.ok(JSON.parse(request.postData).password === expectedPassword, 'update contiene la clave sintética esperada');
        await delay(350);
        const code = scenario === 'update-error' ? 422 : scenario === 'update-expired' ? 401 : 200;
        await reply(code,code === 200 ? fixtureUser : {code:code === 422 ? 'weak_password':'session_not_found',msg:'fixture-provider-private'}); return;
      }
      if (url.pathname === '/auth/v1/logout' && request.method === 'POST') {
        counts.logout++;
        assert.equal(url.searchParams.get('scope'), 'global', 'cierre global por SDK');
        await delay(350);
        await reply(scenario === 'signout-error' ? 503 : 204,scenario === 'signout-error' ? {code:'unexpected_failure',msg:'fixture-provider-private'} : {}); return;
      }
      if (scenario === 'login' && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
        counts.login++;
        const body = JSON.parse(request.postData);
        assert.ok(body.email === fixtureUser.email && body.password === expectedPassword, 'login normal usa credenciales sintéticas del recorrido');
        await reply(200,{access_token:fixtureAccess,refresh_token:randomUUID(),token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:fixtureUser}); return;
      }
      if (scenario === 'login' && url.pathname === '/rest/v1/rpc/is_member') {
        counts.membership++;
        await reply(200,false); return;
      }
      counts.database++;
      await reply(403,{message:'fixture refuses unexpected request'});
    })().catch(async () => {
      boundaryErrors.push('Fallo en contrato HTTP de fixture (contenido omitido)');
      try { await cdp.send('Fetch.failRequest',{requestId:params.requestId,errorReason:'Failed'}); } catch {}
    });
  });
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
}

async function tabTo(cdp, selector, backwards = false) {
  for (let i = 0; i < 14; i++) {
    await pressTab(cdp, backwards);
    if (await cdp.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`)) return;
  }
  assert.fail('Acción ausente del recorrido Tab: '+selector);
}
async function fill(cdp, selector, text) {
  await tabTo(cdp, selector);
  await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});
  await cdp.send('Input.insertText',{text});
}
async function activate(cdp, selector) {
  await tabTo(cdp, selector);
  await pressEnter(cdp);
}
async function touch(cdp, selector) {
  const point = await cdp.evaluate(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
async function screen(cdp, name) {
  await cdp.evaluate(`Promise.all(document.getAnimations().map(a => a.finished.catch(() => {})))`);
  assert.equal(await cdp.evaluate(`[...document.querySelectorAll('input[type="password"], input[type="email"]')].every(x => x.value === '')`),true,'captura solo con claves vacías');
  const shot = await cdp.send('Page.captureScreenshot',{format:'png'});
  await writeFile(join(EVIDENCE, name+'.png'),Buffer.from(shot.data,'base64'));
}
async function assertCleanHistory(cdp, back = false) {
  const history = await cdp.send('Page.getNavigationHistory');
  assert.equal(history.entries.every(entry => {
    const url = new URL(entry.url);
    return !url.hash && !url.search;
  }), true, 'historial sin URL sensible');
  if (back && history.currentIndex > 0) {
    await cdp.send('Page.navigateToHistoryEntry',{entryId:history.entries[history.currentIndex-1].id});
    await waitUntil(cdp, `location.hash === '' && location.search === ''`, 'Atrás sin secretos');
    await cdp.send('Page.navigateToHistoryEntry',{entryId:history.entries[history.currentIndex].id});
    await waitUntil(cdp, `location.pathname === '/actualizar-clave' && location.hash === '' && location.search === ''`, 'Adelante sin secretos');
    await waitUntil(cdp, `document.body.innerText.includes('Pedir un nuevo enlace')`, 'historial no revive grant');
  }
}
async function observeAuthEvents(cdp) {
  await cdp.evaluate(`window.__authEvents = []; window.__authChannel = new BroadcastChannel('sb-127-auth-token'); window.__authChannel.onmessage = ({data}) => window.__authEvents.push(data.event)`);
}
async function changeRealTab(cdp, cdpPort) {
  await observeAuthEvents(cdp);
  const other = await openTarget(cdpPort);
  const tab = await Cdp.connect(other.webSocketDebuggerUrl);
  try {
    await tab.send('Page.bringToFront');
    await waitUntil(cdp, `document.visibilityState === 'hidden'`, 'pestaña realmente oculta');
    await cdp.send('Page.bringToFront');
    await waitUntil(cdp, `document.visibilityState === 'visible' && window.__authEvents.includes('SIGNED_IN')`, 'retorno visible y SIGNED_IN real del SDK');
    await cdp.evaluate('new Promise(requestAnimationFrame)');
    assert.equal(await cdp.evaluate(`!!document.querySelector('input[name="new-password"]')`), true, 'volver a pestaña conserva recuperación válida');
  } finally { await tab.send('Page.close'); tab.close(); }
}
async function runViewport({cdpPort,appUrl,width,height,mobile}) {
  const target = await openTarget(cdpPort);
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  const errors = [];
  cdp.onEvent(({method,params}) => {
    // Record categories only: never bodies, URLs, tokens, provider messages or input values.
    if (method === 'Runtime.exceptionThrown') errors.push('runtime exception');
    const expectedFailure = ['identity-change','verify-error','network-callback','unknown','quota','transport','expired','delayed-expired','update-error','update-expired','signout-error','reused','malformed'].includes(scenario);
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      const sdkFailure = params.args.some(arg => /Auth(Api|RetryableFetch|ImplicitGrantRedirect|SessionMissing)Error|TypeError: Failed to fetch/.test(String(arg.description ?? arg.value ?? '')));
      if (!expectedFailure || !sdkFailure) errors.push('unexpected console error');
    }
    if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      const fixtureNetwork = params.entry.source === 'network' && params.entry.url?.startsWith(AUTH+'/auth/v1/');
      if (!expectedFailure || !fixtureNetwork) errors.push('unexpected browser log error');
    }
  });
  try {
    await Promise.all(['Page.enable','Runtime.enable','Log.enable','Network.enable'].map(x=>cdp.send(x)));
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1,mobile});
    await cdp.send('Emulation.setTouchEmulationEnabled', mobile ? {enabled:true,maxTouchPoints:5} : {enabled:false});
    await installBoundary(cdp,appUrl);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__invalidFlash = false; new MutationObserver(() => { if(document.body?.innerText.includes('Pedir un nuevo enlace')) window.__invalidFlash = true; }).observe(document,{subtree:true,childList:true});`});
    expectedOrigin = new URL(appUrl).origin;
    const navigate = async (path='/') => {
      await cdp.send('Page.navigate',{url:new URL(path,appUrl).href});
      await waitUntil(cdp,`!!document.querySelector('[data-login-card]')`,'login listo');
      assert.equal(await cdp.evaluate(`document.querySelector('input[name="password"]').minLength`),6,'login conserva mínimo seis');
    };
    const beforeSSR = counts.recover;
    await cdp.send('Emulation.setScriptExecutionDisabled', {value:true});
    await cdp.send('Page.navigate', {url:new URL('/recuperar-clave',appUrl).href});
    await waitUntil(cdp, `!!document.querySelector('input[type="email"]')`, 'HTML sin JavaScript');
    assert.equal(await cdp.evaluate(`document.querySelector('input[type="email"]').disabled && document.querySelector('form button').disabled`), true, 'SSR bloquea envío antes de hidratar');
    assert.equal(await cdp.evaluate(`new FormData(document.querySelector('form')).has('email')`), false, 'SSR no serializa correo');
    assert.equal(await cdp.evaluate(`document.body.innerText.includes('JavaScript')`), true, 'sin JS se explica que no se solicita');
    await pressTab(cdp); await pressEnter(cdp);
    assert.equal(await cdp.evaluate(`location.search === ''`), true, 'sin JS no filtra query');
    assert.equal(counts.recover, beforeSSR, 'sin JS no promete solicitud');
    await cdp.send('Emulation.setScriptExecutionDisabled', {value:false});
    for (const kind of ['known','unknown','quota','transport']) {
      scenario = kind;
      await navigate();
      await cdp.evaluate('sessionStorage.clear()');
      assert.equal(await cdp.evaluate(`!!document.querySelector('[data-recovery-action]')`),true,'login ofrece ¿Olvidaste tu contraseña?');
      await activate(cdp,'[data-recovery-action]');
      await waitUntil(cdp,`document.querySelector('h1')?.textContent === 'Recuperar contraseña'`,'formulario de solicitud');
      await waitUntil(cdp, `document.querySelector('form')?.hasAttribute('data-recovery-ready')`, 'solicitud hidratada en cada escenario');
      assert.equal(await cdp.evaluate(`document.body.innerText.includes('Daybook Asistencia')`),true);
      if (kind === 'known') {
        await screen(cdp,`request-${width}-dark`);
        if (mobile) await touch(cdp,'button[aria-label^="Activar modo"]');
        else await activate(cdp,'button[aria-label^="Activar modo"]');
        await waitUntil(cdp,`document.documentElement.dataset.theme === 'light'`,'tema claro');
        await screen(cdp,`request-${width}-light`);
        assert.equal(await cdp.evaluate(`document.documentElement.scrollWidth <= innerWidth`),true,'sin overflow');
      }
      expectedEmail = 'Synthetic.'+randomUUID()+'@example.invalid';
      await fill(cdp,'input[name="email"]',expectedEmail);
      const before = counts.recover;
      await pressTab(cdp);
      await assertKeyboardFocus(cdp,{name:'enviar enlace',selector:'form button[type="submit"]'},String(width));
      await pressEnter(cdp);
      await pressEnter(cdp);
      await waitUntil(cdp,`document.querySelector('[role="status"], [role="alert"]')?.textContent?.includes(${JSON.stringify(kind==='known'||kind==='unknown'?'Si existe una cuenta':'No pudimos enviar')})`,'resultado genérico').catch(async () => {
        const state = await cdp.evaluate(`({hasQuery:location.search !== '',ready:document.querySelector('form')?.hasAttribute('data-recovery-ready'),busy:document.querySelector('form')?.getAttribute('aria-busy'),valid:document.querySelector('input[type="email"]')?.validity.valid,hasStatus:!!document.querySelector('[role="status"]'),hasAlert:!!document.querySelector('[role="alert"]')})`);
        throw new Error('resultado genérico: '+JSON.stringify({kind,counts,state,boundaryErrors}));
      });
      assert.equal(counts.recover,before+1,'doble envío bloqueado');
      assert.equal(await cdp.evaluate(`document.body.innerText.includes('fixture-provider-private')`),false,'sin mensaje del proveedor');
      assert.equal(await cdp.evaluate(`document.querySelector('form button[type="submit"]').disabled`),true,'enfriamiento después de respuesta');
      await tabTo(cdp,'[data-back-login]');
      await pressTab(cdp, true);
      await assertKeyboardFocus(cdp,{name:'correo anterior al retorno',selector:'input[name="email"]'},String(width));
      await pressTab(cdp);
      await assertKeyboardFocus(cdp,{name:'volver a login',selector:'[data-back-login]'},String(width));
      await pressEnter(cdp);
      await waitUntil(cdp,`!!document.querySelector('[data-login-card]')`,'volver al login');
      if (kind === 'known') {
        await activate(cdp,'[data-recovery-action]');
        await waitUntil(cdp,`document.querySelector('h1')?.textContent === 'Recuperar contraseña'`,'reabrir solicitud');
        await waitUntil(cdp,`document.querySelector('form button[type="submit"]')?.disabled === true`,'volver al login no salta enfriamiento');
        assert.equal(counts.recover,before+1,'sin reenvío al reabrir');
      }
    }
    // Each session originates in the real SDK URL handler; never inject React/auth state.
    const openRecovery = async (kind, url) => {
      scenario = kind;
      await cdp.evaluate('localStorage.clear(); sessionStorage.clear()');
      await cdp.send('Page.navigate',{url:'about:blank'});
      await waitUntil(cdp,`location.href === 'about:blank'`,'documento aislado');
      await cdp.send('Page.navigate',{url});
      await waitUntil(cdp,`document.querySelector('h1')?.textContent === 'Actualizar contraseña'`,'ruta pública de actualización');
    };
    const deny = async () => {
      await waitUntil(cdp,`document.body.innerText.includes('Pedir un nuevo enlace')`,'recuperación rechazada');
      assert.equal(await cdp.evaluate(`!!document.querySelector('input[name="new-password"]')`),false,'sesión negativa no abre formulario');
    };
    // Mantener la validación del proveedor pendiente más allá del antiguo timer de 1 s.
    let releaseValidation;
    delayedValidation = new Promise(resolve => { releaseValidation = resolve; });
    const beforeDelayedUser = counts.user, beforeDelayedUpdate = counts.update;
    try {
      await openRecovery('delayed-expired',callbackUrl(appUrl));
      await waitUntil(cdp,`document.querySelector('[role="status"]')?.textContent === 'Comprobando enlace…'`,'validación pendiente del SDK');
      const validationDeadline = Date.now()+10000;
      while (counts.user === beforeDelayedUser && Date.now() < validationDeadline) await delay(50);
      assert.ok(counts.user > beforeDelayedUser,'el SDK está esperando la validación del proveedor local');
      await delay(1200);
      assert.equal(await cdp.evaluate(`document.querySelector('[role="status"]')?.textContent === 'Comprobando enlace…'`),true,'sigue checking tras más de 1 s');
      assert.equal(await cdp.evaluate(`location.hash === '' && location.search === ''`),true,'callback sensible fuera de URL mientras SDK valida');
      assert.equal(await cdp.evaluate(`!!document.querySelector('input[name="new-password"]')`),false,'checking nunca abre el formulario');
    } finally { releaseValidation(); }
    await deny();
    assert.equal(counts.update,beforeDelayedUpdate,'validación demorada inválida nunca actualiza');
    await waitUntil(cdp,`location.pathname === '/actualizar-clave' && location.hash === '' && location.search === ''`,'URL limpia después de invalid tardío',3000);
    await assertCleanHistory(cdp, true);
    console.log(`✓ callback demorado ${width}: checking >1200 ms, invalid sin formulario, URL limpia`);
    const beforeNegatives = counts.update;
    for (const kind of ['missing','arbitrary','malformed','reused','expired','network-callback','normal']) {
      const url = ['expired','network-callback'].includes(kind) ? callbackUrl(appUrl) : kind === 'normal' ? callbackUrl(appUrl,'signup') : new URL('/actualizar-clave',appUrl).href + (kind==='arbitrary' ? '#type=recovery' : kind==='malformed' ? '#type=recovery&access_token=malformed' : kind==='reused' ? '#error=access_denied&error_code=otp_expired' : '');
      const beforeUser=counts.user;
      await openRecovery(kind,url);
      await deny();
      await assertCleanHistory(cdp, true);
      if (kind === 'expired' || kind === 'normal') assert.ok(counts.user > beforeUser, 'callback ejercita SDK y proveedor');
      console.log(`✓ sesión ${kind} ${width}: rechazada`);
      if (kind === 'normal') {
        // Existing session, SDK INITIAL_SESSION on reload, no fake session storage.
        await cdp.send('Page.navigate',{url:new URL('/actualizar-clave',appUrl).href});
        await deny();
      }
    }
    assert.equal(counts.update,beforeNegatives,'negativos nunca llaman updateUser');
    const receiverTarget = await openTarget(cdpPort);
    const receiver = await Cdp.connect(receiverTarget.webSocketDebuggerUrl);
    try {
      await receiver.send('Page.enable'); await receiver.send('Runtime.enable');
      await installBoundary(receiver, appUrl);
      await receiver.send('Page.navigate',{url:new URL('/actualizar-clave',appUrl).href});
      await waitUntil(receiver, `document.body.innerText.includes('Pedir un nuevo enlace')`, 'pestaña sin callback');
      await observeAuthEvents(receiver);
      await openRecovery('valid', callbackUrl(appUrl));
      await waitUntil(cdp, `!!document.querySelector('input[name="new-password"]')`, 'callback local autoriza emisor');
      await waitUntil(receiver, `window.__authEvents.includes('PASSWORD_RECOVERY')`, 'broadcast real recibido');
      assert.equal(await receiver.evaluate(`!!document.querySelector('input[name="new-password"]')`), false, 'broadcast no autoriza otra pestaña');
      console.log(`✓ broadcast real ${width}: receptor sin callback permanece cerrado`);
    } finally { await receiver.send('Page.close'); receiver.close(); }
    for (const kind of ['valid','identity-change','verify-error','update-error','update-expired','signout-error']) {
      await openRecovery(['identity-change','verify-error'].includes(kind) ? 'valid' : kind,callbackUrl(appUrl));
      await waitUntil(cdp,`!!document.querySelector('input[name="new-password"]')`,'PASSWORD_RECOVERY válido');
      assert.equal(await cdp.evaluate('window.__invalidFlash'), false, 'INITIAL_SESSION no produce destello inválido');
      await assertCleanHistory(cdp);
      if (kind === 'valid') {
        await changeRealTab(cdp, cdpPort);
        console.log(`✓ visibilidad real ${width}: hidden→visible, SIGNED_IN conserva grant`);
        await screen(cdp,`recovery-${width}-empty`);
        if (mobile) await touch(cdp,'button[aria-label^="Activar modo"]');
        else await activate(cdp,'button[aria-label^="Activar modo"]');
        await waitUntil(cdp,`document.documentElement.dataset.theme === 'light'`,'recuperación tema claro');
        await screen(cdp,`recovery-${width}-light-empty`);
        assert.equal(await cdp.evaluate(`document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight`),true,'geometría de actualización');
        await fill(cdp,'input[name="new-password"]',randomUUID().slice(0,7));
        await fill(cdp,'input[name="confirm-password"]',randomUUID().slice(0,7));
        const before=counts.update;
        await activate(cdp,'form button[type="submit"]');
        assert.equal(await cdp.evaluate(`document.querySelector('input[name="new-password"]').validity.tooShort`), true, 'mínimo nativo ocho');
        assert.equal(counts.update,before,'política bloquea update');
        await fill(cdp,'input[name="new-password"]',randomUUID());
        await fill(cdp,'input[name="confirm-password"]',randomUUID());
        await activate(cdp,'form button[type="submit"]');
        await waitUntil(cdp,`document.querySelector('[role="alert"]')?.textContent.includes('no coinciden')`,'confirmación distinta');
        assert.equal(counts.update,before,'mismatch bloquea update');
      }
      scenario = kind;
      expectedPassword = randomUUID()+'aA!';
      await fill(cdp,'input[name="new-password"]',expectedPassword);
      await fill(cdp,'input[name="confirm-password"]',expectedPassword);
      const before=counts.update;
      const beforeLogout=counts.logout;
      await pressTab(cdp);
      await assertKeyboardFocus(cdp,{name:'guardar contraseña',selector:'form button[type="submit"]'},String(width));
      await pressEnter(cdp); await pressEnter(cdp);
      if (['identity-change','verify-error'].includes(kind)) {
        await deny();
        assert.equal(counts.update, before, 'revalidación rechazada: cero updates');
        assert.equal(counts.logout, beforeLogout);
        continue;
      }
      if (kind === 'update-error' || kind === 'update-expired') {
        await waitUntil(cdp,`!!document.querySelector('[role="alert"]')`,'error genérico de actualización');
        assert.equal(counts.logout,beforeLogout,'fallo update no anuncia éxito');
        assert.equal(await cdp.evaluate(`document.body.innerText.includes('fixture-provider-private')`),false);
        if (kind === 'update-expired') await deny();
      } else {
        await waitUntil(cdp,`[...document.querySelectorAll('input[type="password"]')].every(x=>x.value==='')`,'limpieza de ambas claves');
        if (kind === 'signout-error') {
          await waitUntil(cdp,`document.body.innerText.includes('No pudimos cerrar la sesión')`,'fallo de signOut visible');
          assert.equal(await cdp.evaluate(`location.pathname`),'/actualizar-clave');
          assert.equal(await cdp.evaluate(`document.body.innerText.includes('sesión cerrada')`),false);
          await screen(cdp,`recovery-${width}-logout-error-clean`);
          assert.equal(await cdp.evaluate(`!!document.querySelector('form') || !!document.querySelector('[data-back-login]')`), false, 'cierre fallido mantiene pantalla cerrada');
          scenario='valid';
          await activate(cdp,'[data-retry-signout]');
        }
        await waitUntil(cdp,`!!document.querySelector('[data-login-card]')`,'éxito vuelve a login');
        assert.ok(counts.logout>beforeLogout,'cierre deliberado por SDK');
        if (kind === 'valid') {
          scenario='login';
          const beforeLogin=counts.login, beforeMembership=counts.membership;
          await fill(cdp,'input[name="email"]',fixtureUser.email);
          await fill(cdp,'input[name="password"]',expectedPassword);
          await activate(cdp,'form button');
          await waitUntil(cdp,`document.body.innerText.includes('Tu cuenta todavía no está habilitada')`,'identidad recuperada sin membresía').catch(async error => {
            const state=await cdp.evaluate(`({login:!!document.querySelector('[data-login-card]'),checking:document.body.innerText.includes('Comprobando tu acceso'),denied:document.body.innerText.includes('no está habilitada'),loadError:document.body.innerText.includes('No pudimos comprobar'),loginError:document.body.innerText.includes('No pudimos iniciar')})`);
            console.log('diagnóstico sin datos personales: '+JSON.stringify({counts,state,boundaryErrors}));
            throw error;
          });
          assert.equal(counts.login,beforeLogin+1,'login normal SDK conserva flujo');
          assert.ok(counts.membership>beforeMembership,'lista blanca continúa siendo obligatoria');
          console.log(`✓ login normal ${width}: SDK real y lista blanca rechaza identidad sin membresía`);
        }
        // Reload after consumption must not regain recovery authorization.
        await cdp.send('Page.navigate',{url:new URL('/actualizar-clave',appUrl).href});
        await deny();
      }
      assert.equal(counts.update,before+1,'una actualización en vuelo');
      expectedPassword=undefined;
    }
    assert.deepEqual(errors,[],'collector sin errores inesperados');
    console.log(`✓ recovery ${width}x${height}: missing/malformed/reused/expired/normal/recovery, política, mismatch, update, signOut y limpieza`);
    console.log(`✓ request ${width}x${height}: callback, no enumeración, cuota/transporte, doble envío, tema, teclado`);
  } finally {
    try { await cdp.send('Page.close'); } catch {}
    cdp.close();
  }
}

async function checkMcp(appUrl) {
  async function call(method, params) {
    const response = await fetch(new URL('/_next/mcp',appUrl), {
      method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000),
    });
    if (response.status === 404) return null;
    assert.equal(response.ok, true, 'MCP local debe responder correctamente');
    const body = await response.text();
    const data = body.startsWith('event:') || body.startsWith('data:')
      ? JSON.parse(body.split('\n').find(line => line.startsWith('data:')).slice(5))
      : JSON.parse(body);
    assert.ok(!data.error, 'MCP devolvió error de protocolo');
    return data.result;
  }
  const catalog = await call('tools/list', {});
  if (!catalog?.tools?.some(tool => tool.name === 'get_compilation_issues')) {
    console.log('MCP no expone integración de issues; sin certificación MCP');
    return;
  }
  assertCompilationIssues(await call('tools/call',{name:'get_compilation_issues',arguments:{}}));
  console.log('✓ MCP local: issues obtenidos y assertados vacíos');
}
const deadline = setTimeout(async () => { console.error('Timeout global de recovery'); await teardown(); process.exit(1); }, 240_000);
try {
  await mkdir(EVIDENCE,{recursive:true});
  const runtime = await startBrowser();
  await runViewport({...runtime,width:390,height:844,mobile:true});
  await runViewport({...runtime,width:1440,height:900,mobile:false});
  await checkMcp(runtime.appUrl);
  assert.deepEqual(boundaryErrors,[]);
  assert.equal(counts.externalMutations,0);
  assert.equal(counts.external,0);
  assert.equal(counts.database,0);
  console.log('✓ Requests externos y mutaciones fuera de fixture: 0');
} catch (error) {
  // Assertion messages are curated, never print objects that may contain auth material.
  console.error(error instanceof Error ? error.message : 'Browser recovery failed');
  process.exitCode=1;
} finally {
  clearTimeout(deadline);
  await teardown();
}
