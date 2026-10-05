// Solo lo ejecuta el supervisor. SDK real; interceptación exclusivamente en la frontera HTTP.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Cdp, openTarget, waitUntil, delay, teardown, startBrowser, pressTab, pressEnter, assertKeyboardFocus } from './browser-login.mjs';

const EVIDENCE = process.env.RECOVERY_EVIDENCE_DIR ?? '/home/domarchithinkpad/.hermes/cache/scratch/password-recovery-20261005/travel/build-v2';
const AUTH = 'http://127.0.0.1:54321';
const agentBrowser = process.env.AGENT_BROWSER_BIN ?? '/home/domarchithinkpad/.hermes/cache/scratch/password-recovery-20261005/tools/node_modules/.bin/agent-browser';
let agentSession;
const agentSessionArgs = () => ['--session',agentSession,'--restore','--restore-save','never'];
const execFileAsync = promisify(execFile);
let agentAttached = false;
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
        responseHeaders: [{name:'Content-Type',value:'application/json'}, {name:'Access-Control-Allow-Origin',value:appOrigin}, {name:'Access-Control-Allow-Headers',value:'authorization,apikey,content-type,x-client-info,x-supabase-api-version,content-profile,accept-profile'}, {name:'Access-Control-Allow-Methods',value:'GET,POST,PUT,OPTIONS'}],
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
        await reply(scenario === 'quota' ? 429 : 200, scenario === 'quota' ? {code:'over_email_send_rate_limit',msg:'fixture-provider-private'} : {});
        return;
      }
      if (url.pathname === '/auth/v1/user' && request.method === 'GET') {
        counts.user++;
        const authorization = Object.entries(request.headers).find(([key])=>key.toLowerCase()==='authorization')?.[1];
        assert.ok(authorization === 'Bearer '+fixtureAccess, 'SDK presenta sesión emitida por fixture');
        if (scenario === 'delayed-expired') await delayedValidation;
        const expired = scenario === 'expired' || scenario === 'delayed-expired';
        await reply(expired ? 401 : 200, expired ? {code:'session_not_found',msg:'fixture-private'} : fixtureUser); return;
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

async function fill(cdp, selector, text) {
  await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus(); document.querySelector(${JSON.stringify(selector)}).select()`);
  await cdp.send('Input.insertText',{text});
}
async function activate(cdp, selector) {
  await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  await pressEnter(cdp);
}
async function touch(cdp, selector) {
  const point = await cdp.evaluate(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
async function screen(cdp, name) {
  await delay(200); // Esperar las transiciones de tema antes de capturar.
  assert.equal(await cdp.evaluate(`[...document.querySelectorAll('input[type="password"]')].every(x => x.value === '')`),true,'captura solo con claves vacías');
  const shot = await cdp.send('Page.captureScreenshot',{format:'png'});
  await writeFile(join(EVIDENCE, name+'.png'),Buffer.from(shot.data,'base64'));
}
async function runViewport({cdpPort,appUrl,width,height,mobile}) {
  const target = await openTarget(cdpPort);
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  const errors = [];
  cdp.onEvent(({method,params}) => {
    // Record categories only: never bodies, URLs, tokens, provider messages or input values.
    if (method === 'Runtime.exceptionThrown') errors.push('runtime exception');
    const expectedFailure = ['quota','transport','expired','delayed-expired','update-error','update-expired','signout-error','reused','malformed'].includes(scenario);
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
    expectedOrigin = new URL(appUrl).origin;
    const navigate = async (path='/') => {
      await cdp.send('Page.navigate',{url:new URL(path,appUrl).href});
      await waitUntil(cdp,`!!document.querySelector('[data-login-card]')`,'login listo');
    };
    for (const kind of ['known','unknown','quota','transport']) {
      scenario = kind;
      await navigate();
      await cdp.evaluate('sessionStorage.clear()');
      assert.equal(await cdp.evaluate(`!!document.querySelector('[data-recovery-action]')`),true,'login ofrece ¿Olvidaste tu contraseña?');
      await activate(cdp,'[data-recovery-action]');
      await waitUntil(cdp,`document.querySelector('h1')?.textContent === 'Recuperar contraseña'`,'formulario de solicitud');
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
      await waitUntil(cdp,`document.querySelector('[role="status"], [role="alert"]')?.textContent?.includes(${JSON.stringify(kind==='known'||kind==='unknown'?'Si existe una cuenta':'No pudimos enviar')})`,'resultado genérico');
      assert.equal(counts.recover,before+1,'doble envío bloqueado');
      assert.equal(await cdp.evaluate(`document.body.innerText.includes('fixture-provider-private')`),false,'sin mensaje del proveedor');
      assert.equal(await cdp.evaluate(`document.querySelector('form button[type="submit"]').disabled`),true,'enfriamiento después de respuesta');
      await activate(cdp,'[data-back-login]');
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
      assert.equal(await cdp.evaluate(`location.hash !== ''`),true,'el SDK conserva el callback mientras inicializa');
      assert.equal(await cdp.evaluate(`!!document.querySelector('input[name="new-password"]')`),false,'checking nunca abre el formulario');
    } finally { releaseValidation(); }
    await deny();
    assert.equal(counts.update,beforeDelayedUpdate,'validación demorada inválida nunca actualiza');
    await waitUntil(cdp,`location.pathname === '/actualizar-clave' && location.hash === '' && location.search === ''`,'URL limpia después de invalid tardío',3000);
    console.log(`✓ callback demorado ${width}: checking >1200 ms, invalid sin formulario, URL limpia`);
    const beforeNegatives = counts.update;
    for (const kind of ['missing','malformed','reused','expired','normal']) {
      const url = kind === 'expired' ? callbackUrl(appUrl) : kind === 'normal' ? callbackUrl(appUrl,'signup') : new URL('/actualizar-clave',appUrl).href + (kind==='malformed' ? '#type=recovery&access_token=malformed' : kind==='reused' ? '#error=access_denied&error_code=otp_expired' : '');
      const beforeUser=counts.user;
      await openRecovery(kind,url);
      await deny();
      if (kind === 'expired' || kind === 'normal') assert.ok(counts.user > beforeUser, 'callback ejercita SDK y proveedor');
      console.log(`✓ sesión ${kind} ${width}: rechazada`);
      if (kind === 'normal') {
        // Existing session, SDK INITIAL_SESSION on reload, no fake session storage.
        await cdp.send('Page.navigate',{url:new URL('/actualizar-clave',appUrl).href});
        await deny();
      }
    }
    assert.equal(counts.update,beforeNegatives,'negativos nunca llaman updateUser');
    for (const kind of ['valid','update-error','update-expired','signout-error']) {
      await openRecovery(kind,callbackUrl(appUrl));
      await waitUntil(cdp,`!!document.querySelector('input[name="new-password"]')`,'PASSWORD_RECOVERY válido');
      if (kind === 'valid') {
        await screen(cdp,`recovery-${width}-empty`);
        if (mobile) await touch(cdp,'button[aria-label^="Activar modo"]');
        else await activate(cdp,'button[aria-label^="Activar modo"]');
        await waitUntil(cdp,`document.documentElement.dataset.theme === 'light'`,'recuperación tema claro');
        await screen(cdp,`recovery-${width}-light-empty`);
        assert.equal(await cdp.evaluate(`document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight`),true,'geometría de actualización');
        await fill(cdp,'input[name="new-password"]',randomUUID().slice(0,5));
        await fill(cdp,'input[name="confirm-password"]',randomUUID().slice(0,5));
        const before=counts.update;
        await activate(cdp,'form button[type="submit"]'); await delay(150);
        assert.equal(counts.update,before,'política bloquea update');
        await fill(cdp,'input[name="new-password"]',randomUUID());
        await fill(cdp,'input[name="confirm-password"]',randomUUID());
        await activate(cdp,'form button[type="submit"]');
        await waitUntil(cdp,`document.querySelector('[role="alert"]')?.textContent.includes('no coinciden')`,'confirmación distinta');
        assert.equal(counts.update,before,'mismatch bloquea update');
      }
      expectedPassword = randomUUID()+'aA!';
      await fill(cdp,'input[name="new-password"]',expectedPassword);
      await fill(cdp,'input[name="confirm-password"]',expectedPassword);
      const before=counts.update;
      const beforeLogout=counts.logout;
      await pressTab(cdp);
      await assertKeyboardFocus(cdp,{name:'guardar contraseña',selector:'form button[type="submit"]'},String(width));
      await pressEnter(cdp); await pressEnter(cdp);
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

try {
  await mkdir(EVIDENCE,{recursive:true});
  const { stdout: scopedId } = await execFileAsync(agentBrowser,['session','id','--scope','worktree','--prefix','travel-recovery'],{cwd:process.cwd(),timeout:10000});
  agentSession = scopedId.trim();
  assert.ok(agentSession && !/\s/.test(agentSession),'agent-browser devuelve un id oficial de worktree');
  const runtime = await startBrowser();
  // Attach only to Chrome owned by this harness; scoped session, never a human browser.
  agentAttached = true;
  await execFileAsync(agentBrowser,[...agentSessionArgs(),'--cdp',String(runtime.cdpPort),'open','about:blank'],{cwd:process.cwd(),timeout:20000});
  await execFileAsync(agentBrowser,[...agentSessionArgs(),'--cdp',String(runtime.cdpPort),'get','title'],{cwd:process.cwd(),timeout:20000});
  console.log('✓ agent-browser: id oficial scope worktree, prefix travel-recovery; open/get/close con restore sin guardar auth');
  // MCP is local and diagnostics contain no application data.
  const mcp = await fetch(new URL('/_next/mcp',runtime.appUrl),{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}}),signal:AbortSignal.timeout(5000)});
  const catalog = await mcp.text();
  console.log(`MCP tools/list HTTP ${mcp.status}; get_compilation_issues ${catalog.includes('get_compilation_issues') ? 'disponible' : 'no expuesto'}`);
  if (catalog.includes('get_compilation_issues')) {
    const diagnostics = await fetch(new URL('/_next/mcp',runtime.appUrl),{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_compilation_issues',arguments:{}}}),signal:AbortSignal.timeout(5000)});
    await diagnostics.text(); console.log(`MCP get_compilation_issues HTTP ${diagnostics.status}`);
  }
  await runViewport({...runtime,width:390,height:844,mobile:true});
  await runViewport({...runtime,width:1440,height:900,mobile:false});
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
  if (agentAttached) {
    try { await execFileAsync(agentBrowser,[...agentSessionArgs(),'close'],{cwd:process.cwd(),timeout:15000}); } catch { process.exitCode=1; console.error('No se pudo cerrar la sesión aislada de agent-browser'); }
  }
  await teardown();
}
