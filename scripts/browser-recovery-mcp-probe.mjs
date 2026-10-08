// REPRO LOCAL supervisado; importar no abre sockets ni ejecuta el harness.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { lstat, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { assertCompilationIssues } from '../lib/mcp-compilation.ts';

const SOURCE='/home/domarchithinkpad/Developer/password-recovery-review-close-20261006/travel';
const EVIDENCE='/home/domarchithinkpad/.hermes/cache/scratch/password-recovery-review-close-20261006/travel';
const NODE='/home/domarchithinkpad/.local/share/mise/installs/node/24.21.0/bin/node';
const hash=value=>createHash('sha256').update(value).digest('hex');

export function actualCheckMcp(source, localFetch, validator=assertCompilationIssues) {
  const fn=source.match(/^async function checkMcp\([^]*?^}/m)?.[0];
  assert.ok(fn,'M5 MCP extracción de checkMcp real');
  return runInNewContext(fn+'\ncheckMcp',{
    assert,fetch:localFetch,URL,AbortSignal,assertCompilationIssues:validator,console:{log(){}},
  },{timeout:1000});
}

// Sólo transporte HTTP/JSON-RPC de fixture. Ninguna decisión del guard aquí.
export async function withLocalMcp(reply, run) {
  const observations={requests:0,list:0,call:0,externalAttempts:0,closed:false,openSockets:0};
  const sockets=new Set();
  let fixtureError=false;
  const server=createServer(async (request,response)=>{
    try {
      assert.equal(request.method,'POST','M5 fixture método cerrado');
      assert.equal(request.url,'/_next/mcp','M5 fixture ruta cerrada');
      let body='';
      for await (const chunk of request) {
        body+=chunk;
        assert.ok(body.length<=4096,'M5 fixture request acotado');
      }
      const rpc=JSON.parse(body);
      assert.equal(rpc.jsonrpc,'2.0','M5 fixture JSON-RPC');
      assert.ok(rpc.method==='tools/list' || rpc.method==='tools/call','M5 fixture método MCP');
      if(rpc.method==='tools/call') {
        assert.equal(rpc.params?.name,'get_compilation_issues','M5 fixture tool exacta');
        assert.equal(JSON.stringify(rpc.params.arguments),'{}','M5 fixture sin argumentos');
      }
      observations.requests++;
      observations[rpc.method==='tools/list'?'list':'call']++;
      const result=reply(rpc,observations);
      response.writeHead(result.status ?? 200,{'Content-Type':result.sse?'text/event-stream':'application/json',Connection:'close'});
      const data=result.raw ?? JSON.stringify(result.envelope ?? {jsonrpc:'2.0',id:rpc.id,result:result.result});
      response.end(result.sse?'event: message\ndata: '+data+'\n\n':data);
    } catch {
      fixtureError=true;
      response.writeHead(500,{Connection:'close'});response.end('{}');
    }
  });
  server.on('connection',socket=>{
    sockets.add(socket);socket.setTimeout(2000,()=>socket.destroy());
    socket.on('close',()=>sockets.delete(socket));
  });
  server.requestTimeout=2000;server.headersTimeout=2000;
  await new Promise((resolve,reject)=>{
    server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  assert.ok(address && typeof address==='object','M5 fixture dirección local');
  const url=`http://127.0.0.1:${address.port}`;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),4000);
  const localFetch=(input,options)=>{
    const target=new URL(input);
    if(target.origin!==url || target.pathname!=='/_next/mcp') {
      observations.externalAttempts++;
      throw new assert.AssertionError({message:'M5 fixture bloquea destino no local'});
    }
    return fetch(target,{...options,redirect:'error',signal:AbortSignal.any([controller.signal,options.signal])});
  };
  try {await run({url,localFetch,observations});}
  finally {
    clearTimeout(timer);controller.abort();
    await new Promise((resolve,reject)=>{
      server.close(error=>error?reject(error):resolve());
      // Sólo conexiones retenidas del server creado aquí; no PID ni sockets ajenos.
      for(const socket of sockets) socket.destroy();
    });
    observations.closed=!server.listening;
    observations.openSockets=[...sockets].filter(socket=>!socket.destroyed).length;
    assert.equal(fixtureError,false,'M5 fixture sin fallos de protocolo internos');
    assert.equal(observations.openSockets,0,'M5 fixture cleanup de sockets propios');
  }
  return observations;
}

export async function main(argv=process.argv.slice(2)) {
  assert.deepEqual(argv,['--mode=missing-tool'],'M5 MCP modo cerrado');
  assert.equal(process.execPath,NODE,'M5 MCP Node instalado');
  assert.equal(process.cwd(),SOURCE,'M5 MCP checkout autorizado');
  for(const root of [SOURCE,EVIDENCE]) {
    assert.equal(await realpath(root),root,'M5 MCP root canónico');
    assert.ok((await lstat(root)).isDirectory(),'M5 MCP root directorio');
  }
  const paths=['scripts/browser-recovery.mjs','lib/mcp-compilation.ts','scripts/browser-recovery-mcp-probe.mjs'];
  async function snapshot() {
    const files=[];
    for(const path of paths) {
      assert.ok(!(await lstat(join(SOURCE,path))).isSymbolicLink(),'M5 MCP fuente sin symlink');
      files.push({path,sha256:hash(await readFile(join(SOURCE,path)))});
    }
    return files;
  }
  const before=await snapshot(),source=await readFile(join(SOURCE,paths[0]),'utf8');
  const evidence=await mkdtemp(join(EVIDENCE,'m5-mcp-missing-'));
  const receipt={diagnosticOnly:true,certifiesFix:false,scope:'real-checkMcp-local-HTTP-fixture',
    before,outcome:'not-observed',transport:null,assertion:false};
  let failure;
  try {
    receipt.transport=await withLocalMcp(()=>({result:{tools:[]}}),async ({url,localFetch})=>{
      try {await actualCheckMcp(source,localFetch)(url);receipt.outcome='missing-tool-silent-success';}
      catch(error) {
        receipt.assertion=error instanceof assert.AssertionError
          && error.message.split('\n')[0]==='MCP requiere una única tool get_compilation_issues';
        receipt.outcome=receipt.assertion?'missing-tool-assertion-rejected':'infrastructure-error';
        if(!receipt.assertion) throw error;
      }
    });
    assert.equal(receipt.transport.list,1,'M5 MCP catálogo realmente servido');
    assert.equal(receipt.transport.call,0,'M5 MCP sin tool invocada');
    assert.equal(receipt.transport.externalAttempts,0,'M5 MCP cero intentos externos');
  } catch(error) {failure=error;receipt.outcome='infrastructure-error';}
  finally {
    receipt.after=await snapshot();receipt.sourceUnchanged=JSON.stringify(before)===JSON.stringify(receipt.after);
    await writeFile(join(evidence,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  }
  assert.ok(!failure && receipt.sourceUnchanged,'M5 MCP REPRO incompleto; inspeccionar receipt');
  console.log(JSON.stringify({receipt:join(evidence,'receipt.json'),outcome:receipt.outcome,diagnosticOnly:true}));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(()=>{console.error('M5 MCP REPRO: infraestructura incompleta (detalle omitido)');process.exitCode=1;});
}
