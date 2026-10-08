// Runner LOCAL de esta tarea. Sólo supervisor tras inspección/hash/CUSTOM.
// Importar no inicia procesos; modos/argv cerrados, sin shell ni instalaciones.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, readFileSync } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, open, readFile, readdir, readlink, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const SOURCE='/home/domarchithinkpad/Developer/password-recovery-review-close-20261006/travel';
const TMP='/home/domarchithinkpad/.hermes/cache/scratch/tc-d0et9_nt';
const EVIDENCE='/home/domarchithinkpad/.hermes/cache/scratch/password-recovery-review-close-20261006/travel';
const NODE='/home/domarchithinkpad/.local/share/mise/installs/node/24.21.0/bin/node';
const loginPath='scripts/browser-login.mjs', unitPath='lib/browser-chrome-path.test.ts';
const directories=['app','components','lib','public','scripts','docs','.github','supabase'];
const rootFiles=['AGENTS.md','CLAUDE.md','README.md','.gitignore','package.json','package-lock.json',
  'next-env.d.ts','next.config.mjs','postcss.config.mjs','tsconfig.json','skills-lock.json'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const save=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
function actual(source,name) {
  const found=source.match(new RegExp(`^(?:export )?(?:async )?function ${name}\\([^]*?^}`,'m'))?.[0];
  assert.ok(found,`M2 adapter función real ${name}`);
  return found.replace(/^export /,'');
}
function change(source,site,replacement) {
  assert.equal(source.split(site).length-1,1,'M2 mutation site exactamente uno');
  return source.replace(site,()=>replacement);
}
async function manifest(root,paths) {
  const files=[];
  async function visit(path) {
    assert.ok(!path.split('/').some(part=>part.startsWith('.env')),'M2 snapshot sin runtime env');
    const info=await lstat(join(root,path));
    assert.ok(!info.isSymbolicLink(),'M2 snapshot sólo source real');
    if (info.isDirectory()) for (const name of (await readdir(join(root,path))).sort()) await visit(join(path,name));
    else { assert.ok(info.isFile(),'M2 snapshot archivo normal'); files.push({path,sha256:hash(await readFile(join(root,path)))}); }
  }
  for (const path of paths) await visit(path);
  return {files,sha256:hash(JSON.stringify(files))};
}
async function safety() {
  // Implementación REAL ya cubierta por safety GREEN I1; no copiar su lógica.
  const source=await readFile(join(SOURCE,'scripts/browser-recovery-i1-mutants.mjs'),'utf8');
  const names=['parseProcStat','readProcStat','groupAlive','stopHandle'];
  return runInNewContext(names.map(name=>actual(source,name)).join('\n')+`\n({${names.join(',')}})`,
    {assert,readFile,readdir,setTimeout,clearTimeout});
}
function environment(root) {
  // TMP corto canónico validado por main; HOME/XDG siguen privados por caso.
  return {PATH:dirname(NODE)+':/usr/bin:/bin',HOME:join(root,'home'),TMPDIR:TMP,
    XDG_CONFIG_HOME:join(root,'home/config'),XDG_CACHE_HOME:join(root,'home/cache'),NEXT_TELEMETRY_DISABLED:'1'};
}
function launch(command,args,options,records,os) {
  const child=spawn(command,args,{...options,shell:false,detached:true,stdio:['ignore','pipe','pipe']});
  const record={child,identity:null,exitKnown:false,spawnError:null,output:'',closed:null};
  records.push(record); // Retener antes de toda lectura que pueda fallar.
  child.once('exit',()=>{record.exitKnown=true;});
  record.closed=new Promise(resolve=>{
    child.once('error',error=>{record.spawnError=error.code ?? 'UNKNOWN';});
    child.once('close',(code,signal)=>resolve({code,signal}));
  });
  const append=chunk=>{record.output=(record.output+chunk.toString()).slice(-100000);};
  child.stdout.on('data',append); child.stderr.on('data',append);
  if (child.pid) record.identity=os.parseProcStat(readFileSync(`/proc/${child.pid}/stat`,'utf8'),child.pid);
  return record;
}
async function cleanRecords(records,os) {
  // Nunca process.kill(pid/pgid), tampoco después de close. Registry no autoriza señales.
  for (const record of [...records].reverse()) await os.stopHandle(record.child);
  const deadline=Date.now()+5000;
  let observations;
  do {
    observations=[];
    for (const record of records) {
      if (!record.identity) {
        observations.push({identityKnown:false,terminated:!record.child.pid && record.spawnError!==null});
        continue;
      }
      const current=await os.readProcStat(record.identity.pid);
      const groupLive=await os.groupAlive(record.identity.pgrp);
      observations.push({pid:record.identity.pid,identityKnown:true,exitKnown:record.exitKnown,
        identityMatches:current ? current.starttime===record.identity.starttime : null,
        state:current?.state ?? 'absent',groupLive,
        terminated:record.exitKnown && !current?.live && !groupLive});
      for(const identity of record.observedDescendants?.values() ?? []) {
        const descendant=await os.readProcStat(identity.pid);
        observations.push({pid:identity.pid,identityKnown:true,observedDescendant:true,
          identityMatches:descendant ? descendant.starttime===identity.starttime : null,
          state:descendant?.state ?? 'absent',terminated:!descendant?.live});
      }
    }
    if (observations.every(item=>item.terminated)) return observations;
    await pause(50);
  } while (Date.now()<deadline);
  const error=new Error('M2 cleanup ownership incierto; conservar root');
  error.observations=observations; throw error;
}
async function runTests(root,file,pattern,records,os,abort) {
  const argv=['--experimental-strip-types','--test','--test-reporter=tap','--test-timeout=10000'];
  if (pattern) argv.push('--test-name-pattern='+pattern);
  argv.push(file);
  const record=launch(NODE,argv,{cwd:root,env:environment(root)},records,os);
  let timedOut=false,interrupted=false,stopTask,boundTimer;
  const stop=()=>{stopTask ??= os.stopHandle(record.child); stopTask.catch(()=>{});};
  const interrupt=()=>{interrupted=true;stop();};
  abort.addEventListener('abort',interrupt,{once:true});
  const timer=setTimeout(()=>{timedOut=true;stop();},20000);
  try {
    if(abort.aborted) interrupt();
    const exit=await Promise.race([record.closed,new Promise(resolve=>{
      boundTimer=setTimeout(()=>resolve({code:null,signal:'bounded-wait'}),32000);
    })]);
    if(stopTask) await stopTask;
    const output=record.output;
    const count=name=>Number(new RegExp(`^# ${name} (\\d+)$`,'m').exec(output)?.[1] ?? -1);
    return {exit,timedOut,interrupted,spawnError:record.spawnError,counts:{pass:count('pass'),fail:count('fail'),skipped:count('skipped')},
      assertion:output.includes("code: 'ERR_ASSERTION'"),
      missingRejection:output.includes('Missing expected rejection'),missingException:output.includes('Missing expected exception'),
      namedFailure:pattern===null ? null : output.split('\n').some(line=>/^not ok \d+ - /.test(line)
        && line.slice(line.indexOf(' - ')+3)===pattern.slice(1,-1)),
      outputSha256:hash(output)};
  } finally {clearTimeout(timer);clearTimeout(boundTimer);abort.removeEventListener('abort',interrupt);}
}

// Tests adicionales del mismo mecanismo, sólo ejecutados en copia privada.
// Extraen funciones REALES; FS real; ningún test lanza Chrome o scripts.
const extraTests=String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {access,lstat,mkdtemp,mkdir,open,readFile,realpath,rm,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../scripts/browser-login.mjs',import.meta.url),'utf8');
function fn(name) {
 const value=source.match(new RegExp('^(?:async )?function '+name+'\\([^]*?^}','m'))?.[0];
 assert.ok(value,'M2 función real extraída'); return value;
}
function resolver(path) { return runInNewContext(fn('chromePath')+'\nchromePath',
 {process:{env:{CHROME_PATH:path},platform:process.platform},access,lstat,open,readFile,realpath,stat,constants}); }
for(const kind of ['no-fallback','file']) {
 test('T3 M2 '+kind+' rechazo previo a spawn',async()=>{
  const root=await mkdtemp(join(process.cwd(),'fs-case-'));
  try {
   const path=join(root,'candidate');
   if(kind==='file') await mkdir(path);
   const message=kind==='no-fallback' ? 'T3 CHROME_PATH no accesible'
    : 'T3 CHROME_PATH debe ser un archivo ejecutable';
   await assert.rejects(resolver(path),{message},'T3 M2 '+kind+' rechazo obligatorio');
  } finally {await rm(root,{recursive:true,force:true});}
 });
}
test('T3 M2 argv inseguro rechazo previo a spawn',()=>{
 const guard=runInNewContext(fn('assertSandboxedChromeArgs')+'\nassertSandboxedChromeArgs',{assert});
 const safe=['--headless=new','--user-data-dir=/private-owned-profile','about:blank'];
 assert.doesNotThrow(()=>guard(safe));
 assert.throws(()=>guard([...safe,'--no-sandbox']),{message:'T3 argumento Chrome fuera del contrato de sandbox'},
  'T3 M2 argv inseguro debe rechazarse antes de spawn');
});
test('T3 M2 descriptor no vuelve a una ruta mutable',()=>{
 const command=runInNewContext(fn('chromeCommand')+'\nchromeCommand',{assert,process:{platform:'linux'}});
 assert.equal(command({fd:7}),'/proc/self/fd/7','T3 M2 spawn usa el descriptor validado');
});
test('T3 M2 descriptor se hereda en el hijo',()=>{
 const stdio=runInNewContext(fn('chromeStdio')+'\nchromeStdio')({fd:7});
 assert.deepEqual(stdio,['ignore','pipe','pipe','ignore','ignore','ignore','ignore',7]);
});
`;

async function mutants(root,evidence,source,records,os,abort) {
  await mkdir(join(root,'scripts')); await mkdir(join(root,'lib'));
  await writeFile(join(root,loginPath),source,{flag:'wx'});
  await writeFile(join(root,unitPath),await readFile(join(SOURCE,unitPath)),{flag:'wx'});
  const extraPath='lib/m2-private-cases.test.mjs';
  await writeFile(join(root,extraPath),extraTests,{flag:'wx'});
  const paths=[loginPath,unitPath,extraPath];
  const before=await manifest(root,paths), results=[];
  const argvSite='assert.ok(argv.every((arg) => typeof arg === "string" && (allowed.has(arg)\n    || (arg.startsWith("--user-data-dir=") && arg.length > "--user-data-dir=".length\n      && !/[\\0\\r\\n]/.test(arg)))), "T3 argumento Chrome fuera del contrato de sandbox");';
  const variants=[
    {id:'allowlist-return',site:'if (!systemTrusted) {',replacement:'if (false) {',
      file:unitPath,name:'T3 CHROME_PATH ELF privado se rechaza antes de spawn y sin fallback'},
    {id:'ci-root-owner',site:'info.uid !== 0',replacement:'false',file:unitPath,
      name:'T3 ruta CI fija exige toda la cadena root y no escribible'},
    {id:'explicit-fallback',site:'const explicit = process.env.CHROME_PATH !== undefined;',replacement:'const explicit = false;',name:'T3 M2 no-fallback rechazo previo a spawn'},
    {id:'directory-return',site:'if (!info.isFile()) throw new Error("T3 CHROME_PATH debe ser un archivo ejecutable");',
      replacement:'if (!info.isFile()) return executable;',name:'T3 M2 file rechazo previo a spawn'},
    {id:'argv-allow',site:argvSite,replacement:'assert.ok(true, "T3 argumento Chrome fuera del contrato de sandbox");',name:'T3 M2 argv inseguro rechazo previo a spawn',exception:true},
    {id:'descriptor-path',site:'if (process.platform === "linux") return `/proc/self/fd/${file.fd}`;',replacement:'if (process.platform === "linux") return "/mutable/chrome";',
      name:'T3 M2 descriptor no vuelve a una ruta mutable',assertionOnly:true},
    {id:'descriptor-inheritance',site:'for (let index = 3; index <= fd; index++) stdio[index] = index === fd ? fd : "ignore";',replacement:'for (let index = 3; index <= fd; index++) stdio[index] = "ignore";',
      name:'T3 M2 descriptor se hereda en el hijo',assertionOnly:true},
  ];
  async function control(label) {
    const runs=[];
    for (const [file,total] of [[unitPath,7],[extraPath,5]]) {
      const result=await runTests(root,file,null,records,os,abort); runs.push(result);
      await save(join(evidence,`${label}-${total}.json`),result);
      assert.ok(result.exit.code===0 && !result.timedOut && !result.interrupted && !result.spawnError
        && result.counts.pass===total && result.counts.fail===0,'M2 control unit real debe pasar');
    }
    return {label,runs};
  }
  const controls=[await control('control-before')];
  for(const variant of variants) {
    assert.ok(!abort.aborted,'M2 interrumpido');
    const record={id:variant.id,expectedAssertion:variant.name,siteOccurrences:1,before:before.sha256};
    try {
      const mutated=change(source,variant.site,variant.replacement);
      record.site={before:hash(variant.site),after:hash(variant.replacement)};
      await writeFile(join(root,loginPath),mutated);
      record.mutated=(await manifest(root,paths)).sha256;
      record.run=await runTests(root,variant.file ?? extraPath,'^'+variant.name+'$',records,os,abort);
      const r=record.run;
      record.killed=r.exit.code===1 && !r.exit.signal && !r.timedOut && !r.interrupted && !r.spawnError
        && r.counts.fail===1 && r.counts.pass===0 && r.assertion && r.namedFailure
        && (variant.exception ? r.missingException : variant.assertionOnly ? true : r.missingRejection);
    } finally {
      await writeFile(join(root,loginPath),source);
      record.restored=(await manifest(root,paths)).sha256;
      record.restoredExactly=record.restored===before.sha256;
      await save(join(evidence,variant.id+'.json'),record);
    }
    results.push(record);
    assert.ok(record.killed && record.restoredExactly,'M2 mutante: assertion exacta y restauración obligatorias');
  }
  controls.push(await control('control-restored'));
  return {scope:'pre-spawn-only',before,after:await manifest(root,paths),mutants:results,controls};
}

async function procSnapshot(main,profile,os) {
  assert.ok(main.identity && main.child.exitCode===null && main.child.signalCode===null,'M2 handle Chrome vivo');
  const leader=await os.readProcStat(main.identity.pid);
  assert.ok(leader?.live && leader.starttime===main.identity.starttime,'M2 identidad Chrome retenida');
  // Sólo stat de otros procesos: cmdline/status/exe únicamente tras parentesco.
  const table=new Map();
  for(const name of await readdir('/proc')) {
    if(!/^[1-9]\d*$/.test(name) || Number(name)<=1) continue;
    try {
      const raw=await readFile(`/proc/${name}/stat`,'utf8');
      const identity=os.parseProcStat(raw,Number(name));
      const ppid=Number(raw.slice(raw.lastIndexOf(')')+2).split(' ')[1]);
      table.set(identity.pid,{...identity,ppid});
    } catch(error) { if(!['ENOENT','ESRCH'].includes(error.code)) throw error; }
  }
  const descendants=new Set([leader.pid]);
  for(let size=-1;size!==descendants.size;) {
    size=descendants.size;
    for(const item of table.values()) if(item.live && descendants.has(item.ppid)) descendants.add(item.pid);
  }
  const ownNamespaces={};
  for(const name of ['user','pid','mnt','net']) ownNamespaces[name]=await readlink(`/proc/self/ns/${name}`);
  const observed=[],binaryHashes=new Map();
  main.observedDescendants ??= new Map();
  const leaderExecutable=await realpath(`/proc/${leader.pid}/exe`);
  for(const pid of descendants) {
    const before=table.get(pid);
    if(!before?.live) continue;
    try {
      // Revalidar cada eslabón antes de leer cmdline/status/exe. No autoriza señales.
      const chain=new Set();
      for(let ancestor=pid;;) {
        assert.ok(!chain.has(ancestor),'M2 parentesco proc sin ciclos');chain.add(ancestor);
        const expected=table.get(ancestor),current=await os.readProcStat(ancestor);
        assert.ok(expected && current?.live && current.starttime===expected.starttime,
          'M2 identidad de parentesco estable antes de lectura');
        if(ancestor===leader.pid) break;
        ancestor=expected.ppid;
      }
      if(pid!==leader.pid) main.observedDescendants.set(`${pid}:${before.starttime}`,{pid,starttime:before.starttime});
      const argv=(await readFile(`/proc/${pid}/cmdline`)).toString().split('\0').filter(Boolean);
      let executable=null,executableSha256=null,binaryUnavailable=null;
      try {
        executable=await realpath(`/proc/${pid}/exe`);
        if(!binaryHashes.has(executable)) binaryHashes.set(executable,hash(await readFile(`/proc/${pid}/exe`)));
        executableSha256=binaryHashes.get(executable);
      } catch(error) {
        if(!['EACCES','EPERM'].includes(error.code)) throw error;
        binaryUnavailable=error.code;
      }
      const status=await readFile(`/proc/${pid}/status`,'utf8');
      const namespaces={};
      for(const name of ['user','pid','mnt','net']) {
        try { namespaces[name]={sameAsObserver:(await readlink(`/proc/${pid}/ns/${name}`))===ownNamespaces[name]}; }
        catch(error) { if(!['EACCES','EPERM'].includes(error.code)) throw error; namespaces[name]={unavailable:true}; }
      }
      const after=await os.readProcStat(pid);
      assert.ok(after?.live && after.starttime===before.starttime,'M2 identidad estable durante lectura proc');
      const profileArgs=argv.filter(arg=>arg.startsWith('--user-data-dir='));
      const profileExact=profileArgs.length===1 && profileArgs[0]==='--user-data-dir='+profile;
      if(pid===leader.pid) assert.ok(profileExact,'M2 perfil exacto del handle Chrome');
      // Chrome puede reescribir argv0 como una sola cadena con espacios.
      // Clasificación diagnóstica cerrada; jamás serializar esa cadena/valores.
      const firstArg=argv[0] ?? '',firstArgWithinBound=firstArg.length<=65536;
      const firstTypes=firstArgWithinBound
        ? [...firstArg.matchAll(/(?:^|\s)--type=(renderer|zygote|gpu-process|utility)(?=\s|$)/g)].map(match=>match[1]) : [];
      const types=new Set([...argv.flatMap(arg=>{
        const match=/^--type=(renderer|zygote|gpu-process|utility)$/.exec(arg);
        return match ? [match[1]] : [];
      }),...firstTypes]);
      const kind=types.size===1 ? [...types][0] : types.size===0 && pid===leader.pid ? 'main' : 'other';
      const knownFlags=new Set([
        '--headless','--remote-debugging-port','--user-data-dir','--no-first-run','--no-default-browser-check',
        '--disable-background-networking','--disable-component-update','--disable-domain-reliability',
        '--disable-sync','--metrics-recording-only','--disable-features','--enable-features','--type',
        '--no-zygote-sandbox','--no-sandbox','--change-stack-guard-on-fork','--crashpad-handler-pid',
        '--enable-crash-reporter','--field-trial-handle','--variations-seed-version','--trace-process-track-uuid',
        '--lang','--renderer-client-id','--time-ticks-at-unix-epoch','--launch-time-ticks','--shared-files',
        '--num-raster-threads','--enable-main-frame-before-activation','--disable-dev-shm-usage',
        '--ozone-platform','--use-angle','--use-gl','--service-sandbox-type','--utility-sub-type',
        '--gpu-preferences','--metrics-shmem-handle','--mojo-platform-channel-handle',
      ]);
      const flagNames=new Set([
        ...argv.flatMap(arg=>/^--[a-z0-9-]{1,64}(?==|$)/.exec(arg)?.[0] ?? []),
        ...(firstArgWithinBound ? [...firstArg.matchAll(/(?:^|\s)(--[a-z0-9-]{1,64})(?==|\s|$)/g)].map(match=>match[1]) : []),
      ]);
      const field=name=>new RegExp('^'+name+':\\s+(\\d+)','m').exec(status)?.[1] ?? null;
      const uid=/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/m.exec(status)?.slice(1).map(Number) ?? null;
      observed.push({pid,ppid:before.ppid,starttime:before.starttime,
        kind,argc:argv.length,firstArgContainsKnownType:firstTypes.length>0,firstArgWithinBound,
        uid,profileExact,profileSpecified:profileArgs.length>0,
        executableMatchesLeader:executable===null ? null : executable===leaderExecutable,
        executableSha256,binaryUnavailable,
        flags:[...flagNames].filter(flag=>knownFlags.has(flag)),
        unknownFlagNameCount:[...flagNames].filter(flag=>!knownFlags.has(flag)).length,
        seccomp:field('Seccomp'),seccompFilters:field('Seccomp_filters'),noNewPrivs:field('NoNewPrivs'),namespaces});
    } catch(error) {
      if(['EACCES','EPERM'].includes(error.code)) observed.push({pid,ppid:before.ppid,
        starttime:before.starttime,kind:'unavailable',observationUnavailable:error.code});
      else if(!['ENOENT','ESRCH'].includes(error.code)) throw error;
    }
  }
  return observed;
}
async function probe(root,source,records,os,abort) {
  for(const name of (await readdir(SOURCE)).filter(name=>name.startsWith('.env'))) {
    // Única excepción autorizada por discovery BASE; no leer su contenido.
    assert.equal(name,'.env.example','M2 probe sin archivos env runtime de checkout');
    const info=await lstat(join(SOURCE,name));
    assert.ok(info.isFile() && !info.isSymbolicLink(),'M2 ejemplo env debe ser archivo regular sin symlink');
  }
  let ownProfileRoot=null;
  const logs=[];
  const names=['chromePath','freePort','waitForHttp','waitForDevTools','rememberOutput','assertSandboxedChromeArgs','startBrowser'];
  const start=runInNewContext('let ownedRoot;\n'+names.map(name=>actual(source,name)).join('\n')+'\nstartBrowser',{
    assert,Buffer,access,open,readFile,realpath,stat,constants,join,createServer,fetch,AbortSignal,
    ROOT:SOURCE,DEADLINE_MS:45000,delay:pause,tmpdir:()=>root,
    process:{platform:process.platform,execPath:NODE,env:environment(root)},
    mkdtemp:async prefix=>{assert.equal(dirname(prefix),root,'M2 perfil sólo root propio');ownProfileRoot=await mkdtemp(prefix);return ownProfileRoot;},
    console:{log:line=>{if(String(line).startsWith('Chrome sandbox: ')) logs.push(JSON.parse(String(line).slice('Chrome sandbox: '.length)));}},
    spawnOwned:(command,args,options={})=>{
      assert.ok(!abort.aborted,'M2 interrumpido antes de spawn');
      const record=launch(command,args,{cwd:SOURCE,env:options.env ?? environment(root)},records,os);
      record.child.output=()=>record.output;
      return record.child;
    },
  });
  await start(); // Implementación normal REAL; sólo transporte/retención local de handles.
  assert.equal(records.length,2,'M2 Next y Chrome propios registrados');
  assert.ok(ownProfileRoot,'M2 root de perfil creado por startBrowser');
  const deadline=Date.now()+5000;
  let processes=[];
  do {
    assert.ok(!abort.aborted,'M2 interrumpido durante observación');
    processes=await procSnapshot(records[1],join(ownProfileRoot,'chrome-profile'),os);
    if(processes.some(item=>item.kind==='renderer')) break;
    await pause(100);
  } while(Date.now()<deadline);
  return {diagnosticOnly:true,platform:'linux',startupReceipt:logs,processes,
    rendererObserved:processes.some(item=>item.kind==='renderer'),sandboxActive:null,
    limitations:['No assertion de seccomp/namespace activa hasta revisar datos reales.',
      'MAIN no se exige sandboxed; sólo se reportan valores del kernel.',
      'about:blank del arranque legítimo; no se navega auth ni se observa entorno /proc.',
      'Ausencia de renderer/datos no es PASS de sandbox; alcance sólo Linux local.']};
}

export async function main(argv=process.argv.slice(2)) {
  assert.ok(argv.length===1 && ['--mode=unit-mutants','--mode=proc-probe','--mode=all'].includes(argv[0]),'M2 modo cerrado obligatorio');
  assert.equal(process.platform,'linux','M2 runner local Linux');
  assert.equal(process.execPath,NODE,'M2 Node instalado exacto');
  assert.equal(process.cwd(),SOURCE,'M2 checkout autorizado');
  for(const root of [SOURCE,TMP,EVIDENCE]) {
    assert.equal(await realpath(root),root,'M2 root canónico');
    assert.ok((await lstat(root)).isDirectory(),'M2 root directorio');
  }
  const mode=argv[0].slice(7),before=await manifest(SOURCE,[...directories,...rootFiles]);
  const source=await readFile(join(SOURCE,loginPath),'utf8'),os=await safety();
  const root=await mkdtemp(join(TMP,'m2-')),evidence=await mkdtemp(join(EVIDENCE,'m2-mutants-'));
  const records=[],controller=new AbortController();
  const abort=controller.signal;
  const summary={mode,before,root,evidence,completed:false,cleanup:null,stage:'setup'};
  const interrupt=()=>controller.abort();
  process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
  const watchdog=setTimeout(interrupt,180000);
  let failure;
  try {
    await mkdir(join(root,'home'));
    if(mode!=='proc-probe') {
      summary.stage='unit-mutants';
      const unitRoot=join(root,'unit');await mkdir(unitRoot);
      summary.unit=await mutants(unitRoot,evidence,source,records,os,abort);
      summary.unit.cleanup=await cleanRecords(records,os);
      records.length=0;
    }
    if(mode!=='unit-mutants') {
      summary.stage='proc-probe';
      const probeRoot=join(root,'probe');await mkdir(probeRoot);
      summary.proc=await probe(probeRoot,source,records,os,abort);
      await save(join(evidence,'linux-proc.json'),summary.proc);
    }
    summary.completed=true;
  } catch(error) {
    failure=error;
    const diagnostic=String(error.message ?? '')+'\n'+records.map(item=>item.output).join('\n');
    const socketCategories=[
      ['ENAMETOOLONG',/\bENAMETOOLONG\b|file name too long/i],
      ['UNIX_SOCKET_PATH_LENGTH',/(?:socket|sockaddr|unix)[^\r\n]{0,120}(?:too long|path length|length limit)/i],
      ['CHROME_SINGLETON',/ProcessSingleton|SingletonSocket|SingletonLock|SingletonCookie/i],
    ].filter(([,pattern])=>pattern.test(diagnostic)).map(([category])=>category);
    summary.failure={code:['ERR_ASSERTION','ENOENT','EACCES','EPERM'].includes(error.code)?error.code:'OTHER',
      builtinError:['TypeError','ReferenceError'].includes(error.name)?error.name:null,
      socketCategories:socketCategories.length ? socketCategories : ['UNKNOWN'],
      category:error.message?.startsWith('M2 ') ? 'M2_CONTRACT' : 'BOOTSTRAP_OR_UNCLASSIFIED',
      bootstrap:['Next terminó','Next no quedó listo','Chrome terminó','Chrome no expuso CDP','Turbopack']
        .map((marker,index)=>diagnostic.includes(marker)?['NEXT_EXIT','NEXT_TIMEOUT','CHROME_EXIT','CHROME_TIMEOUT','TURBOPACK'][index]:null).filter(Boolean)};
  } finally {
    clearTimeout(watchdog);
    try {
      summary.cleanup={observations:await cleanRecords(records,os),rootRemoved:false};
      assert.equal(dirname(root),TMP,'M2 cleanup sólo mkdtemp propio');
      await rm(root,{recursive:true});summary.cleanup.rootRemoved=true;
    } catch(error) {
      failure ??= error;
      summary.cleanup={rootRemoved:false,rootRetained:true,observations:error.observations ?? [],reason:'OWNERSHIP_UNCERTAIN'};
    }
    summary.after=await manifest(SOURCE,[...directories,...rootFiles]);
    summary.checkoutUnchanged=summary.before.sha256===summary.after.sha256;
    summary.completed=summary.completed && !failure && summary.checkoutUnchanged && summary.cleanup.rootRemoved;
    process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);
    await save(join(evidence,'summary.json'),summary);
  }
  assert.ok(!failure && summary.checkoutUnchanged && summary.cleanup.rootRemoved,'M2 runner falló; consultar receipt sanitizado');
  console.log(JSON.stringify({receipt:join(evidence,'summary.json'),unitMutants:summary.unit?.mutants.length ?? 0,
    rendererObserved:summary.proc?.rendererObserved ?? null,sandboxActive:null,checkoutUnchanged:true,rootRemoved:true}));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(()=>{console.error('M2 runner no completado; inspeccionar evidence sanitizada');process.exitCode=1;});
}
