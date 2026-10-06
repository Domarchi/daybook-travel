import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const recovery = await readFile(new URL('../scripts/browser-recovery.mjs', import.meta.url), 'utf8');
const login = await readFile(new URL('../scripts/browser-login.mjs', import.meta.url), 'utf8');

function helper(source: string, name: string) {
  const found = source.match(new RegExp(`^async function ${name}\\([^]*?^}`, 'm'))?.[0];
  assert.ok(found, `M1 extracción: helper real ${name}`);
  return found;
}
const stops = recovery.match(/^const stops = \{[^]*?^};/m)?.[0];
assert.ok(stops, 'M1 extracción: selectores reales');
const orderNames = ['loginOrder', 'requestOrder', 'updateOrder', 'invalidOrder', 'retryOrder'];
const declarations = orderNames.map(name => {
  const found = recovery.match(new RegExp(`^const ${name} = [^\\n]+;`, 'm'))?.[0];
  assert.ok(found, `M1 extracción: orden real ${name}`);
  return found;
});
// Ni lógica de guard copiada ni sustitutos de titleAnchor/keyboardStep/tabTo.
// Los únicos dobles están en el transporte CDP y el DOM mínimo que éste observa.
const api = runInNewContext([
  stops, ...declarations, helper(login, 'pressTab'),
  ...['tabTo', 'touch', 'titleAnchor', 'keyboardStep', 'documentInventory', 'documentBoundaryStep', 'keyboardSequence']
    .map(name => helper(recovery, name)),
  `({keyboardSequence, titleAnchor, keyboardStep, documentBoundaryStep, stops, orders:{${orderNames.join(',')}}})`,
].join('\n'), { assert });

type Trap = 'none' | 'body-before' | 'body-after' | 'body-self' | 'body-editable';
type InputEvent = { type: string; key?: string; modifiers?: number };

