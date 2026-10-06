// Runner LOCAL supervisado. Importar no inicia main. Sólo unit de transporte CDP
// doble: no afirma entrega browser real, que mide el probe de duplicado separado.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

const SOURCE='/home/domarchithinkpad/Developer/password-recovery-review-close-20261006/travel';
const TMP='/home/domarchithinkpad/.hermes/cache/scratch/tc-d0et9_nt';
const EVIDENCE='/home/domarchithinkpad/.hermes/cache/scratch/password-recovery-review-close-20261006/travel';
const NODE='/home/domarchithinkpad/.local/share/mise/installs/node/24.21.0/bin/node';
const recoveryPath='scripts/browser-recovery.mjs',testPath='lib/browser-recovery-diagnostic-consumption.test.ts';
const sourcePaths=['app','components','lib','public','scripts','docs','.github','supabase',
  'AGENTS.md','CLAUDE.md','README.md','.gitignore','package.json','package-lock.json',
  'next-env.d.ts','next.config.mjs','postcss.config.mjs','tsconfig.json','skills-lock.json'];
const privatePaths=[recoveryPath,testPath];
const assertionId='M5 consumo único: duplicado idéntico debe producir unexpected browser log error';
const hash=value=>createHash('sha256').update(value).digest('hex');
const save=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
async function snapshot(root,paths) {
  const files=[];
  async function visit(path) {
    assert.ok(!path.split('/').some(part=>part.startsWith('.env')),'M5 snapshot sin runtime env');
    const info=await lstat(join(root,path));
    assert.ok(!info.isSymbolicLink(),'M5 snapshot sin symlinks');
    if(info.isDirectory()) for(const name of (await readdir(join(root,path))).sort()) await visit(join(path,name));
    else {assert.ok(info.isFile(),'M5 archivo normal');files.push({path,sha256:hash(await readFile(join(root,path)))});}
  }
  for(const path of paths) await visit(path);
  return {files,sha256:hash(JSON.stringify(files))};
}
function replaceOne(source,site,replacement) {
  assert.equal(source.split(site).length-1,1,'M5 sitio único obligatorio');
  return source.replace(site,()=>replacement);
}
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise,new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(Object.assign(new Error('M5 unit deadline'),{code:'M5_TIMEOUT'})),10000);
    })]);
  } finally {clearTimeout(timer);}
}
async function actualTests(root) {
  const original=await readFile(join(root,testPath),'utf8'),tests=[];
  const imports=/^import [^\n]+ from 'node:(?:test|assert\/strict|fs\/promises|vm)';\n/gm;
  assert.equal((original.match(imports) ?? []).length,4,'M5 adapter cuatro imports nativos conocidos');
  // Adaptar sólo loader/URL del módulo privado. Assertions y helpers del test
  // permanecen los REALES; el propio test extrae callback/guard de recovery.
  let source=original.replace(imports,'');
  assert.doesNotMatch(source,/^import /m,'M5 adapter sin imports desconocidos');
  source=replaceOne(source,'import.meta.url',JSON.stringify(pathToFileURL(join(root,testPath)).href));
  const javascript=stripTypeScriptTypes(source,{mode:'strip'});
  await bounded(runInNewContext('(async()=>{\n'+javascript+'\n})()',{
    assert,readFile,runInNewContext,URL,Buffer,
    test:(name,run)=>{assert.equal(typeof run,'function','M5 callback test real');tests.push({name,run});},
  },{timeout:1000}));
  assert.equal(tests.length,27,'M5 exactamente los 27 tests reales');
  assert.equal(new Set(tests.map(item=>item.name)).size,27,'M5 nombres reales distintos');
  return {tests,testSourceSha256:hash(original)};
}
async function runUnit(root) {
  const {tests,testSourceSha256}=await actualTests(root),results=[];
  for(const item of tests) {
    try {await bounded(item.run());results.push({name:item.name,pass:true});}
    catch(error) {
      const assertion=error instanceof assert.AssertionError && error.code==='ERR_ASSERTION';
      results.push({name:item.name,pass:false,assertion,
        assertionId:assertion && String(error.message).split('\n')[0]===assertionId?assertionId:null,
        errorCategory:error.code==='M5_TIMEOUT'?'TIMEOUT':assertion?'ASSERTION':
          ['TypeError','ReferenceError','SyntaxError'].includes(error.name)?error.name:'OTHER'});
    }
  }
  return {testSourceSha256,results,pass:results.filter(item=>item.pass).length,fail:results.filter(item=>!item.pass).length};
}
export async function main(argv=process.argv.slice(2)) {
  assert.deepEqual(argv,['--mode=all'],'M5 modo cerrado --mode=all');
  assert.equal(process.execPath,NODE,'M5 Node instalado');assert.equal(process.cwd(),SOURCE,'M5 checkout autorizado');
  for(const path of [SOURCE,TMP,EVIDENCE]) {
    assert.equal(await realpath(path),path,'M5 root canónico');assert.ok((await lstat(path)).isDirectory(),'M5 root real');
  }
  const sourceBefore=await snapshot(SOURCE,sourcePaths);
  const recovery=await readFile(join(SOURCE,recoveryPath)),testSource=await readFile(join(SOURCE,testPath));
  const catalogSource=recovery.toString().match(/^function fixtureDiagnosticCases\([^]*?^}/m)?.[0];
  assert.ok(catalogSource,'M5 catálogo real disponible');
  const catalog=runInNewContext(catalogSource+'\nfixtureDiagnosticCases()');
  const expectedNames=Array.from(catalog,item=>`M5 diagnóstico ${item[0]}: duplicado idéntico debe ser unexpected browser log error`).sort();
  assert.equal(expectedNames.length,11,'M5 catálogo de once duplicados');
  const root=await mkdtemp(join(TMP,'m5-unit-')),evidence=await mkdtemp(join(EVIDENCE,'m5-diagnostic-mutants-'));
  const summary={scope:'unit-real-callback-with-CDP-double',browserMeasured:false,root,evidence,sourceBefore,
    controls:[],mutant:null,completed:false,rootRemoved:false};
  let before,failure;
  try {
    await mkdir(join(root,'scripts'));await mkdir(join(root,'lib'));
    await writeFile(join(root,recoveryPath),recovery,{flag:'wx'});
    await writeFile(join(root,testPath),testSource,{flag:'wx'});
    before=await snapshot(root,privatePaths);summary.privateBefore=before;
    async function control(id) {
      const run=await runUnit(root);summary.controls.push({id,...run});await save(join(evidence,id+'.json'),run);
      assert.ok(run.pass===27 && run.fail===0,'M5 control de los tests reales debe pasar');
    }
    await control('control-before');
    const site='        fixtureDiagnostics.get(cdp).delete(entry.networkRequestId);';
    const replacement='        // Mutante privado: correlación no consumida.';
    const record={id:'remove-consumption',occurrence:0,before:before.sha256,expectedAssertion:assertionId,expectedNames};
    summary.mutant=record;
    try {
      const mutated=replaceOne(recovery.toString(),site,replacement);record.occurrence=1;
      record.site={before:hash(site),after:hash(replacement)};
      await writeFile(join(root,recoveryPath),mutated);
      record.mutated=(await snapshot(root,privatePaths)).sha256;
      record.run=await runUnit(root);
      const failed=record.run.results.filter(item=>!item.pass);
      record.killed=record.run.pass===16 && failed.length===11
        && failed.every(item=>item.assertion && item.assertionId===assertionId)
        && JSON.stringify(failed.map(item=>item.name).sort())===JSON.stringify(expectedNames);
    } finally {
      await writeFile(join(root,recoveryPath),recovery);
      record.restored=(await snapshot(root,privatePaths)).sha256;
      record.restoredExactly=record.restored===before.sha256;
      await save(join(evidence,'remove-consumption.json'),record);
    }
    assert.ok(record.killed && record.restoredExactly,'M5 once rechazos exactos y restauración obligatorios');
    await control('control-restored');summary.completed=true;
  } catch(error) {
    failure=error;summary.failure={category:error instanceof assert.AssertionError?'ASSERTION':
      ['TypeError','ReferenceError','SyntaxError'].includes(error.name)?error.name:error.code==='M5_TIMEOUT'?'TIMEOUT':'OTHER'};
  } finally {
    if(before) {
      await writeFile(join(root,recoveryPath),recovery);
      summary.privateAfter=await snapshot(root,privatePaths);
      summary.restoredExactly=summary.privateAfter.sha256===before.sha256;
    }
    summary.sourceAfter=await snapshot(SOURCE,sourcePaths);
    summary.sourceUnchanged=sourceBefore.sha256===summary.sourceAfter.sha256;
    assert.equal(dirname(root),TMP,'M5 cleanup sólo mkdtemp propio');
    // Ningún proceso/perfil/socket creado por este runner: cleanup sólo FS.
    if(!before || summary.restoredExactly) {await rm(root,{recursive:true});summary.rootRemoved=true;}
    summary.completed=summary.completed && !failure && summary.sourceUnchanged && summary.rootRemoved;
    await save(join(evidence,'summary.json'),summary);
  }
  assert.ok(summary.completed,'M5 mutante unit incompleto; inspeccionar receipt sanitizado');
  console.log(JSON.stringify({receipt:join(evidence,'summary.json'),unitMutantKilled:summary.mutant.killed,
    browserMeasured:false,sourceUnchanged:summary.sourceUnchanged,rootRemoved:summary.rootRemoved}));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(()=>{console.error('M5 mutante unit: ejecución incompleta, no contar infraestructura como muerte');process.exitCode=1;});
}
