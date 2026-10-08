import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { assertCompilationIssues } from './mcp-compilation.ts';
import { actualCheckMcp, withLocalMcp } from '../scripts/browser-recovery-mcp-probe.mjs';

const source=await readFile(new URL('../scripts/browser-recovery.mjs',import.meta.url),'utf8');
// Next instalado: server/mcp/tools/get-compilation-issues.js registra inputSchema:{}
// y devuelve content text JSON {issues:formattedIssues}. Catálogo MCP wire: object vacío.
const tool={name:'get_compilation_issues',inputSchema:{type:'object',properties:{}}};
const catalog={tools:[tool]};
const content=(value:unknown)=>({content:[{type:'text',text:JSON.stringify(value)}]});
const empty=content({issues:[]});
const issue={severity:'error',title:'local fixture compilation issue'};
type Reply={status?:number;result?:unknown;envelope?:unknown;raw?:string;sse?:boolean};
const named=(message:string)=>(error:unknown)=>error instanceof assert.AssertionError
  && error.message.split('\n')[0]===message;

for(const sse of [false,true]) test(`M5 MCP control Next16 issues vacío por ${sse?'SSE':'JSON'}`,async()=>{
  const observations=await withLocalMcp(rpc=>({sse,result:rpc.method==='tools/list'?catalog:empty}),async ({url,localFetch})=>{
    await actualCheckMcp(source,localFetch,assertCompilationIssues)(url);
  });
  assert.equal(observations.list,1,'M5 MCP catálogo observado');
  assert.equal(observations.call,1,'M5 MCP issues realmente solicitados');
  assert.equal(observations.externalAttempts,0,'M5 MCP sin egress');
  assert.equal(observations.closed && observations.openSockets===0,true,'M5 MCP cleanup local');
});

const cases:{id:string;stage:'list'|'call';reply:Reply;assertion:string}[]=[
  {id:'HTTP 404 no certifica',stage:'list',reply:{status:404,result:null},assertion:'MCP local debe responder correctamente'},
  {id:'HTTP unavailable no certifica',stage:'list',reply:{status:503,result:null},assertion:'MCP local debe responder correctamente'},
  {id:'catálogo ausente',stage:'list',reply:{result:{}},assertion:'MCP catálogo de tools inválido'},
  {id:'catálogo malformado',stage:'list',reply:{result:{tools:{}}},assertion:'MCP catálogo de tools inválido'},
  {id:'miembro null en catálogo',stage:'list',reply:{result:{tools:[null]}},assertion:'MCP catálogo de tools inválido'},
  {id:'nombre de tool malformado',stage:'list',reply:{result:{tools:[{name:7},tool]}},assertion:'MCP catálogo de tools inválido'},
  {id:'tool faltante',stage:'list',reply:{result:{tools:[]}},assertion:'MCP requiere una única tool get_compilation_issues'},
  {id:'tool ajena no sustituye issues',stage:'list',reply:{result:{tools:[{name:'get_errors',inputSchema:tool.inputSchema}]}},assertion:'MCP requiere una única tool get_compilation_issues'},
  {id:'tool duplicada',stage:'list',reply:{result:{tools:[tool,tool]}},assertion:'MCP requiere una única tool get_compilation_issues'},
  {id:'error de protocolo list',stage:'list',reply:{envelope:{jsonrpc:'2.0',id:1,error:{code:-32603,message:'local fixture'}}},assertion:'MCP devolvió error de protocolo'},
  {id:'result ausente',stage:'list',reply:{envelope:{jsonrpc:'2.0',id:1}},assertion:'MCP respuesta de protocolo inválida'},
  {id:'result null',stage:'list',reply:{result:null},assertion:'MCP respuesta de protocolo inválida'},
  {id:'result escalar',stage:'list',reply:{result:3},assertion:'MCP respuesta de protocolo inválida'},
  {id:'JSON inválido',stage:'list',reply:{raw:'{'},assertion:'MCP respuesta de protocolo inválida'},
  {id:'envelope null',stage:'list',reply:{raw:'null'},assertion:'MCP respuesta de protocolo inválida'},
  {id:'error de protocolo call',stage:'call',reply:{envelope:{jsonrpc:'2.0',id:1,error:{code:-32603,message:'local fixture'}}},assertion:'MCP devolvió error de protocolo'},
  {id:'call isError',stage:'call',reply:{result:{...empty,isError:true}},assertion:'MCP devolvió un error'},
  {id:'content ausente',stage:'call',reply:{result:{}},assertion:'MCP sin resultado de issues'},
  {id:'content malformado',stage:'call',reply:{result:{content:{}}},assertion:'MCP sin contenido'},
  {id:'content vacío',stage:'call',reply:{result:{content:[]}},assertion:'MCP sin JSON de issues'},
  {id:'content miembro null',stage:'call',reply:{result:{content:[null]}},assertion:'MCP sin JSON de issues'},
  {id:'content texto inválido',stage:'call',reply:{result:{content:[{type:'text',text:'{'}]}},assertion:'MCP sin JSON de issues'},
  {id:'issues ausentes',stage:'call',reply:{result:content({})},assertion:'MCP no obtuvo issues'},
  {id:'issues malformados',stage:'call',reply:{result:content({issues:{}})},assertion:'MCP no obtuvo issues'},
  {id:'issues no disponibles en bundler',stage:'call',reply:{result:content({error:'local fixture unavailable'})},assertion:'MCP no obtuvo issues'},
  {id:'issues reales no vacíos',stage:'call',reply:{result:content({issues:[issue]})},assertion:'MCP detectó issues de compilación'},
];
for(const spec of cases) test(`M5 MCP fail-closed: ${spec.id}`,async()=>{
  await withLocalMcp(rpc=>rpc.method===(spec.stage==='list'?'tools/list':'tools/call')
    ?spec.reply:{result:rpc.method==='tools/list'?catalog:empty},async ({url,localFetch,observations})=>{
    await assert.rejects(()=>actualCheckMcp(source,localFetch,assertCompilationIssues)(url),named(spec.assertion),
      `M5 MCP fail-closed: ${spec.id}`);
    assert.equal(observations.externalAttempts,0,'M5 MCP rechazo sin egress');
  });
});

