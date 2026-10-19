"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileCheck2,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  Upload,
} from "lucide-react";
import { db } from "../lib/supabase";
import {
  PERSON_EXCEL_FIELDS,
  TRIP_EXCEL_FIELDS,
  buildExcelSyncPayload,
  issuePublicoAlLeerExcel,
  mensajePublicoExcel,
  type ExcelRow,
  type ExcelSyncPayload,
  type ExcelSyncResult,
  type ExcelSyncValidationError,
  type ExcelSyncEntity,
} from "../lib/excel-sync";
import {
  aplicarMapeo,
  construirSolicitudMapeo,
  esperarMapeoImportacion,
  solicitarMapeoImportacion,
  validarMapeo,
  type TravelImportMapping,
  type TravelAiQueueRpcClient,
  encabezadoConDatoPersonal,
  bytesUtf8,
} from "../lib/travel-ai-queue";
import type { Person, Trip } from "../lib/types";
import { Button } from "@/components/ui/button";
import { SectionKicker } from "@/components/ui/section-kicker";
import { TableWrap } from "@/components/ui/table-wrap";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { DAYBOOK_GOLD, cabeceraExcel, cargarLogo, logoParaExcel } from "@/lib/brand";
import { localDate } from "@/lib/format";

// Las dos zonas de contenido del panel comparten caja.
const ZONA = "grid gap-[18px] p-6 max-[760px]:gap-[14px] max-[760px]:px-4 max-[760px]:py-[18px]";

// El armazon del panel: ocupa el alto del dialogo y se desplaza por dentro.
const PANEL = "flex min-h-0 flex-1 flex-col overflow-y-auto bg-surface";

// Los titulos de las tres pantallas del panel.
const TITULO = "text-[18px] tracking-[-0.025em] text-foreground";

// Las tres cajitas de aviso: seguridad, mensaje suelto y nota de demostracion.
const AVISO = "rounded-sm border border-line bg-surface-soft text-[12px] text-foreground-soft";

// Las tarjetas de conteo, en el resumen y en la pantalla final.
const TARJETA = "grid min-h-[76px] content-center gap-px rounded-sm border border-line bg-surface px-3 py-[10px]";
const TARJETA_NUMERO = "text-[22px] leading-[1.1] tracking-[-0.03em]";

// Los tonos de las tarjetas y de las pastillas de accion. El gris es el estado
// en reposo: una cuenta en cero no se enciende.
const TONOS = {
  new: "border-[color-mix(in_srgb,var(--success)_38%,var(--border))] bg-[color-mix(in_srgb,var(--success)_9%,var(--surface))] text-success [&>strong]:text-inherit",
  change: "border-[color-mix(in_srgb,var(--warning)_38%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_9%,var(--surface))] text-warning [&>strong]:text-inherit",
  conflict: "border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_9%,var(--surface))] text-danger [&>strong]:text-inherit",
};

// Las celdas de la tabla de revision. En tarjeta esta tabla NO se parte en dos
// columnas como la de Viajes: cada dato va en su propia linea, con el titulo
// arriba, porque lo que se lee aqui es texto largo (nombres de hoja, mensajes)
// y en media columna no cabe.
const CELDA_LIBRO = [
  "max-[760px]:col-start-1 max-[760px]:min-h-[50px] max-[760px]:w-full",
  "max-[760px]:flex-col max-[760px]:items-start max-[760px]:justify-center",
  "max-[760px]:gap-[3px]",
].join(" ");

// La barra de botones de abajo: se queda pegada al borde inferior del dialogo.
const BARRA_ABAJO = [
  "sticky bottom-[-24px] z-[4] mx-[-24px] mt-[2px] mb-[-24px]",
  "flex min-h-[72px] items-center justify-end gap-2 border-t border-line",
  "bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-6 py-3 backdrop-blur-[14px]",
  "max-[760px]:bottom-[-18px] max-[760px]:mx-[-16px] max-[760px]:mb-[-18px]",
  "max-[760px]:px-4 max-[760px]:py-[10px] max-[760px]:[&>button]:flex-1",
].join(" ");

type Props = {
  people: Person[];
  trips: Trip[];
  demo: boolean;
  rpcClient?: TravelAiQueueRpcClient;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
  onApplied: (message: string) => Promise<void> | void;
};

type ImportRow = ExcelRow & { row_number: number };
type Phase = "idle" | "reading" | "mapping" | "preview" | "applying" | "done";
type PreviewAction = "new" | "change" | "unchanged" | "conflict";

type PreviewLine = {
  entity: "Persona" | "Viaje";
  row: number;
  action: PreviewAction;
  title: string;
  detail: string;
};

type LocalIssue = {
  entity: "Persona" | "Viaje" | "Archivo";
  row?: number;
  message: string;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS_PER_SHEET = 5_000;

const peopleHeaders = [...PERSON_EXCEL_FIELDS];
const tripHeaders = [...TRIP_EXCEL_FIELDS];

const personCompareKeys = [
  "employee_code",
  "name",
  "origin",
  "destination",
  "shift",
  "start_date",
  "end_date",
  "baggage",
  "active",
];

const tripCompareKeys = [
  "date",
  "origin",
  "destination",
  "requested_time",
  "baggage",
  "status",
  "pnr",
  "flight",
  "amount",
  "notes",
];

const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CL")
    .replace(/[^a-z0-9]/g, "");

const displayValue = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return value;
};

function rowsToRecords(
  rows: unknown[][],
  sheet: string,
  expectedHeaders: readonly string[],
): { headerIndex: number; records: ImportRow[] } {
  if (!rows.length) return { headerIndex: 0, records: [] as ImportRow[] };
  const expected = new Set(expectedHeaders.map(normalizeName));
  const candidates = rows.slice(0, 10).map((candidate, index) => ({
    index,
    headers: candidate.map((cell) => String(displayValue(cell)).trim()),
    score: candidate.reduce<number>(
      (total, cell) =>
        total +
        (expected.has(normalizeName(String(displayValue(cell)))) ? 1 : 0),
      0,
    ),
  }));
  const headerRow = candidates.reduce(
    (best, candidate) => (candidate.score > best.score ? candidate : best),
    { index: -1, headers: [] as string[], score: 0 },
  );
  if (headerRow.score < 3) {
    throw new Error(
      `No encontramos los encabezados de ${sheet} dentro de las primeras 10 filas. Usa el libro descargado desde Daybook Travel.`,
    );
  }
  const { headers } = headerRow;
  const duplicate = headers.find(
    (header, index) =>
      header &&
      headers.findIndex(
        (candidate) => normalizeName(candidate) === normalizeName(header),
      ) !== index,
  );
  if (duplicate) {
    throw new Error(`La hoja ${sheet} repite el encabezado “${duplicate}”.`);
  }
  const records: ImportRow[] = [];
  rows.slice(headerRow.index + 1).forEach((cells, index) => {
    if (!cells.some((cell) => String(displayValue(cell)).trim())) return;
    const record: ImportRow = { row_number: headerRow.index + index + 2 };
    headers.forEach((header, column) => {
      if (header) record[header] = displayValue(cells[column]);
    });
    records.push(record);
  });
  return { headerIndex: headerRow.index, records };
}

