import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8')) as { scripts?: Record<string, string> };
const workflow = await readFile(new URL('.github/workflows/ci.yml', root), 'utf8');

test('D1 CI ejecuta la gate recovery con mutantes Tab, sin una segunda suite recovery', () => {
  assert.equal(
    packageJson.scripts?.['test:browser:recovery'],
    'node scripts/browser-recovery-tab-mutants.mjs',
    'D1 la gate recovery pública debe invocar los mutantes Tab reales',
  );
  assert.match(workflow, /^      - run: npm run test:browser:recovery$/m,
    'D1 CI debe invocar la gate recovery pública');
  assert.doesNotMatch(workflow, /^      - run: node scripts\/browser-recovery(?:-tab-mutants)?\.mjs$/m,
    'D1 CI no debe duplicar baseline y mutantes fuera de la gate pública');
});
