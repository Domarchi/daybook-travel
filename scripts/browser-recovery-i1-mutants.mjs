// Sólo supervisor, después de revisar/aprobar CUSTOM i1-browser-mutants.
// Runner LOCAL de esta tarea y sus roots cerrados; no es un gate portable de CI.
// No shell, Git, instalaciones, configuración global ni mutaciones del checkout.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE='/home/domarchithinkpad/Developer/password-recovery-review-close-20261006/travel';
const TMP='/home/domarchithinkpad/.hermes/cache/scratch/tc-d0et9_nt';
const EVIDENCE='/home/domarchithinkpad/.hermes/cache/scratch/password-recovery-review-close-20261006/travel';
const NODE='/home/domarchithinkpad/.local/share/mise/installs/node/24.21.0/bin/node';
const directories=['app','components','lib','public','scripts','docs','.github','supabase'];
const rootFiles=['AGENTS.md','CLAUDE.md','README.md','.gitignore','package.json','package-lock.json',
  'next-env.d.ts','next.config.mjs','postcss.config.mjs','tsconfig.json','skills-lock.json'];
const viewports={mobile:{width:390,height:844,mobile:true},desktop:{width:1440,height:900,mobile:false}};
const families={
  streams:['remove-runtime','remove-log','remove-both'],
  callbacks:['disconnect-console','disconnect-exception','disconnect-log'],
  markers:['ordinary-console','authapi-console','ordinary-exception'],
};
const allVariants=Object.values(families).flat();
const fixtureKinds=['unknown','quota','transport','expired','delayed-expired','verify-error',
  'network-callback','update-error','update-expired','signout-error','login-error'];
const enabled="['Page.enable','Runtime.enable','Log.enable','Network.enable']";
const collectorLog='    console.log(`collector ${viewport}: ${JSON.stringify(diagnosticCounts)}`);';
const recoveryPath='scripts/browser-recovery.mjs', loginPath='scripts/browser-login.mjs';
const entryPath='scripts/i1-private-entry.mjs';
const hash=value => createHash('sha256').update(value).digest('hex');
const pause=ms => new Promise(resolve => setTimeout(resolve,ms));
const json=(path,value) => writeFile(path,JSON.stringify(value,null,2)+'\n');

function options(argv) {
  assert.equal(argv.length,3,'I1 runner: tres opciones cerradas obligatorias');
  const result={};
  const allowed={family:['all',...Object.keys(families)],variant:['all',...allVariants],viewport:['both',...Object.keys(viewports)]};
  for (const arg of argv) {
    const match=/^--(family|variant|viewport)=([a-z-]+)$/.exec(arg);
    assert.ok(match && allowed[match[1]].includes(match[2]),'I1 runner: opción desconocida');
    assert.ok(!Object.hasOwn(result,match[1]),'I1 runner: opción duplicada');
    result[match[1]]=match[2];
  }
  const variants=result.family === 'all' ? allVariants : families[result.family];
  assert.ok(result.variant === 'all' || variants.includes(result.variant),'I1 runner: variante fuera de familia');
  return {...result,variants:result.variant === 'all' ? variants : [result.variant],
    viewports:result.viewport === 'both' ? Object.keys(viewports) : [result.viewport]};
}

function replaceOne(source,site,replacement,sites,label) {
  assert.equal(source.split(site).length-1,1,`I1 runner: sitio único ${label}`);
  sites.push({label,occurrences:1,before:hash(site),after:hash(replacement)});
  return source.replace(site,() => replacement);
}