function browser(order: string[], trap: Trap, exitHasFocus = false, reverseWrap: 'off' | 'last' | 'wrong-button' = 'off', anchorShiftTabToBody = false) {
  function element(name: string, selector: string, insideMain: boolean, tabIndex: number, tagName: string) {
    return {
      name, selector, insideMain, tabIndex, tagName, disabled: false, isContentEditable: false,
      getBoundingClientRect() { return { x: 0, y: 0, width: 100, height: 20 }; },
      getClientRects() { return [{}]; },
      scrollIntoView() {},
      closest(query: string) { assert.equal(query, '[inert]'); return null; },
      getAttribute(attribute: string) { return attribute === 'tabindex' && tabIndex >= 0 ? String(tabIndex) : null; },
      matches(query: string): boolean {
        if (query.startsWith('main ')) return insideMain && this.matches(query.slice(5));
        return query === '*' || query === selector || query.toUpperCase() === tagName
          || query === '[tabindex]' && tabIndex >= 0 || query === 'a[href]' && tagName === 'A';
      },
    };
  }
  const body = element('body', 'body', false, trap === 'body-self' ? 0 : -1, 'BODY');
  body.isContentEditable = trap === 'body-editable';
  const main = element('main', 'main', true, -1, 'MAIN');
  const title = element('title', 'h1', true, -1, 'H1');
  const controls = order.map(name => {
    const selector: string = api.stops[name];
    const tag = selector.startsWith('input') ? 'INPUT' : selector.startsWith('a[') ? 'A' : 'BUTTON';
    return element(name, selector, true, 0, tag);
  });
  // Modelo estructural, no copia de markup de producto. El h1 no es focusable
  // y está entre tema y el resto de controles, como requiere titleAnchor actual.
  const nodes = [body,
    ...(trap === 'body-before' ? [element(trap, '[data-extra-before]', false, 0, 'BUTTON')] : []),
    main, controls[0], title, ...controls.slice(1),
    ...(trap === 'body-after' ? [element(trap, '[data-extra-after]', false, 0, 'BUTTON')] : [])];
  let position = 0;
  let active = body;
  let hasFocus = true;
  let anchoredShiftTabPending = false;
  const events: { method: string; event: InputEvent }[] = [];
  const visited: string[] = [];
  const boundaries: { direction: number; tagName: string; tabIndex: number; isContentEditable: boolean; hasFocus: boolean }[] = [];
  const document = {
    body,
    hasFocus() { return hasFocus; },
    get activeElement() { return active; },
    querySelector(selector: string) { return nodes.find(node => node.matches(selector)) ?? null; },
    querySelectorAll(selector: string) {
      return nodes.filter(node => selector.split(',').some(part => node.matches(part.trim())));
    },
  };
  const cdp = {
    async evaluate(expression: string) {
      // Evaluar la expresión real: nunca devolver "true" por reconocer una
      // assertion del harness. No hay métodos focus/click en el DOM doble.
      return runInNewContext(expression, {
        document,
        getComputedStyle: () => ({ outlineStyle: 'solid', outlineWidth: '2px', visibility: 'visible', display: 'block' }),
      });
    },
    async send(method: string, event: InputEvent) {
      assert.ok(['Input.dispatchKeyEvent', 'Input.dispatchMouseEvent', 'Input.dispatchTouchEvent'].includes(method),
        'M1 doble CDP: sólo input nativo del helper real');
      events.push({ method, event });
      if (method === 'Input.dispatchMouseEvent' && event.type === 'mouseReleased'
        || method === 'Input.dispatchTouchEvent' && event.type === 'touchEnd') {
        position = nodes.indexOf(title);
        active = body; // Click/touch en h1 cambia el inicio secuencial, no su tabindex.
        hasFocus = true;
        anchoredShiftTabPending = anchorShiftTabToBody;
      }
      if (method === 'Input.dispatchKeyEvent' && event.type === 'rawKeyDown') {
        assert.equal(event.key, 'Tab', 'M1 recorrido usa Tab/ShiftTab');
        const direction = event.modifiers === 8 ? -1 : 1;
        // Transporte medido con BODY tabindex0: después del ancla nativa h1,
        // el primer ShiftTab puede conservar BODY en vez de alcanzar tema.
        // Sólo el estado DOM/foco cambia; evaluate sigue ejecutando el guard real.
        const bodyAnchorRedirect = anchoredShiftTabPending && direction === -1 && body.tabIndex === 0;
        anchoredShiftTabPending = false;
        if (bodyAnchorRedirect) {
          position = nodes.indexOf(body);
          active = body; hasFocus = true; visited.push(active.name); return;
        }
        // Variante OS medida: Tab desde BODY posterior reentra por el comienzo.
        // Los 49 casos previos conservan su modelo porque reverseWrap='off'.
        if (reverseWrap !== 'off' && direction === 1 && position >= nodes.length) position = -1;
        // Al agotar el documento activeElement es BODY. El probe real headless
        // conserva hasFocus=true; la variante anterior false sigue cubierta.
        // El Tab opuesto reentra por el mismo extremo (contrato abstracto).
        for (let step = 0; step <= nodes.length; step++) {
          position += direction;
          if (reverseWrap !== 'off' && position < 0) {
            // ShiftTab agotó el comienzo: envoltura directa al último tabulable.
            // wrong-button inyecta un destino incorrecto ya presente en el DOM,
            // para exigir identidad exacta, no sólo tag BUTTON ni inventario sano.
            position = reverseWrap === 'wrong-button'
              ? nodes.findIndex(node => node.name === 'login')
              : nodes.findLastIndex(node => node.tabIndex >= 0 || node.isContentEditable);
            assert.ok(position >= 0, 'M1 modelo reverse-wrap tiene destino');
            active = nodes[position]; hasFocus = true; visited.push(active.name); return;
          }
          if (position < 0 || position >= nodes.length) {
            active = body; hasFocus = exitHasFocus;
            boundaries.push({ direction, tagName: active.tagName, tabIndex: active.tabIndex,
              isContentEditable: active.isContentEditable, hasFocus });
            visited.push(direction < 0 ? 'outside-before' : 'outside-after');
            return;
          }
          if (nodes[position].tabIndex >= 0 || nodes[position].isContentEditable) {
            active = nodes[position]; hasFocus = true; visited.push(active.name); return;
          }
        }
        assert.fail('M1 fixture sin controles focusables');
      }
    },
  };
  return { cdp, events, visited, boundaries, active: () => active.name,
    focusable: () => nodes.filter(node => node.tabIndex >= 0 || node.isContentEditable).map(node => node.name) };
}

