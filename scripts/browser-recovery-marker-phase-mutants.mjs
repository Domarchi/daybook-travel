// LOCAL supervisado, import-safe. Regresión de fase: test REAL por Node/VM, sin Next/browser.
// Patrón de ownership/child retenido del runner copy-config, sin modificarlo.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const SOURCE='/home/domarchithinkpad/Developer/password-recovery-review-close-20261006/travel';
const TMP='/home/domarchithinkpad/.hermes/cache/scratch/tc-d0et9_nt';
const EVIDENCE='/home/domarchithinkpad/.hermes/cache/scratch/password-recovery-review-close-20261006/travel';
const NODE='/home/domarchithinkpad/.local/share/mise/installs/node/24.21.0/bin/node';
const runnerPath='scripts/browser-recovery-i1-mutants.mjs',testPath='lib/browser-recovery-marker-phase.test.ts';
const recoveryPath='scripts/browser-recovery.mjs';
const rootFiles=['AGENTS.md','CLAUDE.md','README.md','.gitignore','package.json','package-lock.json',
  'next-env.d.ts','next.config.mjs','postcss.config.mjs','tsconfig.json','skills-lock.json'];
const directories=['app','components','lib','public','scripts','docs','.github','supabase'];
const privatePaths=[runnerPath,testPath,recoveryPath,'package.json'];
const assertionId='I1 marcador ordinary-exception falta en prelude después de canary cerrado y antes de hidratar';
const testNames=['I1 marcador ordinary-exception se emite una vez después de cerrar canary y antes de hidratar',
  'I1 marcador ordinario real no obtiene exención canary y mata guard final errors'];
