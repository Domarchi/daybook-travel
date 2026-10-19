import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

// Read the actual call-site expressions without importing the browser entrypoint.
// No Next server, Chrome, sockets, or fixture project is started by these tests.
const source = await readFile(new URL("./travel-excel-import-browser.mjs", import.meta.url), "utf8");
const literal = String.raw`(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\x60(?:\\.|[^\x60\\])*\x60)`;
const calls = [...source.matchAll(new RegExp(String.raw`await waitUntil\(cdp,\s*(${literal}),\s*(${literal})\)`, "g"))];
const predicates = calls.map(([, expression, label]) => ({
  expression: runInNewContext(expression),
  label: runInNewContext(label),
}));

function documentFixture(ready) {
  const element = { textContent: ready ? "1" : "0" };
  // A React-owned DOM node cannot be serialized by value through CDP.
  element.__reactFiber = { stateNode: element, return: { child: element } };
  return {
    element,
    document: {
      body: { textContent: ready ? "Interpretación lista Revisión local completada" : "" },
      querySelector(selector) {
        if (selector === "#fake-applied") return element;
        assert.ok([
          "[data-import-ready=true] input[type=file]",
          '[aria-label="Fila de encabezados"]',
        ].includes(selector), `Uninspected selector: ${selector}`);
        return ready ? element : null;
      },
    },
  };
}

test("the regression audits every waitUntil predicate", () => {
  assert.equal(predicates.length, 13);
  assert.equal(calls.length, [...source.matchAll(/await waitUntil\(/g)].length);
});

test("the ready DOM fixture has a circular React-owned reference", () => {
  assert.throws(() => JSON.stringify(documentFixture(true).element), /circular/i);
});

for (const { expression, label } of predicates) {
  test(`${label}: readiness is a primitive Boolean for both states`, () => {
    for (const ready of [false, true]) {
      const { document } = documentFixture(ready);
      const value = runInNewContext(expression, { document });
      assert.equal(typeof value, "boolean", `${label} must not return a DOM object or null`);
      assert.equal(value, ready);
      assert.equal(JSON.stringify(value), ready ? "true" : "false");
    }
  });
}

const keyboardHelper = source.match(/async function nextByKeyboard\(name\) \{[\s\S]*?\n    \}/)?.[0];
assert.ok(keyboardHelper, "the native pagination keyboard helper must be audited");
for (const focused of [true, false]) {
  test(`pagination Enter requires focus and a complete native key sequence (focused=${focused})`, async () => {
    const events = [];
    const context = {
      assert, ui: label => `[aria-label="${label}"]`, delay: async () => {},
      cdp: {
        evaluate: async () => focused,
        send: async (method, params) => { events.push({ method, params }); },
      },
    };
    const execution = runInNewContext(`(${keyboardHelper})("Filas siguientes")`, context);
    if (!focused) {
      await assert.rejects(execution, /pager must receive keyboard focus/);
      assert.deepEqual(events, []);
      return;
    }
    await execution;
    assert.deepEqual(events.map(event => event.params.type), ["rawKeyDown", "char", "keyUp"]);
    assert.equal(events[1].params.text, "\r");
    assert.equal(events[1].params.unmodifiedText, "\r");
    for (const event of events) {
      assert.equal(event.method, "Input.dispatchKeyEvent");
      assert.equal(event.params.key, "Enter");
      assert.equal(event.params.nativeVirtualKeyCode, 13);
    }
  });
}
