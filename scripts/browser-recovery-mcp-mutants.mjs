// Runner LOCAL supervisado. Importar no inicia HTTP, mutaciones ni procesos.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { actualCheckMcp, withLocalMcp } from './browser-recovery-mcp-probe.mjs';

const SOURCE='/home/domarchithinkpad/Developer/password-recovery-review-close-20261006/travel';
const TMP='/home/domarchithinkpad/.hermes/cache/scratch/tc-d0et9_nt';
const EVIDENCE='/home/domarchithinkpad/.hermes/cache/scratch/password-recovery-review-close-20261006/travel';
const NODE='/home/domarchithinkpad/.local/share/mise/installs/node/24.21.0/bin/node';
const recovery='scripts/browser-recovery.mjs',validator='lib/mcp-compilation.ts';
const testPath='lib/browser-recovery-mcp.test.ts',probePath='scripts/browser-recovery-mcp-probe.mjs';
const privatePaths=[recovery,validator,testPath,probePath];
const sourcePaths=['app','components','lib','public','scripts','docs','.github','supabase',
  'AGENTS.md','CLAUDE.md','README.md','.gitignore','package.json','package-lock.json',
  'next-env.d.ts','next.config.mjs','postcss.config.mjs','tsconfig.json','skills-lock.json'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const save=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
async function snapshot(root,paths) {
  const files=[];
  async function visit(path) {
    assert.ok(!path.split('/').some(part=>part.startsWith('.env')),'M5 MCP snapshot sin env');
    const info=await lstat(join(root,path));
    assert.ok(!info.isSymbolicLink(),'M5 MCP snapshot sin symlinks');
    if(info.isDirectory()) for(const name of (await readdir(join(root,path))).sort()) await visit(join(path,name));
    else {assert.ok(info.isFile(),'M5 MCP archivo normal');files.push({path,sha256:hash(await readFile(join(root,path)))});}
  }
  for(const path of paths) await visit(path);
  return {files,sha256:hash(JSON.stringify(files))};
}
function replaceOne(source,site,replacement) {
  assert.equal(source.split(site).length-1,1,'M5 MCP sitio privado único');
  return source.replace(site,()=>replacement);
}
const closed=id=>`M5 MCP fail-closed: ${id}`;
const missing=(test,message=test)=>({test,message,kind:'missing-rejection'});
const lateTest='M5 MCP issues tardíos después de observación vacía deben rechazar nueva consulta';
const mainTest='M5 MCP main consulta final después de ambos viewports y rechaza issues tardíos';
const variants=[
  {id:'silent-tool-fallback',path:recovery,
    site:"  assert.equal(catalog.tools.filter(tool => tool.name === 'get_compilation_issues').length, 1,\n    'MCP requiere una única tool get_compilation_issues');",
    replacement:"  if (catalog.tools.filter(tool => tool.name === 'get_compilation_issues').length !== 1) return;",
    checks:['tool faltante','tool ajena no sustituye issues','tool duplicada'].map(id=>missing(closed(id)))},
  {id:'remove-catalog-guard',path:recovery,
    site:"  assert.ok(Array.isArray(catalog.tools) && catalog.tools.every(tool => tool\n    && typeof tool === 'object' && !Array.isArray(tool) && typeof tool.name === 'string'\n    && tool.name.length > 0 && tool.name === tool.name.trim()), 'MCP catálogo de tools inválido');",
    replacement:'  // Mutante privado: omite validación del catálogo.',
    checks:[missing(closed('nombre de tool malformado'))]},
  {id:'remove-protocol-error-guard',path:recovery,
    site:"    assert.ok(!('error' in data), 'MCP devolvió error de protocolo');",
    replacement:'    // Mutante privado: omite guard de error JSON-RPC.',
    checks:['error de protocolo list','error de protocolo call'].map(id=>({test:closed(id),message:closed(id),
      kind:'wrong-named-guard',actualGuard:'MCP respuesta de protocolo inválida'}))},
  {id:'bypass-compilation-validator',path:recovery,
    site:"  assertCompilationIssues(await call('tools/call',{name:'get_compilation_issues',arguments:{}}));",
    replacement:"  await call('tools/call',{name:'get_compilation_issues',arguments:{}});",
    checks:[missing(closed('call isError')),missing(closed('content ausente'))]},
  {id:'remove-empty-issues-guard',path:validator,
    site:"  assert.equal(data.issues.length, 0, 'MCP detectó issues de compilación');",
    replacement:'  // Mutante privado: acepta issues no vacíos.',
    checks:[missing(closed('issues reales no vacíos')),
      missing(lateTest,'M5 MCP issues tardíos no reutilizan observación vacía')]},
  {id:'skip-final-certification',path:recovery,
    // Early return es la regresión bajo prueba, nunca un throw artificial de kill.
    // Omite la certificación final completa; finally conserva teardown real.
    site:'    await checkMcp(runtime.appUrl);',replacement:'    return; // Mutante privado: omite certificación final.',
    checks:[missing(mainTest,'M5 MCP main no certifica issues tardíos')]},
];

async function actualTests(root,transportRecords) {
  let implementation=await readFile(join(root,validator),'utf8');
  implementation=replaceOne(implementation,"import assert from 'node:assert/strict';\n",'');
  implementation=replaceOne(implementation,'export function assertCompilationIssues','function assertCompilationIssues');
  const assertCompilationIssues=runInNewContext(stripTypeScriptTypes(implementation,{mode:'strip'})+
    '\nassertCompilationIssues',{assert},{timeout:1000});
  let source=await readFile(join(root,testPath),'utf8');
  const tests=[];
  const imports=["import test from 'node:test';","import assert from 'node:assert/strict';",
    "import { readFile } from 'node:fs/promises';","import { runInNewContext } from 'node:vm';",
    "import { assertCompilationIssues } from './mcp-compilation.ts';",
    "import { actualCheckMcp, withLocalMcp } from '../scripts/browser-recovery-mcp-probe.mjs';"];
  for(const line of imports) source=replaceOne(source,line+'\n','');
  assert.doesNotMatch(source,/^import /m,'M5 MCP adapter sin import desconocido');
  source=replaceOne(source,'import.meta.url',JSON.stringify(pathToFileURL(join(root,testPath)).href));
  // Sólo loader de los tests/validator REALES; el transporte no decide el guard.
  // Copia probe verificada idéntica; su implementación importada es la misma.
  assert.equal(hash(await readFile(join(root,probePath))),hash(await readFile(join(SOURCE,probePath))),
    'M5 MCP adapter transporte idéntico');
  await runInNewContext('(async()=>{\n'+stripTypeScriptTypes(source,{mode:'strip'})+'\n})()',{
    assert,readFile,runInNewContext,URL,setTimeout,clearTimeout,assertCompilationIssues,actualCheckMcp,
    test:(name,run)=>tests.push({name,run}),
    withLocalMcp:async(reply,run)=>{
      let observed;
      try {return await withLocalMcp(reply,async fixture=>{observed=fixture.observations;return run(fixture);});}
      finally {
        const record=observed?{...observed}:null;
        transportRecords.push(record);
        assert.ok(record && record.closed && record.openSockets===0 && record.externalAttempts===0,
          'M5 MCP fixture cleanup y egress obligatorios');
      }
    },
  },{timeout:1000});
  assert.equal(tests.length,30,'M5 MCP treinta tests reales');
  assert.equal(new Set(tests.map(item=>item.name)).size,30,'M5 MCP nombres únicos');
  return tests;
}
async function runTests(root,checks) {
  const transports=[],tests=await actualTests(root,transports),results=[];
  const selected=checks?checks.map(check=>{
    const found=tests.find(item=>item.name===check.test);assert.ok(found,'M5 MCP test seleccionado existente');
    return {...found,check};
  }):tests;
  for(const item of selected) {
    try {await item.run();results.push({name:item.name,pass:true,exactKill:false});}
    catch(error) {
      const assertion=error instanceof assert.AssertionError && error.code==='ERR_ASSERTION';
      const check=item.check;
      const exactKill=!!check && assertion && error.operator==='rejects' && (
        check.kind==='missing-rejection'
          ?error.actual===undefined && error.message===`Missing expected rejection: ${check.message}`
          :error.message===check.message && error.actual instanceof assert.AssertionError
            && error.actual.message.split('\n')[0]===check.actualGuard);
      results.push({name:item.name,pass:false,exactKill,
        assertionId:exactKill?check.message:null,kind:exactKill?check.kind:null,
        category:assertion?'ASSERTION':['TypeError','ReferenceError','SyntaxError'].includes(error?.name)?error.name:'OTHER'});
    }
  }
  assert.equal(transports.length,selected.length,'M5 MCP un server real cerrado por test');
  return {results,pass:results.filter(item=>item.pass).length,fail:results.filter(item=>!item.pass).length,
    transport:{servers:transports.length,requests:transports.reduce((sum,item)=>sum+item.requests,0),
      closed:transports.every(item=>item.closed),openSockets:transports.reduce((sum,item)=>sum+item.openSockets,0),
      externalAttempts:transports.reduce((sum,item)=>sum+item.externalAttempts,0)}};
}
export async function main(argv=process.argv.slice(2)) {
  assert.deepEqual(argv,['--mode=all'],'M5 MCP mutantes modo cerrado');
  assert.equal(process.execPath,NODE,'M5 MCP Node instalado');assert.equal(process.cwd(),SOURCE,'M5 MCP cwd autorizado');
  for(const root of [SOURCE,TMP,EVIDENCE]) {
    assert.equal(await realpath(root),root,'M5 MCP root canónico');assert.ok((await lstat(root)).isDirectory(),'M5 MCP root real');
  }
  const sourceBefore=await snapshot(SOURCE,sourcePaths),originals=new Map();
  for(const path of privatePaths) originals.set(path,await readFile(join(SOURCE,path)));
  const root=await mkdtemp(join(TMP,'m5-mcp-')),evidence=await mkdtemp(join(EVIDENCE,'m5-mcp-mutants-'));
  const summary={scope:'real-MCP-guards-and-tests-local-HTTP',browserMeasured:false,root,evidence,sourceBefore,
    variants:[],controls:[],completed:false,rootRemoved:false};
  let before,failure;
  try {
    await mkdir(join(root,'scripts'));await mkdir(join(root,'lib'));
    for(const [path,bytes] of originals) await writeFile(join(root,path),bytes,{flag:'wx'});
    before=await snapshot(root,privatePaths);summary.privateBefore=before;
    async function control(id) {
      const run=await runTests(root);summary.controls.push({id,...run});await save(join(evidence,id+'.json'),run);
      assert.ok(run.pass===30 && run.fail===0,'M5 MCP control treinta tests debe pasar');
    }
    await control('control-before');
    for(const spec of variants) {
      const record={id:spec.id,expected:spec.checks,occurrence:0,before:before.sha256};summary.variants.push(record);
      try {
        const mutated=replaceOne(originals.get(spec.path).toString(),spec.site,spec.replacement);record.occurrence=1;
        await writeFile(join(root,spec.path),mutated);record.mutated=(await snapshot(root,privatePaths)).sha256;
        record.run=await runTests(root,spec.checks);
        record.killed=record.run.pass===0 && record.run.fail===spec.checks.length
          && record.run.results.every(item=>item.exactKill);
      } finally {
        await writeFile(join(root,spec.path),originals.get(spec.path));
        record.restored=(await snapshot(root,privatePaths)).sha256;record.restoredExactly=record.restored===before.sha256;
        await save(join(evidence,spec.id+'.json'),record);
      }
      await control('control-restored-'+spec.id);
      assert.ok(record.killed && record.restoredExactly,'M5 MCP muerte nombrada y restauración obligatorias');
    }
    summary.completed=true;
  } catch(error) {failure=error;summary.failure={category:error instanceof assert.AssertionError?'ASSERTION':'INFRASTRUCTURE'};}
  finally {
    if(before) {
      for(const [path,bytes] of originals) await writeFile(join(root,path),bytes);
      summary.privateAfter=await snapshot(root,privatePaths);summary.restoredExactly=summary.privateAfter.sha256===before.sha256;
    }
    summary.sourceAfter=await snapshot(SOURCE,sourcePaths);summary.sourceUnchanged=summary.sourceAfter.sha256===sourceBefore.sha256;
    assert.equal(dirname(root),TMP,'M5 MCP cleanup root mkdtemp propio');
    if(!before || summary.restoredExactly) {await rm(root,{recursive:true});summary.rootRemoved=true;}
    summary.completed=summary.completed && !failure && summary.rootRemoved && summary.sourceUnchanged;
    await save(join(evidence,'summary.json'),summary);
  }
  assert.ok(summary.completed,'M5 MCP matriz incompleta; no contar bootstrap como muerte');
  console.log(JSON.stringify({receipt:join(evidence,'summary.json'),killed:summary.variants.filter(item=>item.killed).length,
    rootRemoved:summary.rootRemoved,sourceUnchanged:summary.sourceUnchanged,browserMeasured:false}));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(()=>{console.error('M5 MCP mutantes: ejecución incompleta (detalle omitido)');process.exitCode=1;});
}
