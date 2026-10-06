// Importable sin ejecutar navegador, shell, red ni escrituras. Sólo el supervisor
// invoca main. Mutaciones privadas del DOM; nunca modifica archivos del checkout.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const states = new Set([
  'login','login-error','request','request-success','request-error','request-cooldown',
  'update-ready','update-invalid','update-policy','update-mismatch','update-error','signout-error',
]);

export async function exerciseTabMutants({cdp,state,order,stops,viewport,certify}) {
  if (!states.has(state)) return [];
  const receipts = [];
  for (let index=0; index<order.length; index++) {
    const name=order[index], selector=stops[name];
    // remove conserva el nodo y lo quita sólo del tab order. reorder intercambia
    // dos nodos vecinos del contrato conservando objetos/listeners de React.
    for (const mutation of ['remove', ...(index+1<order.length ? ['reorder'] : [])]) {
      const peer=mutation === 'reorder' ? stops[order[index+1]] : null;
      const id=`${viewport}:${state}:${mutation}-${name}`;
      const expectedAssertion=`T1:${viewport}:${state}:${index === 0 ? 'reverse' : 'forward'}:${name}`;
      let applied=false, killed=false, restored=false;
      try {
        const installed=await cdp.evaluate(`(() => {
          if (window.__travelTabMutation) return false;
          const targets=document.querySelectorAll(${JSON.stringify(selector)});
          const peers=${peer ? `document.querySelectorAll(${JSON.stringify(peer)})` : '[]'};
          if (targets.length !== 1 || ${Boolean(peer)} && peers.length !== 1) return false;
          const target=targets[0], peer=peers[0] ?? null;
          const main=document.querySelector('main');
          const before=main.outerHTML;
          const tabindex=target.getAttribute('tabindex');
          const markers=[];
          if (peer) {
            const a=document.createComment('t1-a'), b=document.createComment('t1-b');
            target.before(a); peer.before(b);
            a.after(peer); b.after(target);
            markers.push(a,b);
          } else target.setAttribute('tabindex','-1');
          window.__travelTabMutation={target,peer,markers,tabindex,before,main};
          return true;
        })()`);
        assert.equal(installed,true,`T1 ${id}: mutation site único disponible`);
        applied=true;
        try { await certify(); }
        catch (error) {
          // Un timeout o una assertion diferente no cuentan como muerte.
          if (!(error instanceof assert.AssertionError) || error.tabAssertion !== expectedAssertion) throw error;
          killed=true;
        }
        assert.equal(killed,true,`T1 ${id}: mutante sobrevivió ${expectedAssertion}`);
      } finally {
        if (applied) {
          restored=await cdp.evaluate(`(() => {
            const saved=window.__travelTabMutation;
            if (!saved) return false;
            const {target,peer,markers,tabindex,before,main}=saved;
            if (peer) {
              markers[0].after(target); markers[1].after(peer);
              markers.forEach(marker => marker.remove());
            } else if (tabindex === null) target.removeAttribute('tabindex');
            else target.setAttribute('tabindex',tabindex);
            delete window.__travelTabMutation;
            return main.outerHTML === before;
          })()`);
          assert.equal(restored,true,`T1 ${id}: restauración privada byte a byte`);
        }
      }
      // Repro sano después de CADA restauración. No basta cerrar el documento.
      await certify();
      receipts.push({id,site:{selector,operation:mutation === 'remove' ? 'tabindex=-1' : 'swap-nodes',peer},
        assertion:expectedAssertion,killed,restored});
      console.log(`✓ T1 mutant ${id}: ${expectedAssertion}; restaurado`);
    }
  }
  for (const mutation of ['body-before','body-after','body-tabindex0']) {
    const id=`${viewport}:${state}:${mutation}`;
    const expectedAssertion=`M1 document boundary ${viewport}/${state}:inventory`;
    let applied=false, killed=false, restored=false;
    try {
      const installed=await cdp.evaluate(`(() => {
        if (window.__travelTabMutation || window.__travelBoundaryMutation) return false;
        if (document.querySelectorAll('main').length !== 1) return false;
        const body=document.body, before=body.cloneNode(true).outerHTML;
        const tabindex=body.getAttribute('tabindex');
        const mutation=${JSON.stringify(mutation)};
        const node=mutation === 'body-tabindex0' ? null : document.createElement('button');
        window.__travelBoundaryMutation={body,before,tabindex,node};
        if (node) {
          node.type='button'; node.textContent='M1';
          node.setAttribute('data-travel-boundary-trap',mutation);
          node.style.cssText='position:fixed;top:0;left:0;width:24px;height:24px';
          if (mutation === 'body-before') body.prepend(node);
          else body.append(node);
        } else body.setAttribute('tabindex','0');
        return true;
      })()`);
      assert.equal(installed,true,`M1 ${id}: mutation site único disponible`);
      applied=true;
      try { await certify(); }
      catch (error) {
        if (!(error instanceof assert.AssertionError) || error.documentBoundaryAssertion !== expectedAssertion) throw error;
        killed=true;
      }
      assert.equal(killed,true,`M1 ${id}: mutante sobrevivió ${expectedAssertion}`);
    } finally {
      if (applied) {
        restored=await cdp.evaluate(`(() => {
          const saved=window.__travelBoundaryMutation;
          if (!saved) return false;
          const {body,before,tabindex,node}=saved;
          if (node) node.remove();
          else if (tabindex === null) body.removeAttribute('tabindex');
          else body.setAttribute('tabindex',tabindex);
          delete window.__travelBoundaryMutation;
          return document.body === body && body.outerHTML === before;
        })()`);
        assert.equal(restored,true,`M1 ${id}: restauración privada byte a byte`);
      }
    }
    await certify();
    receipts.push({id,site:{selector:'body',operation:mutation},assertion:expectedAssertion,killed,restored});
    console.log(`✓ M1 mutant ${id}: ${expectedAssertion}; restaurado`);
  }
  return receipts;
}

