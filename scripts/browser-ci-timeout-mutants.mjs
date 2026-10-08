// Runner LOCAL, sólo supervisor tras aprobación CUSTOM. Importar no ejecuta main.
// Sin procesos hijos, Chrome, sockets, Git ni CI externo: YAML privado + tests T4 reales.
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
const workflowPath='.github/workflows/ci.yml',testPath='lib/browser-recovery-hardening.test.ts';
const sourcePaths=['app','components','lib','public','scripts','docs','.github','supabase',
  'AGENTS.md','CLAUDE.md','README.md','.gitignore','package.json','package-lock.json',
  'next-env.d.ts','next.config.mjs','postcss.config.mjs','tsconfig.json','skills-lock.json'];
const privatePaths=[workflowPath,testPath];
const hash=value=>createHash('sha256').update(value).digest('hex');
const save=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const normalNames=[
  'T4 CI usa sólo Chrome del sistema ya permitido y timeout de job',
  'T4 test:browser: Chrome del sistema y timeout propio',
  'T4 test:browser:recovery: Chrome del sistema y timeout propio',
  'M3 rechaza reintroducir staging privilegiado de Chrome',
];
const assertionIds=[
  'T4 timeout verify/job exacto: 20 minutos',
  'T4 timeout verify/test:browser exacto: 5 minutos',
  'T4 timeout verify/test:browser:recovery exacto: 10 minutos',
];
async function snapshot(root,paths) {
  const files=[];
  async function visit(path) {
    assert.ok(!path.split('/').some(part=>part.startsWith('.env')),'M3 snapshot sin env runtime');
    const info=await lstat(join(root,path));
    assert.ok(!info.isSymbolicLink(),'M3 snapshot sin symlinks');
    if(info.isDirectory()) for(const name of (await readdir(join(root,path))).sort()) await visit(join(path,name));
    else {assert.ok(info.isFile(),'M3 archivo normal');files.push({path,sha256:hash(await readFile(join(root,path)))});}
  }
  for(const path of paths) await visit(path);
  return {files,sha256:hash(JSON.stringify(files))};
}
function replaceOne(source,site,replacement) {
  assert.equal(source.split(site).length-1,1,'M3 mutation occurrence exactamente uno');
  return source.replace(site,()=>replacement);
}
async function actualSuite(root) {
  const source=await readFile(join(root,testPath),'utf8');
  const begin='async function t4Workflow() {',end='for (const mutation of [';
  assert.equal(source.split(begin).length-1,1,'M3 inicio único de helpers reales');
  const start=source.indexOf(begin);
  assert.equal(source.slice(start).split(end).length-1,1,'M3 límite único posterior a helpers T4');
  const finish=source.indexOf(end,start);
  assert.ok(finish>start,'M3 bloque T4 real completo');
  const block=source.slice(start,finish),tests=[];
  // API Node instalada (desde 22.13). Sólo quitar tipos, sin reescribir assertions.
  const javascript=stripTypeScriptTypes(block,{mode:'strip'});
  const api=runInNewContext(javascript+'\n({t4WorkflowSource,t4BrowserStep})',{
    assert,readFile,URL,root:pathToFileURL(root+'/'),
    test:(name,run)=>{assert.equal(typeof run,'function','M3 callback real');tests.push({name,run});},
  },{timeout:1000});
  assert.deepEqual(tests.map(item=>item.name),normalNames,'M3 exactamente los tres tests normales T4');
  return {api,tests,extractedSourceSha256:hash(block)};
}
async function runNormal(root) {
  const {tests,extractedSourceSha256}=await actualSuite(root),results=[];
  for(const item of tests) {
    try {await item.run();results.push({test:item.name,pass:true});}
    catch(error) {
      const assertion=error instanceof assert.AssertionError && error.code==='ERR_ASSERTION';
      const first=String(error.message ?? '').split('\n')[0];
      results.push({test:item.name,pass:false,assertion,
        assertionId:assertion && assertionIds.includes(first)?first:null,
        errorCategory:assertion?'ASSERTION':['TypeError','ReferenceError','SyntaxError'].includes(error.name)?error.name:'OTHER'});
    }
  }
  return {extractedSourceSha256,results,pass:results.filter(item=>item.pass).length,fail:results.filter(item=>!item.pass).length};
}
function variants(yaml,api) {
  const result=[];
  for(const [index,target,old,up,down] of [[0,'job','20','200','19'],[1,'baseline','5','50','4'],[2,'recovery','10','100','9']]) {
    const script=index===1?'test:browser':'test:browser:recovery';
    const site=index===0 ? `    timeout-minutes: ${old}\n`
      : `      - run: npm run ${script}\n        timeout-minutes: ${old}\n`;
    for(const [direction,value] of [['up',up],['down',down]]) result.push({
      id:target+'-'+direction,index,site,replacement:site.replace('timeout-minutes: '+old,'timeout-minutes: '+value),
    });
  }
  const {job,steps}=api.t4WorkflowSource(yaml);
  // Duplicar bloques REALES sólo en copia, sin fixtures de validación paralelos.
  // El valor correcto en otro job/step no debe satisfacer el guard de verify.
  result.push({id:'wrong-job',index:0,site:'  verify:\n'+job,
    replacement:'  timeout-decoy:\n'+job+'  verify:\n'+replaceOne(job,'    timeout-minutes: 20\n','    timeout-minutes: 200\n')});
  const baseline=api.t4BrowserStep(steps,'test:browser');
  result.push({id:'wrong-step',index:1,site:baseline,
    replacement:replaceOne(baseline,'run: npm run test:browser','run: npm run build')
      +replaceOne(baseline,'        timeout-minutes: 5\n','        timeout-minutes: 50\n')});
  return result;
}
export async function main(argv=process.argv.slice(2)) {
  assert.deepEqual(argv,['--mode=all'],'M3 único modo cerrado --mode=all');
  assert.equal(process.execPath,NODE,'M3 Node instalado exacto');
  assert.equal(process.cwd(),SOURCE,'M3 checkout autorizado');
  for(const path of [SOURCE,TMP,EVIDENCE]) {
    assert.equal(await realpath(path),path,'M3 root canónico');
    assert.ok((await lstat(path)).isDirectory(),'M3 root directorio real');
  }
  const canonicalBefore=await snapshot(SOURCE,sourcePaths);
  const originalYaml=await readFile(join(SOURCE,workflowPath));
  const originalTests=await readFile(join(SOURCE,testPath));
  const root=await mkdtemp(join(TMP,'m3-')),evidence=await mkdtemp(join(EVIDENCE,'m3-timeouts-'));
  const summary={root,evidence,canonicalBefore,mutants:[],controls:[],completed:false,rootRemoved:false};
  let originalSnapshot,failure;
  try {
    await mkdir(join(root,'.github/workflows'),{recursive:true});await mkdir(join(root,'lib'));
    await writeFile(join(root,workflowPath),originalYaml,{flag:'wx'});
    await writeFile(join(root,testPath),originalTests,{flag:'wx'});
    originalSnapshot=await snapshot(root,privatePaths);summary.privateBefore=originalSnapshot;
    async function control(id) {
      const run=await runNormal(root);
      summary.controls.push({id,...run});await save(join(evidence,id+'.json'),run);
      assert.ok(run.pass===3 && run.fail===0,'M3 control normal T4 obligatorio');
    }
    await control('control-before');
    const {api}=await actualSuite(root);
    const cases=variants(originalYaml.toString(),api);
    assert.equal(cases.length,8,'M3 catálogo cerrado ocho mutaciones');
    for(const item of cases) {
      const record={id:item.id,expectedTest:normalNames[item.index],expectedAssertion:assertionIds[item.index],
        occurrence:0,before:originalSnapshot.sha256};
      try {
        const mutated=replaceOne(originalYaml.toString(),item.site,item.replacement);record.occurrence=1;
        record.site={before:hash(item.site),after:hash(item.replacement)};
        await writeFile(join(root,workflowPath),mutated);
        record.mutated=(await snapshot(root,privatePaths)).sha256;
        record.run=await runNormal(root);
        const rejected=record.run.results.filter(value=>!value.pass);
        record.killed=record.run.pass===2 && rejected.length===1 && rejected[0].assertion===true
          && rejected[0].test===record.expectedTest && rejected[0].assertionId===record.expectedAssertion;
      } finally {
        await writeFile(join(root,workflowPath),originalYaml);
        record.restored=(await snapshot(root,privatePaths)).sha256;
        record.restoredExactly=record.restored===originalSnapshot.sha256;
        summary.mutants.push(record);await save(join(evidence,item.id+'.json'),record);
      }
      assert.ok(record.killed && record.restoredExactly,'M3 muerte nombrada/restauración obligatorias');
    }
    await control('control-restored');summary.completed=true;
  } catch(error) {
    failure=error;
    summary.failure={category:error instanceof assert.AssertionError?'ASSERTION':
      ['TypeError','ReferenceError','SyntaxError'].includes(error.name)?error.name:'OTHER'};
  } finally {
    // Sin procesos ni perfiles. Restaurar bytes incluso al abortar un caso.
    if(originalSnapshot) {
      await writeFile(join(root,workflowPath),originalYaml);
      summary.privateAfter=await snapshot(root,privatePaths);
      summary.restoredExactly=summary.privateAfter.sha256===originalSnapshot.sha256;
    }
    summary.canonicalAfter=await snapshot(SOURCE,sourcePaths);
    summary.checkoutUnchanged=canonicalBefore.sha256===summary.canonicalAfter.sha256;
    assert.equal(dirname(root),TMP,'M3 cleanup sólo mkdtemp propio');
    if(!originalSnapshot || summary.restoredExactly) {await rm(root,{recursive:true});summary.rootRemoved=true;}
    summary.completed=summary.completed && !failure && summary.checkoutUnchanged && summary.rootRemoved;
    await save(join(evidence,'summary.json'),summary);
  }
  assert.ok(summary.completed,'M3 runner incompleto; revisar receipt sanitizado');
  console.log(JSON.stringify({receipt:join(evidence,'summary.json'),mutants:summary.mutants.length,
    restoredExactly:summary.restoredExactly,checkoutUnchanged:summary.checkoutUnchanged,rootRemoved:summary.rootRemoved}));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(()=>{console.error('M3 runner incompleto; revisar evidence sanitizada');process.exitCode=1;});
}
