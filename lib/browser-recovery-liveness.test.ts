import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const recovery = await readFile(new URL('../scripts/browser-recovery.mjs', import.meta.url), 'utf8');

// Ejecutar los bloques reales sin importar el entrypoint: éste puede abrir
// sockets y lanzar Chrome. No copiar la lógica del collector ni su guard.
function collectorSource() {
  const viewport = recovery.match(/^async function runViewport\([^]*?^}/m)?.[0];
  const lifecycle = recovery.match(/^function createHmrLifecycleCollector\([^]*?^}/m)?.[0];
  const fixtureCatalog = recovery.match(/^function fixtureDiagnosticCases\([^]*?^}/m)?.[0];
  assert.ok(viewport, 'I1 extracción: runViewport real disponible');
  assert.ok(lifecycle, 'I1 extracción: lifecycle real disponible');
  assert.ok(fixtureCatalog, 'I1 extracción: catálogo fixture real disponible');
  const setupStart = viewport.indexOf('  const errors = [];');
  const setupEnd = viewport.indexOf('\n  try {', setupStart);
  const lastScenario = "    await queryCallback('provider-error',true);";
  const scenarioEnd = viewport.indexOf(lastScenario);
  const success = viewport.indexOf('    console.log(`✓ recovery ', scenarioEnd);
  assert.ok(setupStart >= 0 && setupEnd > setupStart,
    'I1 extracción: inicialización y suscripción completas antes del recorrido');
  assert.ok(scenarioEnd > setupEnd && success > scenarioEnd,
    'I1 extracción: cierre real entre el último escenario y el anuncio de éxito');
  return {
    viewport,
    lifecycle,
    fixtureCatalog,
    setup: viewport.slice(setupStart, setupEnd),
    finish: viewport.slice(scenarioEnd + lastScenario.length, success),
  };
}

test('I1 tripwire: streams y guard real permanecen conectados en runViewport', () => {
  const { viewport, setup, finish } = collectorSource();
  assert.match(viewport, /await Promise\.all\(\['Page\.enable','Runtime\.enable','Log\.enable','Network\.enable'\]\.map\(x=>cdp\.send\(x\)\)\)/,
    'I1 integración: Runtime y Log habilitados en el recorrido real');
  assert.equal((setup.match(/cdp\.onEvent\(/g) ?? []).length, 1,
    'I1 integración: extraer la suscripción real completa');
  for (const method of ['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded']) {
    assert.ok(setup.includes(`method === '${method}'`), `I1 integración: callback ${method} conectado`);
  }
  assert.ok(finish.includes("assert.deepEqual(errors,[],'collector sin errores inesperados');"),
    'I1 integración: conservar y ejecutar la assertion final de errores inesperados');
  assert.match(recovery, /await runViewport\(\{[^\n]*width:390,height:844,mobile:true}/,
    'I1 integración: recorrido móvil real');
  assert.match(recovery, /await runViewport\(\{[^\n]*width:1440,height:900,mobile:false}/,
    'I1 integración: recorrido desktop real');
});

for (const { width, height, mobile } of [
  { width: 390, height: 844, mobile: true },
  { width: 1440, height: 900, mobile: false },
]) {
  const viewport = `${width}x${height}`;
  test(`I1 ${viewport}: collector vacío sin streams debe fallar por vivacidad`, async () => {
    const source = collectorSource();
    const subscriptions: unknown[] = [];
    const cdp = {
      onEvent(callback: unknown) { subscriptions.push(callback); },
      async evaluate(expression: string) {
        assert.equal(expression, 'localStorage.clear(); sessionStorage.clear()',
          'I1 aislamiento: sólo limpieza del cierre, sin ejecutar escenarios ni browser');
      },
    };
    const collector = runInNewContext(`
      ${source.lifecycle}
      ${source.fixtureCatalog}
      ${source.setup}
      ({
        finish: async () => { ${source.finish} },
        snapshot: () => ({ errors: [...errors], counts: { ...diagnosticCounts } })
      })
    `, {
      assert, URL, cdp, width, height, mobile, viewport,
      appUrl: 'http://127.0.0.1:3100',
      console: { log() {} },
    });
    assert.equal(subscriptions.length, 1, 'I1 callback de producción registrado');
    assert.equal(typeof subscriptions[0], 'function', 'I1 suscripción contiene el callback real');
    assert.equal(collector.snapshot().errors.length, 0, 'I1 precondición: sin errores observados');
    assert.equal(Object.keys(collector.snapshot().counts).length, 0, 'I1 precondición: cero eventos captados');

    // No se llama manualmente al callback: se reproduce la ausencia total de
    // streams. No certifica entrega CDP; eso requiere el gate browser externo.
    // En BASE el cierre resuelve: el RED esperado es Missing expected rejection,
    // con este mensaje de vivacidad, nunca un fallo de import/bootstrap/helper.
    await assert.rejects(() => collector.finish(), (error: unknown) => {
      assert.ok(error instanceof assert.AssertionError,
        'I1 rechazo por assertion de vivacidad, no infraestructura');
      assert.match(error.message, /I1 collector sin vivacidad/,
        'I1 rechazo identifica vivacidad faltante');
      assert.ok(error.message.includes(viewport), 'I1 rechazo identifica el viewport');
      return true;
    }, `I1 ${viewport}: falta vivacidad; collector vacío sin streams no puede certificar éxito`);
  });
}