function mutate(source,variant,sites) {
  if (variant === 'control') return source;
  if (families.streams.includes(variant)) {
    const replacement=variant === 'remove-runtime' ? "['Page.enable','Log.enable','Network.enable']"
      : variant === 'remove-log' ? "['Page.enable','Runtime.enable','Network.enable']" : "['Page.enable','Network.enable']";
    return replaceOne(source,enabled,replacement,sites,variant);
  }
  if (families.callbacks.includes(variant)) {
    const site={
      'disconnect-console':"if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {",
      'disconnect-exception':"if (method === 'Runtime.exceptionThrown') {",
      'disconnect-log':"if (method === 'Log.entryAdded' && params.entry.level === 'error') {",
    }[variant];
    return replaceOne(source,site,site.replace('if (','if (false && '),sites,variant);
  }
  assert.ok(families.markers.includes(variant),'I1 runner: variante cerrada');
  const expression=variant === 'ordinary-exception'
    ? "setTimeout(function ordinaryI1Exception() { throw new Error('TRAVEL_I1_ORDINARY_EXCEPTION'); }, 0)"
    : variant === 'authapi-console' ? "console.error('AuthApiError: TRAVEL_I1_ORDINARY_CONSOLE')"
      : "console.error('TRAVEL_I1_ORDINARY_CONSOLE')";
  const counter=variant === 'ordinary-exception' ? 'unexpected.runtime-exception' : 'unexpected.console-error';
  // Runtime real: excepción ordinaria en about:blank tras cerrar el canary;
  // marcadores console conservan el documento final. Sin tocar auth/DOM.
  // Si no se entrega, el guard final sobrevivirá: NO lanzar un error artificial.
  const injection=`    await cdp.send('Runtime.evaluate',{expression:${JSON.stringify(expression)},returnByValue:true});
    const markerDeadline=Date.now()+2000;
    while (!diagnosticCounts[${JSON.stringify(counter)}] && Date.now()<markerDeadline) await delay(20);
`;
  if (variant === 'ordinary-exception') {
    const site='      runtimeCanary.open=false;\n    }\n';
    return replaceOne(source,site,site+injection,sites,variant);
  }
  return replaceOne(source,collectorLog,injection+collectorLog,sites,variant);
}

async function directory(path) {
  assert.equal(await realpath(path),path,'I1 runner: root canónico sin alias');
  const stat=await lstat(path);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(),'I1 runner: directorio real');
}

async function copyDependencies(modules,target) {
  const receipt={files:0,links:0,bytes:0,nextPackageSha256:hash(await readFile(join(modules,'next/package.json')))};
  async function visit(path) {
    const source=join(modules,path), destination=join(target,path), stat=await lstat(source);
    assert.ok(!path.split('/').some(part=>part.startsWith('.env') || ['.git','.next','.cache'].includes(part)),
      'I1 deps: runtime/config/cache fuera de copia');
    if (stat.isSymbolicLink()) {
      const internal=relative(modules,await realpath(source));
      assert.ok(!internal.startsWith('..') && !isAbsolute(internal),'I1 deps: enlace fuera del árbol instalado');
      await symlink(relative(dirname(destination),join(target,internal)),destination);
      receipt.links++;
    } else if (stat.isDirectory()) {
      await mkdir(destination);
      for (const name of await readdir(source)) await visit(join(path,name));
    } else {
      assert.ok(stat.isFile(),'I1 deps: archivo instalado normal');
      // Reflink si el filesystem lo permite; fallback de copyFile, no hardlink.
      await copyFile(source,destination,constants.COPYFILE_FICLONE);
      receipt.files++; receipt.bytes+=stat.size;
    }
  }
  await visit('');
  assert.equal(hash(await readFile(join(target,'next/package.json'))),receipt.nextPackageSha256,'I1 deps: Next instalado preservado');
  return receipt;
}

function bootstrapDiagnostic(error,phase,children=[]) {
  // Examinar en memoria el buffer existente (máximo 30k por child). Nunca
  // persistir mensaje, output, URL, stack raw ni fragmentos coincidentes.
  const text=String(error?.message ?? '')+'\n'+children.map(child=>child.output?.() ?? '').join('\n');
  const rules=[
    ['TURBOPACK_ROOT',/outside (?:of )?(?:the )?project root|root directory.*(?:incorrect|resolve)|symlink.*outside/is],
    ['TURBOPACK_PANIC',/Turbopack.*(?:panic|fatal)|panicked at/is],
    ['DEPENDENCY_RESOLUTION',/Cannot find module|MODULE_NOT_FOUND|Module not found|couldn.t find the next package/i],
    ['NEXT_EXIT_BEFORE_READY',/Next terminó antes de estar listo/],
    ['NEXT_READY_TIMEOUT',/Next no quedó listo/],
    ['CHROME_EXIT_BEFORE_CDP',/Chrome terminó antes de exponer CDP/],
    ['CHROME_CDP_TIMEOUT',/Chrome no expuso CDP/],
    ['CHROME_BINARY_MISSING',/No se encontró Chrome/],
    ['REGISTRY_CONTRACT',/I1 cleanup registry/],
    ['OWNERSHIP_CONTRACT',/I1 cleanup ownership/],
  ];
  const categories=rules.filter(([,pattern])=>pattern.test(text)).map(([name])=>name);
  const frames=[...String(error?.stack ?? '').matchAll(/\/(browser-login\.mjs|browser-recovery\.mjs|i1-private-entry\.mjs):(\d+):(\d+)/g)]
    .slice(0,6).map(match=>({script:match[1],line:Number(match[2]),column:Number(match[3])}));
  return {phase:['next-start','next-ready','chrome-start','chrome-ready','ready','entry'].includes(phase) ? phase : 'entry',
    code:['ERR_ASSERTION','ENOENT','EACCES','EPERM','EADDRINUSE','ERR_MODULE_NOT_FOUND'].includes(error?.code) ? error.code : 'UNCLASSIFIED',
    categories:categories.length ? categories : ['UNCLASSIFIED'],frames,
    processes:children.map(child=>({exitCode:child.exitCode,signal:['SIGTERM','SIGKILL','SIGABRT','SIGSEGV'].includes(child.signalCode) ? child.signalCode : null}))};
}

