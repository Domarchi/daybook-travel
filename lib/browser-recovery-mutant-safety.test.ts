import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

const runner = await readFile(new URL('../scripts/browser-recovery-i1-mutants.mjs', import.meta.url), 'utf8');

// Extraer implementación existente. No importar main ni ejecutar procesos,
// señales, timers largos o lecturas /proc reales desde estas pruebas.
function actualFunction(name: string) {
  const source = runner.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'))?.[0];
  assert.ok(source, `I1 safety extracción: función real ${name}`);
  return source;
}

test('I1 cleanup no señala leaders cerrados/registry numérica', async () => {
  const registry = [71001, 71002];
  const signals: { target: number; signal: string | number; via: string; closed: boolean }[] = [];
  const liveNumbers = new Set([...registry, 71003]);
  let closed = false;
  let registryReadAfterClose = false;
  let launches = 0;
  const timers = new Map<number, () => void>();
  let nextTimer = 0;

  class ChildHandle extends EventEmitter {
    pid = 71003;
    exitCode: number | null = null;
    signalCode: string | null = null;
    kill(signal: string | number) {
      signals.push({ target: this.pid, signal, via: 'child-handle', closed });
      return true;
    }
  }
  const child = new ChildHandle();
  const pause = runner.match(/^const pause=.*;$/m)?.[0];
  assert.ok(pause, 'I1 safety extracción: pausa real disponible');
  const childRun = runInNewContext([
    pause, ...['parseProcStat','readProcStat','groupAlive','observeOwnedGroups','waitForOwnedExit','stopHandle','childRun'].map(actualFunction), 'childRun',
  ].join('\n'), {
    assert, join, dirname,
    NODE: '/synthetic/node', entryPath: 'scripts/i1-private-entry.mjs',
    setTimeout(callback: () => void) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    spawn() {
      launches++;
      // Entregar exit/close después de que childRun registre sus listeners.
      // Los números de la registry siguen existiendo pero ya no son autoridad
      // de ownership: podrían pertenecer a procesos distintos tras reutilización.
      queueMicrotask(() => {
        child.exitCode = 0;
        child.emit('exit', 0, null);
        closed = true;
        child.emit('close', 0, null);
      });
      return child;
    },
    process: {
      pid: 71000,
      kill(target: number, signal: string | number) {
        if (!liveNumbers.has(Math.abs(target))) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
        if (signal !== 0) {
          signals.push({ target, signal, via: 'numeric-os', closed });
          // Sólo modelo OS: terminar la llamada real de cleanup sin sleeps.
          // Nunca se envía una señal al sistema del host.
          liveNumbers.delete(Math.abs(target));
        }
        return true;
      },
    },
    async readFile(path: string) {
      if (path === '/synthetic/registry.json') {
        registryReadAfterClose = closed;
        return JSON.stringify(registry);
      }
      assert.equal(path, '/synthetic/result.json', 'I1 safety: sólo IO simulado declarado');
      return JSON.stringify({ completed: true });
    },
  });

  let failure: unknown;
  try {
    await childRun('/synthetic/source', '/synthetic/tmp', '/synthetic/result.json',
      '/synthetic/registry.json', new AbortController().signal);
  } catch (error) { failure = error; }

  assert.equal(launches, 1, 'I1 safety: childRun real ejecutó spawn simulado');
  assert.equal(closed, true, 'I1 safety: handle ya CLOSED antes del cleanup');
  assert.equal(registryReadAfterClose, true, 'I1 safety: registry numérica observada después de close');
  assert.deepEqual(signals, [], 'I1 cleanup no señala leaders cerrados/registry numérica');
  // Se permite fallar cerrado por ownership incierto. Un error de extracción,
  // ReferenceError o cualquier fallo ajeno al contrato NO convierte esto en GREEN.
  if (failure) {
    assert.ok(failure instanceof assert.AssertionError, 'I1 safety: rechazo explícito de ownership');
    assert.match(failure.message, /I1 cleanup (?:ownership|registry)/);
  }
  assert.equal(timers.size, 0, 'I1 safety: watchdogs cancelados al cerrar');
});

