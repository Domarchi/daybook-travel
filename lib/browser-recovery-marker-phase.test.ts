import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const recovery=await readFile(new URL('../scripts/browser-recovery.mjs',import.meta.url),'utf8');
const runner=await readFile(new URL('../scripts/browser-recovery-i1-mutants.mjs',import.meta.url),'utf8');
function actual(source:string,name:string) {
  const found=source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`,'m'))?.[0];
  assert.ok(found,`I1 fase extracción real: ${name}`);return found;
}
function instrument() {
  const start=runner.indexOf('const families='),end=runner.indexOf('\nfunction options(');
  assert.ok(start>=0 && end>start,'I1 fase declaraciones reales del instrumento');
  const mutate=runInNewContext(runner.slice(start,end)+'\n'+actual(runner,'replaceOne')+'\n'+actual(runner,'mutate')+'\nmutate',
    {assert,createHash});
  const sites:any[]=[];
  const mutated=mutate(recovery,'ordinary-exception',sites);
  assert.equal(sites.length,1,'I1 fase un sitio real de mutación');
  assert.equal(sites[0].occurrences,1,'I1 fase sitio único del instrumento');
  const viewport=actual(mutated,'runViewport');
  const setupStart=viewport.indexOf('  const errors = [];');
  const setupEnd=viewport.indexOf('\n  try {',setupStart);
  const emulation=viewport.indexOf("    await cdp.send('Emulation.setDeviceMetricsOverride'",setupEnd);
  assert.ok(setupStart>=0 && setupEnd>setupStart && emulation>setupEnd,'I1 fase prelude real antes de emulación');
  const injection=viewport.match(/^    await cdp\.send\('Runtime.evaluate',\{expression:.*\n    const markerDeadline=.*\n    while .*;\n/m)?.[0];
  assert.ok(injection,'I1 fase expresión y espera reales del marcador disponibles');
  const finalGuard=viewport.match(/^    assert\.deepEqual\(errors,\[\],'collector sin errores inesperados'\);$/m)?.[0];
  assert.ok(finalGuard,'I1 fase guard final real disponible');
  return {setup:viewport.slice(setupStart,setupEnd),
    prelude:viewport.slice(setupEnd+'\n  try {'.length,emulation),injection,finalGuard};
}

function fixture() {
  const source=instrument(),listeners:((event:any)=>void)[]=[],calls:string[]=[];
  const ordinary:{canaryClosed:boolean;normalContext:boolean;blank:boolean}[]=[];
  const reports:string[]=[];
  let api:any;
  const dispatch=(method:string,params:any)=>{for(const listener of listeners) listener({method,params});};
  const cdp={
    onEvent(listener:(event:any)=>void) {listeners.push(listener);},
    async send(method:string,params:any={}) {
      calls.push(method);
      if(['Page.enable','Runtime.enable','Log.enable','Network.enable'].includes(method)) return {};
      if(method==='Page.getFrameTree') return {frameTree:{frame:{id:'unit-frame',url:'about:blank'}}};
      if(method==='Page.createIsolatedWorld') return {executionContextId:42};
      assert.equal(method,'Runtime.evaluate','I1 fase transporte sólo pre-navigation, sin Next/navegación');
      const contextId=params.contextId ?? 7;
      const filename=/\/\/# sourceURL=([^\n]+)$/.exec(params.expression)?.[1] ?? 'about:blank';
      const scheduled:Function[]=[];
      // Doble de transporte: ejecutar la expresión REAL, luego entregar el error
      // realmente lanzado por su timer. Ningún contador/flag del collector se asigna.
      runInNewContext(params.expression,{
        location:{href:'about:blank'},
        console:{error:(value:unknown)=>dispatch('Runtime.consoleAPICalled',{
          type:'error',executionContextId:contextId,args:[{type:typeof value,value}],
        })},
        setTimeout:(callback:Function)=>{scheduled.push(callback);return scheduled.length;},
        fetch:()=>{reports.push('http-attempt');throw new Error('I1 fixture no HTTP');},
      },{filename,timeout:1000});
      for(const callback of scheduled) {
        try {callback();}
        catch(error:any) {
          if(error.message==='TRAVEL_I1_ORDINARY_EXCEPTION') ordinary.push({
            canaryClosed:api.snapshot().canaryOpen===false,normalContext:params.contextId===undefined,blank:filename==='about:blank',
          });
          dispatch('Runtime.exceptionThrown',{exceptionDetails:{executionContextId:contextId,text:'Uncaught',
            exception:{type:'object',subtype:'error',className:error.constructor.name,description:error.name+': '+error.message},
            stackTrace:{callFrames:[{url:filename,functionName:callback.name}]},
          }});
        }
      }
      return {};
    },
  };
  api=runInNewContext([
    actual(recovery,'createHmrLifecycleCollector'),actual(recovery,'fixtureDiagnosticCases'),source.setup,
    `({prelude:async()=>{${source.prelude}}, emitInstrument:async()=>{${source.injection}},
      finishUnexpected:()=>{${source.finalGuard}},
      snapshot:()=>({counts:{...diagnosticCounts},errors:[...errors],canaryOpen:runtimeCanary?.open})})`,
  ].join('\n'),{
    assert,URL,cdp,width:390,height:844,mobile:true,appUrl:'http://127.0.0.1:3100',
    randomUUID:()=> 'unit-canary-context',delay:async()=>{},console:{log(){}},
  });
  assert.equal(listeners.length,1,'I1 fase callback real registrado');
  return {api,ordinary,calls,reports};
}

test('I1 marcador ordinary-exception se emite una vez después de cerrar canary y antes de hidratar',async()=>{
  const {api,ordinary,calls,reports}=fixture();
  await api.prelude();
  const state=api.snapshot();
  assert.equal(state.counts['expected.canary.runtime-console'],1,'I1 fase control positivo console real en VM');
  assert.equal(state.counts['expected.canary.runtime-exception'],1,'I1 fase control positivo excepción real en VM');
  assert.equal(state.canaryOpen,false,'I1 fase prelude cerró el canary real');
  assert.equal(ordinary.length,1,
    'I1 marcador ordinary-exception falta en prelude después de canary cerrado y antes de hidratar');
  assert.equal(ordinary[0].canaryClosed && ordinary[0].normalContext && ordinary[0].blank,true,
    'I1 marcador ordinario sólo en about:blank normal tras cerrar canary');
  assert.equal(state.counts['unexpected.runtime-exception'],1,'I1 marcador ordinario captado por callback real');
  assert.equal(calls.filter(method=>method==='Runtime.evaluate').length,2,'I1 fase dos emisiones exactas: canary y ordinaria');
  assert.equal(reports.length,0,'I1 fase sin HTTP de reporting en documento vacío simulado');
  assert.throws(()=>api.finishUnexpected(),(error:any)=>error instanceof assert.AssertionError
    && error.message.split('\n')[0]==='collector sin errores inesperados','I1 fase guard final real rechaza ordinario');
});

test('I1 marcador ordinario real no obtiene exención canary y mata guard final errors',async()=>{
  const {api,ordinary,reports}=fixture();
  await api.prelude();
  // Control del clasificador: ejecutar la inyección REAL también en BASE, donde
  // está fuera del prelude. El test anterior exige su ubicación sin esta ayuda.
  if(ordinary.length===0) await api.emitInstrument();
  const state=api.snapshot();
  assert.equal(ordinary.length,1,'I1 control marcador ordinario emitido exactamente una vez');
  assert.equal(ordinary[0].canaryClosed && ordinary[0].normalContext && ordinary[0].blank,true,
    'I1 control excepción ordinaria de contexto normal sin canary abierto');
  assert.equal(state.counts['expected.canary.runtime-exception'],1,'I1 ordinario no aumenta conteo canary');
  assert.equal(state.counts['unexpected.runtime-exception'],1,'I1 ordinario aumenta unexpected por callback real');
  assert.equal(state.errors.length,1,'I1 ordinario conserva errors final');
  assert.equal(reports.length,0,'I1 control VM sin transporte HTTP');
  assert.throws(()=>api.finishUnexpected(),(error:any)=>error instanceof assert.AssertionError
    && error.message.split('\n')[0]==='collector sin errores inesperados','I1 guard final errors real rechaza marcador');
});
