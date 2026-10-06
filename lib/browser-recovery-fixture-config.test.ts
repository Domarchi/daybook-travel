import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const { default: loadConfig } = require('next/dist/server/config.js');
const { defaultConfig, normalizeConfig } = require('next/dist/server/config-shared.js');
const { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } = require('next/constants.js');
const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const harness = await readFile(new URL('../scripts/browser-login.mjs', import.meta.url), 'utf8');
const marker = 'TRAVEL_BROWSER_FIXTURE'; // Protocolo propio del harness, no variable interna Next.
const fixtureMode = 'document-boundaries-v1';
// Gate unit local de esta tarea; no se presenta como fixture portable de CI.
const ownedTmp = '/home/domarchithinkpad/.hermes/cache/scratch/tc-d0et9_nt';

async function observeStartup() {
  const start = harness.match(/^export async function startBrowser\([^]*?^}/m)?.[0];
  const guard = harness.match(/^function assertSandboxedChromeArgs\([^]*?^}/m)?.[0];
  assert.ok(start && guard, 'M1 fixture: extraer startBrowser y guard reales actuales');
  const launches: { executable: string; argv: string[]; env: Record<string, string> }[] = [];
  const parentEnv: Record<string, string> = {};
  const startBrowser = runInNewContext([
    'let ownedRoot;', guard, start.replace(/^export /, ''), 'startBrowser',
  ].join('\n'), {
    assert, join, ROOT: sourceRoot,
    process: { execPath: '/synthetic/node', env: parentEnv },
    console: { log() {} },
    tmpdir: () => '/synthetic', mkdtemp: async () => '/synthetic/owned-browser',
    freePort: async () => 43123, waitForHttp: async () => {},
    chromePath: async () => '/synthetic/chrome', waitForDevTools: async () => 43124,
    spawnOwned(executable: string, argv: string[], options?: { env?: Record<string, string> }) {
      launches.push({ executable, argv: Array.from(argv), env: { ...(options?.env ?? parentEnv) } });
      return { exitCode: null }; // Doble OS: ningún proceso, socket ni navegador.
    },
  });
  await startBrowser();
  assert.equal(launches.length, 2, 'M1 fixture: dos spawns simulados del arranque real');
  assert.equal(launches[0].argv[0], join(sourceRoot, 'node_modules/next/dist/bin/next'));
  assert.equal(launches[0].argv[1], 'dev', 'M1 fixture conserva Next DEV real');
  assert.equal(launches[0].argv.includes('--webpack'), false, 'M1 fixture no cambia compiler');
  assert.equal(launches[1].env[marker], undefined, 'M1 modo fixture sólo al Next propio, no Chrome');
  assert.deepEqual(parentEnv, {}, 'M1 startup no modifica entorno del padre');
  return launches[0].env;
}

async function currentConfig(phase: string, env: Record<string, string>) {
  let source: string;
  try { source = await readFile(new URL('../next.config.mjs', import.meta.url), 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // Ausencia actual es válida para Next: defaults REALES, no import inexistente.
    return {};
  }
  // Evaluar el export de configuración REAL con sólo su entorno de proceso
  // simulado. No copiar el condicional de producción ni inventar su resultado.
  assert.equal((source.match(/export default /g) ?? []).length, 1, 'M1 config: export default único');
  const config = runInNewContext(source.replace('export default ', 'globalThis.config = ') + '\n;config', {
    process: { env: { ...env } },
  });
  return normalizeConfig(phase, config);
}

test('M1 fixture Next efectiva: devIndicators=false sólo en browser DEV; dev/build habitual default', async () => {
  const nextEnv = await observeStartup();
  const root = await mkdtemp(join(ownedTmp, 'm1-config-unit-'));
  try {
    // Cada directorio es único: loadConfig cachea por dir/phase, no por contenido.
    // customConfig evita buscar configuración en ancestros; el directorio vacío
    // evita cargar .env del checkout. No se escriben configs ni copian credenciales.
    async function effective(label: string, phase: string, env: Record<string, string>) {
      const dir = join(root, label);
      await mkdir(dir);
      const raw = await currentConfig(phase, env);
      const config = await loadConfig(phase, dir, { customConfig: { ...raw }, silent: true });
      return { raw, config };
    }
    for (const [label, phase, env] of [
      ['normal-dev', PHASE_DEVELOPMENT_SERVER, {}],
      ['normal-build', PHASE_PRODUCTION_BUILD, {}],
      ['marked-build', PHASE_PRODUCTION_BUILD, { [marker]: fixtureMode }],
      ['unknown-mode', PHASE_DEVELOPMENT_SERVER, { [marker]: 'unknown' }],
    ] as const) {
      const { raw, config } = await effective(label, phase, env);
      assert.deepEqual(Object.keys(raw), [], `M1 ${label}: ninguna configuración de fixture`);
      assert.deepEqual(config.devIndicators, defaultConfig.devIndicators, `M1 ${label}: default Next instalado`);
    }
    const fixture = await effective('browser-dev', PHASE_DEVELOPMENT_SERVER, nextEnv);
    assert.equal(fixture.config.devIndicators, false,
      'M1 fixture Next DEV debe desactivar únicamente devIndicators mediante configuración efectiva');
    assert.deepEqual(Object.keys(fixture.raw), ['devIndicators'], 'M1 fixture sólo cambia opción oficial del indicador');
    assert.equal(nextEnv[marker], fixtureMode, 'M1 modo fixture cerrado transmitido por startBrowser real');
  } finally {
    await rm(root, { recursive: true, force: true }); // Sólo mkdtemp propio de esta prueba.
  }
});