// Snapshot explícito de fuente ejecutable/docs/CI. No leer .env*, .git,
// credenciales, perfiles, configuración del agente, node_modules ni .next.
async function manifest(root) {
  const files=[];
  async function visit(relative) {
    assert.ok(!relative.split('/').some(part => part.startsWith('.env')),'I1 runner: runtime env fuera del snapshot');
    const stat=await lstat(join(root,relative));
    assert.ok(!stat.isSymbolicLink(),'I1 runner: symlink inesperado en source');
    if (stat.isDirectory()) {
      for (const name of (await readdir(join(root,relative))).sort()) await visit(relative+'/'+name);
    } else {
      assert.ok(stat.isFile(),'I1 runner: sólo archivos normales de source');
      files.push({path:relative,sha256:hash(await readFile(join(root,relative)))});
    }
  }
  for (const path of [...directories,...rootFiles]) await visit(path);
  files.sort((a,b) => a.path.localeCompare(b.path,'en'));
  return {scope:{directories,rootFiles},files,sha256:hash(JSON.stringify(files))};
}

function parseProcStat(raw,pid) {
  const match=/^([1-9]\d*) \((.*)\) ([RSDZTtXxKWPI]) ((?:-?\d+ ){48}-?\d+)\n?$/.exec(raw);
  assert.ok(match && match[1]===String(pid),'I1 cleanup ownership: proc stat inválido');
  const fields=match[4].split(' '), pgrp=Number(fields[1]);
  assert.ok(Number.isSafeInteger(pgrp) && pgrp>=0 && /^\d+$/.test(fields[18]),'I1 cleanup ownership: identidad proc inválida');
  return {pid,pgrp,starttime:fields[18],state:match[3],live:!['Z','X','x'].includes(match[3])};
}
async function readProcStat(pid) {
  assert.ok(Number.isSafeInteger(pid) && pid>1,'I1 cleanup ownership: PID inválido');
  try { return parseProcStat(await readFile(`/proc/${pid}/stat`,'utf8'),pid); }
  catch (error) { if (error.code==='ENOENT' || error.code==='ESRCH') return null; throw error; }
}
async function groupAlive(pid) {
  // Observación, nunca autorización de señales. Incluir descendientes aunque
  // el leader haya salido; Z/X no son procesos vivos. No leer cmdline ni env.
  for (const name of await readdir('/proc')) {
    if (!/^[1-9]\d*$/.test(name) || Number(name)<=1) continue;
    const stat=await readProcStat(Number(name));
    if (stat?.pgrp===pid && stat.live) return true;
  }
  return false;
}
async function observeOwnedGroups(registry) {
  assert.ok(registry && Number.isInteger(registry.spawnCount) && registry.spawnCount>=0 && registry.spawnCount<=2
    && Array.isArray(registry.entries) && registry.entries.length===registry.spawnCount,
    'I1 cleanup registry incompleta; conservar root');
  const observations=[];
  for (const identity of registry.entries) {
    assert.ok(identity && Number.isSafeInteger(identity.pid) && identity.pid>1
      && identity.pgrp===identity.pid && typeof identity.starttime==='string' && /^\d+$/.test(identity.starttime)
      && identity.exitKnown===true,
    'I1 cleanup registry sin identidad; conservar root');
    const current=await readProcStat(identity.pid);
    observations.push({pid:identity.pid,leaderState:current?.state ?? 'absent',
      identityMatches:current ? current.starttime===identity.starttime && current.pgrp===identity.pgrp : null,
      leaderLive:current?.live ?? false,groupLive:await groupAlive(identity.pgrp)});
  }
  return observations;
}
async function waitForOwnedExit(registry) {
  const deadline=Date.now()+2000;
  let observations;
  do {
    observations=await observeOwnedGroups(registry);
    if (observations.every(item=>!item.leaderLive && !item.groupLive)) return observations;
    await pause(50); // Sólo observar drenaje de descendientes; nunca señalar PID.
  } while (Date.now()<deadline);
  return observations;
}
async function stopHandle(child) {
  const alive=() => child?.pid && child.exitCode===null && child.signalCode===null;
  if (!alive()) return;
  let exited=false,resolveExit;
  const exit=new Promise(resolve => { resolveExit=resolve; });
  const onExit=() => { exited=true; resolveExit(true); };
  child.once('exit',onExit); // Listener ANTES de cualquier señal.
  try {
    for (const signal of ['SIGTERM','SIGKILL']) {
      if (exited || !alive()) return;
      child.kill(signal); // Sólo el handle retenido aún vivo; nunca PID/PGID.
      let timer;
      try {
        const ended=await Promise.race([exit,new Promise(resolve => { timer=setTimeout(() => resolve(false),5000); })]);
        if (ended || !alive()) return;
      } finally { clearTimeout(timer); }
    }
    assert.fail('I1 cleanup ownership: handle no terminó; conservar root');
  } finally {
    child.removeListener('exit',onExit);
  }
}

