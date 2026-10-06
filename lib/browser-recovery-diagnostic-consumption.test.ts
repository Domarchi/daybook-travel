import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source=await readFile(new URL('../scripts/browser-recovery.mjs',import.meta.url),'utf8');
function actual(name: string) {
  const found=source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`,'m'))?.[0];
  assert.ok(found,`M5 función real disponible: ${name}`);return found;
}
const auth=source.match(/^const AUTH = [^\n]+;/m)?.[0];
const viewport=actual('runViewport');
const subscription=viewport.match(/^  cdp\.onEvent\(\(\{method,params\}\) => \{[^]*?^  \}\);/m)?.[0];
assert.ok(auth && subscription,'M5 declaración y callback REAL disponibles');
type FixtureCase=[string,string,string,number|string];
type Entry={source:string;level:string;networkRequestId:string;url:string;text:string};
type Event={method:string;params:any};
const functions=['fixtureDiagnosticCases','expectedFixtureDiagnostic','isExpectedFixtureLog','createHmrLifecycleCollector','installBoundary'];
const catalog=runInNewContext(actual('fixtureDiagnosticCases')+'\nfixtureDiagnosticCases()') as FixtureCase[];

async function collector() {
  const listeners: ((event:Event)=>void)[]=[],errors:string[]=[],boundaryErrors:string[]=[];
  const categories=new Map<string,number>(),fixtureDiagnostics=new WeakMap();
  const appUrl='http://127.0.0.1:32100/';
  let finish: ((method:string,params:any)=>void)|undefined,sequence=0;
  const cdp={
    onEvent(listener:(event:Event)=>void) {listeners.push(listener);},
    async send(method:string,params:any) {
      if(method==='Fetch.fulfillRequest' || method==='Fetch.failRequest') finish?.(method,params);
      return {};
    },
  };
  // Únicos dobles: transporte CDP, espera y destinos de evidencia. No guard copiado.
  const context:any={assert,URL,Buffer,cdp,appUrl,fixtureDiagnostics,errors,boundaryErrors,
    counts:{login:0,user:0,recover:0,update:0,logout:0,external:0,externalMutations:0,database:0},
    scenario:'known',fixtureUser:{id:'unit-user',email:'unit@example.invalid'},fixtureAccess:'unit-session',
    expectedEmail:'unit@example.invalid',expectedOrigin:new URL(appUrl).origin,expectedPassword:'unit-password',
    delayedValidation:Promise.resolve(),delay:async()=>{},runtimeCanary:null,
    diagnosticPhase:'before-t2',fixtureLogRequests:new Set(),fixtureLogCoverage:new Map(),
    countDiagnostic:(name:string)=>categories.set(name,(categories.get(name) ?? 0)+1),
    observeDiagnostic:()=>{},
  };
  const api=runInNewContext([auth,...functions.map(actual),
    'const hmrLifecycle=createHmrLifecycleCollector(appUrl);',subscription,
    '({installBoundary,isExpectedFixtureLog,setScenario:value=>{scenario=value;}})',
  ].join('\n'),context);
  await api.installBoundary(cdp,appUrl);
  assert.equal(listeners.length,2,'M5 collector y boundary reales registrados');
  async function request(spec:FixtureCase) {
    const [kind,method,path,outcome]=spec;
    api.setScenario(kind);
    const url=new URL(path,'http://127.0.0.1:54321');
    if(path.endsWith('/recover')) url.searchParams.set('redirect_to',context.expectedOrigin+'/actualizar-clave');
    if(path.endsWith('/token')) url.searchParams.set('grant_type','password');
    if(path.endsWith('/logout')) url.searchParams.set('scope','global');
    const id='unit-network-'+(++sequence);
    let replyMethod='',replyOutcome:unknown;
    const replied=new Promise<void>(resolve=>{finish=(method,params)=>{
      replyMethod=method;replyOutcome=params.responseCode ?? params.errorReason;resolve();
    };});
    const event={method:'Fetch.requestPaused',params:{networkId:id,requestId:'unit-fetch-'+sequence,
      request:{url:url.href,method,headers:{authorization:'Bearer '+context.fixtureAccess},
        postData:JSON.stringify({email:context.expectedEmail,password:context.expectedPassword})}}};
    for(const listener of listeners) listener(event);
    await replied;finish=undefined;
    assert.equal(boundaryErrors.length,0,'M5 boundary real satisface contrato fixture');
    assert.equal(replyMethod=== (typeof outcome==='number'?'Fetch.fulfillRequest':'Fetch.failRequest'),true,
      'M5 respuesta fixture de clase esperada');
    assert.equal(replyOutcome===outcome,true,'M5 outcome exacto emitido por boundary real');
    assert.equal(fixtureDiagnostics.get(cdp)?.has(id),true,'M5 correlación creada por boundary real');
    const entry:Entry={source:'network',level:'error',networkRequestId:id,url:url.href,
      text:typeof outcome==='number'?'Failed to load resource: the server responded with a status of '+outcome
        :'Failed to load resource: net::ERR_CONNECTION_FAILED'};
    return entry;
  }
  function deliver(entry:Entry) {for(const listener of listeners) listener({method:'Log.entryAdded',params:{entry}});}
  return {request,deliver,errors,categories,api,diagnostics:()=>fixtureDiagnostics.get(cdp)};
}

for(const spec of catalog) {
  test(`M5 diagnóstico ${spec[0]}: primer Log correlacionado, IDs distintos y entrega diferida`,async()=>{
    // Rondas independientes, como collectors por viewport; no reutilizar IDs consumidos.
    for(let round=0;round<2;round++) {
      const model=await collector();
      const first=await model.request(spec);model.deliver(first);
      assert.equal(model.errors.length,0,'M5 primer Log legítimo aceptado');
      const second=await model.request(spec);
      assert.equal(second.networkRequestId!==first.networkRequestId,true,'M5 segunda petición tiene identidad distinta');
      model.api.setScenario('known');model.deliver(second);
      assert.equal(model.errors.length,0,'M5 nueva petición legítima diferida conserva aceptación');
      assert.equal(model.categories.get(`expected.fixture-transport.${spec[0]}.same-context`),1,'M5 categoría inicial exacta');
      assert.equal(model.categories.get(`expected.fixture-transport.${spec[0]}.deferred-context`),1,'M5 contexto registrado prevalece sobre fase posterior');
    }
  });
  test(`M5 diagnóstico ${spec[0]}: duplicado idéntico debe ser unexpected browser log error`,async()=>{
    const model=await collector(),entry=await model.request(spec);
    model.deliver(entry);assert.equal(model.errors.length,0,'M5 primera entrega válida');
    model.deliver(entry);
    assert.deepEqual(model.errors,['unexpected browser log error'],
      'M5 consumo único: duplicado idéntico debe producir unexpected browser log error');
  });
}

for(const crossed of ['foreign-id','outcome','path','context','case'] as const) {
  test(`M5 diagnóstico cruzado ${crossed}: rechaza sin consumir la entrada legítima`,async()=>{
    const spec=catalog.find(item=>item[0]==='login-error');
    assert.ok(spec,'M5 caso real del catálogo disponible');
    const model=await collector(),entry=await model.request(spec);
    const diagnostic=model.diagnostics().get(entry.networkRequestId),invalid={...entry};
    let foreignEntry:Entry|undefined;
    if(crossed==='foreign-id') {
      const foreignCase=catalog.find(item=>item[0]==='quota');
      assert.ok(foreignCase,'M5 segundo caso real del catálogo');
      foreignEntry=await model.request(foreignCase);
      invalid.networkRequestId=foreignEntry.networkRequestId;
      model.api.setScenario('login-error');
    }
    if(crossed==='outcome') invalid.text='Failed to load resource: the server responded with a status of 503';
    if(crossed==='path') invalid.url='http://127.0.0.1:54321/auth/v1/logout?scope=global';
    if(crossed==='case') invalid.url='http://127.0.0.1:54321/auth/v1/token?grant_type=pkce';
    if(crossed==='context') model.diagnostics().set(entry.networkRequestId,{...diagnostic,context:'quota'});
    model.deliver(invalid);
    assert.deepEqual(model.errors,['unexpected browser log error'],'M5 cruce rechazado por callback real');
    assert.equal(model.diagnostics().has(entry.networkRequestId),true,'M5 cruce no consume correlación pendiente legítima');
    if(crossed==='context') model.diagnostics().set(entry.networkRequestId,diagnostic);
    model.deliver(entry);
    assert.equal(model.errors.length,1,'M5 rechazo cruzado no consume el Log legítimo');
    assert.equal(model.categories.get('expected.fixture-transport.login-error.same-context'),1,'M5 legítimo sigue aceptado exactamente una vez');
    if(foreignEntry) {
      assert.equal(model.diagnostics().has(foreignEntry.networkRequestId),true,'M5 cruce tampoco consume la otra petición real');
      model.deliver(foreignEntry);
      assert.equal(model.errors.length,1,'M5 otro fixture conserva su Log legítimo');
      assert.equal(model.categories.get('expected.fixture-transport.quota.deferred-context'),1,'M5 segunda correlación exacta aceptada');
    }
  });
}
