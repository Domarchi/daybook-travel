// REPRO LOCAL supervisado del duplicado Log. Importar no inicia browser.
// No modifica collector/auth/guards: reentrega el MISMO evento CDP ya emitido.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const SOURCE='/home/domarchithinkpad/Developer/password-recovery-review-close-20261006/travel';
const TMP='/home/domarchithinkpad/.hermes/cache/scratch/tc-d0et9_nt';
const EVIDENCE='/home/domarchithinkpad/.hermes/cache/scratch/password-recovery-review-close-20261006/travel';
const NODE='/home/domarchithinkpad/.local/share/mise/installs/node/24.21.0/bin/node';
const sourcePaths=['app','components','lib','public','scripts','docs','.github','supabase',
  'AGENTS.md','CLAUDE.md','README.md','.gitignore','package.json','package-lock.json',
  'next-env.d.ts','next.config.mjs','postcss.config.mjs','tsconfig.json','skills-lock.json'];
const hash=value=>createHash('sha256').update(value).digest('hex');
function actual(source,name) {
  const found=source.match(new RegExp(`^function ${name}\\([^]*?^}`,'m'))?.[0];
  assert.ok(found,`M5 probe función real ${name}`);return found;
}
async function snapshot() {
  const files=[];
  async function visit(path) {
    assert.ok(!path.split('/').some(part=>part.startsWith('.env')),'M5 snapshot sin runtime env');
    const info=await lstat(join(SOURCE,path));
    assert.ok(!info.isSymbolicLink(),'M5 snapshot sin aliases source');
    if(info.isDirectory()) for(const name of (await readdir(join(SOURCE,path))).sort()) await visit(join(path,name));
    else {assert.ok(info.isFile(),'M5 snapshot archivo normal');files.push({path,sha256:hash(await readFile(join(SOURCE,path)))});}
  }
  for(const path of sourcePaths) await visit(path);
  return {files,sha256:hash(JSON.stringify(files))};
}
export async function main(argv=process.argv.slice(2)) {
  assert.ok(argv.length===1 || argv.length===2,'M5 probe opciones cerradas');
  assert.equal(argv[0],'--mode=duplicate','M5 probe modo cerrado duplicate');
  const viewportOption=argv.length===1?'both':/^--viewport=(desktop|mobile|both)$/.exec(argv[1])?.[1];
  assert.ok(viewportOption,'M5 probe viewport cerrado');
  const targets=viewportOption==='both'?['390x844','1440x900']:
    [viewportOption==='mobile'?'390x844':'1440x900'];
  assert.equal(process.execPath,NODE,'M5 probe Node instalado');
  assert.equal(process.cwd(),SOURCE,'M5 probe checkout autorizado');
  for(const root of [SOURCE,TMP,EVIDENCE]) {
    assert.equal(await realpath(root),root,'M5 probe root canónico');
    assert.ok((await lstat(root)).isDirectory(),'M5 probe root directorio');
  }
  for(const name of (await readdir(SOURCE)).filter(name=>name.startsWith('.env'))) {
    assert.equal(name,'.env.example','M5 probe sin env runtime');
    const info=await lstat(join(SOURCE,name));
    assert.ok(info.isFile() && !info.isSymbolicLink(),'M5 ejemplo env regular sin leer contenido');
  }
  const before=await snapshot();
  const source=await readFile(join(SOURCE,'scripts/browser-recovery.mjs'),'utf8');
  const auth=source.match(/^const AUTH = [^\n]+;/m)?.[0];
  assert.ok(auth,'M5 probe AUTH real disponible');
  const marker="countDiagnostic('raw.log-error');";
  assert.equal(source.split(marker).length-1,1,'M5 probe collector real único');
  const api=runInNewContext([auth,...['fixtureDiagnosticCases','expectedFixtureDiagnostic','isExpectedFixtureLog'].map(name=>actual(source,name)),
    '({fixtureDiagnosticCases,expectedFixtureDiagnostic,isExpectedFixtureLog})'].join('\n'),{URL});
  const contexts=new Set(api.fixtureDiagnosticCases().map(entry=>entry[0]));
  const evidence=await mkdtemp(join(EVIDENCE,'m5-duplicate-'));
  const receipt={kind:'M5-fixture-log-duplicate',diagnosticOnly:true,certifiesFix:false,
    selection:{requested:viewportOption,targets,marker:'same-native-fixture-unknown-log',matchedTargets:[]},
    rejectedViewport:null,selectionVerified:false,
    before,completed:false,outcome:'not-started',viewports:[],external:null,externalMutations:null,database:null,
    mcpIssuesAssertedEmpty:false,originalFinalGuardFailed:false,sourceUnchanged:null,
    teardown:'real-recovery-main-finally; supervisor verifica procesos/roots',failure:null};
  // Importar después del preflight; ambos módulos reales tienen guard de autorun.
  const {main:recoveryMain}=await import('./browser-recovery.mjs');
  const {Cdp}=await import('./browser-login.mjs');
  const originalOnEvent=Cdp.prototype.onEvent,originalSend=Cdp.prototype.send,originalLog=console.log;
  const clients=new WeakMap(),collectors=[];
  function stateFor(cdp) {
    if(!clients.has(cdp)) clients.set(cdp,{registered:false,viewport:null,pending:new Map(),correlated:new Map(),
      injected:false,nativeLogCallbacks:0,duplicateCallbacks:0,selectedNativeCallbacks:0,categories:null,
      originalViewportCompleted:false});
    return clients.get(cdp);
  }
  Cdp.prototype.send=async function(method,params={}) {
    const state=stateFor(this);
    if(method==='Emulation.setDeviceMetricsOverride') {
      const key=params.width+'x'+params.height;
      if(['390x844','1440x900'].includes(key)) state.viewport=key;
    }
    // La petición fue observada en Fetch real; sólo la respuesta negativa 404
    // deliberada y única del catálogo unknown permite seleccionar la reentrega.
    let linked;
    if(method==='Fetch.fulfillRequest' && params.responseCode===404) {
      const pending=state.pending.get(params.requestId);
      if(pending) {
        const expected=api.expectedFixtureDiagnostic(pending.url,pending.method,'unknown');
        if(expected?.outcome===params.responseCode) {
          linked=pending.networkRequestId;
          state.correlated.set(linked,{...expected,networkRequestId:linked});
        }
      }
    }
    try {return await originalSend.call(this,method,params);}
    catch(error) {if(linked) state.correlated.delete(linked);throw error;}
    finally {
      if(['Fetch.fulfillRequest','Fetch.failRequest','Fetch.continueRequest'].includes(method)) state.pending.delete(params.requestId);
    }
  };
  Cdp.prototype.onEvent=function(listener) {
    if(!listener.toString().includes(marker)) return originalOnEvent.call(this,listener);
    const state=stateFor(this);
    assert.equal(state.registered,false,'M5 un collector original por cliente CDP');
    state.registered=true;collectors.push(state);
    return originalOnEvent.call(this,event=>{
      if(event.method==='Fetch.requestPaused' && event.params.networkId) {
        const request=event.params.request;
        let url;try {url=new URL(request.url);} catch {}
        if(url && api.expectedFixtureDiagnostic(url,request.method,'unknown')) {
          state.pending.set(event.params.requestId,{url,method:request.method,networkRequestId:event.params.networkId});
        }
      }
      const isLog=event.method==='Log.entryAdded' && event.params.entry.level==='error';
      const entry=isLog?event.params.entry:null;
      const linked=entry?state.correlated.get(entry.networkRequestId):null;
      const selected=targets.includes(state.viewport) && !state.injected && linked && api.isExpectedFixtureLog(entry,linked);
      if(isLog) state.nativeLogCallbacks++;
      listener(event); // Primer callback REAL, evento REAL intacto.
      if(selected) {
        state.injected=true;state.selectedNativeCallbacks++;
        receipt.selection.matchedTargets.push(state.viewport);
        listener(event); // Misma referencia: no clonar/construir eventos o payloads.
        state.duplicateCallbacks++;
      }
    });
  };
  console.log=(...args)=>{
    if(args.length!==1 || typeof args[0]!=='string') return;
    const completed=/^✓ recovery (390x844|1440x900): missing\/malformed\/reused\/expired\/normal\/recovery, política, mismatch, update, signOut y limpieza$/.exec(args[0]);
    if(completed) {
      const state=collectors.find(item=>item.viewport===completed[1]);
      if(state) state.originalViewportCompleted=true; // Línea posterior al guard REAL.
    }
    const match=/^collector (390x844|1440x900): (\{.*\})$/.exec(args[0]);
    if(match) {
      const state=collectors.find(item=>item.viewport===match[1]);
      if(state) {
        const parsed=JSON.parse(match[2]),categories={};
        for(const [name,value] of Object.entries(parsed)) {
          const fixture=/^expected\.fixture-transport\.([a-z-]+)\.(same-context|deferred-context)$/.exec(name);
          const fixed=['raw.log-error','expected.canary.runtime-console','expected.canary.runtime-exception',
            'unexpected.console-error','unexpected.runtime-exception','candidate.lifecycle.hmr-bfcache',
            'expected.lifecycle.hmr-bfcache.back','expected.lifecycle.hmr-bfcache.forward'];
          const unexpected=/^unexpected\.log\.(network|javascript|security|other)\.(auth-user|auth-token|auth-recover|auth-logout|fixture-other|other)\.(http-resource|connection-resource|other-diagnostic)\.(linked|unlinked)$/.test(name);
          if((fixed.includes(name) || fixture && contexts.has(fixture[1]) || unexpected)
            && Number.isSafeInteger(value) && value>=0) categories[name]=value;
        }
        state.categories=categories;
      }
    }
    if(args[0]==='✓ Requests externos y mutaciones fuera de fixture: 0') {
      // Esta línea sólo sigue a las assertions REALES de main sobre esos contadores.
      receipt.external=0;receipt.externalMutations=0;receipt.database=0;
    }
    if(args[0]==='✓ MCP local: issues obtenidos y assertados vacíos') receipt.mcpIssuesAssertedEmpty=true;
  };
  let failure;
  try {
    await recoveryMain();receipt.completed=true;
    assert.equal(collectors.length,2,'M5 probe ambos collectors reales ejecutados');
    assert.deepEqual(collectors.map(item=>item.viewport).sort(),['1440x900','390x844'],'M5 probe ambos viewports reales');
    assert.ok(collectors.every(item=>item.selectedNativeCallbacks===(targets.includes(item.viewport)?1:0)
      && item.duplicateCallbacks===(targets.includes(item.viewport)?1:0)),
      'M5 probe una reentrega real sólo por viewport objetivo');
    receipt.selectionVerified=true;
    assert.equal(receipt.external,0,'M5 probe egress real certificado por main');
    receipt.outcome='duplicate-survived-current-collector'; // REPRO de hueco, nunca GREEN del fix.
  } catch(error) {
    failure=error;
    const atFinal=error instanceof assert.AssertionError && error.message.split('\n')[0]==='collector sin errores inesperados'
      && String(error.stack).includes('/browser-recovery.mjs:');
    const last=collectors.at(-1);
    const matched=last && targets.includes(last.viewport) && last.selectedNativeCallbacks===1 && last.duplicateCallbacks===1
      && receipt.selection.matchedTargets.filter(viewport=>viewport===last.viewport).length===1;
    const unselectedIntact=collectors.filter(item=>!targets.includes(item.viewport))
      .every(item=>item.selectedNativeCallbacks===0 && item.duplicateCallbacks===0 && item.originalViewportCompleted);
    const mobileCompleted=viewportOption!=='desktop' || collectors.some(item=>item.viewport==='390x844'
      && item.originalViewportCompleted && item.selectedNativeCallbacks===0 && item.duplicateCallbacks===0);
    receipt.selectionVerified=!!matched && unselectedIntact && mobileCompleted;
    receipt.rejectedViewport=atFinal && receipt.selectionVerified?last.viewport:null;
    receipt.originalFinalGuardFailed=atFinal;
    receipt.outcome=atFinal && receipt.selectionVerified?'original-final-errors-guard-rejected':'infrastructure-or-other-assertion';
    receipt.failure={code:['ERR_ASSERTION','ENOENT','EACCES','EPERM'].includes(error.code)?error.code:'OTHER',
      builtinError:['TypeError','ReferenceError','SyntaxError'].includes(error.name)?error.name:null};
  } finally {
    Cdp.prototype.onEvent=originalOnEvent;Cdp.prototype.send=originalSend;console.log=originalLog;
    receipt.viewports=collectors.map(state=>({viewport:state.viewport,category:'fixture-unknown-http',
      selectedTarget:targets.includes(state.viewport),originalViewportCompleted:state.originalViewportCompleted,
      nativeLogCallbacks:state.nativeLogCallbacks,selectedNativeCallbacks:state.selectedNativeCallbacks,
      duplicateCallbacks:state.duplicateCallbacks,categories:state.categories}));
    for(const state of collectors) {state.pending.clear();state.correlated.clear();}
    receipt.after=await snapshot();receipt.sourceUnchanged=before.sha256===receipt.after.sha256;
    await writeFile(join(evidence,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
    originalLog(JSON.stringify({receipt:join(evidence,'receipt.json'),outcome:receipt.outcome,certifiesFix:false}));
  }
  if(failure || !receipt.sourceUnchanged) process.exitCode=1;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(()=>{console.error('M5 duplicate probe: infraestructura incompleta; no contar como rechazo del duplicado');process.exitCode=1;});
}
