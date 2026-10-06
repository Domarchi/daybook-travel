// Diagnóstico LOCAL de esta tarea, sólo supervisor. Importar no ejecuta main.
// No normaliza DOM/config ni cambia el resultado de evaluate o la assertion M1.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main as recoveryMain } from './browser-recovery.mjs';
import { Cdp, pressTab } from './browser-login.mjs';

const EVIDENCE='/home/domarchithinkpad/.hermes/cache/scratch/password-recovery-review-close-20261006/travel';
// Catálogos del source actual; nunca serializar el message/stack del error.
const safeStates='(?:login|login-error|request|request-light|request-submit|request-success|request-error|login-return|request-cooldown|update-invalid|request-from-invalid|login-from-invalid|update-ready|update-light|update-policy|update-mismatch|update-submit|update-error|login-after-retry|signout-error|login-after-update|login-query-session)';
const safeStops='(?:theme|email|password|login|request|demo|submit|newPassword|confirmation|newLink|back|retry)';
const documentAssertion=new RegExp(`^M1 document boundary (?:390x844|1440x900)/${safeStates}:(?:inventory|end-forward|end-reverse|begin-reverse|begin-forward)$`);
const tabAssertion=new RegExp(`^T1:(?:390x844|1440x900):${safeStates}:(?:forward|reverse):${safeStops}$`);
// Literales contrastados con documentInventory/documentBoundaryStep actuales.
const inventoryPrefix='(() => {\n    const names=';
const exitBoolean='document.activeElement === document.body && document.body.tabIndex < 0 && !document.body.isContentEditable';
const inventoryNames=new Set(['theme','email','password','login','request','demo',
  'submit','newPassword','confirmation','newLink','back','retry','unexpected']);

// Sólo datos estructurales cerrados. No texto, valores de atributos/campos,
// outerHTML, URLs, IDs de contexto/request ni errores raw salen del navegador.
function structuralExpression(selectors, order) {
  return `(() => {
  const stops=${JSON.stringify(selectors)}, order=${JSON.stringify(order)};
  const stopCategory=element => {
    if (element === document.body) return 'BODY';
    const matches=order.filter(name => {
      const nodes=document.querySelectorAll(stops[name]);
      return nodes.length === 1 && element === nodes[0];
    });
    return matches.length === 1 ? matches[0] : 'unknown';
  };
  const tags=new Set(['HTML','HEAD','BODY','MAIN','DIV','SPAN','FORM','LABEL',
    'INPUT','BUTTON','A','SELECT','TEXTAREA','SECTION','NAV','HEADER','FOOTER',
    'ASIDE','H1','H2','P','UL','LI','SVG','PATH','IFRAME','SUMMARY','DETAILS',
    'DIALOG','SLOT','NEXTJS-PORTAL']);
  const tag=element => !element ? null : tags.has(element.tagName)
    ? element.tagName : element.tagName?.includes('-') ? 'CUSTOM-ELEMENT' : 'OTHER';
  const attributes=new Set(['id','class','style','type','name','value','tabindex',
    'disabled','hidden','inert','href','role','title','contenteditable','autocomplete',
    'aria-label','aria-expanded','aria-haspopup','aria-controls','aria-hidden',
    'aria-disabled','aria-live','aria-describedby','aria-invalid','aria-required',
    'data-indicator-status','data-nextjs-dev-tools-button','data-nextjs-dialog',
    'data-nextjs-dialog-overlay','data-nextjs-toast','data-nextjs-toast-wrapper']);
  const ancestry=element => {
    const result=[];
    for (let node=element.parentElement ?? element.getRootNode().host; node;) {
      result.push(tag(node));
      node=node.parentElement ?? node.getRootNode().host;
    }
    return result;
  };
  const shadowHosts=element => {
    const result=[];
    for (let host=element.getRootNode().host; host; host=host.getRootNode().host) result.push(tag(host));
    return result;
  };
  const inert=element => {
    for (let node=element; node; node=node.parentElement ?? node.getRootNode().host) {
      if (node.hasAttribute('inert')) return true;
    }
    return false;
  };
  const describe=element => {
    const names=element.getAttributeNames();
    const visibility=getComputedStyle(element).visibility;
    const label=element.getAttribute('aria-label');
    return {tagName:tag(element),tabIndex:element.tabIndex,stopCategory:stopCategory(element),
      isContentEditable:element.isContentEditable === true,
      visibility:['visible','hidden','collapse'].includes(visibility) ? visibility : 'other',
      rendered:element.getClientRects().length > 0,enabled:!element.matches(':disabled'),
      inert:inert(element),ancestryTags:ancestry(element),shadowHostTags:shadowHosts(element),
      attributeNames:names.filter(name => attributes.has(name)).sort(),
      otherAttributeNameCount:names.filter(name => !attributes.has(name)).length,
      ariaLabelCategory:label === 'Open Next.js Dev Tools' ? 'vendorNextDevToolsOpen'
        : label === null ? 'absent' : 'other'};
  };
  const candidates=[];
  const visit=root => {
    for (const element of root.querySelectorAll('*')) {
      if (element.tabIndex >= 0 || element.isContentEditable && element.getAttribute('tabindex') === null) {
        candidates.push(describe(element));
      }
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(document);
  const shadowActiveTags=[];
  let active=document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active=active.shadowRoot.activeElement;
    shadowActiveTags.push(tag(active));
  }
  return {hasFocus:document.hasFocus(),activeElementTag:tag(document.activeElement),activeStopCategory:stopCategory(active),
    shadowActiveTags,deepActive:active ? describe(active) : null,candidates};
})()`;
}