// Se serializa esta función como adapter PRIVADO; importa y ejecuta main real.
// No captura texto crudo de errores, valores de inputs, URL ni mensajes provider.
async function privateEntry(config) {
  const receipt={completed:false,error:null,collector:null,mcp:false,egressReceipt:false};
  const allowed=/^(?:expected\.canary\.runtime-(?:console|exception)|raw\.log-error|expected\.fixture-transport\.(?:unknown|quota|transport|expired|delayed-expired|verify-error|network-callback|update-error|update-expired|signout-error|login-error)\.(?:same-context|deferred-context)|candidate\.lifecycle\.hmr-bfcache|expected\.lifecycle\.hmr-bfcache\.(?:back|forward)|unexpected\.(?:console-error|runtime-exception))$/;
  console.log=(...args) => {
    if (args.length !== 1 || typeof args[0] !== 'string') return;
    const line=args[0], prefix='collector '+config.viewport+': ';
    if (line.startsWith(prefix)) {
      const raw=JSON.parse(line.slice(prefix.length));
      receipt.collector={};
      for (const [key,value] of Object.entries(raw)) {
        if (!allowed.test(key) || !Number.isSafeInteger(value) || value<0) receipt.unrecognizedCounter=true;
        else receipt.collector[key]=value;
      }
    }
    if (line === '✓ MCP local: issues obtenidos y assertados vacíos') receipt.mcp=true;
    if (line === '✓ Requests externos y mutaciones fuera de fixture: 0') receipt.egressReceipt=true;
  };
  let recovery;
  try {
    recovery=await import('./browser-recovery.mjs');
    await recovery.main();
    receipt.completed=true;
  } catch (error) {
    const first=typeof error.message === 'string' ? error.message.split('\n')[0] : '';
    const liveness='I1 collector sin vivacidad '+config.viewport+': ';
    const recognized=first.startsWith(liveness) && /^[A-Za-z0-9.,: -]+$/.test(first.slice(liveness.length))
      || first === 'collector sin errores inesperados';
    receipt.error={assertion:error instanceof assert.AssertionError && error.code === 'ERR_ASSERTION',
      message:recognized ? first : 'other',
      diagnostic:bootstrapDiagnostic(error,'entry'),
      atRealGuard:typeof error.stack === 'string' && error.stack.includes(config.guardLocation)};
    process.exitCode=1;
  } finally {
    receipt.boundary=recovery?.__i1ReadCounters() ?? null;
    try { receipt.bootstrap=JSON.parse(await readFile(config.bootstrapReceipt,'utf8')); }
    catch (error) { if (error.code!=='ENOENT') throw error; }
    await writeFile(config.receipt,JSON.stringify(receipt,null,2)+'\n');
  }
}