test('M1 document boundary headless BODY tabIndex=-1 no editable hasFocus=true: roundtrip 390x844/login', async () => {
  const viewport = '390x844', state = 'login', mobile = true;
  const order: string[] = Array.from(api.orders.loginOrder);

  // El predicado REAL tampoco puede aceptar un control externo ni BODY
  // tabulable/editable. Llegamos al extremo mediante los helpers de input reales;
  // se evalúa su expresión contra DOM, sin respuestas booleanas prefabricadas.
  for (const trap of ['body-before', 'body-after', 'body-self', 'body-editable'] as const) {
    const model = browser(order, trap, true);
    const trapName = trap === 'body-self' || trap === 'body-editable' ? 'body' : trap;
    assert.deepEqual(model.focusable(), trap === 'body-after' ? [...order, trapName] : [trapName, ...order]);
    await api.titleAnchor(model.cdp, mobile);
    await api.keyboardStep(model.cdp, state, order[0], true, viewport);
    if (trap === 'body-after') {
      for (const name of order.slice(1)) await api.keyboardStep(model.cdp, state, name, false, viewport);
    }
    const edge = trap === 'body-after' ? 'end-forward' : 'begin-reverse';
    await assert.rejects(
      () => api.documentBoundaryStep(model.cdp, state, viewport, trap !== 'body-after', null, edge),
      (error: unknown) => {
        assert.ok(error instanceof assert.AssertionError, 'M1 rechazo de trampa por guard real');
        assert.equal((error as assert.AssertionError & { documentBoundaryAssertion?: string }).documentBoundaryAssertion,
          `M1 document boundary ${viewport}/${state}:${edge}`);
        return true;
      }, `M1 document boundary headless rechaza ${trap}`);
    assert.equal(model.active(), trapName, 'M1 precondición: el control prohibido conserva foco');
  }

  const normal = browser(order, 'none', true);
  assert.deepEqual(normal.focusable(), order, 'M1 seis controles exactos, sin unexpected');
  await assert.doesNotReject(
    () => api.keyboardSequence(normal.cdp, state, order, viewport, mobile),
    'M1 document boundary headless BODY negativo no editable debe aceptar hasFocus=true');
  assert.deepEqual(normal.boundaries, [
    { direction: 1, tagName: 'BODY', tabIndex: -1, isContentEditable: false, hasFocus: true },
    { direction: -1, tagName: 'BODY', tabIndex: -1, isContentEditable: false, hasFocus: true },
  ], 'M1 salidas nativas end-forward y begin-reverse');
  assert.deepEqual(normal.visited, [...order, 'outside-after', order.at(-1),
    ...order.slice(0, -1).reverse(), 'outside-before', order[0]],
  'M1 roundtrip: siguiente control exacto al reentrar y full order forward/reverse');
  const rawKeys = normal.events.filter(({ event }) => event.type === 'rawKeyDown').map(({ event }) => event.modifiers);
  assert.deepEqual(rawKeys, [8, ...order.slice(1).map(() => 0), 0, 8,
    ...order.slice(0, -1).map(() => 8), 8, 0], 'M1 sólo Tab/ShiftTab exactos, sin búsqueda');
  assert.equal(normal.events.filter(({ event }) => event.type === 'keyUp').length, rawKeys.length);
  assert.equal(normal.active(), 'theme', 'M1 conserva tema final');
});

