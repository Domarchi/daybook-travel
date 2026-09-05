import test from 'node:test';
import assert from 'node:assert/strict';
import {pulseDates,addDays} from './calendar.ts';
test('lunes y jueves durante cambio horario de Chile',()=>{assert.deepEqual(pulseDates('2026-09-07','2026-09-17'),[{date:'2026-09-07',direction:'SUBIDA'},{date:'2026-09-10',direction:'BAJADA'},{date:'2026-09-14',direction:'SUBIDA'},{date:'2026-09-17',direction:'BAJADA'}]);});
test('respeta fin de vigencia parcial',()=>assert.deepEqual(pulseDates('2026-09-07','2026-09-09'),[{date:'2026-09-07',direction:'SUBIDA'}]));
test('rechaza ancla incorrecta y período invertido',()=>{assert.throws(()=>pulseDates('2026-09-08','2026-09-17'));assert.throws(()=>pulseDates('2026-09-14','2026-09-07'));});
test('cruza mes y año sin corrimiento horario',()=>{assert.equal(addDays('2026-12-31',1),'2027-01-01');assert.equal(addDays('2028-02-28',1),'2028-02-29');});
