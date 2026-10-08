import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const workflow = await readFile(new URL('.github/workflows/ci.yml', root), 'utf8');

test('D1 CI declara Ubuntu 22.04 para ejecutar las gates browser con sandbox real', () => {
  assert.match(
    workflow,
    /^  verify:\n    runs-on: ubuntu-22\.04\n[\s\S]*?^      - run: npm run test:browser$[\s\S]*?^      - run: npm run test:browser:recovery$/m,
    'D1 las gates browser y recovery deben seguir en el job con runner compatible con sandbox',
  );
  assert.doesNotMatch(
    workflow,
    /--(?:no-sandbox|disable-setuid-sandbox)\b/,
    'D1 CI no debe pedir que Chrome desactive su sandbox',
  );
});