test('M1 reverse wrap ÚLTIMO exacto → BODY → PRIMERO exacto: roundtrip 390x844/login', async () => {
  const viewport = '390x844', state = 'login', mobile = true;
  const order: string[] = Array.from(api.orders.loginOrder);
  for (const trap of ['body-before', 'body-after', 'body-self', 'body-editable'] as const) {
    const model = browser(order, trap, true, 'last');
    const trapName = trap === 'body-self' || trap === 'body-editable' ? 'body' : trap;
    assert.deepEqual(model.focusable(), trap === 'body-after' ? [...order, trapName] : [trapName, ...order],
      'M1 reverse wrap: trampa tabulable real en el documento');
    await assert.rejects(() => api.keyboardSequence(model.cdp, state, order, viewport, mobile), (error: unknown) => {
      assert.ok(error instanceof assert.AssertionError, 'M1 reverse wrap rechaza trampa por assertion, no bootstrap');
      assert.equal((error as assert.AssertionError & { documentBoundaryAssertion?: string }).documentBoundaryAssertion,
        `M1 document boundary ${viewport}/${state}:inventory`);
      return true;
    }, `M1 reverse wrap conserva rechazo documental ${trap}`);
  }

  const wrong = browser(order, 'none', true, 'wrong-button');
  assert.deepEqual(wrong.focusable(), order, 'M1 reverse wrap incorrecto conserva inventario sano');
  await assert.rejects(() => api.keyboardSequence(wrong.cdp, state, order, viewport, mobile), (error: unknown) => {
    assert.ok(error instanceof assert.AssertionError, 'M1 reverse wrap destino incorrecto falla por guard real');
    assert.equal((error as assert.AssertionError & { documentBoundaryAssertion?: string }).documentBoundaryAssertion,
      `M1 document boundary ${viewport}/${state}:begin-reverse`);
    return true;
  }, 'M1 reverse wrap no acepta otro BUTTON del contrato como último');
  assert.equal(wrong.active(), 'login', 'M1 reverse wrap negativo alcanzó otro BUTTON, no demo');

  const normal = browser(order, 'none', true, 'last');
  assert.deepEqual(normal.focusable(), order, 'M1 reverse wrap seis controles exactos');
  await assert.doesNotReject(() => api.keyboardSequence(normal.cdp, state, order, viewport, mobile),
    'M1 reverse wrap debe aceptar ÚLTIMO exacto → BODY negativo no editable → PRIMERO exacto 390x844/login');
  assert.deepEqual(normal.visited, [...order, 'outside-after', order.at(-1),
    ...order.slice(0, -1).reverse(), order.at(-1), 'outside-after', order[0]],
  'M1 reverse wrap secuencia cerrada, sin búsqueda ni salto de paradas');
  assert.deepEqual(normal.boundaries, [
    { direction: 1, tagName: 'BODY', tabIndex: -1, isContentEditable: false, hasFocus: true },
    { direction: 1, tagName: 'BODY', tabIndex: -1, isContentEditable: false, hasFocus: true },
  ], 'M1 reverse wrap: salida forward BODY y Tab1 desde último BODY; ningún BODY reverse inventado');
  const modifiers = [8, ...order.slice(1).map(() => 0), 0, 8,
    ...order.slice(0, -1).map(() => 8), 8, 0, 0];
  assert.deepEqual(normal.events.filter(({ method }) => method === 'Input.dispatchKeyEvent')
    .map(({ event }) => ({ type: event.type, key: event.key, modifiers: event.modifiers })),
  modifiers.flatMap(modifiers => [
    { type: 'rawKeyDown', key: 'Tab', modifiers },
    { type: 'keyUp', key: 'Tab', modifiers },
  ]), 'M1 reverse wrap: exactamente 16 pares nativos, incluidos los dos Tab finales');
  assert.equal(modifiers.length, 16);
  assert.equal(normal.active(), 'theme', 'M1 reverse wrap termina en el PRIMERO exacto');
});

