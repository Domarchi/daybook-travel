import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, open, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../scripts/browser-login.mjs', import.meta.url), 'utf8');
const resolverSource = source.match(/^async function chromePath\([^]*?^}/m)?.[0];
assert.ok(resolverSource, 'T3 extraer chromePath real existente');
// FS real; TMPDIR lo suministra el supervisor/host, sin ejecutar wrappers.
const ownedTmp = tmpdir();
const realChrome = '/opt/google/chrome/chrome';

function resolver(explicitPath: string) {
  const accessed: string[] = [];
  const spawned: unknown[][] = [];
  const noSpawn = (...args: unknown[]) => {
    spawned.push(args);
    assert.fail('T3 chromePath no debe ejecutar procesos para resolver un binario');
  };
  const resolve = runInNewContext(`${resolverSource}\nchromePath`, {
    process: { env: { CHROME_PATH: explicitPath }, platform: process.platform },
    access: async (path: string, mode?: number) => { accessed.push(path); await access(path, mode); },
    realpath, stat, open, constants, Buffer,
    spawn: noSpawn, spawnOwned: noSpawn,
  }) as () => Promise<string>;
  return { resolve, accessed, spawned };
}

test('T3 CHROME_PATH wrapper desconocido debe rechazarse antes de spawn y sin fallback', async () => {
  const root = await mkdtemp(join(ownedTmp, 'm2-wrapper-unit-'));
  const wrapper = join(root, 'chrome-wrapper');
  const model = resolver(wrapper);
  try {
    // Flag inocuo del repro, escrito solamente: nunca se ejecuta este archivo.
    await writeFile(wrapper, '#!/bin/sh\nexec /opt/google/chrome/chrome --disable-infobars "$@"\n',
      { flag: 'wx', mode: 0o700 });
    await access(wrapper);
    await assert.rejects(model.resolve, {
      message: /^T3 CHROME_PATH wrapper no autorizado$/,
    }, 'T3 CHROME_PATH wrapper desconocido: rechazo obligatorio, no ruta ni fallback');
    assert.ok(model.accessed.every(path => path === wrapper),
      'T3 CHROME_PATH explícito rechazado no explora candidatos alternativos');
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.deepEqual(model.spawned, [], 'T3 wrapper rechazado antes de cualquier spawn');
  }
});

test('T3 CHROME_PATH conserva aceptación del Chrome ELF64 real sin ejecutarlo', async (t) => {
  if (process.platform !== 'linux') {
    t.skip('Integración Linux LOCAL: no prueba aceptación de binarios en este host');
    return;
  }
  const file = await open(realChrome, 'r').catch((error: NodeJS.ErrnoException) => {
    if (hostname() !== 'domarchithinkpad' && ['ENOENT', 'ENOTDIR'].includes(error.code ?? '')) return null;
    throw error; // ThinkPad: falta del binario o fallo de acceso nunca es skip.
  });
  if (file === null) {
    t.skip('Integración Linux LOCAL: Chrome ELF real no instalado; aceptación no probada en este host');
    return;
  }
  try {
    const header = Buffer.alloc(5);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    assert.equal(bytesRead, 5, 'T3 binario real tiene cabecera completa');
    assert.equal(header.toString('hex'), '7f454c4602', 'T3 fixture local es ELF64 real');
  } finally { await file.close(); }
  const model = resolver(realChrome);
  assert.equal(await realpath(await model.resolve()), await realpath(realChrome),
    'T3 resolver acepta el ejecutable real instalado');
  assert.deepEqual(model.spawned, [], 'T3 aceptación del ELF no ejecuta Chrome');
});