test('I1 cleanup zombie no se clasifica vivo por kill(0)', async () => {
  const pid = 72001;
  // /proc/<pid>/stat: 52 campos; comm puede incluir espacios y paréntesis.
  // Campos 4..52: ppid, pgrp, session, ..., num_threads (20), starttime (22).
  const fields = Array<string>(49).fill('0');
  fields[0] = '1'; fields[1] = String(pid); fields[2] = String(pid);
  fields[16] = '1'; fields[18] = '987654';
  const rawStat = `${pid} (chrome worker (owned)) Z ${fields.join(' ')}\n`;
  const groupAlive = runInNewContext(['parseProcStat','readProcStat','groupAlive'].map(actualFunction).join('\n')+'\ngroupAlive', {
    assert,
    async readdir(path: string) {
      assert.equal(path, '/proc', 'I1 safety: enumeración proc simulada');
      return [String(pid)];
    },
    process: {
      kill(target: number, signal: number) {
        assert.equal(target, -pid, 'I1 safety: probe OS simulado del grupo indicado');
        assert.equal(signal, 0, 'I1 safety: observación nunca envía señal destructiva');
        // Linux puede aceptar kill(0) aunque sólo quede un zombie.
        return true;
      },
    },
    async readFile(path: string) {
      assert.equal(path, `/proc/${pid}/stat`, 'I1 safety: stat crudo sólo del PID fixture');
      return rawStat;
    },
  });
  assert.equal(await groupAlive(pid), false,
    'I1 cleanup zombie no se clasifica vivo por kill(0); exigir estado estructural /proc/stat');
});

test('I1 copia privada conserva configuración Next de fixture', async () => {
  const declarations=['directories','rootFiles','hash'].map(name=>{
    const found=runner.match(new RegExp(`^const ${name}=[^]*?;`,'m'))?.[0];
    assert.ok(found,`I1 copia: declaración real ${name}`);
    return found;
  }).join('\n');
  const scope=runInNewContext(declarations+'\n({directories,rootFiles})',{createHash});
  const root='/synthetic/i1-source',config='next.config.mjs';
  const files=new Map<string,Buffer>();
  // Los directorios se modelan vacíos; todos los archivos raíz tienen sus bytes
  // actuales. La config existe en el FS doble aunque rootFiles aún la omita.
  for(const name of new Set<string>([...scope.rootFiles,config])) {
    assert.ok(!name.includes('/') && !name.startsWith('.env'),'I1 copia: sólo archivos raíz de fuente');
    files.set(join(root,name),await readFile(new URL('../'+name,import.meta.url)));
  }
  const directories=new Set<string>(scope.directories.map((name:string)=>join(root,name)));
  const reads:string[]=[];
  const manifest=runInNewContext(declarations+'\n'+actualFunction('manifest')+'\nmanifest',{
    assert,createHash,join,
    async lstat(path:string) {
      assert.ok(files.has(path) || directories.has(path),'I1 copia: stat sólo del FS declarado');
      return {isSymbolicLink:()=>false,isDirectory:()=>directories.has(path),isFile:()=>files.has(path)};
    },
    async readdir(path:string) {
      assert.ok(directories.has(path),'I1 copia: readdir sólo de directorios declarados');
      return [];
    },
    async readFile(path:string) {
      assert.ok(files.has(path),'I1 copia: lectura sólo de bytes declarados');
      reads.push(path);return files.get(path);
    },
  });
  // oneCase copia snapshot.files: ejecutar su productor REAL, sin main/child/IO real de escritura.
  const snapshot=await manifest(root);
  assert.ok(snapshot.files.some((file:{path:string})=>file.path==='package.json'),
    'I1 copia: manifest real recorrió archivos raíz');
  const matches=snapshot.files.filter((file:{path:string})=>file.path===config);
  assert.equal(matches.length,1,'I1 copia privada conserva configuración Next de fixture');
  const expectedHash=createHash('sha256').update(files.get(join(root,config))!).digest('hex');
  assert.equal(matches[0].sha256,expectedHash,'I1 copia: configuración Next conserva hash byte exacto');
  assert.equal(reads.filter(path=>path===join(root,config)).length,1,
    'I1 copia: configuración Next leída exactamente una vez por manifest real');
});
