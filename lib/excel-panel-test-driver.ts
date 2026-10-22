// Adaptado del driver de PR6: handlers reales con hooks/JSX sintéticos en Node.
// No es un navegador ni una integración con Supabase. No abre red ni servicios.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import writeXlsxFile from "write-excel-file/node";
import readXlsxFile, { readSheetNames } from "read-excel-file/node";
import * as excel from "./excel-sync.ts";
import type { ExcelSyncResult } from "./excel-sync.ts";

export type PanelElement = { type: unknown; props: Record<string, unknown> };
export type PanelRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{
    data: ExcelSyncResult | null;
    error: unknown;
  }>;
};

export async function workbook(matrices: string[][][], names: string[]) {
  const buffer = await writeXlsxFile(
    matrices.map(matrix => matrix.map(row => row.map(value => ({ value, type: String })))),
    { sheets: names, buffer: true },
  );
  return new File([new Uint8Array(buffer)], "synthetic.xlsx");
}

export function elementText(node: unknown): string {
  if (Array.isArray(node)) return node.map(elementText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return elementText((node as PanelElement).props.children);
  }
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

export async function panelDriver(client: PanelRpcClient) {
  const source = await readFile(new URL("../app/excel-sync-panel.tsx", import.meta.url), "utf8");
  const realRequire = createRequire(import.meta.url);
  const babel = realRequire("next/dist/compiled/babel/core");
  const compiled = babel.transformSync(source, {
    filename: "excel-sync-panel.tsx", configFile: false, babelrc: false,
    presets: [
      [realRequire("next/dist/compiled/babel/preset-typescript"), { allExtensions: true, isTSX: true }],
      [realRequire("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }],
      [realRequire("next/dist/compiled/babel/preset-env"), { targets: { node: "24" }, modules: "commonjs" }],
    ],
  }).code;
  const hooks: unknown[] = [];
  let cursor = 0;
  const react = {
    useState(value: unknown) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = value;
      return [hooks[index], (next: unknown) => {
        hooks[index] = typeof next === "function" ? next(hooks[index]) : next;
      }];
    },
    useRef(value: unknown) { const index = cursor++; return hooks[index] ??= { current: value }; },
    useMemo(fn: () => unknown) { return fn(); },
  };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const modules: Record<string, unknown> = {
    react, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "../lib/supabase": { db: () => client },
    "../lib/excel-sync": excel,
    "@/lib/utils": { cn: (...parts: string[]) => parts.join(" ") },
    "@/lib/brand": {}, "@/lib/format": { localDate: () => "2026-09-08" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/section-kicker": { SectionKicker: "small" },
    "@/components/ui/table-wrap": { TableWrap: "div" },
    "@/components/ui/data-table": { TBody: "tbody", THead: "thead", Table: "table", Td: "td", Th: "th", Tr: "tr" },
    "lucide-react": new Proxy({}, { get: () => "svg" }),
    "read-excel-file": {
      __esModule: true,
      default: async (file: File, options: { sheet: string }) => readXlsxFile(Buffer.from(await file.arrayBuffer()), options),
      readSheetNames: async (file: File) => readSheetNames(Buffer.from(await file.arrayBuffer())),
    },
  };
  const exports: { default?: (props: unknown) => PanelElement } = {};
  new Function("require", "exports", compiled)((name: string) => {
    if (!Object.hasOwn(modules, name)) throw new Error(`Módulo no permitido en la prueba: ${name}`);
    return modules[name];
  }, exports);
  function render() {
    cursor = 0;
    return exports.default!({ people: [], trips: [], demo: false, onClose() {}, onApplied() {} });
  }
  function all(): PanelElement[] {
    const found: PanelElement[] = [];
    function visit(node: unknown) {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (node && typeof node === "object" && "props" in node) {
        const element = node as PanelElement;
        found.push(element);
        visit(element.props.children);
      }
    }
    visit(render());
    return found;
  }
  async function settle() {
    for (let attempt = 0; attempt < 200; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      if (!/Estamos comprobando|Aplicando cambios/.test(elementText(render()))) return;
    }
    throw new Error("El handler del panel no terminó");
  }
  return {
    all,
    text: () => elementText(render()),
    find(label: string) {
      const element = all().find(element => element.props["aria-label"] === label
        || element.type === "button" && elementText(element.props.children) === label);
      if (!element) throw new Error(`Control ausente: ${label}`);
      return element;
    },
    async invoke(label: string) {
      await (this.find(label).props.onClick as () => unknown)();
      await settle();
    },
    async click(label: string) {
      if (!this.find(label).props.disabled) await this.invoke(label);
    },
    async upload(file: File) {
      const input = all().find(element => element.type === "input" && element.props.type === "file");
      if (!input) throw new Error("Selector de archivo ausente");
      await (input.props.onChange as (event: unknown) => unknown)({ target: { files: [file] } });
      await settle();
    },
  };
}
