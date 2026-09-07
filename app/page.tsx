"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock,
  Download,
  LogOut,
  Moon,
  Plane,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sun,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import YearView from "./year-view";
import { db } from "../lib/supabase";
import { addDays, pulseDates } from "../lib/calendar";

type Person = {
  id: string;
  name: string;
  origin: string;
  destination: string;
  shift: string;
  start_date: string;
  end_date: string | null;
  baggage: string;
  active: boolean;
};

type Trip = {
  id: string;
  person_id: string;
  date: string;
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

type HistoryItem = {
  id: number;
  action: string;
  created_at: string;
  actor: string;
  after_data: Record<string, unknown>;
};

type AccessStatus = "checking" | "allowed" | "denied" | "error";
type ModalName = "person" | "trip" | "generate" | "history" | null;

const statuses = [
  "Planificado",
  "Solicitado",
  "Emitido",
  "Volado",
  "Anulado",
  "No presentado",
];

const baggageOptions = [
  "Por confirmar",
  "Mochila",
  "Maleta de cabina",
  "Maleta en bodega",
];

const navItems = [
  { label: "Agenda", icon: CalendarDays },
  { label: "Personas", icon: Users },
  { label: "Viajes", icon: Plane },
];

const localDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));

const formatDateTime = (date: string) =>
  new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CL")
    .trim();

const statusClass = (status: string) =>
  "status-" + normalize(status).replaceAll(" ", "-");

function nextWeekday(date: string, weekday: number) {
  const current = new Date(date + "T12:00:00Z").getUTCDay();
  return addDays(date, (weekday - current + 7) % 7);
}

function makeDemoPeople(): Person[] {
  const firstMonday = nextWeekday(localDate(), 1);
  return [
    {
      id: "p1",
      name: "Persona de ejemplo 1",
      origin: "Santiago",
      destination: "Copiapó",
      shift: "4×3",
      start_date: firstMonday,
      end_date: null,
      baggage: "Mochila",
      active: true,
    },
    {
      id: "p2",
      name: "Persona de ejemplo 2",
      origin: "Concepción",
      destination: "Copiapó",
      shift: "10×10",
      start_date: firstMonday,
      end_date: null,
      baggage: "Maleta en bodega",
      active: true,
    },
  ];
}