const argvTest=['--experimental-strip-types','--test','--test-timeout=10000',testPath];
const hash=value=>createHash('sha256').update(value).digest('hex');
const save=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
async function snapshot(root,paths) {
  const files=[];
  async function visit(path) {
    assert.ok(!path.split('/').some(part=>part.startsWith('.env') || ['.git','node_modules','.next'].includes(part)),
      'I1 phase snapshot sólo fuente declarada');
    const info=await lstat(join(root,path));
    assert.ok(!info.isSymbolicLink(),'I1 phase snapshot sin symlink');
    if(info.isDirectory()) for(const name of (await readdir(join(root,path))).sort()) await visit(join(path,name));
    else {assert.ok(info.isFile(),'I1 phase archivo normal');files.push({path,sha256:hash(await readFile(join(root,path)))});}
  }
  for(const path of paths) await visit(path);
  return {files,sha256:hash(JSON.stringify(files))};
}
async function bounded(promise,ms) {
  let timer;
  try {return await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),ms);})]);}
  finally {clearTimeout(timer);}
}
function parse(output) {
  const count=key=>{
    const matches=[...output.matchAll(new RegExp(`^(?:#|ℹ) ${key} (\\d+)\\r?$`,'gm'))];
    return matches.length===1?Number(matches[0][1]):null;
  };
  const names=(ok)=>[...new Set(output.split('\n').flatMap(line=>{
    const tap=new RegExp(`^${ok?'ok':'not ok'} \\d+ - (.+)$`).exec(line);
    const spec=new RegExp(`^${ok?'✔':'✖'} (.+) \\([\\d.]+m?s\\)$`).exec(line);
    return tap?[tap[1]]:spec?[spec[1]]:[];
  }))];
  const failed=names(false),passed=names(true);
  const namedMessage=new RegExp(`^\\s*AssertionError \\[ERR_ASSERTION\\]: ${assertionId}\\r?$`,'m').test(output)
    || new RegExp(`^\\s*error: \\|[-+]?\\r?\\n\\s+${assertionId}\\r?$`,'m').test(output);
  const exactAssertion=failed.length===1 && failed[0]===testNames[0]
    && output.includes('ERR_ASSERTION') && namedMessage
    && /^\s*0 !== 1\s*$/m.test(output) && /^\s*actual: 0,?\s*$/m.test(output)
    && /^\s*expected: 1,?\s*$/m.test(output) && /^\s*operator: 'strictEqual',?\s*$/m.test(output);
  return {counts:Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(key=>[key,count(key)])),
    passedNames:passed.filter(name=>testNames.includes(name)),failedNames:failed.filter(name=>testNames.includes(name)),
    unknownNames:passed.concat(failed).some(name=>!testNames.includes(name)),
    assertionId:exactAssertion?assertionId:null,exactAssertion,outputSha256:hash(output)};
}
async function runTests(root,stopHandle,signal,handles) {
  assert.equal(signal.aborted,false,'I1 phase ejecución no interrumpida');
  const child=spawn(NODE,argvTest,{cwd:root,stdio:['ignore','pipe','pipe'],shell:false,
    env:{PATH:dirname(NODE)+':/usr/bin:/bin',HOME:root,TMPDIR:TMP,LANG:'C.UTF-8',NO_COLOR:'1'}});
  const record={child,closed:false,spawnError:false,timedOut:false,interrupted:false,overflow:false};handles.push(record);
  let output='',stopTask;
  const closed=new Promise(resolve=>{
    child.once('error',()=>{record.spawnError=true;});
    child.once('close',(exit,signal)=>{record.closed=true;resolve({exit,signal});});
  });record.closedPromise=closed;
  const stop=()=>{stopTask ??= stopHandle(child).then(()=>true,()=>false);return stopTask;};
  const interrupt=()=>{record.interrupted=true;void stop();};
  const collect=chunk=>{
    if(output.length+chunk.length>131072) {record.overflow=true;void stop();return;}
    output+=chunk.toString();
  };
  child.stdout.on('data',collect);child.stderr.on('data',collect);
  signal.addEventListener('abort',interrupt,{once:true});
  const timer=setTimeout(()=>{record.timedOut=true;void stop();},20000);
  try {
    if(signal.aborted) interrupt();
    const ended=await bounded(closed,32000);
    if(!ended) {record.timedOut=true;await stop();}
    if(stopTask) await stopTask;
    return {...parse(output),exit:ended?.exit ?? null,signal:ended?.signal ?? null,
      closed:record.closed,spawnError:record.spawnError,timedOut:record.timedOut,
      interrupted:record.interrupted,overflow:record.overflow};
  } finally {
    clearTimeout(timer);signal.removeEventListener('abort',interrupt);
    if(!record.closed) {await stop();await bounded(closed,1000);}
  }
}
function healthy(run) {
  return run.closed && !run.spawnError && !run.timedOut && !run.interrupted && !run.overflow
    && run.signal===null && !run.unknownNames && run.counts.tests===2
    && run.counts.cancelled===0 && run.counts.skipped===0 && run.counts.todo===0;
}
export async function main(argv=process.argv.slice(2)) {
  assert.deepEqual(argv,['--mode=all'],'I1 phase modo cerrado');
  assert.equal(process.execPath,NODE,'I1 phase Node instalado');assert.equal(process.cwd(),SOURCE,'I1 phase cwd autorizado');
  for(const path of [SOURCE,TMP,EVIDENCE]) {
    assert.equal(await realpath(path),path,'I1 phase root canónico');assert.ok((await lstat(path)).isDirectory(),'I1 phase root directorio');
  }
  const sourceBefore=await snapshot(SOURCE,[...directories,...rootFiles]);
  const originals=new Map();for(const path of privatePaths) originals.set(path,await readFile(join(SOURCE,path)));
  const runner=originals.get(runnerPath).toString();
  const stopSource=runner.match(/^async function stopHandle\([^]*?^}/m)?.[0];assert.ok(stopSource,'I1 phase safety real');
  const stopHandle=runInNewContext(stopSource+'\nstopHandle',{assert,setTimeout,clearTimeout});
  const root=await mkdtemp(join(TMP,'i1-phase-')),evidence=await mkdtemp(join(EVIDENCE,'i1-phase-mutants-'));
  const rootIdentity=await lstat(root);assert.equal(await realpath(root),root,'I1 phase root propio sin alias');
  const abort=new AbortController(),handles=[];
  const interrupt=()=>abort.abort();process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
  const summary={sourceBefore,root,evidence,argv:[NODE,...argvTest],controls:[],mutant:null,
    completed:false,rootRemoved:false,browserMeasured:false};
  let before,failure;
  try {
    await mkdir(join(root,'scripts'));await mkdir(join(root,'lib'));
    for(const [path,bytes] of originals) await writeFile(join(root,path),bytes,{flag:'wx'});
    before=await snapshot(root,privatePaths);summary.privateBefore=before;
    async function control(id) {
      const run=await runTests(root,stopHandle,abort.signal,handles);summary.controls.push({id,...run});
      await save(join(evidence,id+'.json'),run);
      assert.ok(healthy(run) && run.exit===0 && run.counts.pass===2 && run.counts.fail===0
        && run.passedNames.length===2,'I1 phase control real 2/2 obligatorio');
    }
    await control('control-before');
    // Deshabilitar sólo la rama temprana devuelve la inyección real al
    // collectorLog original. No modificar guard, test, expresión ni callback.
    const site="  if (variant === 'ordinary-exception') {";
    assert.equal(runner.split(site).length-1,1,'I1 phase mutation occurrence1');
    const mutated=runner.replace(site,"  if (false && variant === 'ordinary-exception') {");
    const record={id:'late-ordinary-exception',occurrence:1,before:before.sha256};summary.mutant=record;
    try {
      await writeFile(join(root,runnerPath),mutated);record.mutated=(await snapshot(root,privatePaths)).sha256;
      record.run=await runTests(root,stopHandle,abort.signal,handles);
      record.killed=healthy(record.run) && record.run.exit===1 && record.run.counts.pass===1 && record.run.counts.fail===1
        && record.run.exactAssertion && record.run.passedNames.length===1
        && record.run.passedNames[0]===testNames[1];
    } finally {
      if(handles.every(item=>item.closed && !item.timedOut && !item.interrupted && !item.spawnError && !item.overflow)) {
        await writeFile(join(root,runnerPath),originals.get(runnerPath));
        record.restored=(await snapshot(root,privatePaths)).sha256;record.restoredExactly=record.restored===before.sha256;
      } else {record.restoredExactly=false;}
      await save(join(evidence,'late-ordinary-exception.json'),record);
    }
    assert.ok(record.restoredExactly && healthy(record.run),'I1 phase infraestructura y restauración antes de control');
    await control('control-restored');
    assert.ok(record.killed && record.restoredExactly,'I1 phase muerte exacta y restauración obligatorias');
    summary.completed=true;
  } catch(error) {failure=error;summary.failure={category:error instanceof assert.AssertionError?'ASSERTION':'INFRASTRUCTURE'};}
  finally {
    for(const record of handles) {
      try {await stopHandle(record.child);await bounded(record.closedPromise,1000);} catch {failure=true;}
    }
    summary.cleanupHandles=handles.map(record=>({closed:record.closed,exitCode:record.child.exitCode,
      signalCode:record.child.signalCode,spawnError:record.spawnError,timedOut:record.timedOut,interrupted:record.interrupted}));
    // Si hubo timeout/interrupción, conservar root: no suponer drenaje de workers
    // del runner Node ni intentar señales por números/PGID/registros.
    const safeCleanup=handles.every(record=>record.closed && !record.spawnError && !record.timedOut && !record.interrupted && !record.overflow);
    if(before && safeCleanup) {
      for(const [path,bytes] of originals) await writeFile(join(root,path),bytes);
      summary.privateAfter=await snapshot(root,privatePaths);summary.restoredExactly=summary.privateAfter.sha256===before.sha256;
    }
    summary.sourceAfter=await snapshot(SOURCE,[...directories,...rootFiles]);summary.sourceUnchanged=summary.sourceAfter.sha256===sourceBefore.sha256;
    const current=await lstat(root);
    assert.ok(dirname(root)===TMP && await realpath(root)===root && current.isDirectory() && !current.isSymbolicLink()
      && current.dev===rootIdentity.dev && current.ino===rootIdentity.ino,'I1 phase cleanup sólo root propio original');
    if(safeCleanup && (!before || summary.restoredExactly)) {await rm(root,{recursive:true});summary.rootRemoved=true;}
    summary.completed=summary.completed && !failure && !abort.signal.aborted && summary.rootRemoved && summary.sourceUnchanged;
    await save(join(evidence,'summary.json'),summary);
    process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
  }
  assert.ok(summary.completed,'I1 phase matriz incompleta; bootstrap no cuenta como muerte');
  console.log(JSON.stringify({receipt:join(evidence,'summary.json'),killed:summary.mutant.killed,
    rootRemoved:summary.rootRemoved,sourceUnchanged:summary.sourceUnchanged}));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(()=>{console.error('I1 phase mutante: ejecución incompleta (detalle omitido)');process.exitCode=1;});
}