function rowsForMapping(matrix: unknown[][], headerIndex: number, renamed?: string[]) {
  const headers = renamed ?? (matrix[headerIndex] ?? []).map((cell, index) => String(displayValue(cell)).trim() || `Columna ${index + 1}`);
  const rows: ImportRow[] = matrix.slice(headerIndex + 1).flatMap((cells, index) => cells.some(cell => String(displayValue(cell)).trim())
    ? [{ ...Object.fromEntries(headers.map((header, column) => [header, displayValue(cells[column])])), row_number: headerIndex + index + 2 }]
    : []);
  if (rows.length > MAX_ROWS_PER_SHEET) throw new Error(`Cada hoja admite hasta 5000 filas por carga.`);
  return { headers, rows };
}

type ImportSheet = {
  name: string;
  entity: ExcelSyncEntity;
  matrix: unknown[][];
  headerIndex: number;
  selected: boolean;
  headers: string[];
  mapping: TravelImportMapping;
  accepted: ImportRow[] | null;
};

function initialSheet(name: string, entity: ExcelSyncEntity, matrix: unknown[][]): ImportSheet {
  let accepted: ImportRow[] | null = null;
  let headerIndex = matrix.findIndex(row => row.some(cell => String(displayValue(cell)).trim()));
  if (headerIndex < 0) headerIndex = 0;
  const fields = entity === "people" ? peopleHeaders : tripHeaders;
  try {
    const recognized = rowsToRecords(matrix, name, fields);
    accepted = recognized.records;
    headerIndex = recognized.headerIndex;
  } catch { /* Unknown columns require manual mapping. */ }
  const { headers, rows } = rowsForMapping(matrix, headerIndex);
  if (accepted && accepted.length > MAX_ROWS_PER_SHEET || rows.length > MAX_ROWS_PER_SHEET) throw new Error("Cada hoja admite hasta 5000 filas por carga.");
  const mapping = Object.fromEntries(headers.map(header => [header, fields.find(field => normalizeName(field) === normalizeName(header) && !["accion", "errorSincronizacion", "actualizadoEn"].includes(field)) ?? null]));
  return { name, entity, matrix, headerIndex, selected: false, headers, mapping, accepted };
}

