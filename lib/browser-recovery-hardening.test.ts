import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const root = new URL('../', import.meta.url);
const recovery = await readFile(new URL('scripts/browser-recovery.mjs', root), 'utf8');
const login = await readFile(new URL('scripts/browser-login.mjs', root), 'utf8');

// Aislar sólo helpers: importar recovery hoy arrancaría Chrome y abriría sockets.
// Esto prueba el contrato de un paso; el DOM, readiness y navegación reales
// siguen siendo responsabilidad de BROWSER_RECOVERY y T1_MUTANTS.
function helper(source: string, name: string): string {
  const match = source.match(new RegExp(`^async function ${name}\\([^]*?^}`, 'm'));
  assert.ok(match, `T1 helper existente: ${name}`);
  return match[0];
}

const helpers = [helper(login, 'pressTab'), helper(login, 'pressEnter'),
  helper(recovery, 'tabTo'), helper(recovery, 'activate')].join('\n');

type KeyEvent = { type: string; key?: string; modifiers?: number; text?: string };
function keyboard(order: string[], start: string, present: string[] = []) {
  const nodes = new Map([...order, start, ...present].map(selector => [selector, { selector }]));
  let current = start;
  const events: KeyEvent[] = [];
  const document = {
    get activeElement() { return nodes.get(current); },
    querySelector(selector: string) { return nodes.get(selector) ?? null; },
  };
  const cdp = {
    async send(method: string, event: KeyEvent) {
      assert.equal(method, 'Input.dispatchKeyEvent', 'T1 sólo teclado nativo');
      events.push(event);
      if (event.type === 'rawKeyDown' && event.key === 'Tab') {
        const offset = event.modifiers === 8 ? -1 : 1;
        current = order[(order.indexOf(current) + offset + order.length) % order.length];
      }
    },
    async evaluate(expression: string) { return runInNewContext(expression, { document }); },
  };
  const api = runInNewContext(`${helpers}\n({ tabTo, activate })`, { assert });
  return { cdp, events, api, active: () => current };
}

const controls = {
  theme: 'button[aria-label^="Activar modo"]',
  email: 'input[name="email"]',
  password: 'input[name="password"]',
  login: 'form button',
  request: '[data-recovery-action]',
  demo: '[data-demo-action]',
  submit: 'form button[type="submit"]',
  newPassword: 'input[name="new-password"]',
  confirmation: 'input[name="confirm-password"]',
  newLink: 'a[href="/recuperar-clave"]',
  back: '[data-back-login]',
  retry: '[data-retry-signout]',
};

// Nombres sanitizados y estables para cada acción relevante. No se incluyen
// valores de inputs, identidades, URLs de callback ni material de autenticación.
for (const backwards of [false, true]) {
  const direction = backwards ? 'reverse' : 'forward';
  test(`T1 ${direction}: un Tab certifica el siguiente control exacto`, async () => {
    const order = ['previous', 'expected', 'next'];
    const browser = keyboard(order, backwards ? 'next' : 'previous');
    await browser.api.tabTo(browser.cdp, 'expected', backwards);
    assert.equal(browser.active(), 'expected');
    assert.deepEqual(browser.events.map(event => [event.type, event.key, event.modifiers]), [
      ['rawKeyDown', 'Tab', backwards ? 8 : 0], ['keyUp', 'Tab', backwards ? 8 : 0],
    ]);
  });

  for (const [name, selector] of Object.entries(controls)) {
    for (const mutation of ['remove', 'reorder'] as const) {
      test(`T1 mutant ${mutation}-${name}-${direction}: assertion en el primer paso incorrecto`, async () => {
        // El control reordenado sigue siendo alcanzable: el helper de 14 Tabs
        // lo acepta hoy. Quitar del tab order también debe fallar sin buscarlo.
        const order = mutation === 'remove' ? ['anchor', 'unexpected']
          : backwards ? ['anchor', selector, 'unexpected'] : ['anchor', 'unexpected', selector];
        const browser = keyboard(order, 'anchor', [selector]);
        await assert.rejects(() => browser.api.tabTo(browser.cdp, selector, backwards),
          (error: unknown) => {
            assert.ok(error instanceof assert.AssertionError, 'T1 muerte por assertion, no bootstrap/timeout');
            assert.ok(error.message.includes(selector), 'T1 assertion identifica la parada incumplida');
            return true;
          }, `T1 ${mutation}-${name}-${direction} debe morir aunque el destino sea alcanzable`);
        assert.equal(browser.events.filter(event => event.type === 'rawKeyDown').length, 1,
          `T1 ${mutation}-${name}-${direction}: no buscar el destino con Tabs adicionales`);
      });
    }
  }
}