for (const mobile of [true, false]) {
  const viewport = mobile ? '390x844' : '1440x900';
  test(`M1 BODY tabulable debe morir por guard documental antes de T1 reverse:theme ${viewport}/login`, async () => {
    const order: string[] = Array.from(api.orders.loginOrder);
    const model = browser(order, 'body-self', true, 'last', true);
    assert.deepEqual(model.focusable(), ['body', ...order], 'M1 BODY tabindex0 altera el documento, no el orden interno');
    assert.equal(await model.cdp.evaluate('document.body.tabIndex'), 0, 'M1 precondición real del DOM doble');
    await assert.rejects(() => api.keyboardSequence(model.cdp, 'login', order, viewport, mobile), (error: unknown) => {
      assert.ok(error instanceof assert.AssertionError, 'M1 BODY tabulable: rechazo conductual, no bootstrap');
      assert.match(error.message, /^M1 document boundary /,
        'M1 BODY tabulable debe fallar por guard documental, no T1 reverse:theme');
      assert.equal((error as assert.AssertionError & { documentBoundaryAssertion?: string }).documentBoundaryAssertion,
        `M1 document boundary ${viewport}/login:inventory`,
        'M1 BODY tabulable conserva el ID documental cerrado del runner');
      return true;
    }, `M1 BODY tabulable debe rechazar antes del ancla y primer ShiftTab ${viewport}/login`);
    assert.deepEqual(model.events, [], 'M1 precondición BODY se evalúa antes de todo input nativo');
  });
}

const states = {
  login: 'loginOrder', request: 'requestOrder', 'update-ready': 'updateOrder',
  'update-invalid': 'invalidOrder', 'update-error': 'updateOrder', 'signout-error': 'retryOrder',
};
for (const mobile of [true, false]) {
  const viewport = mobile ? '390x844' : '1440x900';
  for (const [state, orderName] of Object.entries(states)) {
    const order: string[] = Array.from(api.orders[orderName]);
    test(`M1 document boundary normal ${viewport}/${state}: contrato sano resuelve`, async () => {
      const model = browser(order, 'none');
      await assert.doesNotReject(() => api.keyboardSequence(model.cdp, state, order, viewport, mobile));
      assert.equal(model.active(), 'theme', 'M1 contrato conserva la parada final declarada');
      assert.deepEqual(model.focusable(), order, 'M1 fixture sana sin trampas');
      assert.ok(model.events.some(({ method }) => method === (mobile ? 'Input.dispatchTouchEvent' : 'Input.dispatchMouseEvent')),
        'M1 titleAnchor real usa input según viewport');
      assert.ok(order.every(name => model.visited.includes(name)), 'M1 pasos reales visitaron todos los controles');
      assert.equal(model.visited.filter(name => name === 'outside-before').length, 1, 'M1 salida nativa al comienzo');
      assert.equal(model.visited.filter(name => name === 'outside-after').length, 1, 'M1 salida nativa al final');
    });

    for (const trap of ['body-before', 'body-after', 'body-self'] as const) {
      test(`M1 document boundary ${trap} ${viewport}/${state}`, async () => {
        const model = browser(order, trap);
        const trapName = trap === 'body-self' ? 'body' : trap;
        assert.deepEqual(model.focusable(), trap === 'body-after' ? [...order, trapName] : [trapName, ...order],
          'M1 precondición: trampa real en el orden de Tab del documento');
        await assert.rejects(() => api.keyboardSequence(model.cdp, state, order, viewport, mobile), (error: unknown) => {
          assert.ok(error instanceof assert.AssertionError, 'M1 rechazo por assertion, no bootstrap/reference/timeout');
          assert.match(error.message, /M1 document boundary/, 'M1 guard identifica frontera del documento');
          assert.ok(error.message.includes(viewport) && error.message.includes(state), 'M1 guard identifica viewport/state');
          return true;
        }, `M1 document boundary ${trap} ${viewport}/${state}: foco fuera del contrato debe rechazarse`);
      });
    }
  }
}
