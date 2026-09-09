"use client";

// Aqui vive todo el estado de la aplicacion: las variables, los efectos y las
// funciones que antes estaban dentro de App(). El texto es identico al que
// habia en page.tsx; lo unico nuevo es el envoltorio de las tres ultimas
// funciones de este archivo.
//
// Cualquier pieza de la aplicacion pide lo que necesita con useApp().

import {
  FormEvent,
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { db } from "../lib/supabase";
import { addDays, pulseDates } from "../lib/calendar";
import { makeDemoPeople, makeDemoTrips } from "../lib/demo";
import { localDate, normalize } from "../lib/format";
import type {
  AccessStatus,
  HistoryItem,
  ModalName,
  Person,
  Trip,
} from "../lib/types";

function useStoreValue() {
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
        (peopleFilter === "10×10" && person.active && person.shift === "10×10") ||
        (peopleFilter === "Por confirmar" &&
          person.active &&
          person.shift === "Por confirmar");
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
            !["Anulado", "Completado", "No presentado"].includes(trip.status),
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

  const reservationRequired = ["Emitido", "Completado", "No presentado"].includes(
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
        ["Emitido", "Completado", "No presentado"].includes(trip.status) &&
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

  return {
    theme,
    setTheme,
    ready,
    setReady,
    email,
    setEmail,
    demo,
    setDemo,
    accessStatus,
    setAccessStatus,
    people,
    setPeople,
    trips,
    setTrips,
    view,
    setView,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    dateFilter,
    setDateFilter,
    personFilter,
    setPersonFilter,
    peopleFilter,
    setPeopleFilter,
    onlyUpcoming,
    setOnlyUpcoming,
    selectedTrips,
    setSelectedTrips,
    calendarMonth,
    setCalendarMonth,
    selectedDay,
    setSelectedDay,
    modal,
    setModal,
    editPerson,
    setEditPerson,
    editTrip,
    setEditTrip,
    newDate,
    setNewDate,
    newPerson,
    setNewPerson,
    pendingTripDate,
    setPendingTripDate,
    tripStatus,
    setTripStatus,
    reservationOpen,
    setReservationOpen,
    generateSelection,
    setGenerateSelection,
    generateUntil,
    setGenerateUntil,
    history,
    setHistory,
    notice,
    setNotice,
    formError,
    setFormError,
    busy,
    setBusy,
    loading,
    setLoading,
    historyLoading,
    setHistoryLoading,
    busyRef,
    allRows,
    reload,
    peopleById,
    personName,
    activePeople,
    eligibleFourByThree,
    visiblePeople,
    visibleTrips,
    requestableTrips,
    upcomingTrips,
    plannedCount,
    requestedCount,
    nextTrip,
    generationPeople,
    generationPreview,
    reservationRequired,
    toggleTheme,
    clearMessages,
    runAction,
    login,
    enterDemo,
    navigate,
    closeModal,
    openPerson,
    openTrip,
    openGenerate,
    showPersonTrips,
    showTripGroup,
    clearTripFilters,
    savePerson,
    saveTrip,
    generateTrips,
    exportCsv,
    markSelectedRequested,
    showHistory,
  };
}

type Store = ReturnType<typeof useStoreValue>;

const AppContext = createContext<Store | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue();
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const store = useContext(AppContext);
  if (!store) throw new Error("useApp se uso fuera de AppProvider");
  return store;
}