async function childRun(root,runtimeTmp,childReceipt,pidsFile,abort) {
  const child=spawn(NODE,[join(root,entryPath)],{
    cwd:root,shell:false,detached:true,stdio:['ignore','ignore','ignore'],
    // Entorno nuevo y cerrado: no copiar auth, HOME real ni variables runtime.
    env:{PATH:dirname(NODE)+':/usr/bin:/bin',HOME:join(root,'owned-home'),TMPDIR:runtimeTmp,
      XDG_CONFIG_HOME:join(root,'owned-home/config'),XDG_CACHE_HOME:join(root,'owned-home/cache'),
      NEXT_TELEMETRY_DISABLED:'1',RECOVERY_EVIDENCE_DIR:join(root,'owned-evidence')},
  });
  let timedOut=false,interrupted=false,spawnError=null;
  let stopTask,rejectStop;
  const stopFailed=new Promise((_,reject) => { rejectStop=reject; });
  const requestStop=() => {
    if (!stopTask) { stopTask=stopHandle(child); stopTask.catch(rejectStop); }
  };
  const signal=() => { interrupted=true; requestStop(); };
  abort.addEventListener('abort',signal,{once:true});
  const watchdog=setTimeout(() => { timedOut=true; requestStop(); },300_000);
  let observations,outerGroupLive,spawnCount;
  let exit,observed=null;
  try {
    const closed=new Promise(resolve => {
      child.once('error',error => { spawnError=error.code ?? 'UNKNOWN'; });
      child.once('close',(code,signal) => resolve({code,signal}));
    });
    if (abort.aborted) signal();
    exit=await Promise.race([closed,stopFailed]);
    if (stopTask) await stopTask;
  } finally {
    clearTimeout(watchdog); abort.removeEventListener('abort',signal);
    try { observed=JSON.parse(await readFile(childReceipt,'utf8')); }
    catch (error) { if (error.code!=='ENOENT') throw error; }
    // Conservar causa inicial incluso si cleanup rechaza la registry después.
    // Después de close NO señalar nada. Registry y /proc sólo observan;
    // cualquier leader/grupo vivo (incluido PID reusado) conserva el root.
    let registry=[];
    try { registry=JSON.parse(await readFile(pidsFile,'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try {
      observations=await waitForOwnedExit(registry);
      spawnCount=registry.spawnCount;
      outerGroupLive=child.pid ? await groupAlive(child.pid) : null;
      assert.ok(outerGroupLive===false && observations.every(item => !item.leaderLive && !item.groupLive),
        'I1 cleanup ownership vivo o incierto; conservar root');
    } catch (error) {
      error.cleanupObservation={observations,outerGroupLive};
      error.childEvidence={exit,timedOut,interrupted,spawnError,observed};
      throw error;
    }
  }
  return {exit,timedOut,interrupted,spawnError,observed,cleanup:{spawnCount,observations,outerGroupLive}};
}

function classify(run,variant,viewport) {
  if (run.timedOut || run.interrupted || run.spawnError || run.exit.signal || !run.observed) return 'infrastructure';
  const observed=run.observed;
  if (!observed.boundary || Object.values(observed.boundary).some(value => value!==0)) return 'boundary-failure';
  if (!observed.collector) return observed.bootstrap ? 'bootstrap-failure' : 'pre-collector-failure';
  if (observed.unrecognizedCounter) return 'unexpected-diagnostic';
  if (variant === 'control') return run.exit.code===0 && observed.completed && !observed.error
    && observed.mcp && observed.egressReceipt ? 'green' : 'control-failed';
  if (run.exit.code===0) return 'survived';
  if (run.exit.code!==1 || !observed.error?.assertion || !observed.error.atRealGuard) return 'wrong-failure';
  if (families.markers.includes(variant)) {
    const category=variant === 'ordinary-exception' ? 'unexpected.runtime-exception' : 'unexpected.console-error';
    return observed.error.message === 'collector sin errores inesperados' && observed.collector[category]===1
      ? 'killed' : 'wrong-assertion';
  }
  const prefix='I1 collector sin vivacidad '+viewport+': ';
  // Expectativa explícita por mutante. No contar como muerte una falta distinta
  // (por ejemplo, una entrega Log fallida al desconectar sólo console).
  const runtime=['Runtime.consoleAPICalled','Runtime.exceptionThrown'];
  const logs=[...fixtureKinds.map(kind => 'Log.entryAdded:'+kind),'Log.entryAdded:catalogo-correlacionado'];
  const expected={
    'remove-runtime':runtime,'remove-log':logs,'remove-both':[...runtime,...logs],
    'disconnect-console':[runtime[0]],'disconnect-exception':[runtime[1]],'disconnect-log':logs,
  }[variant];
  return observed.error.message === prefix+expected.join(', ') ? 'killed' : 'wrong-assertion';
}

async function oneCase({snapshot,modules,suiteRoot,evidenceRoot,viewportName,variant,label,abort}) {
  const id=viewportName+'-'+label;
  const root=await mkdtemp(join(suiteRoot,'case-'));
  await directory(root);
  // Prefijo corto directamente en TMP propio: no exceder el límite Unix del
  // socket Singleton de Chrome con directorios anidados de source/evidence.
  const runtimeTmp=await mkdtemp(join(TMP,'i-'));
  await directory(runtimeTmp);
  const receipt={id,variant,viewport:viewportName,root,runtimeTmp,sites:[],
    bodyState:'not-applicable: no DOM mutation',status:'incomplete',stage:'copy'};
  const originals=new Map();
  let processesClean=true;
  await json(join(evidenceRoot,id+'.json'),receipt);
  try {
    for (const file of snapshot.files) {
      const destination=join(root,file.path);
      await mkdir(dirname(destination),{recursive:true});
      await copyFile(join(SOURCE,file.path),destination);
    }
    receipt.before=await manifest(root);
    assert.equal(receipt.before.sha256,snapshot.sha256,'I1 runner: copia fiel del source actual');
    receipt.dependencies=await copyDependencies(modules,join(root,'node_modules'));
    await directory(join(root,'node_modules'));
    for (const name of ['owned-home','owned-evidence']) await mkdir(join(root,name));
    receipt.stage='private-adapters';
    for (const file of [recoveryPath,loginPath,'next-env.d.ts']) originals.set(file,await readFile(join(root,file),'utf8'));
    const other=viewportName === 'mobile' ? viewports.desktop : viewports.mobile;
    const skipped=`    await runViewport({...runtime,width:${other.width},height:${other.height},mobile:${other.mobile}},runMutants,receipts);`;
    let recovery=replaceOne(originals.get(recoveryPath),skipped,'    // Adapter privado: el otro viewport se ejecuta en otro caso.',receipt.sites,'single-viewport');
    recovery=replaceOne(recovery,'export async function main({runMutants} = {}) {',
      'export function __i1ReadCounters() { return {external:counts.external,externalMutations:counts.externalMutations,database:counts.database,boundaryErrors:boundaryErrors.length}; }\nexport async function main({runMutants} = {}) {',receipt.sites,'read-only-boundary-receipt');
    recovery=mutate(recovery,variant,receipt.sites);
    await writeFile(join(root,recoveryPath),recovery);
    const pidsFile=join(root,'owned-pids.json');
    const bootstrapFile=join(root,'bootstrap-diagnostic.json');
    let login=replaceOne(originals.get(loginPath),'  children.push(child);',
      `  children.push(child);
  i1Registry.spawnCount++; i1PersistRegistry();
  const identity=parseProcStat(readFileSync('/proc/'+child.pid+'/stat','utf8'),child.pid);
  identity.exitKnown=false; i1Registry.entries.push(identity);
  child.once('exit',()=>{identity.exitKnown=true;i1PersistRegistry();});
  i1PersistRegistry();`,receipt.sites,'owned-process-registry');
    const originalStop=login.match(/^async function stopOwned\([^]*?^}/m)?.[0];
    assert.ok(originalStop,'I1 cleanup: stopOwned privado existente');
    login=replaceOne(login,originalStop,'async function stopOwned(child) { await stopHandle(child); }',receipt.sites,'retained-child-handles');
    const removeProfile='  if (ownedRoot) await rm(ownedRoot, { recursive: true, force: true });';
    login=replaceOne(login,removeProfile,
      "  const remaining=await waitForOwnedExit(i1Registry);\n  assert.ok(remaining.every(item=>!item.leaderLive && !item.groupLive),'I1 cleanup ownership vivo; conservar root');\n"+removeProfile,
      receipt.sites,'observe-before-profile-cleanup');
    login=replaceOne(login,'export async function startBrowser() {',`export async function startBrowser() {
  try { return await i1StartBrowser(); }
  catch (error) {
    writeFileSync(${JSON.stringify(bootstrapFile)},JSON.stringify(bootstrapDiagnostic(error,i1Phase,children)));
    throw error;
  }
}
async function i1StartBrowser() {`,receipt.sites,'bootstrap-diagnostic');
    login=replaceOne(login,'  await waitForHttp(appUrl, next);',
      "  i1Phase='next-ready';\n  await waitForHttp(appUrl, next);\n  i1Phase='chrome-start';",receipt.sites,'next-phase');
    login=replaceOne(login,'  const cdpPort = await waitForDevTools(profile, chrome);',
      "  i1Phase='chrome-ready';\n  const cdpPort = await waitForDevTools(profile, chrome);\n  i1Phase='ready';",receipt.sites,'chrome-phase');
    login="import { writeFileSync, readFileSync } from 'node:fs';\nimport { readdir } from 'node:fs/promises';\n"+
      `const i1Registry={spawnCount:0,entries:[]};\nlet i1Phase='next-start';\nconst pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));\nconst i1PersistRegistry=()=>writeFileSync(${JSON.stringify(pidsFile)},JSON.stringify(i1Registry));\ni1PersistRegistry();\n`+
      [parseProcStat,readProcStat,groupAlive,observeOwnedGroups,waitForOwnedExit,stopHandle,bootstrapDiagnostic].map(fn=>fn.toString()).join('\n')+'\n'+login;
    await writeFile(join(root,loginPath),login);
    const selected=viewports[viewportName], viewport=`${selected.width}x${selected.height}`;
    const guard=families.markers.includes(variant) ? "    assert.deepEqual(errors,[],'collector sin errores inesperados');"
      : '    assert.equal(missing.length,0,`I1 collector sin vivacidad ${width}x${height}: ${missing.join(\', \')}`);';
    assert.equal(recovery.split(guard).length-1,1,'I1 runner: línea real única del guard');
    const line=recovery.slice(0,recovery.indexOf(guard)).split('\n').length;
    const config={viewport,receipt:join(root,'child-result.json'),bootstrapReceipt:bootstrapFile,guardLocation:new URL('file://'+join(root,recoveryPath)).href+':'+line+':'};
    await writeFile(join(root,entryPath),"import assert from 'node:assert/strict';\nimport { writeFile, readFile } from 'node:fs/promises';\n"+
      bootstrapDiagnostic.toString()+'\n'+privateEntry.toString()+`\nawait privateEntry(${JSON.stringify(config)});\n`,{flag:'wx'});
    receipt.mutated=await manifest(root);
    receipt.argv=[NODE,join(root,entryPath)];
    receipt.stage='browser';
    await json(join(evidenceRoot,id+'.json'),receipt);
    processesClean=false;
    receipt.run=await childRun(root,runtimeTmp,config.receipt,pidsFile,abort);
    processesClean=true;
    receipt.stage='freeze-check';
    receipt.after=await manifest(root);
    // Única escritura generada admisible: los dos imports de next-env, sin
    // ignorar otras líneas ni normalizar cambios ajenos. Registrar antes de restaurar.
    const original=originals.get('next-env.d.ts');
    const generated=await readFile(join(root,'next-env.d.ts'),'utf8');
    const alternate=original.replaceAll('./.next/dev/types/','./.next/types/');
    assert.ok(generated===original || generated===alternate,'I1 runner: next-env generado fuera del contrato');
    receipt.generated={path:'next-env.d.ts',before:hash(original),after:hash(generated),changed:generated!==original};
    await writeFile(join(root,'next-env.d.ts'),original);
    assert.equal((await manifest(root)).sha256,receipt.mutated.sha256,'I1 runner: source privado congelado durante browser');
    receipt.status=classify(receipt.run,variant,viewport);
    receipt.stage='restoration';
  } catch (error) {
    receipt.failure={stage:receipt.stage,
      contract:error instanceof assert.AssertionError && error.message.startsWith('I1 cleanup ')
        ? error.message.split('\n')[0] : 'infrastructure-or-contract',
      cleanupObservation:error.cleanupObservation ?? null};
    if (error.childEvidence) receipt.childEvidence=error.childEvidence;
    throw error;
  } finally {
    // Se restaura incluso si la assertion, el arranque o un sitio falla. La
    // limpieza de procesos debe terminar antes de borrar perfiles/directorios.
    if (processesClean) {
      for (const [file,content] of originals) await writeFile(join(root,file),content);
      await rm(join(root,entryPath),{force:true});
    } else {
      receipt.restorationDeferred=true;
      receipt.restoredExactly=false;
    }
    if (receipt.before && processesClean) {
      receipt.restored=await manifest(root);
      receipt.restoredExactly=receipt.restored.sha256===snapshot.sha256;
    }
    receipt.checkoutAfter=await manifest(SOURCE);
    receipt.checkoutUnchanged=receipt.checkoutAfter.sha256===snapshot.sha256;
    receipt.cleanup={processesClean,rootRemoved:false,runtimeTmpRemoved:false};
    await json(join(evidenceRoot,id+'.json'),receipt);
    if (processesClean) {
      assert.equal(dirname(root),suiteRoot,'I1 runner: cleanup sólo root mkdtemp propio');
      await directory(root);
      await rm(root,{recursive:true});
      receipt.cleanup.rootRemoved=true;
      assert.equal(dirname(runtimeTmp),TMP,'I1 runner: cleanup sólo TMP mkdtemp propio');
      await directory(runtimeTmp);
      await rm(runtimeTmp,{recursive:true});
      receipt.cleanup.runtimeTmpRemoved=true;
      receipt.stage='done';
      await json(join(evidenceRoot,id+'.json'),receipt);
    }
  }
  assert.ok(receipt.restoredExactly && receipt.checkoutUnchanged,'I1 runner: restauración y checkout congelado');
  assert.equal(receipt.status,variant === 'control' ? 'green' : 'killed',`I1 runner: caso ${id} inválido`);
  console.log(`I1 ${id}: ${receipt.status}; restaurado; cleanup observado`);
  return {id,status:receipt.status,restored:true,receipt:id+'.json'};
}

export async function main(argv=process.argv.slice(2)) {
  const selection=options(argv);
  assert.equal(process.platform,'linux','I1 runner: contrato Linux local');
  assert.equal(process.execPath,NODE,'I1 runner: Node instalado exacto');
  assert.equal(process.cwd(),SOURCE,'I1 runner: checkout autorizado exacto');
  for (const root of [SOURCE,TMP,EVIDENCE]) await directory(root);
  const modules=join(SOURCE,'node_modules');
  await directory(modules);
  const snapshot=await manifest(SOURCE);
  assert.ok(!snapshot.files.some(file => file.path===entryPath),'I1 runner: adapter privado no preexistente');
  const suiteRoot=await mkdtemp(join(TMP,'i1-'));
  const evidenceRoot=await mkdtemp(join(EVIDENCE,'i1-mutants-'));
  const summary={selection,source:snapshot,runnerSha256:hash(await readFile(fileURLToPath(import.meta.url))),
    suiteRoot,evidenceRoot,runs:[],approved:false,complete:false};
  const abort=new AbortController();
  const interrupt=() => abort.abort();
  process.on('SIGINT',interrupt); process.on('SIGTERM',interrupt);
  try {
    await json(join(evidenceRoot,'summary.json'),summary);
    for (const viewportName of selection.viewports) {
      const cases=[{variant:'control',label:'control-before'},
        ...selection.variants.map(variant => ({variant,label:variant})),{variant:'control',label:'control-restored'}];
      for (const item of cases) {
        assert.ok(!abort.signal.aborted,'I1 runner: interrumpido');
        summary.runs.push(await oneCase({snapshot,modules,suiteRoot,evidenceRoot,viewportName,...item,abort:abort.signal}));
        await json(join(evidenceRoot,'summary.json'),summary);
      }
    }
    summary.complete=true;
  } finally {
    process.off('SIGINT',interrupt); process.off('SIGTERM',interrupt);
    summary.sourceAfter=await manifest(SOURCE);
    summary.sourceUnchanged=summary.sourceAfter.sha256===snapshot.sha256;
    summary.cleanup={remainingOwnedRoots:await readdir(suiteRoot)};
    if (summary.cleanup.remainingOwnedRoots.length===0) await rm(suiteRoot,{recursive:true});
    summary.killed=summary.runs.filter(run => run.status==='killed').length;
    summary.controlsGreen=summary.runs.filter(run => run.status==='green').length;
    await json(join(evidenceRoot,'summary.json'),summary);
  }
  assert.ok(summary.sourceUnchanged && summary.cleanup.remainingOwnedRoots.length===0,'I1 runner: freeze/cleanup final');
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch {
    // Detalles seguros en receipts; nunca reenviar error.message/stack raw.
    console.error('I1 mutantes: gate falló; revisar receipts sanitizados, no contar fallo como muerte.');
    process.exitCode=1;
  }
}
