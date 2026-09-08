"use client";

import { useMemo, useRef, useState } from "react";
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
  type ExcelRow,
  type ExcelSyncPayload,
  type ExcelSyncResult,
  type ExcelSyncValidationError,
} from "../lib/excel-sync";
import type { Person, Trip } from "../lib/types";

type Props = {
  people: Person[];
  trips: Trip[];
  demo: boolean;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
  onApplied: (message: string) => Promise<void> | void;
};

type ImportRow = ExcelRow & { row_number: number };
type Phase = "idle" | "reading" | "preview" | "applying" | "done";
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
): ImportRow[] {
  if (!rows.length) return [];
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
      `No encontramos los encabezados de ${sheet} dentro de las primeras 10 filas. Usa el libro descargado desde FCC TRAVEL.`,
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
  return records;
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
    message: issue.message,
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
    if (inputRef.current) inputRef.current.value = "";
  }

  async function downloadWorkbook(kind: "template" | "current") {
    setDownloadBusy(kind);
    setMessage("");
    try {
      const { default: writeXlsxFile } = await import("write-excel-file");
      const personById = new Map(people.map((person) => [person.id, person]));
      const currentPeople = kind === "current" ? people : [];
      const currentTrips = kind === "current" ? trips : [];
      const header = (value: string) => ({
        value,
        fontWeight: "bold" as const,
        color: "#ffffff",
        backgroundColor: "#263345",
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
            "Usa fechas AAAA-MM-DD; el turno puede quedar Por confirmar, 4×3 o 10×10.",
          ),
        ],
        [
          cell("3"),
          cell(
            "Conserva ID FCC y Versión al editar registros descargados desde FCC TRAVEL.",
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
            "Carga el archivo en FCC TRAVEL, revisa el resumen y recién entonces aplica los cambios.",
          ),
        ],
        [
          cell("Importante"),
          cell(
            "Quitar una fila no elimina datos. Para sacar a alguien del proyecto, usa Activo = No.",
          ),
        ],
      ];

      await writeXlsxFile([personRows, tripRows, instructionRows], {
        sheets: ["Personas", "Viajes", "Instrucciones"],
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
        stickyRowsCount: 1,
        showGridLines: false,
        fileName:
          kind === "current"
            ? `FCC-TRAVEL-${new Date().toISOString().slice(0, 10)}.xlsx`
            : "FCC-TRAVEL-plantilla.xlsx",
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
      const peopleSheet = names.find(
        (name) => normalizeName(name) === "personas",
      );
      const tripsSheet = names.find((name) => normalizeName(name) === "viajes");
      if (!peopleSheet && !tripsSheet) {
        throw new Error(
          "No encontramos las hojas Personas o Viajes. Usa la plantilla de FCC TRAVEL.",
        );
      }
      const [peopleMatrix, tripsMatrix] = await Promise.all([
        peopleSheet ? readXlsxFile(file, { sheet: peopleSheet }) : [],
        tripsSheet ? readXlsxFile(file, { sheet: tripsSheet }) : [],
      ]);
      const peopleRows = rowsToRecords(
        peopleMatrix as unknown[][],
        peopleSheet ?? "Personas",
        peopleHeaders,
      );
      const tripsRows = rowsToRecords(
        tripsMatrix as unknown[][],
        tripsSheet ?? "Viajes",
        tripHeaders,
      );
      if (
        peopleRows.length > MAX_ROWS_PER_SHEET ||
        tripsRows.length > MAX_ROWS_PER_SHEET
      ) {
        throw new Error(
          `Cada hoja admite hasta ${MAX_ROWS_PER_SHEET.toLocaleString("es-CL")} filas por carga.`,
        );
      }
      if (!peopleRows.length && !tripsRows.length) {
        throw new Error("El libro no contiene filas para revisar.");
      }

      const built = buildExcelSyncPayload({ peopleRows, tripRows: tripsRows });
      const localIssues = built.errors.map(issueToLocal);
      const lines = buildPreviewLines(built.payload, people, trips);
      setPayload(built.payload);
      setPreview(lines);
      setIssues(localIssues);
      setSyncId(crypto.randomUUID());
      setPhase("preview");
    } catch (error) {
      setPayload(null);
      setPreview([]);
      setIssues([
        {
          entity: "Archivo",
          message:
            error instanceof Error
              ? error.message
              : "No pudimos leer el archivo. Descarga la plantilla e inténtalo nuevamente.",
        },
      ]);
      setPhase("preview");
    }
  }

  async function applyChanges() {
    if (!actionablePayload || !syncId || blocked || !actionCount || demo)
      return;
    setPhase("applying");
    setMessage("");
    onBusyChange?.(true);
    try {
      const { data, error } = await db.rpc("sync_excel_batch", {
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
      <div className="excel-sync excel-complete" aria-live="polite">
        <span className="excel-complete-icon" aria-hidden="true">
          <CheckCircle2 size={28} />
        </span>
        <span className="section-kicker">SINCRONIZACIÓN COMPLETA</span>
        <h3>El libro ya está reflejado en FCC TRAVEL</h3>
        <p>{message}</p>
        <div className="excel-result-grid">
          <span>
            <strong>{inserted}</strong>
            <small>Nuevos</small>
          </span>
          <span>
            <strong>{updated}</strong>
            <small>Actualizados</small>
          </span>
        </div>
        <div className="excel-complete-actions">
          <button type="button" onClick={reset}>
            <RotateCcw size={17} /> Revisar otro libro
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Volver a Personas <ArrowRight size={17} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="excel-sync">
      <ol className="excel-steps" aria-label="Pasos para sincronizar">
        <li className={phase === "idle" ? "current" : "complete"}>
          <span>1</span> Preparar
        </li>
        <li
          className={
            phase === "reading" || phase === "preview"
              ? "current"
              : phase === "applying"
                ? "complete"
                : ""
          }
        >
          <span>2</span> Revisar
        </li>
        <li className={phase === "applying" ? "current" : ""}>
          <span>3</span> Aplicar
        </li>
      </ol>

      {phase === "idle" ? (
        <div className="excel-start">
          <section
            className="excel-downloads"
            aria-labelledby="excel-download-title"
          >
            <div>
              <span className="section-kicker">PUNTO DE PARTIDA</span>
              <h3 id="excel-download-title">Descarga un libro preparado</h3>
              <p>
                Usa la plantilla para una carga nueva o el libro actual para
                editar registros sin perder sus identificadores.
              </p>
            </div>
            <div className="excel-download-actions">
              <button
                type="button"
                disabled={downloadBusy !== null}
                onClick={() => void downloadWorkbook("template")}
              >
                {downloadBusy === "template" ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Download size={17} />
                )}
                Plantilla vacía
              </button>
              <button
                type="button"
                disabled={downloadBusy !== null}
                onClick={() => void downloadWorkbook("current")}
              >
                {downloadBusy === "current" ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <FileSpreadsheet size={17} />
                )}
                Libro actual
              </button>
            </div>
          </section>

          <label className="excel-dropzone">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => void analyzeFile(event.target.files?.[0])}
            />
            <span className="excel-upload-icon" aria-hidden="true">
              <Upload size={22} />
            </span>
            <strong>Selecciona el archivo completado</strong>
            <small>.xlsx · máximo 10 MB</small>
          </label>

          <div className="excel-safety-note">
            <FileCheck2 size={18} aria-hidden="true" />
            <span>
              <strong>Nada cambia al seleccionar el archivo.</strong>
              Primero verás nuevos registros, cambios y errores para decidir con
              seguridad.
            </span>
          </div>
          {message ? <p className="excel-inline-message">{message}</p> : null}
        </div>
      ) : phase === "reading" ? (
        <div className="excel-reading" aria-live="polite">
          <LoaderCircle className="spin" size={28} />
          <h3>Revisando {fileName}</h3>
          <p>Estamos comprobando hojas, columnas, fechas y referencias.</p>
        </div>
      ) : (
        <div className="excel-preview">
          <header className="excel-file-head">
            <span className="excel-file-icon" aria-hidden="true">
              <FileSpreadsheet size={20} />
            </span>
            <span>
              <strong>{fileName}</strong>
              <small>Revisión local completada</small>
            </span>
            <button
              type="button"
              onClick={reset}
              disabled={phase === "applying"}
            >
              Cambiar archivo
            </button>
          </header>

          <div className="excel-counts" aria-live="polite">
            <span className={counts.new ? "new has-items" : "new"}>
              <strong>{counts.new}</strong>
              <small>Nuevos</small>
            </span>
            <span className={counts.change ? "change has-items" : "change"}>
              <strong>{counts.change}</strong>
              <small>Cambios</small>
            </span>
            <span className="unchanged">
              <strong>{counts.unchanged}</strong>
              <small>Sin cambios</small>
            </span>
            <span
              className={counts.conflict ? "conflict has-items" : "conflict"}
            >
              <strong>{counts.conflict}</strong>
              <small>Conflictos</small>
            </span>
            <span className={counts.error ? "error has-items" : "error"}>
              <strong>{counts.error}</strong>
              <small>Errores</small>
            </span>
          </div>

          {issues.length ? (
            <section
              className="excel-issues"
              aria-labelledby="excel-issues-title"
            >
              <div className="excel-issues-head">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>
                  <strong id="excel-issues-title">
                    Corrige el libro antes de aplicar
                  </strong>
                  <small>
                    Volver a cargarlo repetirá la revisión desde cero.
                  </small>
                </span>
              </div>
              <ul>
                {issues.slice(0, 12).map((issue, index) => (
                  <li key={`${issue.entity}-${issue.row ?? 0}-${index}`}>
                    <strong>
                      {issue.entity}
                      {issue.row ? ` · fila ${issue.row}` : ""}
                    </strong>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
              {issues.length > 12 ? (
                <small>
                  Hay {issues.length - 12} observaciones adicionales.
                </small>
              ) : null}
            </section>
          ) : null}

          {preview.length ? (
            <div
              className="excel-preview-table"
              role="region"
              aria-label="Cambios detectados"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Hoja / fila</th>
                    <th>Registro</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map((line) => (
                    <tr key={`${line.entity}-${line.row}`}>
                      <td data-label="Hoja / fila">
                        <strong>{line.entity}</strong>
                        <small>Fila {line.row}</small>
                      </td>
                      <td data-label="Registro">
                        <strong>{line.title}</strong>
                        <small>{line.detail}</small>
                      </td>
                      <td data-label="Resultado">
                        <span className={`excel-action ${line.action}`}>
                          {actionLabel(line.action)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 50 ? (
                <p className="excel-more-rows">
                  Mostramos 50 de {preview.length} filas revisadas. El resumen
                  incluye todas.
                </p>
              ) : null}
            </div>
          ) : null}

          {message ? (
            <p className="excel-inline-message" role="status">
              {message}
            </p>
          ) : null}
          {demo ? (
            <p className="excel-demo-note">
              Puedes revisar archivos en la demostración. Para aplicar cambios,
              entra con una cuenta habilitada.
            </p>
          ) : null}

          <div className="excel-panel-actions">
            <button
              type="button"
              onClick={onClose}
              disabled={phase === "applying"}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="primary"
              disabled={phase === "applying" || blocked || !actionCount || demo}
              onClick={() => void applyChanges()}
            >
              {phase === "applying" ? (
                <>
                  <LoaderCircle className="spin" size={17} /> Aplicando cambios…
                </>
              ) : blocked ? (
                "Corrige el archivo para continuar"
              ) : actionCount ? (
                `Aplicar ${actionCount} ${actionCount === 1 ? "cambio" : "cambios"}`
              ) : (
                "No hay cambios para aplicar"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
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
        detail = "El mismo ID FCC aparece más de una vez en el libro.";
      } else {
        const current = currentPeople.get(id);
        if (!current) {
          action = "conflict";
          detail = "El ID FCC no existe en los datos actuales.";
        } else if (
          record.version !== undefined &&
          current.version !== undefined &&
          Number(record.version) !== Number(current.version)
        ) {
          action = "conflict";
          detail = "La versión del registro ya cambió en FCC TRAVEL.";
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
        detail = "El mismo ID FCC aparece más de una vez en el libro.";
      } else {
        const current = currentTrips.get(id);
        if (!current) {
          action = "conflict";
          detail = "El ID FCC no existe en los datos actuales.";
        } else if (
          record.version !== undefined &&
          current.version !== undefined &&
          Number(record.version) !== Number(current.version)
        ) {
          action = "conflict";
          detail = "La versión del viaje ya cambió en FCC TRAVEL.";
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
