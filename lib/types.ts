// Vocabulario del dominio y forma de los registros que viajan entre Supabase y la pantalla.
// Estas listas son la fuente única: `lib/excel-sync.ts` las reexporta para no duplicarlas.

export const SHIFTS = ["Por confirmar", "4×3", "10×10"] as const;
export const TRIP_DIRECTIONS = ["SUBIDA", "BAJADA"] as const;
export const TRIP_STATUSES = [
  "Planificado",
  "Solicitado",
  "Emitido",
  "Completado",
  "Anulado",
  "No presentado",
] as const;
export const BAGGAGE_OPTIONS = [
  "Por confirmar",
  "Mochila",
  "Maleta de cabina",
  "Maleta en bodega",
] as const;

export type Shift = (typeof SHIFTS)[number];
export type TripDirection = (typeof TRIP_DIRECTIONS)[number];
export type TripStatus = (typeof TRIP_STATUSES)[number];
export type Baggage = (typeof BAGGAGE_OPTIONS)[number];

export type Person = {
  id: string;
  version?: number | null;
  employee_code?: string | null;
  name: string;
  origin: string;
  destination: string;
  shift: string;
  start_date: string;
  end_date: string | null;
  /** Día de subida en 4×3: 1 = lunes … 7 = domingo. No se usa en 10×10. */
  up_weekday?: number | null;
  /** Día de bajada en 4×3: 1 = lunes … 7 = domingo. No se usa en 10×10. */
  down_weekday?: number | null;
  baggage: string;
  active: boolean;
  updated_at?: string;
};

export type Trip = {
  id: string;
  version?: number | null;
  person_id: string;
  date: string;
  planned_date?: string | null;
  direction: string;
  origin: string;
  destination: string;
  requested_time: string | null;
  baggage: string;
  status: string;
  pnr: string;
  flight: string;
  amount: number | null;
  notes: string;
  updated_at?: string;
};

export type HistoryItem = {
  id: number;
  action: string;
  created_at: string;
  actor: string;
  after_data: Record<string, unknown>;
};

export type AccessStatus = "checking" | "allowed" | "denied" | "error";
export type ModalName = "person" | "trip" | "generate" | "history" | "excel" | null;