export async function main() {
  // Contrato explícito de los 176 mutantes originales: no basta un total que
  // pudiera ocultar duplicados, estados omitidos o assertions intercambiadas.
  const login=['theme','email','password','login','request','demo'];
  const cooldown=['theme','email','back'];
  const update=['theme','newPassword','confirmation','submit','back'];
  const orders={login,'login-error':login,request:['theme','email','submit','back'],
    'request-success':cooldown,'request-error':cooldown,'request-cooldown':cooldown,
    'update-ready':update,'update-invalid':['theme','newLink','back'],
    'update-policy':update,'update-mismatch':update,'update-error':update,'signout-error':['theme','retry']};
  const expectedT1=[], expectedM1=[], measured=[];
  for (const viewport of ['390x844','1440x900']) {
    for (const [state,order] of Object.entries(orders)) {
      for (const [index,name] of order.entries()) {
        for (const mutation of ['remove',...(index+1<order.length ? ['reorder'] : [])]) {
          expectedT1.push(`${viewport}:${state}:${mutation}-${name}|T1:${viewport}:${state}:${index === 0 ? 'reverse' : 'forward'}:${name}`);
        }
      }
      for (const mutation of ['body-before','body-after','body-tabindex0']) {
        expectedM1.push(`${viewport}:${state}:${mutation}|M1 document boundary ${viewport}/${state}:inventory`);
      }
    }
  }
  const recovery=await import('./browser-recovery.mjs');
  await recovery.main({runMutants:async options => {
    const receipts=await exerciseTabMutants(options);
    measured.push(...receipts);
    return receipts;
  }});
  assert.equal(expectedT1.length,176,'T1 catálogo original 176');
  assert.equal(expectedM1.length,72,'M1 catálogo 3 trampas × 12 estados × 2 viewports');
  assert.equal(new Set(measured.map(receipt => receipt.id)).size,248,'T1+M1 248 mutantes distintos');
  assert.deepEqual(measured.map(receipt => `${receipt.id}|${receipt.assertion}`).sort(),
    [...expectedT1,...expectedM1].sort(),'T1+M1 catálogo completo y assertions exactas');
  assert.ok(measured.every(receipt => receipt.killed && receipt.restored),'T1+M1 muertes y restauraciones completas');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) {
    console.error(error instanceof assert.AssertionError ? error.message : 'T1 mutantes: fallo de infraestructura (detalle omitido)');
    process.exitCode=1;
  }
}