function makeDemoTrips(people: Person[]): Trip[] {
  const firstMonday = people[0].start_date;
  const fourByThree = pulseDates(firstMonday, addDays(firstMonday, 35)).map(
    (row, index) => ({
      id: "t" + index,
      person_id: "p1",
      ...row,
      origin: row.direction === "SUBIDA" ? "Santiago" : "Copiapó",
      destination: row.direction === "SUBIDA" ? "Copiapó" : "Santiago",
      requested_time: index === 0 ? "08:30" : null,
      baggage: "Mochila",
      status:
        index === 0 ? "Solicitado" : index === 1 ? "Emitido" : "Planificado",
      pnr: index === 1 ? "DEMO01" : "",
      flight: index === 1 ? "LA 112" : "",
      amount: index === 1 ? 84990 : null,
      notes: "",
    }),
  );
  const tenByTen: Trip[] = [
    {
      id: "t-10x10-up",
      person_id: "p2",
      date: firstMonday,
      direction: "SUBIDA",
      origin: "Concepción",
      destination: "Copiapó",
      requested_time: "09:00",
      baggage: "Maleta en bodega",
      status: "Planificado",
      pnr: "",
      flight: "",
      amount: null,
      notes: "",
    },
    {
      id: "t-10x10-down",
      person_id: "p2",
      date: addDays(firstMonday, 10),
      direction: "BAJADA",
      origin: "Copiapó",
      destination: "Concepción",
      requested_time: "17:00",
      baggage: "Maleta en bodega",
      status: "Planificado",
      pnr: "",
      flight: "",
      amount: null,
      notes: "",
    },
  ];
  return [...fourByThree, ...tenByTen].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>("checking");
  const [people, setPeople] = useState<Person[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [view, setView] = useState("Agenda");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [dateFilter, setDateFilter] = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [peopleFilter, setPeopleFilter] = useState("Activas");
  const [onlyUpcoming, setOnlyUpcoming] = useState(true);
  const [selectedTrips, setSelectedTrips] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    localDate().slice(0, 7),
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalName>(null);
  const [editPerson, setEditPerson] = useState<Person | null>(null);
  const [editTrip, setEditTrip] = useState<Trip | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [pendingTripDate, setPendingTripDate] = useState<string | null>(null);
  const [tripStatus, setTripStatus] = useState("Planificado");
  const [reservationOpen, setReservationOpen] = useState(false);
  const [generateSelection, setGenerateSelection] = useState("all");
  const [generateUntil, setGenerateUntil] = useState(() =>
    addDays(localDate(), 90),
  );
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("fcc-travel-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
  }, []);

  useEffect(() => {
    db.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });
    const { data } = db.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function allRows(table: string) {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db
        .from(table)
        .select("*")
        .order("id")
        .range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) return rows;
    }
  }

  async function reload() {
    setLoading(true);
    setAccessStatus((current) =>
      current === "allowed" ? current : "checking",
    );
    try {
      const { data: member, error } = await db.rpc("is_member");
      if (error) throw error;
      if (!member) {
        setAccessStatus("denied");
        setPeople([]);
        setTrips([]);
        return;
      }
      const [peopleRows, tripRows] = await Promise.all([
        allRows("people"),
        allRows("trips"),
      ]);
      setPeople(
        (peopleRows as unknown as Person[]).sort((a, b) =>
          a.name.localeCompare(b.name, "es"),
        ),
      );
      setTrips(
        (tripRows as unknown as Trip[]).sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      );
      setAccessStatus("allowed");
    } catch {
      setAccessStatus((current) => (current === "allowed" ? current : "error"));
      setNotice(
        "No pudimos cargar la información. Revisa la conexión e inténtalo nuevamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (email && !demo) void reload();
  }, [email, demo]);

  useEffect(() => {
    if (!email || demo) return;
    const timer = setInterval(() => void reload(), 60_000);
    return () => clearInterval(timer);
  }, [email, demo]);

  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );

  const personName = (id: string) =>
    peopleById.get(id)?.name ?? "Persona sin registro";

  const activePeople = useMemo(
    () => people.filter((person) => person.active),
    [people],
  );

  const eligibleFourByThree = useMemo(
    () => people.filter((person) => person.active && person.shift === "4×3"),
    [people],
  );

  const visiblePeople = useMemo(() => {
    const needle = normalize(query);
    return people.filter((person) => {
      const matchesText =
        !needle ||
        normalize(
          [person.name, person.origin, person.destination, person.shift].join(
            " ",
          ),
        ).includes(needle);
      const matchesFilter =
        peopleFilter === "Todas" ||
        (peopleFilter === "Activas" && person.active) ||
        (peopleFilter === "Inactivas" && !person.active) ||
        (peopleFilter === "4×3" && person.active && person.shift === "4×3") ||
        (peopleFilter === "10×10" && person.active && person.shift === "10×10");
      return matchesText && matchesFilter;
    });
  }, [people, peopleFilter, query]);

  const visibleTrips = useMemo(() => {
    const needle = normalize(query);
    return trips
      .filter((trip) => {
        const matchesText =
          !needle ||
          normalize(
            [
              personName(trip.person_id),
              trip.origin,
              trip.destination,
              trip.pnr,
              trip.flight,
            ].join(" "),
          ).includes(needle);
        return (
          matchesText &&
          (statusFilter === "Todos" || trip.status === statusFilter) &&
          (!dateFilter || trip.date === dateFilter) &&
          (!personFilter || trip.person_id === personFilter) &&
          (!onlyUpcoming || trip.date >= localDate())
        );
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [
    trips,
    query,
    statusFilter,
    dateFilter,
    personFilter,
    onlyUpcoming,
    peopleById,
  ]);

  const requestableTrips = useMemo(
    () =>
      visibleTrips.filter(
        (trip) => trip.status === "Planificado" && trip.date >= localDate(),
      ),
    [visibleTrips],
  );

  useEffect(() => {
    setSelectedTrips([]);
  }, [query, statusFilter, dateFilter, personFilter, onlyUpcoming]);

  const upcomingTrips = useMemo(
    () =>
      trips
        .filter(
          (trip) =>
            trip.date >= localDate() &&
            !["Anulado", "Volado", "No presentado"].includes(trip.status),
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [trips],
  );

  const plannedCount = upcomingTrips.filter(
    (trip) => trip.status === "Planificado",
  ).length;
  const requestedCount = upcomingTrips.filter(
    (trip) => trip.status === "Solicitado",
  ).length;
  const nextTrip = upcomingTrips[0];

  const generationPeople = useMemo(() => {
    if (generateSelection === "all") return eligibleFourByThree;
    return eligibleFourByThree.filter(
      (person) => person.id === generateSelection,
    );
  }, [eligibleFourByThree, generateSelection]);

  const generationPreview = useMemo(
    () =>
      generationPeople.reduce((total, person) => {
        const until =
          person.end_date && person.end_date < generateUntil
            ? person.end_date
            : generateUntil;
        if (until < person.start_date) return total;
        return (
          total +
          pulseDates(person.start_date, until).filter(
            (row) =>
              !trips.some(
                (trip) =>
                  trip.person_id === person.id &&
                  trip.date === row.date &&
                  trip.direction === row.direction,
              ),
          ).length
        );
      }, 0),
    [generationPeople, generateUntil, trips],
  );

  const reservationRequired = ["Emitido", "Volado", "No presentado"].includes(
    tripStatus,
  );

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("fcc-travel-theme", next);
    } catch {}
  }

  function clearMessages() {
    setNotice("");
    setFormError("");
  }

  async function runAction(
    operation: () => Promise<void>,
    destination: "form" | "global" = "global",
  ) {
    setBusy(true);
    busyRef.current = true;
    setFormError("");
    if (destination === "global") setNotice("");
    try {
      await operation();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : ((error as { message?: string })?.message ??
            "No se pudo completar la acción. Inténtalo nuevamente.");
      if (destination === "form") {
        setFormError(message);
        setTimeout(
          () => document.querySelector<HTMLElement>(".dialog-error")?.focus(),
          0,
        );
      } else setNotice(message);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(async () => {
      const { error } = await db.auth.signInWithPassword({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (error) {
        throw new Error(
          "No pudimos iniciar sesión. Comprueba tu correo y contraseña.",
        );
      }
    });
  }

  function enterDemo() {
    const demoPeople = makeDemoPeople();
    setView("Agenda");
    setDemo(true);
    setAccessStatus("allowed");
    setPeople(demoPeople);
    setTrips(makeDemoTrips(demoPeople));
    setCalendarMonth(localDate().slice(0, 7));
    setSelectedDay(null);
    clearMessages();
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }

  function navigate(label: string) {
    setView(label);
    setQuery("");
    setStatusFilter("Todos");
    setDateFilter("");
    setPersonFilter("");
    setSelectedTrips([]);
    setOnlyUpcoming(label === "Viajes");
    if (label === "Personas") setPeopleFilter("Activas");
    clearMessages();
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }

  function closeModal() {
    setModal(null);
    setEditPerson(null);
    setEditTrip(null);
    setPendingTripDate(null);
    setHistory([]);
    setFormError("");
  }

  function openPerson(person: Person | null = null) {
    clearMessages();
    setPendingTripDate(null);
    setEditPerson(person);
    setModal("person");
  }

  function openTrip(trip: Trip | null, date?: string, personId?: string) {
    clearMessages();
    if (!trip && !activePeople.length && !personId) {
      setPendingTripDate(date || selectedDay || dateFilter || localDate());
      setEditPerson(null);
      setFormError("");
      setModal("person");
      return;
    }
    setEditTrip(trip);
    setTripStatus(trip?.status ?? "Planificado");
    setReservationOpen(
      Boolean(
        trip?.pnr ||
        trip?.flight ||
        trip?.amount ||
        (trip && trip.status !== "Planificado"),
      ),
    );
    setNewDate(date || selectedDay || dateFilter || localDate());
    setNewPerson(personId || personFilter || activePeople[0]?.id || "");
    setModal("trip");
  }

  function openGenerate(personId?: string) {
    clearMessages();
    if (!eligibleFourByThree.length) {
      navigate("Personas");
      setNotice(
        "Agrega una persona activa con turno 4×3 para crear su calendario.",
      );
      return;
    }
    setGenerateSelection(
      personId && eligibleFourByThree.some((person) => person.id === personId)
        ? personId
        : "all",
    );
    setGenerateUntil(addDays(localDate(), 90));
    setModal("generate");
  }

  function showPersonTrips(person: Person) {
    navigate("Viajes");
    setPersonFilter(person.id);
  }

  function showTripGroup(status: string) {
    navigate("Viajes");
    setStatusFilter(status);
    setOnlyUpcoming(true);
  }

  function clearTripFilters() {
    setQuery("");
    setStatusFilter("Todos");
    setDateFilter("");
    setPersonFilter("");
    setOnlyUpcoming(true);
    setSelectedTrips([]);
  }

  async function savePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(async () => {
      const person = {
        name: String(form.get("name")).trim(),
        origin: String(form.get("origin")).trim(),
        destination: String(form.get("destination")).trim(),
        shift: String(form.get("shift")),
        start_date: String(form.get("start_date")),
        end_date: String(form.get("end_date")) || null,
        baggage: String(form.get("baggage")),
        active: form.get("active") === "on",
      };
      if (person.end_date && person.end_date < person.start_date) {
        throw new Error("La fecha de término debe ser posterior al inicio.");
      }
      if (
        person.shift === "4×3" &&
        new Date(person.start_date + "T12:00:00Z").getUTCDay() !== 1
      ) {
        throw new Error("En un turno 4×3, la primera subida debe ser lunes.");
      }
      let savedId = editPerson?.id ?? "";
      if (demo) {
        savedId ||= crypto.randomUUID();
        setPeople((current) =>
          editPerson
            ? current.map((row) =>
                row.id === editPerson.id ? { ...person, id: row.id } : row,
              )
            : [...current, { ...person, id: savedId }].sort((a, b) =>
                a.name.localeCompare(b.name, "es"),
              ),
        );
      } else {
        const result = editPerson
          ? await db.from("people").update(person).eq("id", editPerson.id)
          : await db.from("people").insert(person).select("id").single();
        if (result.error) throw result.error;
        if (!editPerson) savedId = String(result.data?.id ?? "");
        await reload();
      }
      const resumeDate = pendingTripDate;
      closeModal();
      setPendingTripDate(null);
      if (!editPerson && resumeDate && savedId) {
        openTrip(null, resumeDate, savedId);
      } else {
        setNotice(
          "Persona guardada. Sus viajes existentes conservaron sus fechas.",
        );
      }
    }, "form");
  }

  async function saveTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(async () => {
      const person = peopleById.get(String(form.get("person_id")));
      if (!person) throw new Error("Selecciona una persona activa.");
      const direction = String(form.get("direction"));
      const changeReason = String(form.get("change_reason") ?? "").trim();
      const observations = String(form.get("notes") ?? "").trim();
      if (editTrip && !changeReason) {
        throw new Error("Indica el motivo de este cambio.");
      }
      const notes = editTrip
        ? [observations, `Motivo del cambio: ${changeReason}`]
            .filter(Boolean)
            .join("\n")
        : observations;
      const trip = {
        person_id: person.id,
        date: String(form.get("date")),
        direction,
        origin:
          String(form.get("origin")).trim() ||
          (direction === "SUBIDA" ? person.origin : person.destination),
        destination:
          String(form.get("destination")).trim() ||
          (direction === "SUBIDA" ? person.destination : person.origin),
        requested_time: String(form.get("requested_time")) || null,
        baggage: String(form.get("baggage")),
        status: String(form.get("status")),
        pnr: String(form.get("pnr") ?? "").trim(),
        flight: String(form.get("flight") ?? "").trim(),
        amount:
          form.get("amount") === "" || form.get("amount") === null
            ? null
            : Number(form.get("amount")),
        notes,
        updated_at: new Date().toISOString(),
      };
      if (
        (!editTrip || editTrip.date !== trip.date) &&
        (trip.date < person.start_date ||
          (person.end_date && trip.date > person.end_date) ||
          !person.active)
      ) {
        throw new Error(
          "La fecha debe estar dentro de la vigencia de una persona activa.",
        );
      }
      if (
        ["Emitido", "Volado", "No presentado"].includes(trip.status) &&
        !trip.pnr
      ) {
        throw new Error("Registra el código de reserva para este estado.");
      }
      if (
        trips.some(
          (row) =>
            row.id !== editTrip?.id &&
            row.person_id === trip.person_id &&
            row.date === trip.date &&
            row.direction === trip.direction,
        )
      ) {
        throw new Error("Ese movimiento ya existe para la persona y fecha.");
      }
      if (demo) {
        setTrips((current) =>
          (editTrip
            ? current.map((row) =>
                row.id === editTrip.id ? { ...trip, id: row.id } : row,
              )
            : [...current, { ...trip, id: crypto.randomUUID() }]
          ).sort((a, b) => a.date.localeCompare(b.date)),
        );
      } else if (editTrip) {
        const result = await db
          .from("trips")
          .update(trip)
          .eq("id", editTrip.id)
          .eq("updated_at", editTrip.updated_at!)
          .select("id");
        if (result.error) throw result.error;
        if (!result.data?.length) {
          throw new Error(
            "Otra persona modificó este viaje. Actualiza la vista antes de editar.",
          );
        }
        await reload();
      } else {
        const result = await db.from("trips").insert(trip);
        if (result.error) throw result.error;
        await reload();
      }
      closeModal();
      if (view === "Agenda") {
        setCalendarMonth(trip.date.slice(0, 7));
        setSelectedDay(trip.date);
      }
      setNotice("Viaje guardado correctamente.");
    }, "form");
  }

  async function generateTrips(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      if (!generationPeople.length) {
        throw new Error("Selecciona al menos una persona con turno 4×3.");
      }
      if (generateUntil < localDate()) {
        throw new Error("La fecha final debe ser hoy o posterior.");
      }
      let count = 0;
      if (demo) {
        const generated = generationPeople.flatMap((person) => {
          const until =
            person.end_date && person.end_date < generateUntil
              ? person.end_date
              : generateUntil;
          if (until < person.start_date) return [];
          return pulseDates(person.start_date, until)
            .filter(
              (row) =>
                !trips.some(
                  (trip) =>
                    trip.person_id === person.id &&
                    trip.date === row.date &&
                    trip.direction === row.direction,
                ),
            )
            .map((row) => ({
              id: crypto.randomUUID(),
              person_id: person.id,
              ...row,
              origin:
                row.direction === "SUBIDA" ? person.origin : person.destination,
              destination:
                row.direction === "SUBIDA" ? person.destination : person.origin,
              requested_time: null,
              baggage: person.baggage,
              status: "Planificado",
              pnr: "",
              flight: "",
              amount: null,
              notes: "",
            }));
        });
        count = generated.length;
        setTrips((current) =>
          [...current, ...generated].sort((a, b) =>
            a.date.localeCompare(b.date),
          ),
        );
      } else {
        for (let index = 0; index < generationPeople.length; index += 10) {
          const batch = generationPeople.slice(index, index + 10);
          const results = await Promise.all(
            batch.map((person) =>
              db.rpc("generate_pulse", {
                p_id: person.id,
                p_until: generateUntil,
              }),
            ),
          );
          for (const result of results) {
            if (result.error) throw result.error;
            count += Number(result.data ?? 0);
          }
        }
        await reload();
      }
      const peopleCount = generationPeople.length;
      closeModal();
      setNotice(
        `${count} viajes nuevos para ${peopleCount} ${peopleCount === 1 ? "persona" : "personas"}. Los registros existentes se conservaron.`,
      );
    }, "form");
  }

  function exportCsv() {
    const rows = visibleTrips.filter(
      (trip) => trip.status === "Planificado" && trip.date >= localDate(),
    );
    if (!rows.length) {
      setNotice("No hay viajes futuros por solicitar con estos filtros.");
      return;
    }
    const cell = (value: unknown) =>
      '"' +
      String(value ?? "")
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const csv =
      "\uFEFF" +
      [
        [
          "Persona",
          "Fecha",
          "Sentido",
          "Origen",
          "Destino",
          "Hora requerida",
          "Equipaje",
          "Estado",
          "Reserva",
          "Vuelo",
          "Monto CLP",
        ],
        ...rows.map((trip) => [
          personName(trip.person_id),
          trip.date,
          trip.direction,
          trip.origin,
          trip.destination,
          trip.requested_time,
          trip.baggage,
          trip.status,
          trip.pnr,
          trip.flight,
          trip.amount,
        ]),
      ]
        .map((row) => row.map(cell).join(";"))
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fcc-travel-solicitud.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setSelectedTrips(rows.map((trip) => trip.id));
    setNotice(
      "Lista descargada. Revísala y, cuando la envíes, marca la selección como solicitada.",
    );
  }

  async function markSelectedRequested() {
    const ids = selectedTrips.filter((id) =>
      trips.some(
        (trip) =>
          trip.id === id &&
          trip.status === "Planificado" &&
          trip.date >= localDate(),
      ),
    );
    if (!ids.length) {
      setNotice("Selecciona viajes planificados para continuar.");
      return;
    }
    await runAction(async () => {
      const updatedAt = new Date().toISOString();
      if (demo) {
        const selected = new Set(ids);
        setTrips((current) =>
          current.map((trip) =>
            selected.has(trip.id)
              ? {
                  ...trip,
                  status: "Solicitado",
                  notes: [
                    trip.notes.trim(),
                    "Motivo del cambio: Solicitud enviada.",
                  ]
                    .filter(Boolean)
                    .join("\n"),
                  updated_at: updatedAt,
                }
              : trip,
          ),
        );
      } else {
        const rows = ids
          .map((id) => trips.find((trip) => trip.id === id))
          .filter((trip): trip is Trip => Boolean(trip));
        for (let index = 0; index < rows.length; index += 10) {
          const results = await Promise.all(
            rows.slice(index, index + 10).map((trip) =>
              db
                .from("trips")
                .update({
                  status: "Solicitado",
                  notes: [
                    trip.notes.trim(),
                    "Motivo del cambio: Solicitud enviada.",
                  ]
                    .filter(Boolean)
                    .join("\n"),
                  updated_at: updatedAt,
                })
                .eq("id", trip.id)
                .eq("updated_at", trip.updated_at!)
                .select("id"),
            ),
          );
          for (const result of results) {
            if (result.error) throw result.error;
            if (!result.data?.length) {
              throw new Error(
                "Uno de los viajes cambió mientras trabajabas. Actualiza la lista y vuelve a intentarlo.",
              );
            }
          }
        }
        await reload();
      }
      setSelectedTrips([]);
      setNotice(
        `${ids.length} ${ids.length === 1 ? "viaje marcado como solicitado" : "viajes marcados como solicitados"}.`,
      );
    });
  }

  async function showHistory(trip: Trip) {
    clearMessages();
    setEditTrip(trip);
    setHistory([]);
    setHistoryLoading(!demo);
    setModal("history");
    if (demo) return;
    try {
      const { data, error } = await db
        .from("history")
        .select("*")
        .eq("record_id", trip.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setHistory(data ?? []);
    } catch {
      setFormError("No se pudo cargar el historial. Inténtalo nuevamente.");
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      const preferred = document.querySelector<HTMLElement>(
        ".dialog [data-autofocus]:not([disabled])",
      );
      const fallback = document.querySelector<HTMLElement>(
        ".dialog input:not([disabled]):not([type=hidden]), .dialog select:not([disabled]), .dialog textarea:not([disabled]), .dialog button:not([disabled])",
      );
      (preferred ?? fallback)?.focus();
    });
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) closeModal();
      if (event.key !== "Tab") return;
      const items = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".dialog button:not([disabled]), .dialog input:not([disabled]):not([type=hidden]), .dialog select:not([disabled]), .dialog textarea:not([disabled]), .dialog summary",
        ),
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", handleKeydown);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handleKeydown);
      previous?.focus();
    };
  }, [modal]);

  const themeButton = (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={
        theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"
      }
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      <span>{theme === "dark" ? "Claro" : "Oscuro"}</span>
    </button>
  );

  if (!ready) {
    return (
      <main className="login-state" aria-live="polite">
        <span className="loading-mark" aria-hidden="true" />
        <p>Cargando FCC TRAVEL…</p>
      </main>
    );
  }

  if (!email && !demo) {
    return (
      <main className="entry">
        <header className="entry-top">
          <span className="brand">FCC TRAVEL</span>
          <div className="entry-tools">
            <span>FCC / COPIAPÓ</span>
            {themeButton}
          </div>
        </header>
        <section className="entry-center">
          <div className="entry-heading">
            <p className="eyebrow">COORDINACIÓN DE VIAJES</p>
            <h1>
              Tu equipo viaja.
              <br />
              La obra continúa.
            </h1>
            <p className="entry-copy">
              Personas, turnos y pasajes organizados en una sola agenda para
              Copiapó.
            </p>
            <div className="entry-route" aria-label="Rutas habituales">
              <span>Santiago</span>
              <ArrowUpRight size={17} />
              <strong>Copiapó</strong>
              <ArrowDownLeft size={17} />
              <span>Concepción</span>
            </div>
          </div>
          <div className="entry-form">
            <span className="section-kicker">Acceso al equipo</span>
            <h2>Entra a tu agenda</h2>
            <p>Usa el correo habilitado para FCC TRAVEL.</p>
            <form onSubmit={login} aria-busy={busy}>
              <label>
                Correo
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  placeholder="nombre@empresa.cl"
                />
              </label>
              <label>
                Contraseña
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={6}
                />
              </label>
              <button disabled={busy} className="primary">
                {busy ? "Ingresando…" : "Entrar"}
                {!busy && <ArrowUpRight size={18} />}
              </button>
            </form>
            {notice && (
              <p role="alert" className="message error-message">
                {notice}
              </p>
            )}
            <div className="try-demo">
              <span>¿Quieres conocerla primero?</span>
              <button type="button" onClick={enterDemo}>
                Abrir demostración <ArrowUpRight size={18} />
              </button>
            </div>
            <small>
              El responsable de la aplicación debe habilitar tu correo.
            </small>
          </div>
        </section>
        <footer className="entry-footer">
          <span>FCC TRAVEL</span>
          <span>Coordinación de viajes de obra</span>
        </footer>
      </main>
    );
  }

  const hasTripFilters =
    Boolean(query) ||
    Boolean(dateFilter) ||
    statusFilter !== "Todos" ||
    Boolean(personFilter) ||
    !onlyUpcoming;

  return (
    <div className="shell">
      <div
        className="app-content"
        inert={modal ? true : undefined}
        aria-hidden={modal ? true : undefined}
      >
        <header className="topbar">
          <div className="brand-block">
            <span className="brand">FCC TRAVEL</span>
            <span className="worksite">Copiapó</span>
          </div>
          <nav aria-label="Navegación principal">
            {navItems.map(({ label, icon: Icon }) => (
              <button
                type="button"
                key={label}
                className={view === label ? "selected" : ""}
                aria-current={view === label ? "page" : undefined}
                onClick={() => navigate(label)}
              >
                <Icon size={17} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="account">
            {themeButton}
            <span className="account-name">
              {demo ? "Demostración" : email}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label={demo ? "Salir de la demostración" : "Cerrar sesión"}
              onClick={async () => {
                if (!demo) await db.auth.signOut();
                setDemo(false);
                setAccessStatus("checking");
                setPeople([]);
                setTrips([]);
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="workspace">
          {demo && (
            <div className="demo-banner">
              <span className="demo-dot" aria-hidden="true" />
              <span>
                Demostración con datos ficticios. Los cambios duran hasta que
                cierres esta sesión.
              </span>
            </div>
          )}

          {notice && (
            <div className="message global-message" role="status">
              <span>{notice}</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Cerrar aviso"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {accessStatus !== "allowed" && !demo ? (
            <section className="access-state" aria-live="polite">
              {accessStatus === "checking" ? (
                <>
                  <span className="loading-mark" aria-hidden="true" />
                  <h1>Comprobando tu acceso…</h1>
                  <p>Estamos conectando con la agenda del proyecto.</p>
                </>
              ) : accessStatus === "error" ? (
                <>
                  <RefreshCw size={25} />
                  <h1>No pudimos comprobar tu acceso</h1>
                  <p>Revisa la conexión y vuelve a intentarlo.</p>
                  <button type="button" className="primary" onClick={reload}>
                    Intentar nuevamente
                  </button>
                </>
              ) : (
                <>
                  <Users size={25} />
                  <h1>Tu cuenta todavía no está habilitada</h1>
                  <p>
                    Solicita al responsable de FCC TRAVEL que agregue tu correo
                    al equipo.
                  </p>
                  <button type="button" onClick={reload}>
                    Volver a comprobar
                  </button>
                </>
              )}
            </section>
          ) : (
            <>
              <header className="page-head">
                <div>
                  <span className="section-kicker">
                    {view === "Agenda"
                      ? "OPERACIÓN DEL PROYECTO"
                      : view === "Personas"
                        ? "DIRECTORIO DE OBRA"
                        : "SOLICITUDES Y RESERVAS"}
                  </span>
                  <h1>
                    {view === "Agenda"
                      ? "Agenda de viajes"
                      : view === "Personas"
                        ? "Personas del proyecto"
                        : "Viajes y solicitudes"}
                  </h1>
                  <p className="page-description">
                    {view === "Agenda"
                      ? "Revisa el movimiento del equipo y atiende lo que sigue."
                      : view === "Personas"
                        ? "Administra rutas, turnos, vigencia y equipaje."
                        : "Prepara solicitudes y completa cada reserva."}
                  </p>
                </div>
                <button
                  type="button"
                  className="primary page-primary"
                  onClick={() =>
                    view === "Personas" ? openPerson() : openTrip(null)
                  }
                >
                  <Plus size={18} />
                  {view === "Personas" ? "Nueva persona" : "Nuevo viaje"}
                </button>
              </header>

              {view === "Agenda" ? (
                <AgendaView
                  nextTrip={nextTrip}
                  plannedCount={plannedCount}
                  requestedCount={requestedCount}
                  activeCount={activePeople.length}
                  personName={personName}
                  onTrip={(trip) => openTrip(trip)}
                  onPlanned={() => showTripGroup("Planificado")}
                  onRequested={() => showTripGroup("Solicitado")}
                  onPeople={() => navigate("Personas")}
                  onGenerate={() => openGenerate()}
                >
                  <YearView
                    selected={selectedDay}
                    onSelect={setSelectedDay}
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    trips={trips}
                    people={people}
                    onTrip={(id) =>
                      openTrip(trips.find((trip) => trip.id === id) ?? null)
                    }
                    onAdd={(date) => openTrip(null, date)}
                  />
                </AgendaView>
              ) : view === "Personas" ? (
                <section aria-labelledby="people-results">
                  <div className="toolbar people-toolbar">
                    <label className="search-field">
                      <Search size={18} aria-hidden="true" />
                      <input
                        aria-label="Buscar personas"
                        placeholder="Buscar nombre, ciudad o turno…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </label>
                    <div className="filter-pills" aria-label="Filtrar personas">
                      {["Activas", "4×3", "10×10", "Inactivas", "Todas"].map(
                        (option) => (
                          <button
                            type="button"
                            key={option}
                            className={peopleFilter === option ? "active" : ""}
                            aria-pressed={peopleFilter === option}
                            onClick={() => setPeopleFilter(option)}
                          >
                            {option}
                          </button>
                        ),
                      )}
                    </div>
                    <button type="button" onClick={() => openGenerate()}>
                      <CalendarDays size={18} />
                      Planificar 4×3
                    </button>
                  </div>
                  <div
                    className="results-line"
                    id="people-results"
                    aria-live="polite"
                  >
                    <span>
                      {visiblePeople.length} de {people.length} personas
                    </span>
                    {(query || peopleFilter !== "Activas") &&
                      visiblePeople.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuery("");
                            setPeopleFilter("Activas");
                          }}
                        >
                          Limpiar filtros
                        </button>
                      )}
                  </div>

                  {visiblePeople.length ? (
                    <div className="people-list">
                      {visiblePeople.map((person, index) => (
                        <article className="person-row" key={person.id}>
                          <span className="person-index" aria-hidden="true">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <div className="person-name">
                            <div>
                              <h2>{person.name}</h2>
                              <span
                                className={
                                  person.active
                                    ? "active-person"
                                    : "inactive-person"
                                }
                              >
                                {person.active ? "Activa" : "Inactiva"}
                              </span>
                            </div>
                            <small>{person.baggage}</small>
                          </div>
                          <div className="person-route">
                            <small>Ruta habitual</small>
                            <span>
                              {person.origin} <ChevronRight size={15} />{" "}
                              {person.destination}
                            </span>
                          </div>
                          <div className="person-shift">
                            <span
                              className={`shift-badge ${person.shift === "4×3" ? "four" : "ten"}`}
                            >
                              Turno {person.shift}
                            </span>
                            <small>Desde {formatDate(person.start_date)}</small>
                          </div>
                          <div className="person-actions">
                            {person.active && (
                              <button
                                type="button"
                                onClick={() =>
                                  openTrip(null, undefined, person.id)
                                }
                              >
                                <UserPlus size={16} /> Nuevo viaje
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => showPersonTrips(person)}
                            >
                              Ver viajes
                            </button>
                            <button
                              type="button"
                              aria-label={`Editar a ${person.name}`}
                              onClick={() => openPerson(person)}
                            >
                              Editar <ArrowUpRight size={16} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Users />}
                      title={
                        people.length
                          ? "No encontramos personas"
                          : "Agrega a la primera persona"
                      }
                      description={
                        people.length
                          ? "Prueba otra búsqueda o vuelve a las personas activas."
                          : "Su ruta, turno y fecha de inicio serán el punto de partida."
                      }
                      action={
                        people.length ? "Limpiar filtros" : "Nueva persona"
                      }
                      onAction={
                        people.length
                          ? () => {
                              setQuery("");
                              setPeopleFilter("Activas");
                            }
                          : () => openPerson()
                      }
                    />
                  )}
                </section>
              ) : (
                <section aria-labelledby="trip-results">
                  {personFilter && peopleById.get(personFilter) && (
                    <div className="context-banner">
                      <span>
                        Viajes de <strong>{personName(personFilter)}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const person = peopleById.get(personFilter);
                          navigate("Personas");
                          if (person) {
                            setPeopleFilter("Todas");
                            setQuery(person.name);
                          }
                        }}
                      >
                        Volver a la persona
                      </button>
                    </div>
                  )}
                  <div className="toolbar trips-toolbar">
                    <label className="search-field">
                      <Search size={18} aria-hidden="true" />
                      <input
                        aria-label="Buscar viajes"
                        placeholder="Buscar persona, ruta, vuelo o reserva…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </label>
                    <label className="select-field">
                      <span className="sr-only">Filtrar por estado</span>
                      <select
                        aria-label="Filtrar por estado"
                        value={statusFilter}
                        onChange={(event) =>
                          setStatusFilter(event.target.value)
                        }
                      >
                        <option>Todos</option>
                        {statuses.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                    <label className="date-field">
                      <span className="sr-only">Filtrar por fecha</span>
                      <input
                        aria-label="Filtrar por fecha"
                        type="date"
                        value={dateFilter}
                        onChange={(event) => setDateFilter(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className={onlyUpcoming ? "active-filter" : ""}
                      aria-pressed={onlyUpcoming}
                      onClick={() => setOnlyUpcoming((current) => !current)}
                    >
                      <SlidersHorizontal size={17} />
                      {onlyUpcoming ? "Próximos" : "Todos los periodos"}
                    </button>
                    <button type="button" onClick={exportCsv}>
                      <Download size={17} /> Lista para solicitar
                    </button>
                    {!demo && (
                      <button type="button" onClick={reload} disabled={loading}>
                        <RefreshCw
                          className={loading ? "spin" : ""}
                          size={17}
                        />
                        {loading ? "Actualizando…" : "Actualizar"}
                      </button>
                    )}
                  </div>
                  <div
                    className="results-line"
                    id="trip-results"
                    aria-live="polite"
                  >
                    <span>
                      {visibleTrips.length}{" "}
                      {visibleTrips.length === 1 ? "viaje" : "viajes"}
                      {onlyUpcoming ? " desde hoy" : " en total"}
                      {statusFilter !== "Todos" ? ` · ${statusFilter}` : ""}
                      {dateFilter ? ` · ${formatDate(dateFilter)}` : ""}
                    </span>
                    {hasTripFilters && visibleTrips.length > 0 && (
                      <button type="button" onClick={clearTripFilters}>
                        Limpiar filtros
                      </button>
                    )}
                  </div>

                  {selectedTrips.length > 0 && (
                    <div className="bulk-action-bar" role="status">
                      <span>
                        <strong>{selectedTrips.length}</strong>{" "}
                        {selectedTrips.length === 1
                          ? "viaje seleccionado"
                          : "viajes seleccionados"}
                      </span>
                      <div>
                        <button
                          type="button"
                          onClick={() => setSelectedTrips([])}
                          disabled={busy}
                        >
                          Quitar selección
                        </button>
                        <button
                          type="button"
                          className="primary"
                          onClick={() => void markSelectedRequested()}
                          disabled={busy}
                        >
                          {busy
                            ? "Actualizando…"
                            : `Marcar ${selectedTrips.length} como ${selectedTrips.length === 1 ? "solicitado" : "solicitados"}`}
                        </button>
                      </div>
                    </div>
                  )}

                  {visibleTrips.length ? (
                    <div
                      className="table-wrap"
                      role="region"
                      aria-label="Listado de viajes"
                      tabIndex={0}
                    >
                      <table>
                        <thead>
                          <tr>
                            <th className="selection-cell">
                              <label className="selection-toggle">
                                <input
                                  type="checkbox"
                                  aria-label="Seleccionar todos los viajes planificados visibles"
                                  checked={
                                    requestableTrips.length > 0 &&
                                    requestableTrips.every((trip) =>
                                      selectedTrips.includes(trip.id),
                                    )
                                  }
                                  onChange={(event) => {
                                    const ids = requestableTrips.map(
                                      (trip) => trip.id,
                                    );
                                    setSelectedTrips((current) =>
                                      event.target.checked
                                        ? Array.from(
                                            new Set([...current, ...ids]),
                                          )
                                        : current.filter(
                                            (id) => !ids.includes(id),
                                          ),
                                    );
                                  }}
                                  disabled={!requestableTrips.length}
                                />
                              </label>
                            </th>
                            <th>Persona y ruta</th>
                            <th>Fecha</th>
                            <th>Movimiento</th>
                            <th>Hora</th>
                            <th>Estado</th>
                            <th>Reserva</th>
                            <th>
                              <span className="sr-only">Acciones</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleTrips.map((trip) => (
                            <tr key={trip.id}>
                              <td
                                data-label="Seleccionar"
                                className="selection-cell"
                              >
                                {trip.status === "Planificado" &&
                                trip.date >= localDate() ? (
                                  <label className="selection-toggle">
                                    <input
                                      type="checkbox"
                                      aria-label={`Seleccionar viaje de ${personName(trip.person_id)} del ${formatDate(trip.date)}`}
                                      checked={selectedTrips.includes(trip.id)}
                                      onChange={(event) =>
                                        setSelectedTrips((current) =>
                                          event.target.checked
                                            ? [...current, trip.id]
                                            : current.filter(
                                                (id) => id !== trip.id,
                                              ),
                                        )
                                      }
                                    />
                                  </label>
                                ) : (
                                  <span aria-hidden="true">—</span>
                                )}
                              </td>
                              <td data-label="Persona y ruta">
                                <strong>{personName(trip.person_id)}</strong>
                                <small>
                                  {trip.origin} → {trip.destination}
                                </small>
                              </td>
                              <td data-label="Fecha">
                                {formatDate(trip.date)}
                              </td>
                              <td data-label="Movimiento">
                                <span
                                  className={`direction ${trip.direction.toLowerCase()}`}
                                >
                                  {trip.direction === "SUBIDA" ? (
                                    <ArrowUpRight size={16} />
                                  ) : (
                                    <ArrowDownLeft size={16} />
                                  )}
                                  {trip.direction === "SUBIDA"
                                    ? "Subida"
                                    : "Bajada"}
                                </span>
                              </td>
                              <td data-label="Hora">
                                {trip.requested_time?.slice(0, 5) ||
                                  "Por confirmar"}
                              </td>
                              <td data-label="Estado">
                                <span
                                  className={`status-pill ${statusClass(trip.status)}`}
                                >
                                  {trip.status}
                                </span>
                              </td>
                              <td data-label="Reserva">{trip.pnr || "—"}</td>
                              <td data-label="Acciones" className="row-actions">
                                <button
                                  type="button"
                                  onClick={() => openTrip(trip)}
                                >
                                  Abrir <ArrowUpRight size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-button"
                                  aria-label={`Ver historial de ${personName(trip.person_id)}`}
                                  onClick={() => void showHistory(trip)}
                                >
                                  <Clock size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Plane />}
                      title={
                        hasTripFilters
                          ? "No hay viajes con estos filtros"
                          : "Aún no hay viajes"
                      }
                      description={
                        hasTripFilters
                          ? "Cambia los filtros para ampliar la búsqueda."
                          : people.length
                            ? "Agrega un viaje o planifica el calendario de los turnos 4×3."
                            : "Primero registra a las personas que viajarán."
                      }
                      action={
                        hasTripFilters
                          ? "Limpiar filtros"
                          : people.length
                            ? "Nuevo viaje"
                            : "Ir a personas"
                      }
                      onAction={
                        hasTripFilters
                          ? clearTripFilters
                          : people.length
                            ? () => openTrip(null)
                            : () => navigate("Personas")
                      }
                    />
                  )}
                  <div className="integration-note">
                    <Plane size={17} />
                    <span>
                      <strong>Tarifas en vivo aún no conectadas.</strong> El
                      monto se registra al confirmar el pasaje.
                    </span>
                  </div>
                </section>
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>FCC TRAVEL / Copiapó</span>
            <span>Personas · Planificación · Pasajes</span>
          </footer>
        </main>
      </div>

      {modal && (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) closeModal();
          }}
        >
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            aria-describedby="dialog-description"
          >
            <header className="dialog-head">
              <div>
                <span className="section-kicker">
                  {modal === "person"
                    ? "DIRECTORIO"
                    : modal === "generate"
                      ? "PLANIFICACIÓN 4×3"
                      : modal === "history"
                        ? "TRAZABILIDAD"
                        : "REGISTRO DE VIAJE"}
                </span>
                <h2 id="dialog-title">
                  {modal === "person"
                    ? editPerson
                      ? "Editar persona"
                      : pendingTripDate
                        ? "Primero, agrega una persona"
                        : "Nueva persona"
                    : modal === "trip"
                      ? editTrip
                        ? "Editar viaje"
                        : "Nuevo viaje"
                      : modal === "generate"
                        ? "Crear calendario 4×3"
                        : "Historial del viaje"}
                </h2>
                <p id="dialog-description">
                  {modal === "person"
                    ? pendingTripDate
                      ? `Al guardarla, continuaremos con el viaje del ${formatDate(pendingTripDate)}.`
                      : "Define su ruta habitual, turno y vigencia."
                    : modal === "trip"
                      ? "Registra el movimiento y completa la reserva cuando corresponda."
                      : modal === "generate"
                        ? "Crea subidas los lunes y bajadas los jueves sin duplicar viajes."
                        : editTrip
                          ? `${personName(editTrip.person_id)} · ${formatDate(editTrip.date)}`
                          : "Cambios registrados en este viaje."}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Cerrar"
                disabled={busy}
                onClick={closeModal}
              >
                <X size={20} />
              </button>
            </header>

            {formError && (
              <p
                role="alert"
                tabIndex={-1}
                className="message error-message dialog-error"
              >
                {formError}
              </p>
            )}

            {modal === "person" && (
              <form onSubmit={savePerson} aria-busy={busy}>
                <div className="dialog-body">
                  <section
                    className="form-section"
                    aria-labelledby="person-main"
                  >
                    <h3 id="person-main">Datos de la persona</h3>
                    <label>
                      Nombre completo
                      <input
                        data-autofocus
                        name="name"
                        required
                        minLength={2}
                        maxLength={180}
                        defaultValue={editPerson?.name}
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        Origen habitual
                        <input
                          name="origin"
                          required
                          defaultValue={editPerson?.origin}
                          placeholder="Santiago"
                        />
                      </label>
                      <label>
                        Destino de subida
                        <input
                          name="destination"
                          required
                          defaultValue={editPerson?.destination ?? "Copiapó"}
                        />
                      </label>
                    </div>
                  </section>
                  <section
                    className="form-section"
                    aria-labelledby="person-schedule"
                  >
                    <h3 id="person-schedule">Turno y vigencia</h3>
                    <div className="form-grid">
                      <label>
                        Turno
                        <select
                          name="shift"
                          defaultValue={editPerson?.shift ?? "4×3"}
                        >
                          <option>4×3</option>
                          <option>10×10</option>
                        </select>
                      </label>
                      <label>
                        Primera subida / inicio
                        <input
                          name="start_date"
                          type="date"
                          required
                          defaultValue={
                            editPerson?.start_date ??
                            nextWeekday(localDate(), 1)
                          }
                        />
                      </label>
                      <label>
                        Vigente hasta <small>(opcional)</small>
                        <input
                          name="end_date"
                          type="date"
                          defaultValue={editPerson?.end_date ?? ""}
                        />
                      </label>
                      <label>
                        Equipaje habitual
                        <select
                          name="baggage"
                          defaultValue={editPerson?.baggage ?? "Por confirmar"}
                        >
                          {baggageOptions.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="check-field">
                      <input
                        name="active"
                        type="checkbox"
                        defaultChecked={editPerson?.active ?? true}
                      />
                      <span>
                        <strong>Persona activa</strong>
                        <small>
                          Puede recibir nuevos viajes y planificación.
                        </small>
                      </span>
                    </label>
                    <p className="hint">
                      Para 4×3, el inicio debe ser lunes. Las fechas 10×10 se
                      registran manualmente.
                    </p>
                  </section>
                </div>
                <DialogActions
                  busy={busy}
                  busyLabel="Guardando…"
                  submitLabel="Guardar persona"
                  onCancel={closeModal}
                />
              </form>
            )}

            {modal === "trip" && (
              <form onSubmit={saveTrip} aria-busy={busy}>
                <div className="dialog-body">
                  {editTrip && (
                    <button
                      type="button"
                      className="context-link"
                      onClick={() => void showHistory(editTrip)}
                    >
                      <Clock size={16} /> Ver historial del viaje
                    </button>
                  )}
                  <section className="form-section" aria-labelledby="trip-main">
                    <h3 id="trip-main">Movimiento</h3>
                    <label>
                      Persona
                      {editTrip && (
                        <input
                          type="hidden"
                          name="person_id"
                          value={editTrip.person_id}
                        />
                      )}
                      <select
                        data-autofocus
                        disabled={Boolean(editTrip)}
                        name="person_id"
                        required
                        defaultValue={editTrip?.person_id ?? newPerson}
                        onChange={(event) =>
                          fillRoute(
                            event.currentTarget.form,
                            event.currentTarget.value,
                          )
                        }
                      >
                        <option value="" disabled>
                          Seleccionar persona
                        </option>
                        {people.map((person) => (
                          <option
                            key={person.id}
                            value={person.id}
                            disabled={!person.active}
                          >
                            {person.name}
                            {!person.active ? " · inactiva" : ""}
                          </option>
                        ))}
                      </select>
                      {editTrip && (
                        <small>
                          La persona se mantiene para conservar la trazabilidad.
                        </small>
                      )}
                    </label>
                    <div className="form-grid">
                      <label>
                        Fecha
                        <input
                          name="date"
                          type="date"
                          required
                          defaultValue={editTrip?.date ?? newDate}
                        />
                      </label>
                      <label>
                        Movimiento
                        {editTrip && (
                          <input
                            type="hidden"
                            name="direction"
                            value={editTrip.direction}
                          />
                        )}
                        <select
                          disabled={Boolean(editTrip)}
                          name="direction"
                          defaultValue={editTrip?.direction ?? "SUBIDA"}
                          onChange={(event) =>
                            fillRoute(
                              event.currentTarget.form,
                              undefined,
                              event.currentTarget.value,
                            )
                          }
                        >
                          <option value="SUBIDA">Subida</option>
                          <option value="BAJADA">Bajada</option>
                        </select>
                        {editTrip && (
                          <small>
                            El sentido identifica este registro y no se cambia.
                          </small>
                        )}
                      </label>
                      <label>
                        Origen
                        <input
                          name="origin"
                          defaultValue={
                            editTrip?.origin ??
                            peopleById.get(newPerson)?.origin ??
                            activePeople[0]?.origin
                          }
                          placeholder="Usar ruta habitual"
                        />
                      </label>
                      <label>
                        Destino
                        <input
                          name="destination"
                          defaultValue={
                            editTrip?.destination ??
                            peopleById.get(newPerson)?.destination ??
                            activePeople[0]?.destination
                          }
                          placeholder="Usar ruta habitual"
                        />
                      </label>
                      <label>
                        Hora requerida
                        <input
                          name="requested_time"
                          type="time"
                          defaultValue={editTrip?.requested_time?.slice(0, 5)}
                        />
                      </label>
                      <label>
                        Equipaje
                        <select
                          name="baggage"
                          defaultValue={
                            editTrip?.baggage ??
                            peopleById.get(newPerson)?.baggage ??
                            activePeople[0]?.baggage ??
                            "Por confirmar"
                          }
                        >
                          {baggageOptions.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </section>

                  <section
                    className="form-section"
                    aria-labelledby="trip-status"
                  >
                    <h3 id="trip-status">Estado</h3>
                    <label>
                      Estado del viaje
                      <select
                        name="status"
                        value={tripStatus}
                        onChange={(event) => {
                          setTripStatus(event.target.value);
                          if (event.target.value !== "Planificado") {
                            setReservationOpen(true);
                          }
                        }}
                      >
                        {statuses.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                    <details
                      className="form-disclosure"
                      open={reservationOpen || reservationRequired}
                      onToggle={(event) => {
                        if (reservationRequired && !event.currentTarget.open) {
                          event.currentTarget.open = true;
                          setReservationOpen(true);
                        } else {
                          setReservationOpen(event.currentTarget.open);
                        }
                      }}
                    >
                      <summary
                        aria-disabled={reservationRequired || undefined}
                        onClick={(event) => {
                          if (reservationRequired) event.preventDefault();
                        }}
                      >
                        <span>
                          <strong>Datos de reserva</strong>
                          <small>
                            PNR, vuelo y monto cuando estén disponibles
                          </small>
                        </span>
                        <ChevronRight size={18} />
                      </summary>
                      <div className="form-grid disclosure-content">
                        <label>
                          Código de reserva
                          <input
                            name="pnr"
                            defaultValue={editTrip?.pnr}
                            maxLength={40}
                            required={reservationRequired}
                          />
                        </label>
                        <label>
                          Aerolínea y vuelo
                          <input
                            name="flight"
                            defaultValue={editTrip?.flight}
                            placeholder="Ej. LA 112"
                          />
                        </label>
                        <label>
                          Monto por persona (CLP)
                          <input
                            name="amount"
                            type="number"
                            min="0"
                            step="1"
                            defaultValue={editTrip?.amount ?? ""}
                          />
                        </label>
                      </div>
                    </details>
                  </section>

                  <section
                    className="form-section"
                    aria-labelledby="trip-notes"
                  >
                    <h3 id="trip-notes">Observaciones</h3>
                    <label>
                      Información útil <small>(opcional)</small>
                      <textarea
                        name="notes"
                        defaultValue={editTrip?.notes}
                        placeholder="Restricciones horarias, equipaje o acuerdos."
                      />
                    </label>
                    {editTrip && (
                      <label>
                        Motivo de este cambio
                        <textarea
                          name="change_reason"
                          required
                          placeholder="Describe brevemente qué cambió y por qué."
                        />
                      </label>
                    )}
                    <p className="hint">
                      Los montos los registra el equipo. Cambiar a Solicitado
                      indica que la solicitud ya fue enviada.
                    </p>
                  </section>
                </div>
                <DialogActions
                  busy={busy}
                  busyLabel="Guardando…"
                  submitLabel="Guardar viaje"
                  onCancel={closeModal}
                />
              </form>
            )}

            {modal === "generate" && (
              <form onSubmit={generateTrips} aria-busy={busy}>
                <div className="dialog-body">
                  <section className="form-section generate-section">
                    <div
                      className="pulse-example"
                      aria-label="Regla de turno 4 por 3"
                    >
                      <span className="four">
                        Lun <strong>Subida</strong>
                      </span>
                      <ChevronRight size={16} />
                      <span>Mar</span>
                      <span>Mié</span>
                      <ChevronRight size={16} />
                      <span className="four">
                        Jue <strong>Bajada</strong>
                      </span>
                    </div>
                    <label>
                      Personas a planificar
                      <select
                        data-autofocus
                        name="person_id"
                        value={generateSelection}
                        onChange={(event) =>
                          setGenerateSelection(event.target.value)
                        }
                      >
                        <option value="all">
                          Todas las personas 4×3 activas (
                          {eligibleFourByThree.length})
                        </option>
                        {eligibleFourByThree.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Generar hasta
                      <input
                        type="date"
                        name="until"
                        required
                        min={localDate()}
                        value={generateUntil}
                        onChange={(event) =>
                          setGenerateUntil(event.target.value)
                        }
                      />
                    </label>
                    <div className="generation-preview" aria-live="polite">
                      <span>Se agregarán</span>
                      <strong>{generationPreview} viajes</strong>
                      <small>
                        para {generationPeople.length}{" "}
                        {generationPeople.length === 1 ? "persona" : "personas"}
                        . Los viajes existentes no se duplican.
                      </small>
                    </div>
                  </section>
                </div>
                <DialogActions
                  busy={busy}
                  busyLabel="Generando…"
                  submitLabel={`Generar ${generationPreview} viajes`}
                  submitDisabled={!generationPreview}
                  onCancel={closeModal}
                />
              </form>
            )}

            {modal === "history" && (
              <div className="history-view">
                <div className="dialog-body">
                  {editTrip && (
                    <button
                      type="button"
                      className="context-link"
                      onClick={() => openTrip(editTrip)}
                    >
                      <ArrowDownLeft size={16} /> Volver al viaje
                    </button>
                  )}
                  {historyLoading ? (
                    <div className="history-loading" aria-live="polite">
                      <span className="loading-mark" aria-hidden="true" />
                      <p>Cargando cambios…</p>
                    </div>
                  ) : demo ? (
                    <EmptyState
                      icon={<Clock />}
                      title="Historial disponible en la operación"
                      description="La demostración no guarda cambios permanentes."
                    />
                  ) : history.length ? (
                    <div className="history-list">
                      {history.map((item) => (
                        <article className="history-item" key={item.id}>
                          <span className="history-dot" aria-hidden="true" />
                          <div>
                            <strong>
                              {item.action === "INSERT"
                                ? "Viaje creado"
                                : "Viaje actualizado"}
                            </strong>
                            <small>
                              {formatDateTime(item.created_at)} · Usuario{" "}
                              {item.actor?.slice(0, 8)}
                            </small>
                            <p>
                              {String(
                                item.after_data?.notes || "Sin observaciones",
                              )}{" "}
                              · {String(item.after_data?.status || "")}
                            </p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Clock />}
                      title="Sin cambios anteriores"
                      description="Este viaje todavía no tiene cambios registrados."
                    />
                  )}
                </div>
                <div className="dialog-actions">
                  <button type="button" onClick={closeModal}>
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );

  function fillRoute(
    form: HTMLFormElement | null,
    personId?: string,
    directionOverride?: string,
  ) {
    if (!form) return;
    const personSelect = form.elements.namedItem(
      "person_id",
    ) as HTMLSelectElement;
    const directionSelect = form.elements.namedItem(
      "direction",
    ) as HTMLSelectElement;
    const person = peopleById.get(personId ?? personSelect.value);
    if (!person) return;
    const direction = directionOverride ?? directionSelect.value;
    const down = direction === "BAJADA";
    (form.elements.namedItem("origin") as HTMLInputElement).value = down
      ? person.destination
      : person.origin;
    (form.elements.namedItem("destination") as HTMLInputElement).value = down
      ? person.origin
      : person.destination;
    (form.elements.namedItem("baggage") as HTMLSelectElement).value =
      person.baggage;
  }
}

function AgendaView({
  nextTrip,
  plannedCount,
  requestedCount,
  activeCount,
  personName,
  onTrip,
  onPlanned,
  onRequested,
  onPeople,
  onGenerate,
  children,
}: {
  nextTrip?: Trip;
  plannedCount: number;
  requestedCount: number;
  activeCount: number;
  personName: (id: string) => string;
  onTrip: (trip: Trip) => void;
  onPlanned: () => void;
  onRequested: () => void;
  onPeople: () => void;
  onGenerate: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <section className="overview-strip" aria-label="Resumen operativo">
        <button
          type="button"
          className="overview-card next"
          onClick={() => nextTrip && onTrip(nextTrip)}
          disabled={!nextTrip}
        >
          <span>Próximo movimiento</span>
          {nextTrip ? (
            <>
              <strong>{formatDate(nextTrip.date)}</strong>
              <small>
                {personName(nextTrip.person_id)} ·{" "}
                {nextTrip.requested_time?.slice(0, 5) || "hora pendiente"}
              </small>
            </>
          ) : (
            <>
              <strong>Sin viajes próximos</strong>
              <small>La agenda está despejada</small>
            </>
          )}
          <ChevronRight size={18} />
        </button>
        <button type="button" className="overview-card" onClick={onPlanned}>
          <span>Por solicitar</span>
          <strong>{plannedCount}</strong>
          <small>Viajes planificados</small>
          <ChevronRight size={18} />
        </button>
        <button type="button" className="overview-card" onClick={onRequested}>
          <span>Pendientes de confirmación</span>
          <strong>{requestedCount}</strong>
          <small>Solicitudes enviadas</small>
          <ChevronRight size={18} />
        </button>
        <button type="button" className="overview-card" onClick={onPeople}>
          <span>Personas activas</span>
          <strong>{activeCount}</strong>
          <small>En el proyecto</small>
          <ChevronRight size={18} />
        </button>
      </section>
      <div className="agenda-actions">
        <button
          type="button"
          className="shift-action four"
          onClick={onGenerate}
        >
          <CalendarDays size={17} /> Planificar turnos 4×3
        </button>
        <p>
          <span className="shift-dot ten" /> Los turnos 10×10 se agregan con sus
          fechas confirmadas.
        </p>
      </div>
      {children}
    </>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && onAction && (
        <button type="button" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

function DialogActions({
  busy,
  busyLabel,
  submitLabel,
  submitDisabled = false,
  onCancel,
}: {
  busy: boolean;
  busyLabel: string;
  submitLabel: string;
  submitDisabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="dialog-actions">
      <button type="button" onClick={onCancel} disabled={busy}>
        Cancelar
      </button>
      <button className="primary" disabled={busy || submitDisabled}>
        {busy ? busyLabel : submitLabel}
      </button>
    </div>
  );
}
