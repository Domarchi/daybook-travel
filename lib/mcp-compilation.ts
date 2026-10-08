import assert from 'node:assert/strict';

// Frontera de diagnóstico: no basta con recibir HTTP 200 ni un catálogo.
export function assertCompilationIssues(result: unknown): void {
  assert.ok(result && typeof result === 'object' && 'content' in result, 'MCP sin resultado de issues');
  assert.ok(!('isError' in result && result.isError), 'MCP devolvió un error');
  assert.ok(Array.isArray(result.content), 'MCP sin contenido');
  const payload = result.content.find(item => item && typeof item === 'object' && item.type === 'text');
  let data;
  try { data = JSON.parse(payload?.text); } catch { assert.fail('MCP sin JSON de issues'); }
  assert.ok(Array.isArray(data?.issues), 'MCP no obtuvo issues');
  assert.equal(data.issues.length, 0, 'MCP detectó issues de compilación');
}