function resultCount(value: number | unknown[] | null | undefined) {
  if (Array.isArray(value)) return value.length;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function comparable(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = String(value).trim();
  const time = /^(\d{1,2}):(\d{2})(?::00)?$/.exec(text);
  return time ? `${time[1].padStart(2, "0")}:${time[2]}` : text;
}

function hasChanges(
  imported: Record<string, unknown>,
  current: Record<string, unknown>,
  keys: string[],
) {
  return keys.some(
    (key) =>
      key in imported && comparable(imported[key]) !== comparable(current[key]),
  );
}

function issueToLocal(issue: ExcelSyncValidationError): LocalIssue {
  return {
    entity:
      issue.entity === "people"
        ? "Persona"
        : issue.entity === "trips"
          ? "Viaje"
          : "Archivo",
    row: issue.row_number,
    message: mensajePublicoExcel(issue.message),
  };
}

function actionLabel(action: PreviewAction) {
  if (action === "new") return "Nuevo";
  if (action === "change") return "Cambio";
  if (action === "conflict") return "Conflicto";
  return "Sin cambios";
}

function getServerIssues(result: ExcelSyncResult | null) {
  if (!result) return [];
  return [
    ...(result.people?.conflicts ?? []).map(issueToLocal),
    ...(result.people?.errors ?? []).map(issueToLocal),
    ...(result.trips?.conflicts ?? []).map(issueToLocal),
    ...(result.trips?.errors ?? []).map(issueToLocal),
  ];
}

export default function ExcelSyncPanel({
  people,
  trips,
  demo,
  rpcClient,
  onClose,
  onBusyChange,
  onApplied,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState("");
  const [syncId, setSyncId] = useState("");
  const [payload, setPayload] = useState<ExcelSyncPayload | null>(null);
  const [preview, setPreview] = useState<PreviewLine[]>([]);
  const [issues, setIssues] = useState<LocalIssue[]>([]);
  const [message, setMessage] = useState("");
  const [downloadBusy, setDownloadBusy] = useState<
    "template" | "current" | null
  >(null);
  const [result, setResult] = useState<ExcelSyncResult | null>(null);
  const [mappingEntity, setMappingEntity] = useState<ExcelSyncEntity>("people");
  const [mappingHeaders, setMappingHeaders] = useState<string[]>([]);
  const [mappingRows, setMappingRows] = useState<ExcelRow[]>([]);
  const [sheets, setSheets] = useState<ImportSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headersConfirmed, setHeadersConfirmed] = useState(false);
  const revision = useRef(0);
  const [mapping, setMapping] = useState<TravelImportMapping>({});
  const [mappingBusy, setMappingBusy] = useState(false);

  const counts = useMemo(
    () => ({
      new: preview.filter((line) => line.action === "new").length,
      change: preview.filter((line) => line.action === "change").length,
      unchanged: preview.filter((line) => line.action === "unchanged").length,
      conflict: preview.filter((line) => line.action === "conflict").length,
      error: issues.length,
    }),
    [issues.length, preview],
  );

  const actionablePayload = useMemo<ExcelSyncPayload | null>(() => {
    if (!payload) return null;
    const accepted = new Set(
      preview
        .filter((line) => line.action === "new" || line.action === "change")
        .map((line) => `${line.entity}:${line.row}`),
    );
    return {
      people: payload.people.filter((row) =>
        accepted.has(`Persona:${row.row_number}`),
      ),
      trips: payload.trips.filter((row) =>
        accepted.has(`Viaje:${row.row_number}`),
      ),
    };
  }, [payload, preview]);

  const actionCount = counts.new + counts.change;
  const blocked = counts.error > 0 || counts.conflict > 0;

  function reset() {
    setPhase("idle");
    setFileName("");
    setSyncId("");
    setPayload(null);
    setPreview([]);
    setIssues([]);
    setMessage("");
    setResult(null);
    setMappingHeaders([]);
    setMappingRows([]);
    setMapping({});
    setMappingBusy(false);
    setSheets([]);
    setHeadersConfirmed(false);
    revision.current += 1;
    if (inputRef.current) inputRef.current.value = "";
  }

  async function downloadWorkbook(kind: "template" | "current") {
    setDownloadBusy(kind);
    setMessage("");
    try {
      const [{ default: writeXlsxFile }, logo] = await Promise.all([
        import("write-excel-file"),
        cargarLogo(),
      ]);
      const date = localDate();
      const personById = new Map(people.map((person) => [person.id, person]));
      const currentPeople = kind === "current" ? people : [];
      const currentTrips = kind === "current" ? trips : [];
      const header = (value: string) => ({
        value,
        fontWeight: "bold" as const,
        color: "#ffffff",
        backgroundColor: DAYBOOK_GOLD,
        alignVertical: "center" as const,
        height: 34,
      });
      const cell = (value: unknown) => ({
        value:
          value === null || value === undefined
            ? ""
            : typeof value === "boolean"
              ? value
                ? "Sí"
                : "No"
              : String(value),
        alignVertical: "top" as const,
        wrap: true,
      });
      const personRows = [
        peopleHeaders.map(header),
        ...currentPeople.map((person) =>
          [
            person.id,
            person.employee_code ?? "",
            person.name,
            person.origin,
            person.destination,
            person.shift,
            person.start_date,
            person.end_date ?? "",
            person.baggage,
            person.active,
            person.version ?? "",
            person.updated_at ?? "",
            "",
            "",
          ].map(cell),
        ),
      ];
      const tripRows = [
        tripHeaders.map(header),
        ...currentTrips.map((trip) => {
          const person = personById.get(trip.person_id);
          return [
            trip.id,
            trip.person_id,
            person?.employee_code ?? "",
            person?.name ?? "",
            trip.planned_date ?? "",
            trip.date,
            trip.direction === "SUBIDA" ? "Subida" : "Bajada",
            trip.origin,
            trip.destination,
            trip.requested_time?.slice(0, 5) ?? "",
            trip.baggage,
            trip.status,
            trip.pnr,
            trip.flight,
            trip.amount ?? "",
            trip.notes,
            "",
            trip.version ?? "",
            trip.updated_at ?? "",
            "",
            "",
          ].map(cell);
        }),
      ];
      const instructionRows = [
        [header("Paso"), header("Qué hacer")],
        [
          cell("1"),
          cell(
            "Completa las hojas Personas y Viajes sin cambiar sus encabezados.",
          ),
        ],
        [
          cell("2"),
          cell(
            "Usa fechas AAAA-MM-DD; el turno puede quedar Por confirmar, 4×3, 10×10 o Sin turno.",
          ),
        ],
        [
          cell("3"),
          cell(
            "Conserva ID y Versión al editar registros descargados desde Daybook Travel.",
          ),
        ],
        [
          cell("4"),
          cell(
            "Agrega un Código trabajador único para relacionar personas con viajes nuevos.",
          ),
        ],
        [
          cell("5"),
          cell(
            "Carga el archivo en Daybook Travel, revisa el resumen y recién entonces aplica los cambios.",
          ),
        ],
        [
          cell("Importante"),
          cell(
            "Quitar una fila no elimina datos. Para sacar a alguien del proyecto, usa Activo = No.",
          ),
        ],
      ];

      await writeXlsxFile([
        [...cabeceraExcel("Personas", date, demo), ...personRows],
        [...cabeceraExcel("Viajes", date, demo), ...tripRows],
        [...cabeceraExcel("Instrucciones", date, demo), ...instructionRows],
      ], {
        sheets: ["Personas", "Viajes", "Instrucciones"],
        images: [[logoParaExcel(logo)], [logoParaExcel(logo)], [logoParaExcel(logo)]],
        columns: [
          peopleHeaders.map((_, index) => ({
            width: [38, 19, 30, 18, 18, 11, 15, 15, 22, 11, 10, 24, 14, 30][
              index
            ],
          })),
          tripHeaders.map((_, index) => ({
            width: [
              38, 38, 19, 30, 17, 15, 13, 18, 18, 15, 22, 17, 14, 16, 15, 34,
              34, 10, 24, 14, 30,
            ][index],
          })),
          [{ width: 16 }, { width: 76 }],
        ],
        stickyRowsCount: 4,
        showGridLines: false,
        fileName:
          kind === "current"
            ? `daybook-travel-${date}.xlsx`
            : "daybook-travel-plantilla.xlsx",
      });
      setMessage(
        kind === "current"
          ? "Libro actual descargado. Conserva los identificadores al editarlo."
          : "Plantilla descargada. Revisa la hoja Instrucciones antes de completarla.",
      );
    } catch {
      setMessage("No pudimos crear el libro. Inténtalo nuevamente.");
    } finally {
      setDownloadBusy(null);
    }
  }

  async function analyzeFile(file: File | undefined) {
    if (!file) return;
    reset();
    setFileName(file.name);
    if (!file.name.toLocaleLowerCase("es-CL").endsWith(".xlsx")) {
      setIssues([
        {
          entity: "Archivo",
          message:
            "Usa un archivo .xlsx. Los formatos .xls y .csv no se admiten aquí.",
        },
      ]);
      setPhase("preview");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setIssues([
        {
          entity: "Archivo",
          message:
            "El archivo supera 10 MB. Divide la carga en libros más pequeños.",
        },
      ]);
      setPhase("preview");
      return;
    }

    setPhase("reading");
    try {
      const { default: readXlsxFile, readSheetNames } =
        await import("read-excel-file");
      const names = await readSheetNames(file);
      const relevantNames = names.filter(name => normalizeName(name) !== "instrucciones");
      if (!relevantNames.length) throw new Error("El libro no contiene hojas para revisar.");
      const loaded = await Promise.all(relevantNames.map(async (name) => initialSheet(name,
        normalizeName(name) === "viajes" ? "trips" : "people", await readXlsxFile(file, { sheet: name }) as unknown[][])));
      setSheets(loaded);
      const failedIndex = loaded.findIndex(sheet => sheet.accepted === null);
      openSheet(loaded, failedIndex < 0 ? 0 : failedIndex);
      setMessage("Selecciona la fila de encabezados de cada hoja que necesite mapeo. Revisa sus etiquetas antes de usar IA.");
      setPhase("mapping");
    } catch (error) {
      setPayload(null);
      setPreview([]);
      setIssues([issuePublicoAlLeerExcel(error)]);
      setPhase("preview");
    }
  }

  function openSheet(nextSheets: ImportSheet[], index: number) {
    const sheet = nextSheets[index];
    const prepared = rowsForMapping(sheet.matrix, sheet.headerIndex, sheet.headers);
    revision.current += 1;
    setHeadersConfirmed(false);
    setMappingBusy(false);
    setSheetIndex(index);
    setMappingEntity(sheet.entity);
    setMappingHeaders(prepared.headers);
    setMappingRows(prepared.rows);
    setMapping(sheet.mapping);
    setPayload(null);
    setPreview([]);
  }

  function changeSheet(index: number) {
    openSheet(sheets, index);
    setMessage("");
  }

  function changeEntity(entity: ExcelSyncEntity) {
    const existing = sheets.findIndex(sheet => sheet.entity === entity);
    if (existing >= 0 && existing !== sheetIndex) { changeSheet(existing); return; }
    const next = sheets.map((sheet, index) => index === sheetIndex ? { ...sheet, entity, mapping: {}, accepted: null } : sheet);
    setSheets(next);
    openSheet(next, sheetIndex);
  }

  function changeHeaders(headerIndex: number, renamed?: string[]) {
    try {
      const prepared = rowsForMapping(sheets[sheetIndex].matrix, headerIndex, renamed);
      const next = sheets.map((sheet, index) => index === sheetIndex ? {
        ...sheet, headerIndex, selected: renamed ? sheet.selected : true, headers: prepared.headers,
        mapping: Object.fromEntries(prepared.headers.map(header => [header, null])), accepted: null,
      } : sheet);
      setSheets(next);
      openSheet(next, sheetIndex);
      setMessage("");
    } catch (error) { setMessage(issuePublicoAlLeerExcel(error).message); }
  }

  function revisarMapeo(nextMapping: TravelImportMapping = mapping) {
    if (!headersValid || !validarMapeo({ entity: mappingEntity, headers: mappingHeaders }, { mapping: nextMapping })) {
      setMessage("Revisa que cada campo de Daybook se use una sola vez."); return;
    }
    if (mappingRows.length > MAX_ROWS_PER_SHEET) { setMessage("Cada hoja admite hasta 5000 filas por carga."); return; }
    const nextSheets = sheets.map((sheet, index) => index === sheetIndex ? { ...sheet, mapping: nextMapping, accepted: aplicarMapeo(mappingRows, nextMapping) as ImportRow[] } : sheet);
    setSheets(nextSheets);
    const pending = nextSheets.findIndex(sheet => sheet.accepted === null);
    if (pending >= 0) { openSheet(nextSheets, pending); setMessage("Relaciona también las columnas de esta hoja para reunir el libro."); return; }
    const peopleRows = nextSheets.filter(sheet => sheet.entity === "people").flatMap(sheet => sheet.accepted ?? []);
    const tripRows = nextSheets.filter(sheet => sheet.entity === "trips").flatMap(sheet => sheet.accepted ?? []);
    if (peopleRows.length > MAX_ROWS_PER_SHEET || tripRows.length > MAX_ROWS_PER_SHEET) { setMessage("Cada entidad admite hasta 5000 filas por carga."); return; }
    const built = buildExcelSyncPayload({ peopleRows, tripRows });
    setPayload(built.payload);
    setPreview(buildPreviewLines(built.payload, people, trips));
    setIssues(built.errors.map(issueToLocal));
    setSyncId(crypto.randomUUID());
    setPhase("preview");
  }

  const headersValid = mappingHeaders.length > 0 && mappingHeaders.every(header => !!header && header !== "row_number") && new Set(mappingHeaders).size === mappingHeaders.length;
  const headerPrivacyBlocked = mappingHeaders.some(encabezadoConDatoPersonal);
  const aiRequest = construirSolicitudMapeo({ entity: mappingEntity, headers: mappingHeaders, rows: mappingRows });
  const canUseAi = headersValid && headersConfirmed && sheets[sheetIndex]?.selected && !headerPrivacyBlocked && !!aiRequest;

  async function interpretarConIA() {
    if (!canUseAi || !aiRequest) return;
    const generation = revision.current;
    setMappingBusy(true);
    try {
      const client = rpcClient ?? browserRpcClient();
      const queued = await solicitarMapeoImportacion(client, aiRequest);
      if (generation !== revision.current) return;
      if (!queued.ok) throw new Error("queue");
      const result = await esperarMapeoImportacion(client, queued.id, aiRequest);
      if (generation !== revision.current) return;
      if (!result.ok || !result.request.proposal) throw new Error("unavailable");
      setMapping(result.request.proposal.mapping);
      setMessage("Interpretación lista. Revísala y corrígela si hace falta antes de continuar.");
    } catch {
      if (generation === revision.current) setMessage("La IA no está disponible. Puedes asignar las columnas manualmente.");
    } finally { if (generation === revision.current) setMappingBusy(false); }
  }

  async function applyChanges() {
    if (!actionablePayload || !syncId || blocked || !actionCount || demo)
      return;
    setPhase("applying");
    setMessage("");
    onBusyChange?.(true);
    try {
      const { data, error } = await (rpcClient ?? db()).rpc("sync_excel_batch", {
        p_sync_id: syncId,
        p_payload: actionablePayload,
      });
      if (error) throw error;
      const nextResult = data as ExcelSyncResult;
      setResult(nextResult);
      const serverIssues = getServerIssues(nextResult);
      if (!nextResult.applied || serverIssues.length) {
        setIssues(serverIssues);
        setMessage(
          serverIssues.length
            ? "El archivo cambió desde la revisión o contiene datos que requieren corrección. No se aplicó ningún cambio."
            : "La revisión del servidor no autorizó la carga. No se aplicó ningún cambio.",
        );
        setPhase("preview");
        return;
      }
      const inserted =
        resultCount(nextResult.people?.inserted) +
        resultCount(nextResult.trips?.inserted);
      const updated =
        resultCount(nextResult.people?.updated) +
        resultCount(nextResult.trips?.updated);
      const summary = `${inserted} nuevos y ${updated} actualizados desde Excel.`;
      setMessage(summary);
      setPhase("done");
      await onApplied(summary);
    } catch (error) {
      const unavailable =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        String((error as { code?: string }).code) === "PGRST202";
      setMessage(
        unavailable
          ? "La importación segura todavía no está habilitada en el servidor. El archivo quedó revisado y puedes intentarlo más tarde."
          : "No pudimos aplicar los cambios. El archivo no se modificó; vuelve a intentarlo.",
      );
      setPhase("preview");
    } finally {
      onBusyChange?.(false);
    }
  }

  if (phase === "done") {
    const inserted =
      resultCount(result?.people?.inserted) +
      resultCount(result?.trips?.inserted);
    const updated =
      resultCount(result?.people?.updated) +
      resultCount(result?.trips?.updated);
    return (
      <div
        className={cn(
          PANEL,
          "min-h-[440px] items-center justify-center gap-[9px] px-6 py-10 text-center max-[760px]:px-[18px]",
        )}
        aria-live="polite"
      >
        <span
          className="mb-[6px] inline-flex size-14 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--success)_38%,var(--border))] bg-[color-mix(in_srgb,var(--success)_10%,var(--surface))] text-success"
          aria-hidden="true"
        >
          <CheckCircle2 size={28} />
        </span>
        <SectionKicker>SINCRONIZACIÓN COMPLETA</SectionKicker>
        <h3 className={TITULO}>El libro ya está reflejado en Daybook Travel</h3>
        <p>{message}</p>
        <div className="mt-3 grid w-[min(360px,100%)] grid-cols-2 gap-2">
          <span className={TARJETA}>
            <strong className={TARJETA_NUMERO}>{inserted}</strong>
            <small>Nuevos</small>
          </span>
          <span className={TARJETA}>
            <strong className={TARJETA_NUMERO}>{updated}</strong>
            <small>Actualizados</small>
          </span>
        </div>
        <div className="mt-[14px] flex gap-2 max-[430px]:grid max-[430px]:w-full max-[430px]:grid-cols-1">
          <Button type="button" onClick={reset}>
            <RotateCcw size={17} /> Revisar otro libro
          </Button>
          <Button type="button" variant="primary" onClick={onClose}>
            Volver a Personas <ArrowRight size={17} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={PANEL}>
      <ol
        className="sticky top-0 z-[5] m-0 grid list-none grid-cols-3 gap-2 border-b border-line bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] px-6 py-[14px] backdrop-blur-[14px] max-[760px]:px-4 max-[430px]:gap-[3px] max-[430px]:px-3"
        aria-label="Pasos para sincronizar"
      >
        <Paso estado={phase === "idle" ? "actual" : "hecho"} numero={1}>
          Preparar
        </Paso>
        <Paso
          estado={
            phase === "reading" || phase === "mapping" || phase === "preview"
              ? "actual"
              : phase === "applying"
                ? "hecho"
                : "pendiente"
          }
          numero={2}
        >
          Revisar
        </Paso>
        <Paso estado={phase === "applying" ? "actual" : "pendiente"} numero={3}>
          Aplicar
        </Paso>
      </ol>

      {phase === "idle" ? (
        <div className={ZONA}>
          <section
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 rounded-md border border-line bg-surface-soft p-[18px] max-[760px]:grid-cols-1 max-[760px]:gap-[15px] max-[760px]:p-[15px]"
            aria-labelledby="excel-download-title"
          >
            <div>
              <SectionKicker>PUNTO DE PARTIDA</SectionKicker>
              <h3 id="excel-download-title" className={TITULO}>
                Descarga un libro preparado
              </h3>
              <p className="mt-[5px] max-w-[530px] text-[12px] text-muted">
                Usa la plantilla para una carga nueva o el libro actual para
                editar registros sin perder sus identificadores.
              </p>
            </div>
            <div className="flex gap-2 max-[760px]:grid max-[760px]:grid-cols-2 max-[430px]:w-full max-[430px]:grid-cols-1">
              <Button
                type="button"
                disabled={downloadBusy !== null}
                onClick={() => void downloadWorkbook("template")}
              >
                {downloadBusy === "template" ? (
                  <LoaderCircle
                    className="animate-[spin_700ms_linear_infinite]"
                    size={17}
                  />
                ) : (
                  <Download size={17} />
                )}
                Plantilla vacía
              </Button>
              <Button
                type="button"
                disabled={downloadBusy !== null}
                onClick={() => void downloadWorkbook("current")}
              >
                {downloadBusy === "current" ? (
                  <LoaderCircle
                    className="animate-[spin_700ms_linear_infinite]"
                    size={17}
                  />
                ) : (
                  <FileSpreadsheet size={17} />
                )}
                Libro actual
              </Button>
            </div>
          </section>

          <label className="relative flex min-h-[184px] cursor-pointer flex-col items-center justify-center gap-[6px] overflow-hidden rounded-lg border border-dashed border-line-strong bg-surface p-7 text-center text-[13px] font-[650] text-foreground transition-[border-color,background-color,scale] duration-[140ms] ease-[var(--ease-out)] active:scale-[0.99] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-[3px] has-[input:focus-visible]:outline-[var(--focus)] max-[760px]:min-h-[156px] max-[760px]:px-4 max-[760px]:py-[22px]">
            <input
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => void analyzeFile(event.target.files?.[0])}
            />
            <span
              className="mb-1 inline-flex size-12 items-center justify-center rounded-[13px] border border-line bg-surface-soft text-foreground-soft"
              aria-hidden="true"
            >
              <Upload size={22} />
            </span>
            <strong>Selecciona el archivo completado</strong>
            <small>.xlsx · máximo 10 MB</small>
          </label>

          <div className={cn(AVISO, "flex items-start gap-[10px] px-[13px] py-3")}>
            <FileCheck2
              size={18}
              aria-hidden="true"
              className="mt-px flex-none text-success"
            />
            <span className="grid gap-[2px]">
              <strong>Nada cambia al seleccionar el archivo.</strong>
              Primero verás nuevos registros, cambios y errores para decidir con
              seguridad.
            </span>
          </div>
          {message ? (
            <p className={cn(AVISO, "px-[13px] py-[11px]")}>{message}</p>
          ) : null}
        </div>
      ) : phase === "reading" ? (
        <div
          className="flex min-h-[340px] flex-col items-center justify-center gap-2 px-6 py-9 text-center"
          aria-live="polite"
        >
          <LoaderCircle
            className="mb-[5px] animate-[spin_700ms_linear_infinite] text-muted"
            size={28}
          />
          <h3 className={TITULO}>Revisando {fileName}</h3>
          <p>Estamos comprobando hojas, columnas, fechas y referencias.</p>
        </div>
      ) : phase === "mapping" ? (
        <div className={ZONA}>
          <header className="grid gap-1 rounded-md border border-line bg-surface-soft px-4 py-3">
            <h3 className={TITULO}>Relaciona las columnas del archivo</h3>
            <p className="text-[12px] text-muted">Nada se aplicará todavía: primero verás la misma vista previa de siempre.</p>
          </header>
          <p className="text-[12px] text-muted">El archivo se lee sólo en este navegador. IA recibe únicamente las etiquetas revisadas y hasta 3 muestras enmascaradas. Máximo 40 encabezados de 1 a 80 bytes UTF-8 y muestras de 0 a 24 bytes; 5000 filas por hoja y entidad.</p>
          <label>Hoja
            <select aria-label="Hoja" value={sheetIndex} onChange={event => changeSheet(Number(event.currentTarget.value))}>
              {sheets.map((sheet, index) => <option key={sheet.name} value={index}>{sheet.name}</option>)}
            </select>
          </label>
          <label>Fila de encabezados
            <select aria-label="Fila de encabezados" value={sheets[sheetIndex]?.selected ? sheets[sheetIndex].headerIndex + 1 : ""} onChange={event => changeHeaders(Number(event.currentTarget.value) - 1)}>
              <option value="" disabled>Selecciona explícitamente la fila</option>
              {sheets[sheetIndex]?.matrix.map((row, index) => <option key={index} value={index + 1}>Fila {index + 1}: {row.map(cell => String(displayValue(cell))).join(" | ")}</option>)}
            </select>
          </label>
          <p>Estas son exactamente las etiquetas que se enviarán si confirmas y solicitas IA. La versión entre comillas hace visibles espacios y saltos de línea. Puedes renombrarlas. Los filtros locales bloquean email y RUT evidentes; otras etiquetas personales requieren tu revisión.</p>
          <label className="grid gap-1 text-[13px] text-foreground-soft">
            Tipo de información
            <select className="min-h-11 rounded-sm border border-line bg-surface px-3 text-foreground" value={mappingEntity} aria-label="Tipo de información" onChange={(event) => changeEntity(event.currentTarget.value as ExcelSyncEntity)}>
              <option value="people">Personas</option>
              <option value="trips">Viajes</option>
            </select>
          </label>
          <TableWrap className="rounded-md" role="region" aria-label="Mapeo de columnas">
            <Table>
              <THead><tr><Th>Columna del archivo</Th><Th>Campo en Daybook</Th></tr></THead>
              <TBody>{mappingHeaders.map((header, column) => (
                <Tr key={column} className="max-[760px]:grid-cols-1">
                  <Td data-label="Columna del archivo" className={CELDA_LIBRO}>
                    <input aria-label={`Etiqueta ${column + 1}`} value={header} onChange={event => changeHeaders(sheets[sheetIndex].headerIndex, mappingHeaders.map((value, index) => index === column ? event.currentTarget.value : value))} />
                    <code aria-label={`Etiqueta enviada ${column + 1}`}>{JSON.stringify(header)}</code>
                    <small>{bytesUtf8(header)} bytes UTF-8</small>
                  </Td>
                  <Td data-label="Campo en Daybook" className={CELDA_LIBRO}>
                    <select aria-label={`Mapeo ${header}`} disabled={mappingBusy} className="min-h-10 w-full rounded-sm border border-line bg-surface px-2 text-foreground" value={mapping[header] ?? ""} onChange={(event) => {
                      const value = event.currentTarget.value || null;
                      setMapping((current) => ({ ...current, [header]: value }));
                    }}>
                      <option value="">Ignorar</option>
                      {(mappingEntity === "people" ? peopleHeaders : tripHeaders).filter((field) => !["accion", "errorSincronizacion", "actualizadoEn"].includes(field)).map((field) => <option key={field} value={field}>{field}</option>)}
                    </select>
                  </Td>
                </Tr>
              ))}</TBody>
            </Table>
          </TableWrap>
          <label><input type="checkbox" aria-label="Confirmar encabezados" checked={headersConfirmed} disabled={!headersValid || !sheets[sheetIndex]?.selected || headerPrivacyBlocked || !aiRequest} onChange={event => { revision.current += 1; setHeadersConfirmed(event.currentTarget.checked); setMappingBusy(false); setMapping(sheets[sheetIndex].mapping); }} /> Confirmo que estas etiquetas son nombres de columnas y no datos personales.</label>
          {headerPrivacyBlocked ? <p role="alert">Renombra los encabezados que contienen email o RUT antes de solicitar IA. El mapeo manual sigue disponible.</p> : null}
          {message ? <p role="status" className={cn(AVISO, "px-[13px] py-[11px]")}>{message}</p> : null}
          <div className={BARRA_ABAJO}>
            <Button type="button" onClick={reset} disabled={mappingBusy}>Cambiar archivo</Button>
            <Button type="button" disabled={mappingBusy || !canUseAi} onClick={() => void interpretarConIA()}>
              {mappingBusy ? <><LoaderCircle className="animate-[spin_700ms_linear_infinite]" size={17} /> Interpretando…</> : "Interpretar columnas con IA"}
            </Button>
            <Button type="button" variant="primary" disabled={mappingBusy} onClick={() => revisarMapeo()}>
              Revisar con este mapeo
            </Button>
          </div>
        </div>
      ) : (
        <div className={ZONA}>
          <header className="grid min-h-16 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-[11px] rounded-md border border-line bg-surface-soft px-3 py-[11px] max-[430px]:grid-cols-[40px_minmax(0,1fr)]">
            <span
              className="inline-flex size-10 items-center justify-center rounded-[10px] border border-line bg-surface-soft text-foreground-soft"
              aria-hidden="true"
            >
              <FileSpreadsheet size={20} />
            </span>
            <span className="grid min-w-0 gap-px">
              <strong className="overflow-hidden text-ellipsis whitespace-nowrap">
                {fileName}
              </strong>
              <small>Revisión local completada</small>
            </span>
            <Button
              type="button"
              className="max-[430px]:col-span-full"
              onClick={reset}
              disabled={phase === "applying"}
            >
              Cambiar archivo
            </Button>
          </header>

          <div
            className="grid grid-cols-5 gap-2 max-[760px]:grid-cols-3 max-[430px]:grid-cols-2"
            aria-live="polite"
          >
            <Tarjeta numero={counts.new} tono={counts.new ? "new" : undefined}>
              Nuevos
            </Tarjeta>
            <Tarjeta
              numero={counts.change}
              tono={counts.change ? "change" : undefined}
            >
              Cambios
            </Tarjeta>
            <Tarjeta numero={counts.unchanged}>Sin cambios</Tarjeta>
            <Tarjeta
              numero={counts.conflict}
              tono={counts.conflict ? "conflict" : undefined}
            >
              Conflictos
            </Tarjeta>
            <Tarjeta
              numero={counts.error}
              tono={counts.error ? "conflict" : undefined}
            >
              Errores
            </Tarjeta>
          </div>

          {issues.length ? (
            <section
              className="overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--danger)_38%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_6%,var(--surface))]"
              aria-labelledby="excel-issues-title"
            >
              <div className="flex items-start gap-[10px] border-b border-[color-mix(in_srgb,var(--danger)_24%,var(--border))] px-[14px] py-[13px]">
                <AlertTriangle
                  size={18}
                  aria-hidden="true"
                  className="mt-px flex-none text-danger"
                />
                <span className="grid gap-[2px]">
                  <strong id="excel-issues-title">
                    Corrige el libro antes de aplicar
                  </strong>
                  <small>
                    Volver a cargarlo repetirá la revisión desde cero.
                  </small>
                </span>
              </div>
              <ul className="m-0 grid list-none gap-0 p-0">
                {issues.slice(0, 12).map((issue, index) => (
                  <li
                    key={`${issue.entity}-${issue.row ?? 0}-${index}`}
                    className="grid grid-cols-[130px_minmax(0,1fr)] gap-[14px] border-b border-line px-[14px] py-[10px] text-[12px] text-foreground-soft last:border-b-0 max-[760px]:grid-cols-1 max-[760px]:gap-[3px]"
                  >
                    <strong>
                      {issue.entity}
                      {issue.row ? ` · fila ${issue.row}` : ""}
                    </strong>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
              {issues.length > 12 ? (
                <small className="block border-t border-line px-[14px] py-[10px]">
                  Hay {issues.length - 12} observaciones adicionales.
                </small>
              ) : null}
            </section>
          ) : null}

          {preview.length ? (
            <TableWrap
              className="rounded-md max-[760px]:overflow-visible max-[760px]:border-0 max-[760px]:bg-transparent"
              role="region"
              aria-label="Cambios detectados"
              tabIndex={0}
            >
              <Table className="min-w-[620px] max-[760px]:min-w-0">
                <THead>
                  <tr>
                    <Th>Hoja / fila</Th>
                    <Th>Registro</Th>
                    <Th className="w-[140px]">Resultado</Th>
                  </tr>
                </THead>
                <TBody>
                  {preview.slice(0, 50).map((line) => (
                    <Tr
                      key={`${line.entity}-${line.row}`}
                      className="max-[760px]:grid-cols-1"
                    >
                      <Td data-label="Hoja / fila" className={CELDA_LIBRO}>
                        <strong className="block">{line.entity}</strong>
                        <small className="block">Fila {line.row}</small>
                      </Td>
                      <Td data-label="Registro" className={CELDA_LIBRO}>
                        <strong className="block">{line.title}</strong>
                        <small className="block">{line.detail}</small>
                      </Td>
                      <Td
                        data-label="Resultado"
                        className={cn(
                          CELDA_LIBRO,
                          "w-[140px] max-[760px]:w-full max-[760px]:border-b-0",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex min-h-[27px] w-fit items-center rounded-[999px] border border-line bg-surface-soft px-2 py-1 text-[10px] font-extrabold text-muted",
                            line.action !== "unchanged" &&
                              TONOS[line.action] + " text-inherit",
                          )}
                        >
                          {actionLabel(line.action)}
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              {preview.length > 50 ? (
                <p className="border-t border-line px-[13px] py-[11px] text-center max-[760px]:mt-2 max-[760px]:rounded-sm max-[760px]:border max-[760px]:border-line max-[760px]:bg-surface">
                  Mostramos 50 de {preview.length} filas revisadas. El resumen
                  incluye todas.
                </p>
              ) : null}
            </TableWrap>
          ) : null}

          {message ? (
            <p className={cn(AVISO, "px-[13px] py-[11px]")} role="status">
              {message}
            </p>
          ) : null}
          {demo ? (
            <p className={cn(AVISO, "px-[13px] py-[11px]")}>
              Puedes revisar archivos en la demostración. Para aplicar cambios,
              entra con una cuenta habilitada.
            </p>
          ) : null}

          <div className={BARRA_ABAJO}>
            <Button
              type="button"
              onClick={onClose}
              disabled={phase === "applying"}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={phase === "applying" || blocked || !actionCount || demo}
              onClick={() => void applyChanges()}
            >
              {phase === "applying" ? (
                <>
                  <LoaderCircle
                    className="animate-[spin_700ms_linear_infinite]"
                    size={17}
                  />{" "}
                  Aplicando cambios…
                </>
              ) : blocked ? (
                "Corrige el archivo para continuar"
              ) : actionCount ? (
                `Aplicar ${actionCount} ${actionCount === 1 ? "cambio" : "cambios"}`
              ) : (
                "No hay cambios para aplicar"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function browserRpcClient() {
  const client = db();
  return {
    async rpc(name: string, args: Record<string, unknown>) {
      const { data, error } = await client.rpc(name, args);
      return { data, error: error ? { message: error.message } : null };
    },
  };
}

function buildPreviewLines(
  payload: ExcelSyncPayload,
  people: Person[],
  trips: Trip[],
) {
  const lines: PreviewLine[] = [];
  const currentPeople = new Map(people.map((person) => [person.id, person]));
  const currentTrips = new Map(trips.map((trip) => [trip.id, trip]));
  const seenPersonIds = new Set<string>();
  const seenTripIds = new Set<string>();
  const peopleByCode = new Map(
    people
      .filter((person) => person.employee_code)
      .map((person) => [normalizeName(person.employee_code!), person]),
  );
  const importedPeopleByCode = new Map(
    payload.people
      .filter((person) => person.employee_code)
      .map((person) => [normalizeName(person.employee_code!), person]),
  );
  const importedCodes = new Set<string>();
  const newTripKeys = new Set<string>();

  for (const record of payload.people) {
    const id = String(record.id ?? "").trim();
    const code = String(record.employee_code ?? "").trim();
    const row = record.row_number;
    const title = String(record.name || `Persona en fila ${row}`);
    let action: PreviewAction = "new";
    let detail = `${record.origin ?? "Origen pendiente"} → ${record.destination ?? "Destino pendiente"}`;
    if (id) {
      if (seenPersonIds.has(id)) {
        action = "conflict";
        detail = "El mismo ID Daybook aparece más de una vez en el libro.";
      } else {
        const current = currentPeople.get(id);
        if (!current) {
          action = "conflict";
          detail = "El ID Daybook no existe en los datos actuales.";
        } else if (
          record.version !== undefined &&
          current.version !== undefined &&
          Number(record.version) !== Number(current.version)
        ) {
          action = "conflict";
          detail = "La versión del registro ya cambió en Daybook Travel.";
        } else {
          action = hasChanges(
            record as Record<string, unknown>,
            current as unknown as Record<string, unknown>,
            personCompareKeys,
          )
            ? "change"
            : "unchanged";
        }
      }
      seenPersonIds.add(id);
    } else if (code) {
      const normalizedCode = normalizeName(code);
      if (
        peopleByCode.has(normalizedCode) ||
        importedCodes.has(normalizedCode)
      ) {
        action = "conflict";
        detail =
          "El Código trabajador ya está en uso. Descarga el libro actual para editar esa persona.";
      }
      importedCodes.add(normalizedCode);
    }
    lines.push({ entity: "Persona", row, action, title, detail });
  }

  for (const record of payload.trips) {
    const id = String(record.id ?? "").trim();
    const row = record.row_number;
    const personCode = String(record.person_employee_code ?? "").trim();
    const normalizedPersonCode = normalizeName(personCode);
    const relatedPerson = record.person_id
      ? currentPeople.get(record.person_id)
      : peopleByCode.get(normalizedPersonCode) ??
        importedPeopleByCode.get(normalizedPersonCode);
    const title = relatedPerson
      ? `${relatedPerson.name} · ${record.date ?? "fecha pendiente"}`
      : personCode
        ? `${personCode} · ${record.date ?? "fecha pendiente"}`
        : `Viaje del ${record.date ?? `fila ${row}`}`;
    let action: PreviewAction = "new";
    let detail = `${record.origin ?? "Origen pendiente"} → ${record.destination ?? "Destino pendiente"}`;
    if (id) {
      if (seenTripIds.has(id)) {
        action = "conflict";
        detail = "El mismo ID Daybook aparece más de una vez en el libro.";
      } else {
        const current = currentTrips.get(id);
        if (!current) {
          action = "conflict";
          detail = "El ID Daybook no existe en los datos actuales.";
        } else if (
          record.version !== undefined &&
          current.version !== undefined &&
          Number(record.version) !== Number(current.version)
        ) {
          action = "conflict";
          detail = "La versión del viaje ya cambió en Daybook Travel.";
        } else {
          const importedPersonId =
            String(record.person_id ?? "").trim() ||
            peopleByCode.get(normalizeName(personCode))?.id ||
            "";
          const changedImmutableField =
            (importedPersonId !== "" && importedPersonId !== current.person_id) ||
            comparable(record.direction) !== comparable(current.direction) ||
            comparable(record.planned_date) !==
              comparable(current.planned_date ?? current.date);
          const mutableChanges = hasChanges(
            record as Record<string, unknown>,
            current as unknown as Record<string, unknown>,
            tripCompareKeys,
          );
          if (changedImmutableField) {
            action = "conflict";
            detail =
              "La persona, fecha planificada y sentido no se pueden cambiar desde Excel.";
          } else if (mutableChanges && !comparable(record.change_reason)) {
            action = "conflict";
            detail =
              "Agrega un motivoCambio para actualizar este viaje desde Excel.";
          } else {
            action = mutableChanges ? "change" : "unchanged";
          }
        }
      }
      seenTripIds.add(id);
    } else {
      const referenceKey = record.person_id
        ? `id:${record.person_id}`
        : `code:${normalizedPersonCode}`;
      const tripKey = `${referenceKey}:${record.date}:${record.direction}`;
      if (
        !record.person_id &&
        (!personCode ||
          (!peopleByCode.has(normalizedPersonCode) &&
            !importedPeopleByCode.has(normalizedPersonCode)))
      ) {
        action = "conflict";
        detail =
          "El código no corresponde a una persona actual ni a una persona nueva de este libro.";
      } else if (newTripKeys.has(tripKey)) {
        action = "conflict";
        detail =
          "El mismo movimiento aparece más de una vez para esta persona y fecha.";
      }
      newTripKeys.add(tripKey);
    }
    lines.push({ entity: "Viaje", row, action, title, detail });
  }

  return lines;
}

// Un paso de la barra de arriba. El número va en un círculo que cambia de color
// según dónde esté la persona: gris lo que falta, blanco lo que está haciendo,
// verde lo que ya pasó.
function Paso({
  estado,
  numero,
  children,
}: {
  estado: "pendiente" | "actual" | "hecho";
  numero: number;
  children: ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex min-h-9 items-center gap-2 text-[11px] font-[750]",
        "max-[430px]:gap-[5px] max-[430px]:text-[10px]",
        estado === "actual" ? "text-foreground" : "text-muted",
      )}
    >
      <span
        className={cn(
          "inline-flex size-6 flex-none items-center justify-center rounded-[999px] border text-[10px]",
          "max-[430px]:size-[22px]",
          estado === "actual"
            ? "border-foreground-soft bg-foreground text-surface"
            : estado === "hecho"
              ? "border-[color-mix(in_srgb,var(--success)_48%,var(--border))] bg-[color-mix(in_srgb,var(--success)_12%,var(--surface))] text-success"
              : "border-line-strong bg-surface-soft text-muted",
        )}
      >
        {numero}
      </span>{" "}
      {children}
    </li>
  );
}

// Una de las cinco cajas del resumen. Solo se enciende con color cuando tiene
// algo dentro: un cero en "Conflictos" no debe gritar.
function Tarjeta({
  numero,
  tono,
  children,
}: {
  numero: number;
  tono?: keyof typeof TONOS;
  children: ReactNode;
}) {
  return (
    <span className={cn(TARJETA, tono && TONOS[tono])}>
      <strong className={TARJETA_NUMERO}>{numero}</strong>
      <small>{children}</small>
    </span>
  );
}
