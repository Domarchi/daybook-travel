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
  return receipts;
}

export async function main() {
  const recovery=await import('./browser-recovery.mjs');
  await recovery.main({runMutants:exerciseTabMutants});
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) {
    console.error(error instanceof assert.AssertionError ? error.message : 'T1 mutantes: fallo de infraestructura (detalle omitido)');
    process.exitCode=1;
  }
}
