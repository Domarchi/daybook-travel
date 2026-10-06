// Solo lo ejecuta el supervisor. SDK real; interceptación exclusivamente en la frontera HTTP.
import assert from 'node:assert/strict';
import { assertCompilationIssues } from '../lib/mcp-compilation.ts';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Cdp, openTarget, waitUntil, delay, teardown, startBrowser, pressTab, pressEnter } from './browser-login.mjs';

const EVIDENCE = process.env.RECOVERY_EVIDENCE_DIR ?? join(tmpdir(), 'travel-recovery-evidence');
const AUTH = 'http://127.0.0.1:54321';
const counts = { login: 0, membership: 0, user: 0, recover: 0, update: 0, logout: 0, pkce: 0, externalMutations: 0, external: 0, database: 0 };
let scenario = 'known';
let delayedValidation;
let expectedEmail;
let expectedOrigin;
let boundaryErrors = [];
const fixtureUser = { id: randomUUID(), aud: 'authenticated', role: 'authenticated', email: 'fixture-'+randomUUID()+'@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
let fixtureAccess;
let expectedPassword;
// Diagnósticos atribuibles a respuestas negativas deliberadas de la fixture.
// La identidad CDP de request queda sólo en memoria; nunca se imprime.
const fixtureDiagnostics = new WeakMap();
function expectedFixtureDiagnostic(url, method, context) {
  if (url.origin !== AUTH) return null;
  const cases = [
    ['unknown','POST','/auth/v1/recover',404],
    ['quota','POST','/auth/v1/recover',429],
    ['transport','POST','/auth/v1/recover','ConnectionFailed'],
    ['expired','GET','/auth/v1/user',401],
    ['delayed-expired','GET','/auth/v1/user',401],
    ['verify-error','GET','/auth/v1/user',401],
    ['network-callback','GET','/auth/v1/user','ConnectionFailed'],
    ['update-error','PUT','/auth/v1/user',422],
    ['update-expired','PUT','/auth/v1/user',401],
    ['signout-error','POST','/auth/v1/logout',503],
    ['login-error','POST','/auth/v1/token',400],
  ];
  const found=cases.find(([kind,verb,path]) => context === kind && method === verb && url.pathname === path);
  if (!found || url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') !== 'password') return null;
  return {context,method:found[1],path:found[2],outcome:found[3]};
}
function isExpectedFixtureLog(entry, diagnostic) {
  if (!diagnostic || entry.source !== 'network' || entry.level !== 'error') return false;
  if (!entry.networkRequestId || entry.networkRequestId !== diagnostic.networkRequestId) return false;
  let url;
  try { url=new URL(entry.url); } catch { return false; }
  if (url.origin !== AUTH || url.pathname !== diagnostic.path) return false;
  const expected=expectedFixtureDiagnostic(url,diagnostic.method,diagnostic.context);
  if (!expected || expected.outcome !== diagnostic.outcome) return false;
  if (diagnostic.outcome === 'ConnectionFailed') return entry.text === 'Failed to load resource: net::ERR_CONNECTION_FAILED';
  // Chrome puede variar la frase HTTP (p. ej. Entity/Content). Sólo admitir el
  // formato de recurso HTTP y el MISMO status emitido por esa petición fixture.
  const http=entry.text.match(/^Failed to load resource: the server responded with a status of (\d{3})(?: \([A-Za-z -]{0,64}\))?$/);
  return !!http && Number(http[1]) === diagnostic.outcome;
}
// Estado privado por client CDP: las URLs/IDs sólo viven en RAM. Next 16 instalado
// crea /_next/hmr?id=self.__next_r (client/dev/hot-reloader/app/web-socket.js).
function createHmrLifecycleCollector(appUrl) {
  const app=new URL(appUrl);
  const sockets=new Map();
  let document=null, transition=null;
  const ownedSocket = value => {
    try {
      const url=new URL(value);
      if (url.protocol !== (app.protocol === 'https:' ? 'wss:' : 'ws:') || url.host !== app.host
        || url.username || url.password || url.hash || url.pathname !== '/_next/hmr'
        || [...url.searchParams.keys()].join(',') !== 'id' || !url.searchParams.get('id')) return null;
      return url;
    } catch { return null; }
  };
  const ownDocument = (value, path) => {
    try { const url=new URL(value); return url.origin === app.origin && url.pathname === path; }
    catch { return false; }
  };
  return {
    navigated(frame, type) {
      if (frame.parentId) return;
      document={frame:frame.id,loader:frame.loaderId,url:frame.url};
      if (transition) {
        transition.navigations++;
        transition.restored=transition.navigations === 1 && type === 'BackForwardCacheRestore'
          && frame.id === transition.target.frame && frame.loaderId === transition.target.loader
          && ownDocument(frame.url,transition.path);
      }
    },
    socketCreated(params) {
      const url=ownedSocket(params.url);
      if (!url || !params.requestId || !document?.loader) return;
      sockets.set(params.requestId,{...document,url:url.href,id:url.searchParams.get('id')});
    },
    capture(path, nextRequestId) {
      assert.ok(document?.loader && ownDocument(document.url,path),'T2 HMR documento propio identificado');
      // Vincular también el id HMR observado al documento hidratado, no sólo a
      // una ruta compartida por varias navegaciones. No imprimir este id.
      const urls=[...sockets.values()].filter(socket => socket.frame === document.frame
        && socket.loader === document.loader && socket.id === nextRequestId).map(socket => socket.url);
      return {...document,path,urls};
    },
    begin(direction, target) {
      assert.ok(!transition && ['back','forward'].includes(direction),'T2 transición HMR exclusiva');
      const path=direction === 'back' ? '/recuperar-clave' : '/actualizar-clave';
      assert.ok(target.path === path,'T2 transición HMR al documento esperado');
      transition={target,path,direction,pending:false,navigations:0,restored:false};
    },
    stage(entry, phase) {
      if (!transition || transition.pending || phase !== 't2-history-'+transition.direction
        || entry.source !== 'network' || entry.level !== 'error' || entry.networkRequestId
        || !ownDocument(entry.url,transition.path) || typeof entry.text !== 'string') return false;
      const match=entry.text.match(/^WebSocket connection to '([^'\r\n]+)' failed: Page entered Back-Forward Cache\.$/);
      if (!match || match[0] !== entry.text) return false;
      const socket=ownedSocket(match[1]);
      if (!socket || !transition.target.urls.includes(socket.href)) return false;
      // Chromium puede entregar el Log antes de frameNavigated. Aún no se
      // acepta: finish exige el restore real del mismo documento/loader.
      transition.pending=true;
      return true;
    },
    finish() {
      assert.ok(transition,'T2 transición HMR abierta');
      const result={direction:transition.direction,
        expected:transition.pending && transition.restored ? 1 : 0,
        rejected:transition.pending && !transition.restored ? 1 : 0};
      transition=null;
      return result;
    },
  };
}
function callbackUrl(appUrl, type = 'recovery') {
  const now = Math.floor(Date.now()/1000);
  fixtureAccess = [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'), Buffer.from(JSON.stringify({sub:fixtureUser.id,aud:'authenticated',exp:now+3600,iat:now})).toString('base64url'), Buffer.from(randomUUID()).toString('base64url')].join('.');
  const hash = new URLSearchParams({access_token:fixtureAccess,refresh_token:randomUUID(),expires_in:'3600',expires_at:String(now+3600),token_type:'bearer',type});
  return new URL('/actualizar-clave',appUrl).href+'#'+hash;
}

async function installBoundary(cdp, appUrl) {
  const appOrigin = new URL(appUrl).origin;
  const diagnostics=new Map();
  fixtureDiagnostics.set(cdp,diagnostics);
  cdp.onEvent(({method, params}) => {
    if (method !== 'Fetch.requestPaused') return;
    void (async () => {
      const {request, requestId} = params;
      const url = new URL(request.url);
      const expected=expectedFixtureDiagnostic(url,request.method,scenario);
      const recordDiagnostic = outcome => {
        if (params.networkId && expected?.outcome === outcome) diagnostics.set(params.networkId,{...expected,networkRequestId:params.networkId});
      };
      const reply = async (status, body) => {
        recordDiagnostic(status);
        return cdp.send('Fetch.fulfillRequest', {
        requestId, responseCode: status,
        responseHeaders: [{name:'Content-Type',value:'application/json'}, {name:'X-Supabase-Api-Version',value:'2024-01-01'}, {name:'Access-Control-Expose-Headers',value:'X-Supabase-Api-Version'}, {name:'Access-Control-Allow-Origin',value:appOrigin}, {name:'Access-Control-Allow-Headers',value:'authorization,apikey,content-type,x-client-info,x-supabase-api-version,content-profile,accept-profile'}, {name:'Access-Control-Allow-Methods',value:'GET,POST,PUT,OPTIONS'}],
        body: Buffer.from(JSON.stringify(body)).toString('base64'),
        });
      };
      if (url.origin === appOrigin && !url.pathname.startsWith('/auth/') && !url.pathname.startsWith('/rest/')) {
        await cdp.send('Fetch.continueRequest', {requestId}); return;
      }
      if (url.origin !== AUTH) {
        counts.external++;
        if (!['GET','OPTIONS','HEAD'].includes(request.method)) counts.externalMutations++;
        await cdp.send('Fetch.failRequest', {requestId,errorReason:'BlockedByClient'}); return;
      }
      if (request.method === 'OPTIONS') { await reply(200,{}); return; }
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
        counts.pkce++;
        // La fixture no valida PKCE: nunca acuña una sesión para un code arbitrario.
        await reply(400,{code:'flow_state_not_found',msg:'fixture refuses PKCE exchange'}); return;
      }
      if (url.pathname === '/auth/v1/recover') {
        counts.recover++;
        const body = JSON.parse(request.postData);
        assert.ok(body.email === expectedEmail, 'correo recibido conserva normalización del login');
        assert.ok(url.searchParams.get('redirect_to') === expectedOrigin + '/actualizar-clave', 'callback exacto por origen');
        await delay(350);
        if (scenario === 'transport') { recordDiagnostic('ConnectionFailed'); await cdp.send('Fetch.failRequest',{requestId,errorReason:'ConnectionFailed'}); return; }
        await reply(scenario === 'quota' ? 429 : scenario === 'unknown' ? 404 : 200, scenario === 'quota' ? {code:'over_email_send_rate_limit',msg:'fixture-provider-private'} : scenario === 'unknown' ? {code:'user_not_found',msg:'fixture-provider-private'} : {});
        return;
      }
      if (url.pathname === '/auth/v1/user' && request.method === 'GET') {
        counts.user++;
        const authorization = Object.entries(request.headers).find(([key])=>key.toLowerCase()==='authorization')?.[1];
        assert.ok(authorization === 'Bearer '+fixtureAccess, 'SDK presenta sesión emitida por fixture');
        if (scenario === 'network-callback') { recordDiagnostic('ConnectionFailed'); await cdp.send('Fetch.failRequest',{requestId,errorReason:'ConnectionFailed'}); return; }
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
      if (['login','login-error'].includes(scenario) && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
        counts.login++;
        const body = JSON.parse(request.postData);
        assert.ok(body.email === fixtureUser.email && body.password === expectedPassword, 'login normal usa credenciales sintéticas del recorrido');
        if (scenario === 'login-error') { await reply(400,{code:'invalid_credentials',msg:'No pudimos iniciar sesión.'}); return; }
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
  await pressTab(cdp, backwards);
  assert.equal(await cdp.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`),
    true, 'T1 parada exacta '+(backwards ? 'reverse: ' : 'forward: ')+selector);
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

const stops = {
  theme: 'button[aria-label^="Activar modo"]', email: 'input[name="email"]',
  password: 'input[name="password"]', login: 'form button',
  request: '[data-recovery-action]', demo: '[data-demo-action]',
  submit: 'form button[type="submit"]', newPassword: 'input[name="new-password"]',
  confirmation: 'input[name="confirm-password"]', newLink: 'a[href="/recuperar-clave"]',
  back: '[data-back-login]', retry: '[data-retry-signout]',
};
const loginOrder = ['theme','email','password','login','request','demo'];
const requestOrder = ['theme','email','submit','back'];
const cooldownOrder = ['theme','email','back'];
const updateOrder = ['theme','newPassword','confirmation','submit','back'];
const invalidOrder = ['theme','newLink','back'];
const retryOrder = ['theme','retry'];

// El título es un punto de partida espacial, no una acción del producto.
// Mouse/touch nativos sitúan el inicio secuencial sin asignar foco por JavaScript.
// El primer Shift+Tab también se aserta: no se busca un control hasta encontrarlo.
async function titleAnchor(cdp, mobile) {
  await cdp.evaluate(`document.querySelector('h1').scrollIntoView({block:'center',behavior:'instant'})`);
  if (mobile) await touch(cdp, 'h1');
  else {
    const point = await cdp.evaluate(`(() => { const r=document.querySelector('h1').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await cdp.send('Input.dispatchMouseEvent', {type:'mousePressed',button:'left',clickCount:1,...point});
    await cdp.send('Input.dispatchMouseEvent', {type:'mouseReleased',button:'left',clickCount:1,...point});
  }
}

async function keyboardStep(cdp, state, name, backwards, viewport) {
  const id = `T1:${viewport}:${state}:${backwards ? 'reverse' : 'forward'}:${name}`;
  try { await tabTo(cdp, stops[name], backwards); }
  catch (error) {
    if (!(error instanceof assert.AssertionError)) throw error;
    // Sólo este tipo de fallo mata un mutante. No bootstrap, readiness ni timeout.
    error.tabAssertion = id;
    error.message = id;
    throw error;
  }
  const visible = await cdp.evaluate(`(() => {
    const element=document.activeElement, style=getComputedStyle(element);
    return element === document.querySelector(${JSON.stringify(stops[name])}) &&
      style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  })()`);
  assert.equal(visible, true, `${id}:foco-visible`);
}

async function keyboardSequence(cdp, state, order, viewport, mobile) {
  await titleAnchor(cdp, mobile);
  await keyboardStep(cdp, state, order[0], true, viewport);
  for (const name of order.slice(1)) await keyboardStep(cdp, state, name, false, viewport);
  for (const name of order.slice(0,-1).reverse()) await keyboardStep(cdp, state, name, true, viewport);
  // Termina siempre en tema; los consumidores declaran cada paso posterior.
}
async function effectiveViewport(cdp) {
  // Sólo medidas y capacidades: nunca URL, texto del DOM ni valores de campos.
  return cdp.evaluate(`({innerWidth,innerHeight,screenWidth:screen.width,screenHeight:screen.height,
    maxTouchPoints:navigator.maxTouchPoints,devicePixelRatio,
    visualWidth:visualViewport?.width,visualHeight:visualViewport?.height,visualScale:visualViewport?.scale})`);
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
async function runViewport({cdpPort,appUrl,width,height,mobile}, runMutants, receipts) {
  const target = await openTarget(cdpPort);
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  const errors = [];
  const diagnosticCounts={};
  const countDiagnostic = category => { diagnosticCounts[category]=(diagnosticCounts[category] ?? 0)+1; };
  const hmrLifecycle=createHmrLifecycleCollector(appUrl);
  const finishHmrTransition = () => {
    const result=hmrLifecycle.finish();
    if (result.expected) countDiagnostic('expected.lifecycle.hmr-bfcache.'+result.direction);
    if (result.rejected) {
      countDiagnostic('unexpected.lifecycle.hmr-unconfirmed.'+result.direction);
      errors.push('unexpected browser log error');
    }
  };
  // Instrumentación con etiquetas cerradas; nunca texto/URLs del diagnóstico.
  let diagnosticPhase='before-t2', diagnosticCase='none', diagnosticSession='none';
  let diagnosticDocument={path:'other',navigation:'other'};
  const requestMetadata=new Map();
  const diagnosticDetails=new Map();
  const diagnosticLocation = value => {
    try {
      const url=new URL(value);
      if (!['http:','https:','ws:','wss:'].includes(url.protocol)) return {origin:'scheme',path:'other'};
      const origin=url.origin.replace(/^ws:/,'http:').replace(/^wss:/,'https:');
      const owner=origin === new URL(appUrl).origin ? 'app' : origin === AUTH ? 'fixture' : 'other';
      let path='other';
      if (owner === 'app') {
        if (url.pathname.startsWith('/_next/static/')) path='next-static';
        else if (url.searchParams.has('_rsc')) path='next-rsc';
        else if (url.pathname === '/recuperar-clave') path='recuperar-clave';
        else if (url.pathname === '/actualizar-clave') path='actualizar-clave';
        else if (['/favicon.ico','/brand/daybook-favicon.svg'].includes(url.pathname)) path='favicon';
      }
      return {origin:owner,path};
    } catch { return {origin:'other',path:'other'}; }
  };
  const diagnosticText = text => {
    for (const category of ['ERR_ABORTED','ERR_BLOCKED_BY_CLIENT','ERR_FAILED','ERR_CACHE_MISS','ERR_CONNECTION_FAILED','ERR_CONNECTION_CLOSED','ERR_CONNECTION_REFUSED','ERR_INCOMPLETE_CHUNKED_ENCODING']) {
      if ([category,'net::'+category,'Failed to load resource: net::'+category].includes(text)) return category;
    }
    if (/^Failed to load resource: the server responded with a status of \d{3}(?: \([^\r\n]{0,80}\))?$/.test(text)) return 'HTTP-other';
    if (/^WebSocket connection to '[^'\r\n]+' failed: WebSocket is closed before the connection is established\.?$/.test(text)) return 'websocket-closed-before-open';
    if (/^WebSocket connection to '[^'\r\n]+' failed: Connection closed before receiving a handshake response\.?$/.test(text)) return 'websocket-closed-before-handshake';
    if (/^WebSocket connection to '[^'\r\n]+' failed:.*net::ERR_ABORTED$/.test(text)) return 'websocket-aborted';
    return 'other-explicitly-unclassified';
  };
  const diagnosticContext = () => ({phase:diagnosticPhase,callback:diagnosticCase,session:diagnosticSession});
  const diagnosticTextFlags = text => {
    // Sólo etiquetas declaradas: no extraer palabras, substrings ni mensajes.
    // Estos indicadores NO participan en la clasificación de errores aceptados.
    const labels=[
      'WebSocket','connection','closed','handshake','restored','BackForwardCache',
      'bfcache','cached','navigation','DevTools','failed','ERR_ABORTED',
      'interrupted','pending','blocked','preflight','CORS','protocol','Fetch',
      'loading','debugger','resource','request','response','document','inspector',
      'cache','Failed to load resource','back/forward cache','back-forward cache',
      'not supported','not allowed','not found','unavailable',
    ];
    const message=typeof text === 'string' ? text.toLowerCase() : '';
    return labels.filter(label => message.includes(label.toLowerCase()));
  };
  const observeDiagnostic = (event, text, requestId, url, source='network', canceled='not-reported') => {
    const request=requestMetadata.get(requestId);
    // La URL embebida se usa sólo transitoriamente para clasificar un diagnóstico
    // WebSocket con formato conocido; no se conserva ni se imprime.
    const socketUrl=typeof text === 'string' ? text.match(/^WebSocket connection to '([^'\r\n]+)' failed:/)?.[1] : undefined;
    const detail={event,category:diagnosticText(text),textFlags:diagnosticTextFlags(text),source,canceled,
      location:diagnosticLocation(url || socketUrl),
      locationEvidence:url ? 'entry-url' : socketUrl ? 'websocket-text' : 'missing',
      requestCorrelation:request ? 'network-id' : requestId ? 'id-without-metadata' : 'no-id',
      fixtureCorrelation:fixtureDiagnostics.get(cdp)?.has(requestId) ? 'linked' : 'unlinked',
      request:request ?? null,observed:diagnosticContext(),document:diagnosticDocument};
    const key=JSON.stringify(detail);
    diagnosticDetails.set(key,(diagnosticDetails.get(key) ?? 0)+1);
  };
  cdp.onEvent(({method,params}) => {
    // Record categories only: never bodies, URLs, tokens, provider messages or input values.
    if (method === 'Page.frameNavigated' && !params.frame.parentId) {
      hmrLifecycle.navigated(params.frame,params.type);
      diagnosticDocument={path:diagnosticLocation(params.frame.url).path,
        navigation:params.type === 'BackForwardCacheRestore' ? 'bfcache' : params.type === 'Navigation' ? 'normal' : 'other'};
    }
    if (method === 'Network.requestWillBeSent' || method === 'Network.webSocketCreated') {
      if (method === 'Network.webSocketCreated') hmrLifecycle.socketCreated(params);
      const resource=method === 'Network.webSocketCreated' ? 'WebSocket'
        : ['Document','Stylesheet','Image','Font','Script','XHR','Fetch','WebSocket'].includes(params.type) ? params.type : 'Other';
      requestMetadata.set(params.requestId,{...diagnosticLocation(params.request?.url ?? params.url),resource,...diagnosticContext()});
    }
    if (method === 'Network.loadingFailed') observeDiagnostic('loading-failed',params.errorText,params.requestId,undefined,'network',params.canceled === true);
    if (method === 'Network.webSocketFrameError') observeDiagnostic('websocket-frame-error',params.errorMessage,params.requestId);
    if (method === 'Runtime.exceptionThrown') { countDiagnostic('unexpected.runtime-exception'); errors.push('runtime exception'); }
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      countDiagnostic('unexpected.console-error');
      errors.push('unexpected console error');
    }
    if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      countDiagnostic('raw.log-error');
      const entry=params.entry;
      const diagnostic=fixtureDiagnostics.get(cdp)?.get(entry.networkRequestId);
      if (isExpectedFixtureLog(entry,diagnostic)) {
        const delivery=diagnostic.context === scenario ? 'same-context' : 'deferred-context';
        countDiagnostic(`expected.fixture-transport.${diagnostic.context}.${delivery}`);
      } else if (hmrLifecycle.stage(entry,diagnosticPhase)) {
        countDiagnostic('candidate.lifecycle.hmr-bfcache');
      } else {
        // Sólo categorías acotadas para investigar rechazos. Ni URL ni texto raw.
        let endpoint='other';
        try {
          const url=new URL(entry.url);
          if (url.origin === AUTH) endpoint=({'/auth/v1/user':'auth-user','/auth/v1/token':'auth-token','/auth/v1/recover':'auth-recover','/auth/v1/logout':'auth-logout'})[url.pathname] ?? 'fixture-other';
        } catch {}
        const source=['network','javascript','security'].includes(entry.source) ? entry.source : 'other';
        const kind=/^Failed to load resource: the server responded with a status of \d{3}(?: \([^\r\n]*\))?$/.test(entry.text) ? 'http-resource'
          : entry.text === 'Failed to load resource: net::ERR_CONNECTION_FAILED' ? 'connection-resource' : 'other-diagnostic';
        countDiagnostic(`unexpected.log.${source}.${endpoint}.${kind}.${diagnostic ? 'linked' : 'unlinked'}`);
        observeDiagnostic('log-error',entry.text,entry.networkRequestId,entry.url,source);
        errors.push('unexpected browser log error');
      }
    }
  });
  try {
    await Promise.all(['Page.enable','Runtime.enable','Log.enable','Network.enable'].map(x=>cdp.send(x)));
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1,mobile});
    await cdp.send('Emulation.setTouchEmulationEnabled', mobile ? {enabled:true,maxTouchPoints:5} : {enabled:false});
    const viewport = `${width}x${height}`;
    const checkedStates = new Set();
    const keyboard = async (state, order) => {
      // Readiness semántica ya observada por cada escenario, más fin de carga y
      // formulario estable. No esperar foco/orden: una regresión debe asertarse.
      await waitUntil(cdp, `document.readyState === 'complete' && !!document.querySelector('h1') && document.querySelector('form')?.getAttribute('aria-busy') !== 'true'`, `T1 ${state} estable`);
      await cdp.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const metrics=await effectiveViewport(cdp);
      assert.equal(metrics.innerWidth === width && metrics.innerHeight === height && (metrics.maxTouchPoints > 0) === mobile,
        true,`T1 viewport efectivo ${viewport} ${state}: ${JSON.stringify(metrics)}`);
      const certify = () => keyboardSequence(cdp, state, order, viewport, mobile);
      await certify();
      if (runMutants && !checkedStates.has(state)) {
        receipts.push(...await runMutants({cdp,state,order,stops,viewport,certify}));
        await certify();
      }
      checkedStates.add(state);
      const effective = await cdp.evaluate(`(() => {
        const names=${JSON.stringify(stops)};
        return [...document.querySelectorAll('main a[href],main button,main input,main select,main textarea,main [tabindex]')]
          .filter(element => element.tabIndex >= 0 && !element.disabled && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
          .map(element => Object.keys(names).find(name => element.matches(names[name]) && ${JSON.stringify(order)}.includes(name)) ?? 'unexpected');
      })()`);
      assert.deepEqual(effective, order, `T1:${viewport}:${state}:controles-efectivos`);
      console.log(`✓ T1 ${viewport} ${state}: forward=${order.join('>')}; reverse=${[...order].reverse().join('>')}`);
    };
    const loginToRequest = async () => {
      await tabTo(cdp,stops.email);
      await tabTo(cdp,stops.password);
      await tabTo(cdp,stops.login);
      await activate(cdp,'[data-recovery-action]');
    };
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
      await keyboard('login',loginOrder);
      if (kind === 'known') {
        scenario='login-error';
        expectedPassword=randomUUID();
        const beforeLogin=counts.login;
        await fill(cdp,stops.email,fixtureUser.email);
        await fill(cdp,stops.password,expectedPassword);
        await activate(cdp,'form button');
        await waitUntil(cdp,`document.querySelector('[role="alert"]')?.textContent.includes('No pudimos iniciar') && !document.querySelector('form button')?.disabled`,'login rechazado listo');
        assert.equal(counts.login,beforeLogin+1,'T1 login rechazado ejercita SDK');
        await keyboard('login-error',loginOrder);
        expectedPassword=undefined;
        scenario=kind;
      }
      assert.equal(await cdp.evaluate(`!!document.querySelector('[data-recovery-action]')`),true,'login ofrece ¿Olvidaste tu contraseña?');
      await loginToRequest();
      await waitUntil(cdp,`document.querySelector('h1')?.textContent === 'Recuperar contraseña'`,'formulario de solicitud');
      await waitUntil(cdp, `document.querySelector('form')?.hasAttribute('data-recovery-ready')`, 'solicitud hidratada en cada escenario');
      await keyboard('request',requestOrder);
      assert.equal(await cdp.evaluate(`document.body.innerText.includes('Daybook Asistencia')`),true);
      if (kind === 'known') {
        await screen(cdp,`request-${width}-dark`);
        if (mobile) await touch(cdp,'button[aria-label^="Activar modo"]');
        else await pressEnter(cdp);
        await waitUntil(cdp,`document.documentElement.dataset.theme === 'light'`,'tema claro');
        await screen(cdp,`request-${width}-light`);
        assert.equal(await cdp.evaluate(`document.documentElement.scrollWidth <= innerWidth`),true,'sin overflow');
        await keyboard('request-light',requestOrder);
      }
      expectedEmail = 'Synthetic.'+randomUUID()+'@example.invalid';
      await fill(cdp,'input[name="email"]',expectedEmail);
      const before = counts.recover;
      await keyboardStep(cdp,'request-submit','submit',false,viewport);
      await pressEnter(cdp);
      await pressEnter(cdp);
      await waitUntil(cdp,`document.querySelector('[role="status"], [role="alert"]')?.textContent?.includes(${JSON.stringify(kind==='known'||kind==='unknown'?'Si existe una cuenta':'No pudimos enviar')})`,'resultado genérico').catch(async () => {
        const state = await cdp.evaluate(`({hasQuery:location.search !== '',ready:document.querySelector('form')?.hasAttribute('data-recovery-ready'),busy:document.querySelector('form')?.getAttribute('aria-busy'),valid:document.querySelector('input[type="email"]')?.validity.valid,hasStatus:!!document.querySelector('[role="status"]'),hasAlert:!!document.querySelector('[role="alert"]')})`);
        throw new Error('resultado genérico: '+JSON.stringify({kind,counts,state,boundaryErrors}));
      });
      assert.equal(counts.recover,before+1,'doble envío bloqueado');
      assert.equal(await cdp.evaluate(`document.body.innerText.includes('fixture-provider-private')`),false,'sin mensaje del proveedor');
      assert.equal(await cdp.evaluate(`document.querySelector('form button[type="submit"]').disabled`),true,'enfriamiento después de respuesta');
      await keyboard(kind === 'known' || kind === 'unknown' ? 'request-success' : 'request-error',cooldownOrder);
      await tabTo(cdp,stops.email);
      await activate(cdp,'[data-back-login]');
      await waitUntil(cdp,`!!document.querySelector('[data-login-card]')`,'volver al login');
      if (kind === 'known') {
        await keyboard('login-return',loginOrder);
        await loginToRequest();
        await waitUntil(cdp,`document.querySelector('h1')?.textContent === 'Recuperar contraseña'`,'reabrir solicitud');
        await waitUntil(cdp,`document.querySelector('form button[type="submit"]')?.disabled === true`,'volver al login no salta enfriamiento');
        await waitUntil(cdp, `document.querySelector('form')?.hasAttribute('data-recovery-ready')`, 'solicitud reabierta hidratada');
        await keyboard('request-cooldown',cooldownOrder);
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
      await keyboard('update-invalid',invalidOrder);
    };
    // Ambas alternativas se activan desde /actualizar-clave con Enter real.
    // Cada salida comienza sin sesión: no concede ni consume un grant.
    const beforeAlternatives=counts.update;
    await openRecovery('missing',new URL('/actualizar-clave',appUrl).href);
    await deny();
    await activate(cdp,'a[href="/recuperar-clave"]');
    await waitUntil(cdp,`location.pathname === '/recuperar-clave' && document.querySelector('form')?.hasAttribute('data-recovery-ready')`,'T1 nuevo enlace abre solicitud hidratada');
    await keyboard('request-from-invalid',requestOrder);
    await assertCleanHistory(cdp);
    await openRecovery('missing',new URL('/actualizar-clave',appUrl).href);
    await deny();
    await tabTo(cdp,stops.newLink);
    await activate(cdp,'[data-back-login]');
    await waitUntil(cdp,`location.pathname === '/' && !!document.querySelector('[data-login-card]')`,'T1 salida de actualización abre login');
    await keyboard('login-from-invalid',loginOrder);
    await assertCleanHistory(cdp);
    assert.equal(counts.update,beforeAlternatives,'T1 salidas no actualizan contraseña');
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
      await keyboard('update-ready',updateOrder);
      assert.equal(await cdp.evaluate('window.__invalidFlash'), false, 'INITIAL_SESSION no produce destello inválido');
      await assertCleanHistory(cdp);
      if (kind === 'valid') {
        await changeRealTab(cdp, cdpPort);
        console.log(`✓ visibilidad real ${width}: hidden→visible, SIGNED_IN conserva grant`);
        await screen(cdp,`recovery-${width}-empty`);
        if (mobile) await touch(cdp,'button[aria-label^="Activar modo"]');
        else await pressEnter(cdp);
        await waitUntil(cdp,`document.documentElement.dataset.theme === 'light'`,'recuperación tema claro');
        await screen(cdp,`recovery-${width}-light-empty`);
        assert.equal(await cdp.evaluate(`document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight`),true,'geometría de actualización');
        await keyboard('update-light',updateOrder);
        await fill(cdp,'input[name="new-password"]',randomUUID().slice(0,7));
        await fill(cdp,'input[name="confirm-password"]',randomUUID().slice(0,7));
        const before=counts.update;
        await activate(cdp,'form button[type="submit"]');
        assert.equal(await cdp.evaluate(`document.querySelector('input[name="new-password"]').validity.tooShort`), true, 'mínimo nativo ocho');
        assert.equal(counts.update,before,'política bloquea update');
        await keyboard('update-policy',updateOrder);
        await fill(cdp,'input[name="new-password"]',randomUUID());
        await fill(cdp,'input[name="confirm-password"]',randomUUID());
        await activate(cdp,'form button[type="submit"]');
        await waitUntil(cdp,`document.querySelector('[role="alert"]')?.textContent.includes('no coinciden')`,'confirmación distinta');
        assert.equal(counts.update,before,'mismatch bloquea update');
        await keyboard('update-mismatch',updateOrder);
      }
      scenario = kind;
      expectedPassword = randomUUID()+'aA!';
      await fill(cdp,'input[name="new-password"]',expectedPassword);
      await fill(cdp,'input[name="confirm-password"]',expectedPassword);
      const before=counts.update;
      const beforeLogout=counts.logout;
      await keyboardStep(cdp,'update-submit','submit',false,viewport);
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
        else {
          await keyboard('update-error',updateOrder);
          // Reintentar desde el error conserva el grant, pero no permite envíos
          // duplicados. El primer PUT falló; sólo éste puede cambiar la clave.
          scenario='valid';
          await fill(cdp,stops.newPassword,expectedPassword);
          await fill(cdp,stops.confirmation,expectedPassword);
          await activate(cdp,'form button[type="submit"]');
          await waitUntil(cdp,`!!document.querySelector('[data-login-card]')`,'T1 reintento de actualización completa cierre');
          assert.equal(counts.update,before+2,'T1 un PUT fallido y un único reintento');
          assert.equal(counts.logout,beforeLogout+1,'T1 reintento cierra sesión global');
          await keyboard('login-after-retry',loginOrder);
          await cdp.send('Page.navigate',{url:new URL('/actualizar-clave',appUrl).href});
          await deny();
          assert.equal(counts.update,before+2,'T1 recargar no revive grant consumido tras reintento');
          expectedPassword=undefined;
          continue;
        }
      } else {
        await waitUntil(cdp,`[...document.querySelectorAll('input[type="password"]')].every(x=>x.value==='')`,'limpieza de ambas claves');
        if (kind === 'signout-error') {
          await waitUntil(cdp,`document.body.innerText.includes('No pudimos cerrar la sesión')`,'fallo de signOut visible');
          assert.equal(await cdp.evaluate(`location.pathname`),'/actualizar-clave');
          assert.equal(await cdp.evaluate(`document.body.innerText.includes('sesión cerrada')`),false);
          await screen(cdp,`recovery-${width}-logout-error-clean`);
          assert.equal(await cdp.evaluate(`!!document.querySelector('form') || !!document.querySelector('[data-back-login]')`), false, 'cierre fallido mantiene pantalla cerrada');
          await keyboard('signout-error',retryOrder);
          scenario='valid';
          await activate(cdp,'[data-retry-signout]');
        }
        await waitUntil(cdp,`!!document.querySelector('[data-login-card]')`,'éxito vuelve a login');
        await keyboard('login-after-update',loginOrder);
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
    // T2: sesión ordinaria obtenida por signInWithPassword del SDK del producto.
    const establishOrdinarySession = async () => {
      scenario='login';
      // Reusar sólo el emisor de tokens HTTP de fixture. Esta URL NO se navega;
      // la sesión nace exclusivamente de la respuesta al login por contraseña.
      callbackUrl(appUrl,'signup');
      expectedPassword=randomUUID()+'aA!';
      await navigate();
      await keyboard('login-query-session',loginOrder);
      const beforeLogin=counts.login, beforeMembership=counts.membership;
      await fill(cdp,stops.email,fixtureUser.email);
      await fill(cdp,stops.password,expectedPassword);
      await activate(cdp,'form button');
      await waitUntil(cdp,`document.body.innerText.includes('Tu cuenta todavía no está habilitada')`,'T2 sesión ordinaria con membresía rechazada');
      assert.equal(counts.login,beforeLogin+1,'T2 sesión ordinaria por login HTTP real');
      assert.equal(counts.membership,beforeMembership+1,'T2 login conserva lista blanca');
      expectedPassword=undefined;
    };
    const queryCallback = async (kind, withSession) => {
      diagnosticCase=['code-malformed','code-no-verifier','provider-error'].includes(kind) ? kind : 'other';
      diagnosticSession=withSession ? 'ordinary-session' : 'no-session';
      diagnosticPhase='t2-reset';
      // Variante local exclusiva de T2: su entrada anterior es la solicitud
      // hidratada. El recorrido de historial de T1 permanece intacto.
      const assertCleanHistory = async (client, back = false) => {
        const history=await client.send('Page.getNavigationHistory');
        assert.equal(history.entries.every(entry => {
          const location=new URL(entry.url);
          return !location.search && !location.hash;
        }),true,'T2 todas las entradas de historial sin parámetros');
        if (!back) return;
        assert.ok(history.currentIndex > 0,'T2 existe entrada previa real');
        const previous=history.entries[history.currentIndex-1];
        const current=history.entries[history.currentIndex];
        assert.equal(new URL(previous.url).pathname,'/recuperar-clave','T2 entrada anterior es solicitud');
        assert.equal(new URL(current.url).pathname,'/actualizar-clave','T2 entrada actual es actualización');
        const callbackDocument=hmrLifecycle.capture('/actualizar-clave',await client.evaluate('self.__next_r'));
        diagnosticPhase='t2-history-back';
        hmrLifecycle.begin('back',previousDocument);
        await client.send('Page.navigateToHistoryEntry',{entryId:previous.id});
        await waitUntil(client,`location.pathname === '/recuperar-clave' && location.search === '' && location.hash === '' && document.readyState === 'complete' && document.querySelector('h1')?.textContent === 'Recuperar contraseña' && document.querySelector('form')?.hasAttribute('data-recovery-ready') && document.querySelector('input[name="email"]')?.disabled === false`,'T2 Back: solicitud hidratada y documento completo');
        assert.equal((await client.send('Page.getNavigationHistory')).currentIndex,history.currentIndex-1,'T2 Back llegó a la entrada anterior');
        finishHmrTransition();
        diagnosticPhase='t2-history-back-ready';
        diagnosticPhase='t2-history-forward';
        hmrLifecycle.begin('forward',callbackDocument);
        await client.send('Page.navigateToHistoryEntry',{entryId:current.id});
        await waitUntil(client,`location.pathname === '/actualizar-clave' && location.search === '' && location.hash === '' && document.readyState === 'complete' && document.querySelector('h1')?.textContent === 'Actualizar contraseña' && document.querySelector('[role="alert"]')?.textContent === 'El enlace no es válido o ha vencido. Solicita uno nuevo.' && !document.querySelector('input[name="new-password"]')`,'T2 Forward: actualización rechazada y documento completo');
        assert.equal((await client.send('Page.getNavigationHistory')).currentIndex,history.currentIndex,'T2 Forward regresó a la entrada original');
        finishHmrTransition();
        diagnosticPhase='t2-history-forward-ready';
      };
      assert.ok(['code-malformed','code-no-verifier','provider-error'].includes(kind),'T2 caso query declarado');
      await cdp.evaluate('localStorage.clear(); sessionStorage.clear()');
      await cdp.send('Page.navigate',{url:'about:blank'});
      await waitUntil(cdp,`location.href === 'about:blank'`,'T2 documento aislado');
      diagnosticPhase='t2-session-setup';
      if (withSession) await establishOrdinarySession();
      scenario='query-'+kind;
      // Página anterior inocua: Back no dispara un login ni una RPC de membresía.
      diagnosticPhase='t2-previous-page';
      await cdp.send('Page.navigate',{url:new URL('/recuperar-clave',appUrl).href});
      await waitUntil(cdp,`location.pathname === '/recuperar-clave' && document.readyState === 'complete' && document.querySelector('form')?.hasAttribute('data-recovery-ready')`,'T2 entrada de historial previa lista');
      const previousDocument=hmrLifecycle.capture('/recuperar-clave',await cdp.evaluate('self.__next_r'));
      const sessionPresent = () => cdp.evaluate(`(() => {
        const session=JSON.parse(localStorage.getItem('sb-127-auth-token') ?? 'null');
        return session?.user?.id === ${JSON.stringify(fixtureUser.id)} && typeof session?.access_token === 'string';
      })()`);
      assert.equal(await sessionPresent(),withSession,'T2 precondición de sesión ordinaria');
      assert.equal(await cdp.evaluate(`[localStorage,sessionStorage].every(storage => !Object.keys(storage).some(key => key.includes('code-verifier')))`),true,'T2 sin verificador PKCE artificial');
      const beforeQueryUpdate=counts.update;
      const beforeQueryPkce=counts.pkce;
      const url=new URL('/actualizar-clave',appUrl);
      const privateDescription='fixture-query-private-'+randomUUID();
      const code=kind === 'code-malformed' ? 'invalid/%not-a-code' : randomUUID();
      if (kind === 'provider-error') {
        url.searchParams.set('error','access_denied');
        url.searchParams.set('error_description',privateDescription);
        url.searchParams.set('error_code','otp_expired');
      } else url.searchParams.set('code',code);
      // Observar sólo aparición del formulario: no cambiar métodos auth ni grants.
      const observer=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__queryGrantSeen=false; new MutationObserver(() => { if(document.querySelector('input[name="new-password"]')) window.__queryGrantSeen=true; }).observe(document,{subtree:true,childList:true});`});
      try {
        diagnosticPhase='t2-callback';
        await cdp.send('Page.navigate',{url:url.href});
        await deny();
        diagnosticPhase='t2-callback-ready';
        const assertSafeQueryUi = async () => {
          assert.equal(await cdp.evaluate(`location.pathname === '/actualizar-clave' && location.search === '' && location.hash === ''`),true,'T2 URL visible sin parámetros');
          assert.equal(await cdp.evaluate(`window.__queryGrantSeen === false && !document.querySelector('input[name="new-password"]')`),true,'T2 ningún grant ni destello de formulario');
          assert.equal(await cdp.evaluate(`document.querySelector('[role="alert"]')?.textContent === 'El enlace no es válido o ha vencido. Solicita uno nuevo.'`),true,'T2 mensaje seguro de recuperación inválida');
          assert.equal(await cdp.evaluate(`![${JSON.stringify(privateDescription)},${JSON.stringify(code)}].some(value => document.body.innerText.includes(value))`),true,'T2 no expone descripción ni code de callback');
          assert.equal(await sessionPresent(),withSession,'T2 sesión ordinaria conservada sin conceder recuperación');
        };
        await assertSafeQueryUi();
        assert.equal(counts.update,beforeQueryUpdate,'T2 callback query inválido nunca actualiza');
        const history=await cdp.send('Page.getNavigationHistory');
        assert.ok(history.currentIndex > 0,'T2 Back/Forward tienen entrada previa real');
        await assertCleanHistory(cdp,true);
        diagnosticPhase='t2-history-verification';
        // Medir antes de reconfigurar permite identificar la deriva del contexto
        // restaurado por el historial. No convertir una medida distinta en éxito.
        const beforeViewport=await effectiveViewport(cdp);
        const changedFields=[
          ...(beforeViewport.innerWidth !== width ? ['innerWidth'] : []),
          ...(beforeViewport.innerHeight !== height ? ['innerHeight'] : []),
          ...((beforeViewport.maxTouchPoints > 0) !== mobile ? ['maxTouchPoints'] : []),
        ];
        console.log(`T2 ${viewport} ${kind} session=${withSession} history-viewport: ${JSON.stringify({changedFields,metrics:beforeViewport})}`);
        // La restauración de historial recibe la misma configuración del target.
        // Se mantienen dimensiones, pantalla, escala y capacidad táctil de T1;
        // deny/keyboard vuelve a asertar las medidas y ejecutar Tab/touch reales.
        await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1,mobile});
        await cdp.send('Emulation.setTouchEmulationEnabled', mobile ? {enabled:true,maxTouchPoints:5} : {enabled:false});
        await deny();
        await assertSafeQueryUi();
        await assertCleanHistory(cdp);
        assert.equal(counts.update,beforeQueryUpdate,'T2 Back/Forward no reviven grant ni actualizan');
        // SDK 2.115: _isPKCECallback exige code Y verificador almacenado. Sin
        // verificador estos casos no deben intercambiar code. La fixture sólo
        // cuenta/rechaza intentos inesperados; esto NO certifica PKCE válido.
        assert.equal(counts.pkce,beforeQueryPkce,'T2 sin verificador no hay exchange PKCE');
        console.log(`✓ T2 ${viewport} ${kind} session=${withSession}: UI segura, URL/history limpios, update=0, pkce=0`);
      } finally {
        await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:observer.identifier});
      }
    };
    await queryCallback('code-malformed',false);
    await queryCallback('code-malformed',true);
    await queryCallback('code-no-verifier',false);
    await queryCallback('code-no-verifier',true);
    await queryCallback('provider-error',false);
    await queryCallback('provider-error',true);
    // Aislar también el viewport siguiente, sin mutaciones al proveedor.
    diagnosticPhase='t2-cleanup';
    await cdp.evaluate('localStorage.clear(); sessionStorage.clear()');
    console.log(`collector ${viewport}: ${JSON.stringify(diagnosticCounts)}`);
    console.log(`collector diagnostic ${viewport}: ${JSON.stringify([...diagnosticDetails].map(([detail,count]) => ({...JSON.parse(detail),count})))}`);
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
export async function main({runMutants} = {}) {
  const receipts = [];
  const deadline = setTimeout(async () => { console.error('Timeout global de recovery'); await teardown(); process.exit(1); }, runMutants ? 600_000 : 240_000);
  try {
    await mkdir(EVIDENCE,{recursive:true});
    const runtime = await startBrowser();
    await runViewport({...runtime,width:390,height:844,mobile:true},runMutants,receipts);
    await runViewport({...runtime,width:1440,height:900,mobile:false},runMutants,receipts);
    await checkMcp(runtime.appUrl);
    assert.deepEqual(boundaryErrors,[]);
    assert.equal(counts.externalMutations,0);
    assert.equal(counts.external,0);
    assert.equal(counts.database,0);
    console.log('✓ Requests externos y mutaciones fuera de fixture: 0');
    if (runMutants) {
      assert.ok(receipts.length > 0,'T1 mutantes ejecutados');
      assert.ok(receipts.every(receipt => receipt.killed && receipt.restored),'T1 mutantes muertos y restaurados');
      await writeFile(join(EVIDENCE,'t1-tab-mutants.json'),JSON.stringify({receipts,external:0,externalMutations:0},null,2)+'\n');
    }
  } finally {
    clearTimeout(deadline);
    await teardown();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) {
    // No objetos, valores de campos, URL de callback ni cuerpos HTTP.
    console.error(error instanceof assert.AssertionError ? error.message : 'Browser recovery: fallo de infraestructura (detalle omitido)');
    process.exitCode=1;
  }
}
