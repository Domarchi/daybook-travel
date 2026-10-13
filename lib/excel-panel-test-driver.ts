// Node integration driver: executes the real panel event handlers with synthetic
// hooks and JSX, not a browser. Browser coverage lives in scripts/.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import writeXlsxFile from "write-excel-file/node";
import readXlsxFile, { readSheetNames } from "read-excel-file/node";
import * as excel from "./excel-sync.ts";
import * as queue from "./travel-ai-queue.ts";
import type { TravelAiQueueRpcClient } from "./travel-ai-queue.ts";

type Element = { type: unknown; props: Record<string, unknown> };
export async function workbook(matrices: string[][][], names: string[]) {
  const buffer = await writeXlsxFile(matrices.map(matrix => matrix.map(row => row.map(value => ({ value, type: String })))), { sheets: names, buffer: true });
  return new File([new Uint8Array(buffer)], "synthetic.xlsx");
}

export async function panelDriver(client: TravelAiQueueRpcClient, options: { deferChangeUpdates?: boolean } = {}) {
  const source = await readFile(new URL("../app/excel-sync-panel.tsx", import.meta.url), "utf8");
  const realRequire = createRequire(import.meta.url);
  const babel = realRequire("next/dist/compiled/babel/core");
  const compiled = babel.transformSync(source, {
    filename: "excel-sync-panel.tsx", configFile: false, babelrc: false,
    presets: [[realRequire("next/dist/compiled/babel/preset-typescript"), { allExtensions: true, isTSX: true }], [realRequire("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }], [realRequire("next/dist/compiled/babel/preset-env"), { targets: { node: "24" }, modules: "commonjs" }]],
  }).code;
  const hooks: unknown[] = [];
  let cursor = 0;
  let dispatchingChange = false;
  const pendingChanges: (() => void)[] = [];
  const react = {
    useState(value: unknown) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = value;
      return [hooks[index], (next: unknown) => {
        const update = () => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; };
        if (dispatchingChange) pendingChanges.push(update);
        else update();
      }];
    },
    useRef(value: unknown) { const index = cursor++; return hooks[index] ??= { current: value }; },
    useMemo(fn: () => unknown) { return fn(); },
  };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const modules: Record<string, unknown> = {
    react, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "../lib/supabase": { db: () => client },
    "../lib/excel-sync": excel, "../lib/travel-ai-queue": queue,
    "@/lib/utils": { cn: (...parts: string[]) => parts.join(" ") },
    "@/lib/brand": {}, "@/lib/format": { localDate: () => "2026-11-12" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/section-kicker": { SectionKicker: "small" },
    "@/components/ui/table-wrap": { TableWrap: "div" },
    "@/components/ui/data-table": { TBody: "tbody", THead: "thead", Table: "table", Td: "td", Th: "th", Tr: "tr" },
    "lucide-react": new Proxy({}, { get: () => "svg" }),
    "read-excel-file": { __esModule: true, default: async (file: File, options: {sheet: string}) => readXlsxFile(Buffer.from(await file.arrayBuffer()), options), readSheetNames: async (file: File) => readSheetNames(Buffer.from(await file.arrayBuffer())) },
  };
  const exports: { default?: (props: unknown) => Element } = {};
  new Function("require", "exports", compiled)((name: string) => modules[name] ?? realRequire(name), exports);
  function render() { cursor = 0; return exports.default!({ people: [], trips: [], demo: false, onClose() {}, onApplied() {}, rpcClient: client }); }
  function all(): Element[] {
    const found: Element[] = [];
    function visit(node: unknown) {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (node && typeof node === "object" && "props" in node) { const el = node as Element; found.push(el); visit(el.props.children); }
    }
    visit(render()); return found;
  }
  function text(node: unknown): string {
    if (Array.isArray(node)) return node.map(text).join("");
    if (node && typeof node === "object" && "props" in node) return text((node as Element).props.children);
    return typeof node === "string" || typeof node === "number" ? String(node) : "";
  }
  async function settle() {
    for (let i = 0; i < 200; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      const content = text(render());
      if (!content.includes("Estamos comprobando") && !content.includes("Interpretando…")) return;
    }
    throw new Error("Panel event did not settle");
  }
  return {
    all, settle, invoke(label: string) { return (this.find(label).props.onClick as () => unknown)(); }, text: () => text(render()),
    find(label: string) { const el = all().find(el => el.props["aria-label"] === label || el.type === "button" && text(el.props.children) === label); if (!el) throw new Error(`Missing UI: ${label}`); return el; },
    async click(label: string) { const el = this.find(label); if (!el.props.disabled) await (el.props.onClick as () => unknown)(); await settle(); },
    // Opt-in dispatch lifetime: no updater runs until currentTarget has expired.
    // The default synchronous mode alone cannot cover deferred React updates.
    flushChanges() { while (pendingChanges.length) pendingChanges.shift()!(); },
    change(label: string, value: string | boolean) {
      const el = this.find(label);
      const event: { currentTarget: { value: string | boolean; checked: string | boolean } | null } = { currentTarget: { value, checked: value } };
      dispatchingChange = options.deferChangeUpdates === true;
      try { (el.props.onChange as (e: unknown) => void)(event); }
      finally {
        dispatchingChange = false;
        if (options.deferChangeUpdates) event.currentTarget = null;
      }
    },
    async upload(file: File) { const input = all().find(el => el.type === "input" && el.props.type === "file")!; await (input.props.onChange as (e: unknown) => unknown)({ currentTarget: { files: [file] }, target: { files: [file] } }); await settle(); },
  };
}
