import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { startBrowser, teardown } from '../scripts/browser-login.mjs';

const execFileAsync = promisify(execFile);

async function canBind(port: number) {
  const server = createServer();
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

test('D1 launch error Chrome limpia perfil, server, puerto y conserva .next ajeno', { timeout: 60_000 }, async (t) => {
  if (process.platform !== 'linux') {
    t.skip('Integración Linux sintética: ChildProcess.error EACCES/ENOEXEC');
    return;
  }

  const fixture = await mkdtemp(join(tmpdir(), 'd1-launch-error-'));
  const loaderRoot = await mkdtemp(join(tmpdir(), 'x-'));
  const fakeServer = join(fixture, 'fixture-server.mjs');
  const fakeChrome = join(fixture, 'chrome-eacces');
  const deniedLoader = join(loaderRoot, 'ld');
  const sentinel = join(process.cwd(), '.next', `d1-preexisting-${process.pid}.marker`);
  const priorChrome = process.env.CHROME_PATH;
  let port: number | undefined;
  await writeFile(fakeServer, `
    import { createServer } from 'node:http';
    const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
    createServer((_request, response) => { response.end('fixture'); }).listen(port, '127.0.0.1');
  `, { mode: 0o700 });
  // ELF real con intérprete dinámico propio sin permiso execute: chromePath
  // acepta el formato, pero execve devuelve EACCES y ChildProcess emite `error`.
  const elf = await readFile('/bin/true');
  const interpreter = Buffer.from('/lib64/ld-linux-x86-64.so.2\0');
  const offset = elf.indexOf(interpreter);
  assert.ok(offset >= 0, 'D1 fixture Linux encuentra PT_INTERP de /bin/true');
  const replacement = Buffer.alloc(interpreter.length);
  const target = Buffer.from(`${deniedLoader}\0`);
  assert.ok(target.length <= replacement.length, 'D1 loader sintético cabe en PT_INTERP');
  target.copy(replacement);
  replacement.copy(elf, offset);
  await writeFile(deniedLoader, 'not executable\\n', { mode: 0o600 });
  await chmod(deniedLoader, 0o600);
  await writeFile(fakeChrome, elf, { mode: 0o700 });
  await chmod(fakeChrome, 0o700);
  await mkdir(join(process.cwd(), '.next'), { recursive: true });
  await writeFile(sentinel, 'pre-existing\n', { flag: 'wx' });
  process.env.CHROME_PATH = fakeChrome;

  try {
    (globalThis as typeof globalThis & { __travelBrowserStartTest?: unknown }).__travelBrowserStartTest = {
      nextEntrypoint: fakeServer,
      temporaryParent: fixture,
      onPort: (value: number) => { port = value; },
    };
    await assert.rejects(
      () => startBrowser(),
      /Chrome no pudo iniciarse \((?:EACCES|ENOEXEC)\)/,
      'D1 ChildProcess.error se conserva como error de launch sanitizado',
    );
    assert.ok(port, 'D1 expone el puerto propio sólo al harness de prueba');
    assert.deepEqual(await readdir(fixture), ['chrome-eacces', 'fixture-server.mjs'],
      'D1 perfil y fixture temporal propios fueron eliminados, sin borrar fixtures externos');
    await access(sentinel);
    await canBind(port);
    const { stdout } = await execFileAsync('ps', ['-eo', 'args=']);
    assert.doesNotMatch(stdout, new RegExp(`fixture-server\.mjs[^\n]*--port ${port}(?:\s|$)`),
      'D1 no queda proceso server propio después del launch error');
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