test('M5 MCP issues tardíos después de observación vacía deben rechazar nueva consulta',async()=>{
  await withLocalMcp((rpc,seen)=>({result:rpc.method==='tools/list'?catalog:
    seen.call===1?empty:content({issues:[issue]})}),async ({url,localFetch,observations})=>{
    const check=actualCheckMcp(source,localFetch,assertCompilationIssues);
    await check(url);
    await assert.rejects(()=>check(url),named('MCP detectó issues de compilación'),
      'M5 MCP issues tardíos no reutilizan observación vacía');
    assert.equal(observations.list,2,'M5 MCP dos catálogos reales');
    assert.equal(observations.call,2,'M5 MCP dos consultas reales de issues');
  });
});

test('M5 MCP main consulta final después de ambos viewports y rechaza issues tardíos',async()=>{
  const fn=source.match(/^export async function main\([^]*?^}/m)?.[0];
  assert.ok(fn,'M5 MCP main REAL disponible');
  const order:string[]=[];let late=false,teardowns=0;
  await withLocalMcp(rpc=>{
    order.push(rpc.method==='tools/list'?'list':'call');
    return {result:rpc.method==='tools/list'?catalog:late?content({issues:[issue]}):empty};
  },async ({url,localFetch})=>{
    const checkMcp=actualCheckMcp(source,localFetch,assertCompilationIssues);
    // Observación anterior normal no sustituye checkMcp FINAL de main real.
    await checkMcp(url);order.length=0;
    const main=runInNewContext(fn.replace(/^export /,'')+'\nmain',{
      assert,checkMcp,setTimeout,clearTimeout,console:{log(){},error(){}},
      mkdir:async()=>{},EVIDENCE:'unit-double',
      startBrowser:async()=>({appUrl:url}),
      runViewport:async ({width,height})=>{order.push(`${width}x${height}`);late=true;},
      teardown:async()=>{teardowns++;},boundaryErrors:[],counts:{external:0,externalMutations:0,database:0},
    },{timeout:1000});
    await assert.rejects(()=>main(),named('MCP detectó issues de compilación'),
      'M5 MCP main no certifica issues tardíos');
  });
  assert.equal(order.join(','),'390x844,1440x900,list,call','M5 MCP final después de ambos viewports');
  assert.equal(teardowns,1,'M5 MCP teardown real finalmente invocado');
});
