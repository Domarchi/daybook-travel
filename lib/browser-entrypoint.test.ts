import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, copyFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('browser-login ejecuta main desde una ruta real con espacios', {timeout: 5000}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel path with spaces '));
  try {
    const script = join(dir, 'browser login.mjs');
    await copyFile(new URL('../scripts/browser-login.mjs', import.meta.url), script);
    // Interceptar sólo el primer socket prueba la entrada real sin iniciar servicios.
    const hook = join(dir, 'entry-hook.mjs');
    await writeFile(hook, `import {registerHooks} from 'node:module';
registerHooks({load(url,context,next) {
  if(url==='node:net') return {format:'module',shortCircuit:true,source:'export function createServer(){throw new Error("ENTRYPOINT_REACHED")}'};
  return next(url,context);
}});`);
    const result = spawnSync(process.execPath, ['--import', hook, script], {cwd:dir, encoding:'utf8', timeout:3000});
    assert.equal(result.error, undefined, 'subproceso termina dentro del límite');
    assert.match(result.stderr, /ENTRYPOINT_REACHED/, 'main debe ejecutarse: exit cero silencioso no es un gate');
    assert.equal(result.status, 1);
  } finally { await rm(dir, {recursive:true,force:true}); }
});
