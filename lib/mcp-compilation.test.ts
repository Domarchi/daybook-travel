import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCompilationIssues} from './mcp-compilation.ts';
const response = (body: unknown) => ({content:[{type:'text',text:JSON.stringify(body)}]});
test('MCP sólo certifica un array issues obtenido y vacío', () => {
  assert.doesNotThrow(() => assertCompilationIssues(response({issues:[]})));
  for (const invalid of [undefined, {}, {tools:[]}, response({}), response({error:'unavailable'}), response({issues:[{severity:'error'}]}), {isError:true,...response({issues:[]})}]) {
    assert.throws(() => assertCompilationIssues(invalid), 'catálogo, error o issues reales no son éxito');
  }
});