export async function main() {
  // Sólo declaración REAL de selectores; nunca importar/ejecutar otro main.
  const source=await readFile(new URL('./browser-recovery.mjs',import.meta.url),'utf8');
  const declaration=source.match(/^const stops = \{[^]*?^};/m)?.[0];
  assert.ok(declaration,'M1 probe: catálogo real de selectores disponible');
  const selectors=runInNewContext(declaration+'\n;stops');
  assert.ok(Object.keys(selectors).length === inventoryNames.size-1
    && Object.entries(selectors).every(([name,selector]) => name !== 'unexpected'
      && inventoryNames.has(name) && typeof selector === 'string'),'M1 probe: catálogo cerrado de selectores');
  const receipt={kind:'M1-document-structural-probe',version:5,diagnosticOnly:true,
    result:'diagnostic-only',certifiesGreen:false,inventoryObserved:false,
    inventoryCount:null,unexpectedCount:null,originalInventory:null,
    before:null,afterNativeTab:null,boundaryObservations:[],
    harnessBoundary:{selectorBooleanExactEvaluated:false,selectorCategory:'document-exit',
      edge:'end-forward',originalBooleanResult:null},
    nativeInput:{method:'Input.dispatchKeyEvent',key:'Tab',modifiers:0,
      types:['rawKeyDown','keyUp'],attempted:false,completed:false},
    diagnosticError:null,recoveryCompleted:false,originalGuardFailed:false,
    originalGuardId:null,originalGuardKind:null,recoveryOutcome:'not-started'};
  const originalEvaluate=Cdp.prototype.evaluate;
  const boundaryContexts=new WeakMap();
  let inventoryOrdinal=0;
  let failure;
  Cdp.prototype.evaluate=async function(expression) {
    // Siempre ejecutar primero el evaluate REAL y devolver SU MISMO resultado.
    // Si evaluate rechaza, su error se propaga sin interceptarlo.
    const value=await originalEvaluate.call(this,expression);
    const inventory=typeof expression === 'string'
      && expression.startsWith(inventoryPrefix)
      && expression.includes(', elements=[];') && expression.includes('visit(document);');
    if (inventory) boundaryContexts.set(this,{inventoryOrdinal:++inventoryOrdinal,exitOrdinal:0,
      inventoryExpression:expression,
      order:Array.isArray(value) ? [...new Set(value.filter(name => name !== 'unexpected' && inventoryNames.has(name)))] : []});
    const context=boundaryContexts.get(this);
    const structureExpression=structuralExpression(selectors,context?.order ?? []);
    if (!receipt.inventoryObserved && inventory) {
      receipt.inventoryObserved=true;
      if (Array.isArray(value)) {
        receipt.inventoryCount=value.length;
        receipt.unexpectedCount=value.filter(name => name === 'unexpected').length;
        if (value.every(name => inventoryNames.has(name))) receipt.originalInventory=[...value];
      }
      try {
        receipt.before=await originalEvaluate.call(this,structureExpression);
      } catch {
        // Sólo código cerrado; el guard original aún recibe el array intacto.
        receipt.diagnosticError='structure-before';
      }
    } else if (expression === exitBoolean) {
      // CADA evaluate de salida, después del input y resultado REALES, incluso
      // false. El source llama end-forward y luego begin-reverse por inventario.
      const exitOrdinal=context ? ++context.exitOrdinal : null;
      const observation={ordinal:receipt.boundaryObservations.length+1,
        inventoryOrdinal:context?.inventoryOrdinal ?? null,exitOrdinal,
        edge:exitOrdinal === 1 ? 'end-forward' : exitOrdinal === 2 ? 'begin-reverse' : 'unattributed',
        edgeBasis:'source-order-after-inventory',selectorBooleanExactEvaluated:true,
        originalBooleanResult:value === true ? 'success' : value === false ? 'failure' : 'non-boolean',
        structure:null,diagnosticError:null,addedDiagnosticTabs:[]};
      receipt.boundaryObservations.push(observation);
      try { observation.structure=await originalEvaluate.call(this,structureExpression); }
      catch {
        observation.diagnosticError='structure-after-harness-boundary';
        receipt.diagnosticError='structure-after-harness-boundary';
      }
      // Mantener los campos de la PRIMERA frontera para comparar recibos viejos;
      // no limitan la captura de fronteras posteriores en boundaryObservations.
      if (!receipt.harnessBoundary.selectorBooleanExactEvaluated) {
        receipt.harnessBoundary.selectorBooleanExactEvaluated=true;
        receipt.harnessBoundary.originalBooleanResult=observation.originalBooleanResult;
        receipt.afterNativeTab=observation.structure;
      }
      // Sólo después de un false REAL ya destinado a fallar. Dos pasos fijos,
      // nunca búsqueda de foco ni continuación del harness con un éxito falso.
      if (value === false && observation.structure && context) {
        for (const ordinal of [1,2]) {
          const step={ordinal,addedDiagnosticInput:true,afterOriginalPredicate:'failure',
            method:'Input.dispatchKeyEvent',key:'Tab',modifiers:0,types:['rawKeyDown','keyUp'],
            attempted:true,completed:false,structure:null,inventory:null,diagnosticError:null};
          observation.addedDiagnosticTabs.push(step);
          let stage='added-native-tab';
          try {
            await pressTab(this,false);
            step.completed=true;
            stage='added-tab-structure';
            step.structure=await originalEvaluate.call(this,structureExpression);
            stage='added-tab-inventory';
            const current=await originalEvaluate.call(this,context.inventoryExpression);
            if (!Array.isArray(current) || !current.every(name => inventoryNames.has(name))) {
              step.diagnosticError='added-tab-inventory-shape';
              break;
            }
            step.inventory={names:current,count:current.length,
              unexpectedCount:current.filter(name => name === 'unexpected').length};
          } catch {
            step.diagnosticError=stage;
            break; // No más input tras error; el false original sigue intacto.
          }
        }
      }
    }
    return value;
  };
  try {
    await recoveryMain(); // Su finally original conserva teardown.
    receipt.recoveryCompleted=true;
    receipt.recoveryOutcome='unexpected-completion';
  } catch (error) {
    failure=error;
    if (error instanceof assert.AssertionError) {
      if (typeof error.documentBoundaryAssertion === 'string' && documentAssertion.test(error.documentBoundaryAssertion)) {
        receipt.originalGuardId=error.documentBoundaryAssertion;
        receipt.originalGuardKind='document-boundary';
      } else if (typeof error.tabAssertion === 'string' && tabAssertion.test(error.tabAssertion)) {
        receipt.originalGuardId=error.tabAssertion;
        receipt.originalGuardKind='tab';
      }
    }
    receipt.originalGuardFailed=receipt.originalGuardId !== null;
    receipt.recoveryOutcome=receipt.originalGuardKind === 'document-boundary' ? 'm1-document-boundary'
      : receipt.originalGuardKind === 'tab' ? 't1-tab'
      : error instanceof assert.AssertionError ? 'other-assertion' : 'infrastructure';
  } finally {
    Cdp.prototype.evaluate=originalEvaluate;
    const filename=`m1-document-probe-${randomUUID()}.json`;
    await writeFile(join(EVIDENCE,filename),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(`M1 diagnostic-only receipt: ${filename}`);
  }
  if (failure) throw failure; // Mismo error M1, nunca un sustituto exitoso.
  return receipt;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch { console.error('M1 probe: fallo original conservado; consultar recibo sanitizado'); }
  process.exitCode=1; // Incluso un completion inesperado NO certifica GREEN.
}