for (const [name, selector] of [['new-link', controls.newLink], ['back-login', controls.back]]) {
  test(`T1 Enter nativo alternativa ${name}`, async () => {
    const browser = keyboard(['anchor', selector], 'anchor');
    await browser.api.activate(browser.cdp, selector);
    assert.equal(browser.active(), selector);
    const enter = browser.events.filter(event => event.key === 'Enter');
    assert.deepEqual(enter.map(event => event.type), ['rawKeyDown', 'char', 'keyUp']);
    assert.equal(enter[1].text, '\r');
    // El helper aislado no basta: exigir que el recorrido invoque cada salida.
    const literal = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.ok(new RegExp(`await activate\\(cdp,\\s*'${literal}'\\)`).test(recovery),
      `T1 browser debe activar ${name} con Enter, además de comprobar su presencia`);
  });
}

test('T1 teclado sin focus ni click JavaScript', () => {
  assert.doesNotMatch(recovery, /\.(?:focus|click)\s*\(/,
    'T1 el recorrido no puede saltar el tab order ni la activación nativa');
});

// Guards de cobertura del arnés. No importan/ejecutan el browser: el supervisor
// debe comprobar después estos mismos casos con el SDK y la frontera HTTP reales.
function t2Local(name: string): string {
  const match = recovery.match(new RegExp(`^    const ${name} = async \\([^]*?^    };`, 'm'));
  assert.ok(match, `T2 falta recorrido browser explícito: ${name}`);
  return match[0];
}

for (const kind of ['code-malformed', 'code-no-verifier', 'provider-error']) {
  for (const withSession of [false, true]) {
    test(`T2 query ${kind}, sesión ordinaria=${withSession}: caso browser invocado`, () => {
      const viewport = recovery.match(/^async function runViewport\([^]*?^}/m)?.[0] ?? '';
      assert.ok(new RegExp(`await queryCallback\\('${kind}',\\s*${withSession}\\)`).test(viewport),
        `T2 falta invocar ${kind} con sesión ordinaria=${withSession} en ambos viewports`);
    });
  }
}

test('T2 query navega al callback real, rechaza grant y no actualiza antes ni después del historial', () => {
  const callback = t2Local('queryCallback');
  for (const parameter of ['code', 'error', 'error_description']) {
    assert.ok(new RegExp(`searchParams\\.set\\('${parameter}',`).test(callback),
      `T2 callback debe llevar query ${parameter}, no sólo hash`);
  }
  assert.ok(/new URL\('\/actualizar-clave',\s*appUrl\)/.test(callback), 'T2 ruta real de actualización');
  assert.ok(/cdp\.send\('Page.navigate',/.test(callback), 'T2 SDK procesa navegación real');
  assert.ok(/const beforeQueryUpdate\s*=\s*counts\.update/.test(callback), 'T2 snapshot de updates por caso');
  assert.ok(/await deny\(\)/.test(callback), 'T2 UI rechazada y sin formulario de nueva clave');
  assert.ok(/assert\.equal\(counts\.update,\s*beforeQueryUpdate/.test(callback), 'T2 cero update al rechazar');
  assert.ok(/await assertCleanHistory\(cdp,\s*true\);[^]*assert\.equal\(counts\.update,\s*beforeQueryUpdate/.test(callback),
    'T2 Back/Forward tampoco revive autorización ni provoca update');
  const history = recovery.match(/^async function assertCleanHistory\([^]*?^}/m)?.[0] ?? '';
  assert.ok(/!url\.hash && !url\.search/.test(history), 'T2 todas las entradas sin query ni hash');
  assert.equal((history.match(/Page\.navigateToHistoryEntry/g) ?? []).length, 2, 'T2 Back y Forward reales');
  assert.ok(/location\.hash === '' && location\.search === ''/.test(history), 'T2 URL visible limpia tras navegar');
});

test('T2 sesión ordinaria nace del login SDK/fixture, sin reemplazar auth ni sembrar almacenamiento', () => {
  const callback = t2Local('queryCallback');
  assert.ok(/if \(withSession\) await establishOrdinarySession\(\);/.test(callback),
    'T2 establecer sesión ordinaria antes del callback cuando corresponde');
  const session = t2Local('establishOrdinarySession');
  assert.ok(/await fill\(cdp,/.test(session) && /await activate\(cdp,'form button'\)/.test(session),
    'T2 login por formulario real y Enter');
  assert.ok(/assert\.equal\(counts\.login,\s*beforeLogin\s*\+\s*1/.test(session), 'T2 verificar login HTTP efectivo');
  assert.ok(/await installBoundary\(cdp,appUrl\)/.test(recovery), 'T2 conservar frontera HTTP existente');
  assert.ok(!/auth\s*\.\s*\w+\s*=|recoveryAccess\.(?:record|beginLocalCallback)\s*\(|(?:localStorage|sessionStorage)\.setItem\s*\(/.test(recovery),
    'T2 no sustituir auth methods, conceder grant ni inyectar sesión en storage');
  const afterSession = callback.slice(callback.indexOf('await establishOrdinarySession();') + 'await establishOrdinarySession();'.length);
  assert.ok(!/openRecovery\s*\(|(?:localStorage|sessionStorage)\.clear\s*\(/.test(afterSession),
    'T2 no borrar la sesión ordinaria antes de medir el callback');
});

test('T2 code arbitrario no inventa éxito PKCE en fixture', () => {
  const callback = t2Local('queryCallback');
  assert.ok(/const beforeQueryPkce\s*=\s*counts\.pkce/.test(callback), 'T2 contar exchanges PKCE por caso');
  assert.ok(/assert\.equal\(counts\.pkce,\s*beforeQueryPkce/.test(callback),
    'T2 sin verificador no afirmar un exchange exitoso');
  const pkce = recovery.match(/if \(url\.pathname === '\/auth\/v1\/token' && url\.searchParams\.get\('grant_type'\) === 'pkce'\) \{([^]*?)return;\s*}/)?.[1];
  assert.ok(pkce, 'T2 fixture debe rechazar y contar cualquier exchange PKCE inesperado');
  assert.ok(/counts\.pkce\+\+/.test(pkce) && /await reply\((?:400|401|403),/.test(pkce),
    'T2 fixture sólo ofrece rechazo PKCE');
  assert.ok(!/await reply\(2\d\d,/.test(pkce), 'T2 no acuñar sesión PKCE sintética');
});

// Pruebas puras de clasificación: trazas sintéticas CDP, sin arrancar un browser
// ni sustituir auth. La medición real sigue siendo BROWSER_RECOVERY del supervisor.
function hmrTrace(options: { observed?: boolean; sameDocument?: boolean; sameId?: boolean; forward?: boolean } = {}) {
  const source=recovery.match(/^function createHmrLifecycleCollector\([^]*?^}/m)?.[0];
  assert.ok(source, 'T2 clasificador HMR aislable');
  const create=runInNewContext(`${source}\ncreateHmrLifecycleCollector`, { URL, assert });
  const app='http://127.0.0.1:3100';
  const socket='ws://127.0.0.1:3100/_next/hmr?id=synthetic-document';
  const collector=create(app);
  const path=options.forward ? '/actualizar-clave' : '/recuperar-clave';
  const frame={id:'main',loaderId:'previous',url:app+path};
  collector.navigated(frame,'Navigation');
  if (options.observed !== false) collector.socketCreated({requestId:'socket',url:socket});
  if (options.sameDocument === false) collector.navigated({...frame,loaderId:'different'},'Navigation');
  const target=collector.capture(path,options.sameId === false ? 'different' : 'synthetic-document');
  collector.navigated({...frame,loaderId:'callback',url:app+(options.forward ? '/recuperar-clave' : '/actualizar-clave')},'Navigation');
  const entry={source:'network',level:'error',url:frame.url,
    text:`WebSocket connection to '${socket}' failed: Page entered Back-Forward Cache.`};
  return {collector,target,frame,entry};
}

for (const direction of ['back','forward']) {
test(`T2 HMR ${direction}: sólo acepta una entrada exacta tras confirmar el mismo documento BFCache`, () => {
  const {collector,target,frame,entry}=hmrTrace({forward:direction === 'forward'});
  const phase='t2-history-'+direction;
  assert.equal(collector.stage(entry,phase),false,'fuera de transición falla');
  collector.begin(direction,target);
  assert.equal(collector.stage(entry,phase),true,'candidato exacto observado previamente');
  assert.equal(collector.stage(entry,phase),false,'duplicado sigue siendo error');
  collector.navigated(frame,'BackForwardCacheRestore');
  const result=collector.finish();
  assert.equal(result.expected,1);
  assert.equal(result.rejected,0);
  assert.equal(collector.stage(entry,phase),false,'transición cerrada falla');
});
}

for (const mutation of ['text','suffix','newline','external','port','protocol','path','extra-query',
  'source','level','request-id','document-path','document-origin','phase','unobserved','other-document','other-id']) {
  test(`T2 HMR rechazo estricto: ${mutation}`, () => {
    const {collector,target,entry}=hmrTrace({observed:mutation !== 'unobserved',
      sameDocument:mutation !== 'other-document',sameId:mutation !== 'other-id'});
    const altered: Record<string,string>={...entry};
    if (mutation === 'text') altered.text='unexpected console.error marker';
    if (mutation === 'suffix') altered.text+=' unrelated';
    if (mutation === 'newline') altered.text+='\n';
    if (mutation === 'external') altered.text=entry.text.replace('127.0.0.1','external.invalid');
    if (mutation === 'port') altered.text=entry.text.replace(':3100',':3101');
    if (mutation === 'protocol') altered.text=entry.text.replace('ws:','http:');
    if (mutation === 'path') altered.text=entry.text.replace('/_next/hmr','/other');
    if (mutation === 'extra-query') altered.text=entry.text.replace('synthetic-document','synthetic-document&extra=1');
    if (mutation === 'source') altered.source='javascript';
    if (mutation === 'level') altered.level='warning';
    if (mutation === 'request-id') altered.networkRequestId='unrelated';
    if (mutation === 'document-path') altered.url=entry.url.replace('recuperar-clave','actualizar-clave');
    if (mutation === 'document-origin') altered.url=entry.url.replace('127.0.0.1','external.invalid');
    collector.begin('back',target);
    assert.equal(collector.stage(altered,mutation === 'phase' ? 't2-history-forward' : 't2-history-back'),false);
    assert.equal(collector.finish().expected,0);
  });
}

for (const mutation of ['missing-restore','normal-navigation','wrong-loader','wrong-frame','wrong-route','multiple-navigations']) {
  test(`T2 HMR candidato sin restore exacto se devuelve como error: ${mutation}`, () => {
    const {collector,target,frame,entry}=hmrTrace();
    collector.begin('back',target);
    assert.equal(collector.stage(entry,'t2-history-back'),true);
    const restored={...frame};
    if (mutation === 'wrong-loader') restored.loaderId='different';
    if (mutation === 'wrong-frame') restored.id='different';
    if (mutation === 'wrong-route') restored.url=entry.url.replace('recuperar-clave','actualizar-clave');
    if (mutation !== 'missing-restore') collector.navigated(restored,mutation === 'normal-navigation' ? 'Navigation' : 'BackForwardCacheRestore');
    if (mutation === 'multiple-navigations') collector.navigated(frame,'BackForwardCacheRestore');
    const result=collector.finish();
    assert.equal(result.expected,0);
    assert.equal(result.rejected,1);
  });
}

// T3: ejecutar sólo el arranque aislado con dobles de IO. Nunca importar el
// módulo, crear procesos/sockets ni abrir Chrome desde este contrato.
const sandboxFlagNames = [
  '--headless','--remote-debugging-port','--user-data-dir','--no-first-run',
  '--no-default-browser-check','--disable-background-networking',
  '--disable-component-update','--disable-domain-reliability','--disable-sync',
  '--metrics-recording-only','--disable-features',
];
const sandboxGuardSource = () => login.match(/^(?:export )?function assertSandboxedChromeArgs\([^]*?^}/m)?.[0].replace(/^export /,'') ?? '';

for (const platform of ['linux','darwin','win32']) {
  test(`T3 ${platform}: argv real del arranque sin bypass y recibo sanitizado`, async () => {
    const start=login.match(/^export async function startBrowser\([^]*?^}/m)?.[0];
    assert.ok(start,'T3 arranque compartido existente');
    const launches: { command: string; args: string[] }[]=[];
    const output: string[]=[];
    await runInNewContext(`let ownedRoot;\n${sandboxGuardSource()}\n${start.replace(/^export /,'')}\nstartBrowser()`, {
      assert, ROOT:'/synthetic-root',
      process:{platform,execPath:'synthetic-node',env:{CHROME_ARGS:'--no-sandbox',CHROMIUM_FLAGS:'--disable-setuid-sandbox',CHROME_NO_SANDBOX:'1'}},
      mkdtemp:async () => '/sensitive-profile-marker', tmpdir:() => '/synthetic-tmp',
      join:(...parts: string[]) => parts.join('/'), freePort:async () => 3100,
      chromePath:async () => 'synthetic-chrome', waitForHttp:async () => {}, waitForDevTools:async () => 3200,
      spawnOwned:(command: string,args: string[]) => { launches.push({command,args:[...args]}); return {}; },
      console:{log:(...values: unknown[]) => output.push(values.join(' '))},
    });
    const browsers=launches.filter(launch => launch.command === 'synthetic-chrome');
    assert.equal(browsers.length,1,'T3 exactamente un arranque Chrome');
    const argv=browsers[0].args;
    const flags=argv.filter(arg => arg.startsWith('--')).map(arg => arg.split('=')[0]);
    assert.ok(flags.every(flag => sandboxFlagNames.includes(flag)),
      'T3 ningún flag de bypass, incluido no-sandbox, puede llegar al proceso');
    assert.deepEqual(argv.filter(arg => arg.startsWith('--disable-features')),
      ['--disable-features=Translate,OptimizationHints,MediaRouter'],'T3 no desactivar features de sandbox/aislamiento');
    assert.deepEqual(argv.filter(arg => !arg.startsWith('--')),['about:blank'],'T3 sin argumentos posicionales de bypass');
    const receiptLines=output.filter(line => line.startsWith('Chrome sandbox: '));
    assert.equal(receiptLines.length,1,'T3 recibo de argv obligatorio en el arranque compartido');
    const receipt=JSON.parse(receiptLines[0].slice('Chrome sandbox: '.length));
    assert.deepEqual(receipt,{sandboxEnabled:true,flags},'T3 recibo sólo booleano y nombres de flags efectivos');
    assert.ok(!output.join('\n').includes('sensitive-profile-marker'),'T3 no imprimir valores de argv');
    const assertion=start.search(/assertSandboxedChromeArgs\(\s*chromeArgs\s*\)/);
    assert.ok(assertion >= 0 && assertion < start.indexOf('const chrome = spawnOwned'),
      'T3 assert sobre argv efectivo antes de lanzar Chrome');
  });
}

test('T3 guard runtime rechaza bypasses y no revela valores en el rechazo', () => {
  const source=sandboxGuardSource();
  assert.ok(source,'T3 falta assertion runtime de argv sanitizada');
  const guard=runInNewContext(`${source}\nassertSandboxedChromeArgs`,{assert});
  const safe=['--headless=new','--user-data-dir=/sensitive-profile-marker','about:blank'];
  assert.deepEqual(JSON.parse(JSON.stringify(guard(safe))),
    {sandboxEnabled:true,flags:['--headless','--user-data-dir']});
  for (const bypass of ['--no-sandbox','--no-sandbox=true','--disable-setuid-sandbox',
    '--disable-seccomp-filter-sandbox','--disable-namespace-sandbox','--disable-gpu-sandbox',
    '--no-zygote','--single-process','--in-process-gpu','--disable-web-security',
    '--disable-site-isolation-trials','--disable-features=Sandbox,NetworkServiceSandbox',
    '--enable-features=NetworkServiceInProcess','--renderer-cmd-prefix=sensitive-argument-marker',
    '--gpu-launcher=sensitive-argument-marker','--unknown=sensitive-argument-marker']) {
    assert.throws(() => guard([...safe,bypass]),(error: unknown) => {
      assert.ok(error instanceof assert.AssertionError,'T3 rechazo por assertion deliberada');
      assert.ok(!/sensitive-(?:profile|argument)-marker/.test(error.message),'T3 rechazo sin valores privados');
      return true;
    },'T3 cualquier bypass debe rechazarse antes del spawn');
  }
});

test('T3 ambos gates usan exclusivamente el startBrowser compartido', () => {
  assert.match(recovery,/import\s*\{[^}]*\bstartBrowser\b[^}]*\}\s*from ['"]\.\/browser-login\.mjs['"]/);
  for (const [name,source] of [['baseline',login],['recovery',recovery]]) {
    const main=source.match(/^(?:export )?async function main\([^]*?^}/m)?.[0] ?? '';
    assert.match(main,/await startBrowser\(\)/,`T3 ${name} realmente invoca el arranque compartido`);
    assert.doesNotMatch(main,/\b(?:spawnOwned|spawn|exec|launch)\s*\(/,`T3 ${name} no tiene arranque alternativo`);
  }
  assert.doesNotMatch(recovery,/--(?:no-sandbox|disable-(?:setuid|seccomp-filter|namespace|gpu)-sandbox)|\b(?:spawnOwned|spawn|exec|launch)\s*\(/,
    'T3 recovery no introduce bypass ni otro proceso Chrome');
});

// Guard del workflow local; no ejecuta Actions ni descarga Chrome. El pin CI
// es distinto de la versión del navegador usado por el supervisor localmente.
async function t4Workflow() {
  const yaml=await readFile(new URL('.github/workflows/ci.yml',root),'utf8');
  const job=yaml.match(/^  verify:\r?\n([\s\S]*?)(?=^  [A-Za-z_][\w-]*:|(?![\s\S]))/m)?.[1];
  assert.ok(job,'T4 job verify existente');
  const steps=job.split(/(?=^ {6}- )/m).filter(block => /^ {6}- /.test(block));
  return {job,steps};
}

function t4Value(block: string, key: string, indent: number): string {
  const value=block.match(new RegExp(`^ {${indent}}${key}:[ \\t]*([^\\r\\n]*)$`,'m'))?.[1].trim() ?? '';
  return value.replace(/^(['"])(.*)\1$/,'$2');
}

function t4Setup(steps: string[]) {
  const setups=steps.filter(step => /^ {6}(?:- |  )uses: ['"]?browser-actions\/setup-chrome@v2['"]?[ \t]*$/m.test(step));
  assert.equal(setups.length,1,'T4 un setup Chrome explícito browser-actions/setup-chrome@v2');
  const setup=setups[0];
  const id=t4Value(setup.replace(/^ {6}- /,'        '),'id',8);
  assert.match(id,/^[A-Za-z_][A-Za-z0-9_-]*$/,'T4 setup Chrome con id propio');
  return {setup,id};
}

test('T4 Chrome CI tiene pin concreto verificado, dependencias y timeout de job', async () => {
  const {job,steps}=await t4Workflow();
  const {setup,id}=t4Setup(steps);
  const inputs=setup.match(/^ {8}with:\r?\n((?: {10}[^\r\n]*\r?\n?)*)/m)?.[1] ?? '';
  assert.equal(t4Value(inputs,'chrome-version',10),'154.0.8037.92',
    'T4 pin exacto, sin latest/stable ni versión local confundida con CI');
  assert.equal(t4Value(inputs,'install-dependencies',10),'true','T4 instalar dependencias Linux');
  assert.equal(steps.filter(step => t4Value(step.replace(/^ {6}- /,'        '),'id',8) === id).length,1,
    'T4 id de setup único en el job');
  const timeout=t4Value(job.split(/^ {4}steps:/m)[0],'timeout-minutes',4);
  assert.ok(/^[1-9]\d*$/.test(timeout),'T4 timeout de job entero positivo');
});

for (const script of ['test:browser','test:browser:recovery']) {
  test(`T4 ${script}: CHROME_PATH del setup y timeout propio`, async () => {
    const {steps}=await t4Workflow();
    const matches=steps.filter(step => t4Value(step.replace(/^ {6}- /,'        '),'run',8) === 'npm run '+script);
    assert.equal(matches.length,1,`T4 step explícito npm run ${script}`);
    const browser=matches[0];
    const env=browser.match(/^ {8}env:\r?\n((?: {10}[^\r\n]*\r?\n?)*)/m)?.[1] ?? '';
    const chromePath=t4Value(env,'CHROME_PATH',10);
    assert.ok(chromePath,`T4 ${script} recibe CHROME_PATH explícito`);
    const {setup,id}=t4Setup(steps);
    assert.equal(chromePath,'${{ steps.'+id+'.outputs.chrome-path }}',
      `T4 ${script} usa el output chrome-path exacto del setup`);
    assert.ok(steps.indexOf(setup) < steps.indexOf(browser),'T4 setup precede al browser');
    assert.ok(/^[1-9]\d*$/.test(t4Value(browser,'timeout-minutes',8)),
      `T4 ${script} tiene timeout-minutes entero positivo`);
  });
}

// Ejecutar el callback CDP de producción, sin ejecutar runViewport/main ni IO.
// Los únicos dobles son la suscripción y sus destinos de evidencia en memoria;
// no se replica ni sustituye la lógica que clasifica Runtime.consoleAPICalled.
for (const scenario of ['login-error','query-provider-error']) {
  for (const appearance of ['AuthApiError','TypeError']) {
    test(`T2 Runtime ${scenario}: console.error arbitrario con apariencia ${appearance} sigue fallando`, () => {
      const viewport=recovery.match(/^async function runViewport\([^]*?^}/m)?.[0] ?? '';
      const subscription=viewport.match(/^  cdp\.onEvent\(\(\{method,params\}\) => \{[^]*?^  \}\);/m)?.[0];
      assert.ok(subscription,'T2 callback CDP real del collector disponible');
      const errors: string[]=[];
      const counts=new Map<string,number>();
      type RuntimeEvent = { method: string; params: { type: string; args: Record<string,string>[] } };
      let handler: ((event: RuntimeEvent) => void) | undefined;
      runInNewContext(subscription,{
        scenario,errors,
        countDiagnostic:(category: string) => counts.set(category,(counts.get(category) ?? 0)+1),
        cdp:{onEvent:(callback: (event: RuntimeEvent) => void) => { handler=callback; }},
      });
      assert.ok(handler,'T2 handler real registrado sin iniciar el browser');
      const arg: Record<string,string>=appearance === 'AuthApiError'
        ? {type:'string',value:'AuthApiError: synthetic runtime marker'}
        : {type:'object',subtype:'error',description:'TypeError: Failed to fetch; synthetic runtime marker'};
      handler({method:'Runtime.consoleAPICalled',params:{type:'error',args:[arg]}});
      assert.deepEqual(errors,['unexpected console error'],
        'T2 console.error arbitrario no se acepta por scenario ni apariencia de error SDK');
      assert.equal(counts.get('unexpected.console-error'),1,'T2 diagnóstico Runtime inesperado contado');
      assert.equal(counts.get('expected.sdk-console.'+scenario),undefined,'T2 sin excepción Runtime por scenario');
    });
  }
}
