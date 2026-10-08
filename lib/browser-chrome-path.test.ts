import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, copyFile, lstat, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../scripts/browser-login.mjs', import.meta.url), 'utf8');
const resolverSource = source.match(/^async function chromePath\([^]*?^}/m)?.[0];
assert.ok(resolverSource, 'T3 extraer chromePath real existente');
const ownedTmp = tmpdir();
const realChrome = '/opt/google/chrome/chrome';

function resolver(explicitPath: string, options: { root?: string; ci?: boolean } = {}, implementation = resolverSource) {
  const accessed: string[] = [];
  const spawned: unknown[][] = [];
  const noSpawn = (...args: unknown[]) => { spawned.push(args); assert.fail('T3 chromePath no debe ejecutar procesos'); };
  const resolve = runInNewContext(`${implementation}\nchromePath`, {
    process: { env: { CHROME_PATH: explicitPath, GITHUB_ACTIONS: options.ci ? 'true' : undefined }, platform: process.platform },
    ROOT: options.root ?? process.cwd(), join, createHash,
    access: async (path: string, mode?: number) => { accessed.push(path); await access(path, mode); },
    lstat, readFile, realpath, stat, constants, spawn: noSpawn, spawnOwned: noSpawn,
  }) as () => Promise<string>;
  return { resolve, accessed, spawned };
}

test('M2 allowlist-return: el mutante que la elimina acepta el ELF privado (RED)', async () => {
  const root = await mkdtemp(join(ownedTmp, 'd1-allowlist-mutant-'));
  const elf = join(root, 'not-chrome');
  const guard = 'if (!systemTrusted && !await matchesCiContract(executable)) {';
  const mutated = resolverSource.replace(guard, 'if (false) {');
  try {
    assert.notEqual(mutated, resolverSource, 'M2 sitio de allowlist presente una sola vez');
    await copyFile('/bin/true', elf, constants.COPYFILE_EXCL);
    assert.equal(await resolver(elf, {}, mutated).resolve(), await realpath(elf),
      'M2 sin allowlist el ELF arbitrario alcanzaría el retorno previo al spawn');
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const kind of ['ELF privado', 'symlink privado al ELF'] as const) {
  test(`T3 CHROME_PATH ${kind} se rechaza antes de spawn y sin fallback`, async () => {
    const root = await mkdtemp(join(ownedTmp, 'd1-private-elf-'));
    const elf = join(root, 'not-chrome');
    const candidate = kind === 'ELF privado' ? elf : join(root, 'not-chrome-link');
    const model = resolver(candidate);
    try {
      await copyFile('/bin/true', elf, constants.COPYFILE_EXCL);
      if (candidate !== elf) await symlink(elf, candidate);
      await assert.rejects(model.resolve, { message: /^T3 CHROME_PATH fuera de la lista permitida$/ },
        'T3 un ELF arbitrario no se convierte en Chrome por su cabecera');
      assert.deepEqual(model.accessed, [await realpath(candidate)],
        'T3 rechaza el candidato explícito sin descubrir otra ruta');
    } finally {
      await rm(root, { recursive: true, force: true });
      assert.deepEqual(model.spawned, [], 'T3 el rechazo ocurre antes de cualquier spawn');
    }
  });
}

test('T3 contrato CI fijo acepta sólo el binario y digest establecidos por workflow', async () => {
  const root = await mkdtemp(join(ownedTmp, 'd1-ci-contract-'));
  const elf = join(root, 'setup-chrome');
  const contract = join(root, '.travel-ci-chrome.json');
  try {
    await copyFile('/bin/true', elf, constants.COPYFILE_EXCL);
    const hash = createHash('sha256').update(await readFile(elf)).digest('hex');
    await writeFile(contract, JSON.stringify({ version: 1, platform: process.platform, path: await realpath(elf), sha256: hash }), { mode: 0o400 });
    assert.equal(await resolver(elf, { root, ci: true }).resolve(), await realpath(elf));
    await assert.rejects(resolver('/bin/true', { root, ci: true }).resolve,
      { message: /^T3 CHROME_PATH fuera de la lista permitida$/ },
      'T3 el contrato no autoriza otro ejecutable del ambiente');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('T3 CHROME_PATH conserva aceptación del Chrome del sistema sin ejecutarlo', async (t) => {
  if (process.platform !== 'linux') {
    t.skip('Integración Linux LOCAL: no prueba aceptación de binarios en este host');
    return;
  }
  const file = await stat(realChrome).catch((error: NodeJS.ErrnoException) => {
    if (hostname() !== 'domarchithinkpad' && ['ENOENT', 'ENOTDIR'].includes(error.code ?? '')) return null;
    throw error;
  });
  if (file === null) {
    t.skip('Integración Linux LOCAL: Chrome del sistema no instalado; aceptación no probada en este host');
    return;
  }
  const model = resolver(realChrome);
  assert.equal(await realpath(await model.resolve()), await realpath(realChrome));
  assert.deepEqual(model.spawned, [], 'T3 aceptación no ejecuta Chrome');
});
