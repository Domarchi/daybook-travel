import test from 'node:test';
import assert from 'node:assert/strict';
import { access, copyFile, lstat, mkdtemp, open, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../scripts/browser-login.mjs', import.meta.url), 'utf8');
const resolverSource = source.match(/^async function chromePath\([^]*?^}/m)?.[0];
assert.ok(resolverSource, 'T3 extraer chromePath real existente');
const commandSource = source.match(/^function chromeCommand\([^]*?^}/m)?.[0];
assert.ok(commandSource, 'T3 extraer chromeCommand real existente');
const ownedTmp = tmpdir();
const realChrome = '/opt/google/chrome/chrome';
const githubRunnerChromium = '/usr/local/share/chromium/chrome-linux/chrome';

function resolver(explicitPath: string, options: { ci?: boolean } = {}, implementation = resolverSource) {
  const accessed: string[] = [];
  const spawned: unknown[][] = [];
  const noSpawn = (...args: unknown[]) => { spawned.push(args); assert.fail('T3 chromePath no debe ejecutar procesos'); };
  const resolve = runInNewContext(`${implementation}\nchromePath`, {
    process: { env: { CHROME_PATH: explicitPath, GITHUB_ACTIONS: options.ci ? 'true' : undefined }, platform: process.platform },
    access: async (path: string, mode?: number) => { accessed.push(path); await access(path, mode); },
    lstat, open, readFile, realpath, stat, constants, spawn: noSpawn, spawnOwned: noSpawn,
  }) as () => Promise<{ file: Awaited<ReturnType<typeof open>> }>;
  return { resolve, accessed, spawned };
}

test('M2 allowlist-return: el mutante que la elimina acepta el ELF privado (RED)', async () => {
  const root = await mkdtemp(join(ownedTmp, 'd1-allowlist-mutant-'));
  const elf = join(root, 'not-chrome');
  const guard = 'if (!systemTrusted) {';
  const mutated = resolverSource.replace(guard, 'if (false) {');
  try {
    assert.notEqual(mutated, resolverSource, 'M2 sitio de allowlist presente una sola vez');
    await copyFile('/bin/true', elf, constants.COPYFILE_EXCL);
    const accepted = await resolver(elf, {}, mutated).resolve();
    await accepted.file.close();
    assert.ok(accepted, 'M2 sin allowlist el ELF arbitrario alcanzaría el retorno previo al spawn');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('T3 spawn recibe descriptor del binario validado, no una ruta sustituible', async () => {
  const root = await mkdtemp(join(ownedTmp, 'd1-fd-command-'));
  const elf = join(root, 'chrome');
  const command = runInNewContext(`${commandSource}\nchromeCommand`, { assert, process: { platform: 'linux' } }) as (file: { fd: number }) => string;
  try {
    await copyFile('/bin/true', elf, constants.COPYFILE_EXCL);
    const file = await open(elf, 'r');
    try {
      assert.equal(command(file), `/proc/self/fd/${file.fd}`,
        'T3 la orden de spawn queda ligada al descriptor abierto');
    } finally { await file.close(); }
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

test('T3 GITHUB_ACTIONS y un contrato de checkout falsificados no autorizan ELF privado', async () => {
  const root = await mkdtemp(join(ownedTmp, 'd1-forged-ci-'));
  const elf = join(root, 'setup-chrome');
  const forgedContract = join(process.cwd(), '.travel-ci-chrome.json');
  try {
    await copyFile('/bin/true', elf, constants.COPYFILE_EXCL);
    await writeFile(forgedContract, '{"path":"forged"}\n', { flag: 'wx', mode: 0o400 });
    await assert.rejects(resolver(elf, { ci: true }).resolve,
      { message: /^T3 CHROME_PATH fuera de la lista permitida$/ },
      'T3 el selector no lee contrato ni variable de CI para ampliar la allowlist');
  } finally {
    await rm(forgedContract, { force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('T3 la antigua ruta especial de CI no se autoriza aunque aparente ser root/no-escribible', async () => {
  const fixed = '/opt/travel-ci-chrome/bundle/chrome';
  const resolve = (owner: number) => runInNewContext(`${resolverSource}\nchromePath`, {
    process: { env: { CHROME_PATH: fixed }, platform: 'linux' }, constants,
    realpath: async () => fixed,
    access: async () => {},
    stat: async () => ({ isFile: () => true, uid: 0, mode: 0o100755, dev: 1, ino: 2 }),
    lstat: async () => ({ isSymbolicLink: () => false, uid: owner, mode: 0o40755 }),
    open: async () => ({ stat: async () => ({ isFile: () => true, dev: 1, ino: 2 }), close: async () => {} }),
  }) as () => Promise<{ file: { close(): Promise<void> } }>;
  await assert.rejects(resolve(1000), { message: /^T3 CHROME_PATH fuera de la lista permitida$/ });
  await assert.rejects(resolve(0), { message: /^T3 CHROME_PATH fuera de la lista permitida$/ },
    'T3 root/mode no son una frontera cuando el checkout conserva sudo');
});

test('T3 acepta sólo el binario canónico de Chromium preinstalado en GitHub Ubuntu', async () => {
  let closed = 0;
  const resolve = runInNewContext(`${resolverSource}\nchromePath`, {
    process: { env: { CHROME_PATH: githubRunnerChromium }, platform: 'linux' }, constants,
    realpath: async () => githubRunnerChromium,
    access: async () => {},
    stat: async () => ({ isFile: () => true, mode: 0o100755, dev: 1, ino: 2 }),
    open: async () => ({
      stat: async () => ({ isFile: () => true, dev: 1, ino: 2 }),
      close: async () => { closed++; },
    }),
  }) as () => Promise<{ file: { close(): Promise<void> } }>;
  const accepted = await resolve();
  await accepted.file.close();
  assert.equal(closed, 1, 'T3 conserva descriptor, no una ruta alternativa');
});

test('T3 descubre Chromium preinstalado de GitHub sin CHROME_PATH', async () => {
  const previousCandidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const attempted: string[] = [];
  let closed = 0;
  const resolve = runInNewContext(`${resolverSource}\nchromePath`, {
    process: { env: {}, platform: 'linux' }, constants,
    realpath: async (path: string) => {
      attempted.push(path);
      if (path === githubRunnerChromium) return githubRunnerChromium;
      const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
      throw error;
    },
    access: async () => {},
    stat: async () => ({ isFile: () => true, mode: 0o100755, dev: 1, ino: 2 }),
    open: async () => ({
      stat: async () => ({ isFile: () => true, dev: 1, ino: 2 }),
      close: async () => { closed++; },
    }),
  }) as () => Promise<{ file: { close(): Promise<void> } }>;

  const accepted = await resolve();
  await accepted.file.close();
  assert.deepEqual(attempted, [...previousCandidates.slice(0, 2), githubRunnerChromium],
    'T3 discovery prioriza la ruta canónica de GitHub antes de wrappers/rutas Google');
  assert.equal(closed, 1);
});

test('T3 CHROME_PATH conserva aceptación del Chrome del sistema sin ejecutarlo', async (t) => {
  if (process.platform !== 'linux') {
    t.skip('Integración Linux LOCAL: no prueba aceptación de binarios en este host');
    return;
  }

  // GitHub Ubuntu instala Chromium aquí; los hosts de desarrollo suelen usar
  // Chrome de Google. Ambas rutas son canónicas y ya están en la allowlist.
  const selected = await (async () => {
    for (const candidate of [githubRunnerChromium, realChrome]) {
      const file = await stat(candidate).catch((error: NodeJS.ErrnoException) => {
        if (['ENOENT', 'ENOTDIR'].includes(error.code ?? '')) return null;
        throw error;
      });
      if (file?.isFile()) return candidate;
    }
    return null;
  })();
  if (selected === null) {
    t.skip('Integración Linux LOCAL: no hay Chrome/Chromium canónico instalado; aceptación no probada en este host');
    return;
  }
  assert.ok((await stat(selected)).isFile(), 'T3 la ruta canónica elegida existe y es un archivo');
  const model = resolver(selected);
  const accepted = await model.resolve();
  await accepted.file.close();
  assert.ok(accepted, 'T3 resolver devuelve descriptor abierto, no una ruta ejecutable');
  assert.deepEqual(model.spawned, [], 'T3 aceptación no ejecuta Chrome');
});
