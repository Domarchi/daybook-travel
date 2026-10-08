import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, chmod, copyFile, mkdir, mkdtemp, open, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { startBrowser, teardown } from '../scripts/browser-login.mjs';

const execFileAsync = promisify(execFile);

async function supportsSpawnIntegration() {
  const server = createServer();
  try {
    await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') return false;
    throw error;
  } finally {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  try {
    await execFileAsync(process.execPath, ['--version']);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') return false;
    throw error;
  }
}

async function canBind(port: number) {
  const server = createServer();
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

for (const kind of ['ELF privado', 'symlink privado al ELF'] as const) {
  test(`D1 ${kind} se rechaza antes de perfil, Next o Chrome`, { timeout: 10_000 }, async (t) => {
    if (process.platform !== 'linux') {
      t.skip('Integración Linux: fixture ELF privado');
      return;
    }
    const fixture = await mkdtemp(join(tmpdir(), 'd1-pre-spawn-'));
    const elf = join(fixture, 'not-chrome');
    const candidate = kind === 'ELF privado' ? elf : join(fixture, 'not-chrome-link');
    const priorChrome = process.env.CHROME_PATH;
    let exposedPort: number | undefined;
    try {
      await copyFile('/bin/true', elf, constants.COPYFILE_EXCL);
      if (candidate !== elf) await symlink(elf, candidate);
      process.env.CHROME_PATH = candidate;
      (globalThis as typeof globalThis & { __travelBrowserStartTest?: unknown }).__travelBrowserStartTest = {
        temporaryParent: fixture,
        onPort: (port: number) => { exposedPort = port; },
      };
      await assert.rejects(() => startBrowser(), { message: /^T3 CHROME_PATH fuera de la lista permitida$/ });
      assert.equal(exposedPort, undefined, 'D1 no reserva puerto: tampoco inicia Next');
      assert.deepEqual((await readdir(fixture)).sort(),
        candidate === elf ? ['not-chrome'] : ['not-chrome', 'not-chrome-link'],
        'D1 no deja perfil, fixture ni servidor propios');
    } finally {
      if (priorChrome === undefined) delete process.env.CHROME_PATH;
      else process.env.CHROME_PATH = priorChrome;
      delete (globalThis as typeof globalThis & { __travelBrowserStartTest?: unknown }).__travelBrowserStartTest;
      await teardown();
      await rm(fixture, { recursive: true, force: true });
    }
  });
}

test('D1 error real de spawn tras descriptor autorizado limpia perfil, server, puerto y conserva .next ajeno', { timeout: 60_000 }, async (t) => {
  if (process.platform !== 'linux') {
    t.skip('Integración Linux sintética: ChildProcess.error EACCES/ENOEXEC');
    return;
  }
  if (!await supportsSpawnIntegration()) {
    t.skip('Infraestructura local bloquea sockets o subprocesos requeridos por esta integración');
    return;
  }

  const fixture = await mkdtemp(join(tmpdir(), 'd1-launch-error-'));
  const loaderRoot = await mkdtemp(join(tmpdir(), 'd1-loader-'));
  const fakeServer = join(fixture, 'fixture-server.mjs');
  const fakeChrome = join(fixture, 'chrome-eacces');
  const deniedLoader = join(loaderRoot, 'ld');
  const sentinel = join(process.cwd(), '.next', `d1-preexisting-${process.pid}.marker`);
  const priorChrome = process.env.CHROME_PATH;
  let port: number | undefined;
  try {
    await writeFile(fakeServer, `
      import { createServer } from 'node:http';
      const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
      createServer((_request, response) => { response.end('fixture'); }).listen(port, '127.0.0.1');
    `, { mode: 0o700 });
    const elf = await readFile('/bin/true');
    const interpreter = Buffer.from('/lib64/ld-linux-x86-64.so.2\0');
    const offset = elf.indexOf(interpreter);
    assert.ok(offset >= 0, 'D1 fixture Linux encuentra PT_INTERP de /bin/true');
    const replacement = Buffer.alloc(interpreter.length);
    const target = Buffer.from(`${deniedLoader}\0`);
    assert.ok(target.length <= replacement.length, 'D1 loader sintético cabe en PT_INTERP');
    target.copy(replacement);
    replacement.copy(elf, offset);
    await writeFile(deniedLoader, 'not executable\n', { mode: 0o600 });
    await chmod(deniedLoader, 0o600);
    await writeFile(fakeChrome, elf, { mode: 0o700 });
    await chmod(fakeChrome, 0o700);
    await mkdir(join(process.cwd(), '.next'), { recursive: true });
    await writeFile(sentinel, 'pre-existing\n', { flag: 'wx' });
    (globalThis as typeof globalThis & { __travelBrowserStartTest?: unknown }).__travelBrowserStartTest = {
      nextEntrypoint: fakeServer,
      temporaryParent: fixture,
      onPort: (value: number) => { port = value; },
      chromePath: async () => ({ file: await open(fakeChrome, 'r') }),
    };

    await assert.rejects(() => startBrowser(), /Chrome no pudo iniciarse \((?:EACCES|ENOEXEC)\)/,
      'D1 el binario ya autorizado alcanza ChildProcess.error');
    assert.ok(port, 'D1 reservó un puerto propio antes de iniciar el server');
    assert.deepEqual((await readdir(fixture)).sort(), ['chrome-eacces', 'fixture-server.mjs'],
      'D1 limpia perfil y no borra fixtures externos');
    await access(sentinel);
    await canBind(port);
    const { stdout } = await execFileAsync('ps', ['-eo', 'args=']);
    assert.doesNotMatch(stdout, new RegExp(`fixture-server\\.mjs[^\n]*--port ${port}(?:\\s|$)`),
      'D1 no queda proceso server propio después del error de spawn');
  } finally {
    if (priorChrome === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = priorChrome;
    delete (globalThis as typeof globalThis & { __travelBrowserStartTest?: unknown }).__travelBrowserStartTest;
    await teardown();
    await rm(sentinel, { force: true });
    await rm(fixture, { recursive: true, force: true });
    await rm(loaderRoot, { recursive: true, force: true });
  }
});
