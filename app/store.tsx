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
import { addDays } from "../lib/calendar";
import { movimientos } from "../lib/cycles";
import {
  cobertura,
  porMes,
  porPersona,
  porRuta,
  referenciaDeRuta,
  rutaDe,
} from "../lib/costs";
import {
  VENTANA_POR_OMISION,
  estadoDeCompra,
  resumenDeCompra,
  ventanaValida,
} from "../lib/purchase";
import {
  hayExigencias,
  limpiarNombreDeTipo,
  motivosDeAcreditacion,
  nombreDeTipoValido,
  resumenDeMotivos,
  tipoRepetido,
  type DocumentoDePersona,
  type TipoDeDocumento,
} from "../lib/accreditation";
import {
  makeDemoDocuments,
  makeDemoDocumentTypes,
  makeDemoPeople,
  makeDemoTrips,
} from "../lib/demo";
import { localDate, normalize } from "../lib/format";
import { csvDeViajes } from "../lib/trips-csv";
import type {
  AccessStatus,
  HistoryItem,
  ModalName,
  Person,
  Trip,
} from "../lib/types";
import { esTurnoRotativo } from "../lib/types";

/** Lo que dura la salida del diálogo. Tiene que calzar con el CSS. */
const MS_CIERRE_DIALOGO = 200;

function useStoreValue() {
  const [theme, setTheme] = useState("dark");
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>("checking");
  const [isAdmin, setIsAdmin] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [documentTypes, setDocumentTypes] = useState<TipoDeDocumento[]>([]);
  const [documents, setDocuments] = useState<DocumentoDePersona[]>([]);
  // Viajes del manifiesto que Katy o Tamara decidieron incluir aunque la persona
  // tenga documentos pendientes. Vale solo mientras el manifiesto está abierto.
  const [conAcreditacionAprobada, setConAcreditacionAprobada] = useState<string[]>([]);
  const [view, setView] = useState("Agenda");
  const [query, setQuery] = useState("");
  const [peopleQuery, setPeopleQuery] = useState("");
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
  const [calendarShift, setCalendarShift] = useState("Todos");
  const [costMonth, setCostMonth] = useState("");
  const [costStatus, setCostStatus] = useState("Todos");
  const [costCategory, setCostCategory] = useState("");
  const [modal, setModal] = useState<ModalName>(null);
  const [closingModal, setClosingModal] = useState(false);
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
  // Dias de anticipacion con que se compran los pasajes. Es una politica de la
  // obra: vive en la base, no en el navegador. Mientras carga vale la de siempre.
  const [purchaseWindow, setPurchaseWindow] = useState(VENTANA_POR_OMISION);
  const [purchaseFilter, setPurchaseFilter] = useState("todos");
  const busyRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("fcc-travel-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
  }, []);

  useEffect(() => {
    let sesion;
    try {
      sesion = db().auth;
    } catch (error) {
      // Sin variables de entorno no hay a quién preguntarle por la sesión. Se
      // muestra la pantalla de entrada con el motivo, en vez de una página en
      // blanco, y la demostración sigue funcionando sin credenciales.
      setNotice(
        error instanceof Error
          ? error.message
          : "Falta configurar el acceso a la base de datos.",
      );
      setReady(true);
      return;
    }
    sesion.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });
    const { data } = sesion.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function allRows(table: string) {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db()
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
      const { data: member, error } = await db().rpc("is_member");
      if (error) throw error;
      if (!member) {
        setAccessStatus("denied");
        setPeople([]);
        setTrips([]);
        setDocumentTypes([]);
        setDocuments([]);
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
      // Si la tabla todavia no existe, se sigue con la ventana por omision en
      // vez de dejar la aplicacion sin cargar.
      const ajustes = await db()
        .from("settings")
        .select("purchase_window_days")
        .maybeSingle();
      if (!ajustes.error && ajustes.data) {
        setPurchaseWindow(
          Number(ajustes.data.purchase_window_days) || VENTANA_POR_OMISION,
        );
      }
      // Acreditación. Si las tablas todavía no existen (la migración 010 sin
      // aplicar) nada se exige y la aplicación sigue como antes.
      try {
        const tipos = await db()
          .from("document_types")
          .select("id,name,active")
          .order("name");
        if (tipos.error) throw tipos.error;
        const filas = await allRows("person_documents");
        setDocumentTypes((tipos.data ?? []) as TipoDeDocumento[]);
        setDocuments(filas as unknown as DocumentoDePersona[]);
      } catch {
        setDocumentTypes([]);
        setDocuments([]);
      }
      // El rol decide si aparece "Accesos". Si la función todavía no existe en
      // la base (la migración 009 sin aplicar) simplemente no se es administrador.
      const admin = await db().rpc("is_admin");
      setIsAdmin(!admin.error && admin.data === true);
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

  // Al cerrar sesión, o si se pierde el rol (se recalcula cada minuto junto con
  // los datos), "Accesos" deja de existir y no se puede quedar la pantalla abierta.
  useEffect(() => {
    if (!email || demo) setIsAdmin(false);
  }, [email, demo]);
  useEffect(() => {
    if (!isAdmin) setView((actual) => (actual === "Accesos" ? "Agenda" : actual));
  }, [isAdmin]);

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

  // Personas a las que el motor les puede armar el calendario: activas y con
  // jornada definida. Antes solo el 4×3; el 10×10 se cargaba viaje por viaje.
  const planificables = useMemo(
    () =>
      people.filter(
        (person) =>
          person.active && esTurnoRotativo(person.shift),
      ),
    [people],
  );

  const visiblePeople = useMemo(() => {
    const needle = normalize(peopleQuery);
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
        (peopleFilter === "Sin turno" &&
          person.active &&
          person.shift === "Sin turno") ||
        (peopleFilter === "Por confirmar" &&
          person.active &&
          person.shift === "Por confirmar");
      return matchesText && matchesFilter;
    });
  }, [people, peopleFilter, peopleQuery]);

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
          (!onlyUpcoming || trip.date >= localDate()) &&
          (purchaseFilter === "todos" ||
            (purchaseFilter === "abiertos" &&
              ["urgente", "vencido"].includes(
                estadoDeCompra(trip, localDate(), purchaseWindow),
              )))
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
    purchaseFilter,
    purchaseWindow,
  ]);

  // En que situacion de compra esta cada viaje, segun la ventana vigente.
  const compraDe = (trip: Pick<Trip, "date" | "status" | "pnr">) =>
    estadoDeCompra(trip, localDate(), purchaseWindow);

  const resumenCompra = useMemo(
    () => resumenDeCompra(trips, localDate(), purchaseWindow),
    [trips, purchaseWindow],
  );

  const costTrips = useMemo(
    () => trips.filter((trip) =>
      (!costMonth || trip.date.startsWith(costMonth)) &&
      (costStatus === "Todos" || trip.status === costStatus)
    ),
    [trips, costMonth, costStatus],
  );

  // La cobertura y los totales siempre usan el mismo período y estado.
  const costos = useMemo(
    () => ({
      cobertura: cobertura(costTrips),
      porMes: porMes(costTrips),
      porRuta: porRuta(costTrips),
      porPersona: porPersona(costTrips),
    }),
    [costTrips],
  );

  // El precio de referencia de la ruta de un viaje, para comparar al registrar
  // un monto nuevo.
  const referenciaDe = (trip: Pick<Trip, "origin" | "destination">) =>
    referenciaDeRuta(trips, rutaDe(trip));

  const requestableTrips = useMemo(
    () =>
      visibleTrips.filter(
        (trip) => trip.status === "Planificado" && trip.date >= localDate(),
      ),
    [visibleTrips],
  );

  // Los viajes que van al manifiesto. Si Katy ya marcó algunos, el manifiesto es
  // de esos y de nadie más: lo que ve en la pantalla es lo que va en el correo.
  // Si no marcó ninguno, son todos los que están por solicitar.
  const manifestCandidates = useMemo(() => {
    const marcados = requestableTrips.filter((trip) =>
      selectedTrips.includes(trip.id),
    );
    return marcados.length ? marcados : requestableTrips;
  }, [requestableTrips, selectedTrips]);

  // Acreditación: de los viajes del manifiesto, los de personas con documentos
  // faltantes o vencidos para la fecha del viaje. Nunca se ocultan: salen del
  // manifiesto a la vista, con su motivo, salvo que alguien decida incluirlos.
  const exigeAcreditacion = hayExigencias(documentTypes);
  const manifestPendientesDeAcreditacion = useMemo(
    () =>
      manifestCandidates
        .map((trip) => ({
          trip,
          motivos: motivosDeAcreditacion(
            trip.person_id,
            trip.date,
            documentTypes,
            documents,
          ),
          incluido: conAcreditacionAprobada.includes(trip.id),
        }))
        .filter((fila) => fila.motivos.length > 0),
    [manifestCandidates, documentTypes, documents, conAcreditacionAprobada],
  );
  const manifestTrips = useMemo(() => {
    const fuera = new Set(
      manifestPendientesDeAcreditacion
        .filter((fila) => !fila.incluido)
        .map((fila) => fila.trip.id),
    );
    return manifestCandidates.filter((trip) => !fuera.has(trip.id));
  }, [manifestCandidates, manifestPendientesDeAcreditacion]);

  function motivosDeAcreditacionDe(personId: string, fecha: string) {
    return motivosDeAcreditacion(personId, fecha, documentTypes, documents);
  }

  function alternarAcreditacionAprobada(tripId: string) {
    setConAcreditacionAprobada((actual) =>
      actual.includes(tripId)
        ? actual.filter((id) => id !== tripId)
        : [...actual, tripId],
    );
  }

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
    if (generateSelection === "all") return planificables;
    return planificables.filter((person) => person.id === generateSelection);
  }, [planificables, generateSelection]);

  // Lo que el motor generaria para una persona y que todavia no existe. Es la
  // unica cuenta que se hace: la vista previa y la generacion usan esta misma
  // funcion, asi que no pueden decir cosas distintas.
  const porGenerar = (persona: Person, hasta: string) =>
    movimientos(persona, hasta).filter(
      (paso) =>
        !trips.some(
          (trip) =>
            trip.person_id === persona.id &&
            trip.date === paso.date &&
            trip.direction === paso.direction,
        ),
    );

  const generationPreview = useMemo(() => {
    try {
      return generationPeople.reduce(
        (total, person) => total + porGenerar(person, generateUntil).length,
        0,
      );
    } catch {
      // Un periodo imposible o unos dias mal puestos: el mensaje sale al
      // intentar generar, no en la vista previa.
      return 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationPeople, generateUntil, trips]);

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
      const { error } = await db().auth.signInWithPassword({
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
    const tiposDeDemo = makeDemoDocumentTypes();
    setDocumentTypes(tiposDeDemo);
    setDocuments(makeDemoDocuments(demoPeople, tiposDeDemo));
    setCalendarMonth(localDate().slice(0, 7));
    setSelectedDay(null);
    setCalendarShift("Todos");
    setPeopleQuery("");
    setPeopleFilter("Activas");
    clearTripFilters();
    setCostMonth("");
    setCostStatus("Todos");
    setCostCategory("");
    clearMessages();
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }

  function navigate(label: string) {
    setView(label);
    clearMessages();
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }

  // El diálogo entra deslizándose y hasta ahora desaparecía de golpe. Para que
  // salga por donde entró hay que darle esos milisegundos antes de desmontarlo:
  // se marca "cerrando", el CSS lo saca, y recién después se limpia el estado.
  // La salida es más corta que la entrada a propósito — al cerrar, el usuario ya
  // decidió y lo que quiere es volver a su trabajo.
  const cierreRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Abrir cancela cualquier cierre en curso. Sin esto, cerrar un diálogo y
  // abrir otro dentro de esos 200 ms dejaba el nuevo marcado como "cerrando".
  function abrirModal(nombre: ModalName) {
    if (cierreRef.current) {
      clearTimeout(cierreRef.current);
      cierreRef.current = null;
    }
    setClosingModal(false);
    setModal(nombre);
  }

  function limpiarModal() {
    setModal(null);
    setClosingModal(false);
    setEditPerson(null);
    setEditTrip(null);
    setPendingTripDate(null);
    setHistory([]);
    setFormError("");
  }

  function closeModal() {
    if (!modal) return limpiarModal();
    if (closingModal) return;
    setClosingModal(true);
    if (cierreRef.current) clearTimeout(cierreRef.current);
    cierreRef.current = setTimeout(limpiarModal, MS_CIERRE_DIALOGO);
  }

  useEffect(() => {
    return () => {
      if (cierreRef.current) clearTimeout(cierreRef.current);
    };
  }, []);

  function openPerson(person: Person | null = null) {
    clearMessages();
    setPendingTripDate(null);
    setEditPerson(person);
    abrirModal("person");
  }

  function openTrip(trip: Trip | null, date?: string, personId?: string) {
    clearMessages();
    if (!trip && !activePeople.length && !personId) {
      setPendingTripDate(date || selectedDay || dateFilter || localDate());
      setEditPerson(null);
      setFormError("");
      abrirModal("person");
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
    setNewPerson(personId || (view === "Viajes" ? personFilter : "") || "");
    abrirModal("trip");
  }

  function openGenerate(personId?: string) {
    clearMessages();
    if (!planificables.length) {
      navigate("Personas");
      setNotice(
        "Agrega una persona activa con jornada 4×3 o 10×10 para crear su calendario.",
      );
      return;
    }
    setGenerateSelection(
      personId && planificables.some((person) => person.id === personId)
        ? personId
        : "all",
    );
    setGenerateUntil(addDays(localDate(), 90));
    abrirModal("generate");
  }

  function showPersonTrips(person: Person) {
    clearTripFilters();
    navigate("Viajes");
    setPersonFilter(person.id);
  }

  function showTripGroup(status: string) {
    clearTripFilters();
    navigate("Viajes");
    setStatusFilter(status);
    setOnlyUpcoming(true);
  }

  function clearTripFilters() {
    setPurchaseFilter("todos");
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
        // Solo el 4×3 usa días de la semana. El resto conserva valores válidos
        // para la base y el motor los ignora.
        up_weekday: Number(form.get("up_weekday") ?? 1) || 1,
        down_weekday: Number(form.get("down_weekday") ?? 4) || 4,
        baggage: String(form.get("baggage")),
        active: form.get("active") === "on",
      };
      if (person.end_date && person.end_date < person.start_date) {
        throw new Error("La fecha de término debe ser posterior al inicio.");
      }
      if (person.shift === "4×3" && person.up_weekday === person.down_weekday) {
        throw new Error("La subida y la bajada no pueden ser el mismo día.");
      }
      let savedId = editPerson?.id ?? "";
      let avisoDeDocumentos = "";
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
        const cambios = fechasDeDocumentosCambiadas(form, savedId);
        if (cambios.length) {
          setDocuments((current) => [
            ...current.filter(
              (documento) =>
                !cambios.some(
                  (cambio) =>
                    cambio.person_id === documento.person_id &&
                    cambio.type_id === documento.type_id,
                ),
            ),
            ...cambios,
          ]);
        }
      } else {
        const result = editPerson
          ? await db().from("people").update(person).eq("id", editPerson.id)
          : await db().from("people").insert(person).select("id").single();
        if (result.error) throw result.error;
        if (!editPerson) savedId = String(result.data?.id ?? "");
        // Los documentos van aparte de la persona. Si fallan, la persona ya
        // quedó guardada: se avisa, no se deja el diálogo abierto, porque
        // guardar de nuevo crearía una persona repetida.
        const cambios = fechasDeDocumentosCambiadas(form, savedId);
        if (cambios.length) {
          const documentos = await db()
            .from("person_documents")
            .upsert(cambios, { onConflict: "person_id,type_id" });
          if (documentos.error) {
            avisoDeDocumentos =
              "La persona se guardó, pero no pudimos guardar sus documentos. Ábrela de nuevo e inténtalo otra vez.";
          }
        }
        await reload();
      }
      const resumeDate = pendingTripDate;
      closeModal();
      setPendingTripDate(null);
      if (!editPerson && resumeDate && savedId) {
        openTrip(null, resumeDate, savedId);
      } else {
        setNotice(
          avisoDeDocumentos ||
            "Persona guardada. Sus viajes existentes conservaron sus fechas.",
        );
      }
    }, "form");
  }

  // Las fechas de documentos del formulario de la persona que difieren de lo
  // guardado. Solo los cambios: reenviar lo mismo ensuciaría el historial.
  function fechasDeDocumentosCambiadas(form: FormData, personId: string) {
    return documentTypes.flatMap((tipo) => {
      const campo = form.get("doc_" + tipo.id);
      if (campo === null) return [];
      const nueva = String(campo) || null;
      const actual =
        documents.find(
          (documento) =>
            documento.person_id === personId && documento.type_id === tipo.id,
        )?.expires_on ?? null;
      return nueva === actual
        ? []
        : [{ person_id: personId, type_id: tipo.id, expires_on: nueva }];
    });
  }

  // Los tipos de documento que se exigen. Solo un administrador puede (lo
  // vuelve a comprobar la base). Nunca se borran: dejar de exigir es desactivar.
  async function addDocumentType(nombre: string): Promise<boolean> {
    const limpio = limpiarNombreDeTipo(nombre);
    if (!nombreDeTipoValido(limpio)) {
      setNotice("Escribe el nombre del documento (entre 2 y 80 letras).");
      return false;
    }
    if (tipoRepetido(limpio, documentTypes)) {
      setNotice("Ese documento ya está en la lista.");
      return false;
    }
    let guardado = false;
    await runAction(async () => {
      const resultado = await db().from("document_types").insert({ name: limpio });
      if (resultado.error) {
        throw new Error(
          resultado.error.code === "23505"
            ? "Ese documento ya está en la lista."
            : resultado.error.code === "42501"
              ? "Solo un administrador puede cambiar los documentos exigidos."
              : "No pudimos guardar el documento. Inténtalo nuevamente.",
        );
      }
      await reload();
      guardado = true;
      setNotice(`${limpio} ahora se exige para viajar.`);
    });
    return guardado;
  }

  async function setDocumentTypeActive(id: string, active: boolean) {
    const tipo = documentTypes.find((fila) => fila.id === id);
    if (!tipo) return;
    await runAction(async () => {
      const resultado = await db()
        .from("document_types")
        .update({ active })
        .eq("id", id)
        .select("id");
      if (resultado.error || !resultado.data?.length) {
        throw new Error(
          "No pudimos cambiar el documento. Solo un administrador puede hacerlo.",
        );
      }
      await reload();
      setNotice(
        active
          ? `${tipo.name} se vuelve a exigir.`
          : `${tipo.name} ya no se exige. Puedes volver a activarlo.`,
      );
    });
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
        const result = await db()
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
        const result = await db().from("trips").insert(trip);
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
        throw new Error(
          "Selecciona al menos una persona con jornada 4×3 o 10×10.",
        );
      }
      if (generateUntil < localDate()) {
        throw new Error("La fecha final debe ser hoy o posterior.");
      }

      // El motor decide las fechas una sola vez, aqui. La demostracion y la
      // operacion real guardan exactamente las mismas filas; lo unico distinto
      // es donde las guardan.
      const nuevos = generationPeople.flatMap((person) =>
        porGenerar(person, generateUntil).map((paso) => ({
          person_id: person.id,
          date: paso.date,
          direction: paso.direction,
          origin:
            paso.direction === "SUBIDA" ? person.origin : person.destination,
          destination:
            paso.direction === "SUBIDA" ? person.destination : person.origin,
          requested_time: null,
          baggage: person.baggage,
          status: "Planificado",
          pnr: "",
          flight: "",
          amount: null,
          notes: "",
        })),
      );

      let count = nuevos.length;
      if (demo) {
        const generated = nuevos.map((fila) => ({
          id: crypto.randomUUID(),
          ...fila,
        }));
        setTrips((current) =>
          [...current, ...generated].sort((a, b) =>
            a.date.localeCompare(b.date),
          ),
        );
      } else if (nuevos.length) {
        count = 0;
        for (let index = 0; index < nuevos.length; index += 200) {
          // ignoreDuplicates deja pasar lo que otra persona haya creado entre
          // medio: nunca se pisa un viaje que ya existe.
          const { data, error } = await db()
            .from("trips")
            .upsert(nuevos.slice(index, index + 200), {
              onConflict: "person_id,date,direction",
              ignoreDuplicates: true,
            })
            .select("id");
          if (error) throw error;
          count += data?.length ?? 0;
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

  async function savePurchaseWindow(dias: number) {
    clearMessages();
    if (!ventanaValida(dias)) {
      setNotice("La ventana de compra va de 1 a 120 dias.");
      return;
    }
    const anterior = purchaseWindow;
    setPurchaseWindow(dias);
    if (demo) return;
    const { error } = await db()
      .from("settings")
      .update({
        purchase_window_days: dias,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "00000000-0000-0000-0000-000000000001");
    if (error) {
      setPurchaseWindow(anterior);
      setNotice("No pudimos guardar la ventana de compra.");
    }
  }

  // La cola de compra: los viajes que hay que atender ahora, en la vista Viajes.
  function showPurchaseQueue() {
    clearMessages();
    setQuery("");
    setStatusFilter("Todos");
    setDateFilter("");
    setPersonFilter("");
    setOnlyUpcoming(false);
    setPurchaseFilter("abiertos");
    setView("Viajes");
    setSelectedTrips([]);
  }

  // El manifiesto: los viajes por solicitar de la vista, agrupados por día y
  // ruta, para copiarlos a un correo. Deja esos viajes seleccionados para que,
  // una vez enviado el correo, se marquen como solicitados en un solo paso.
  function openManifest() {
    if (!requestableTrips.length) {
      setNotice("No hay viajes futuros por solicitar con estos filtros.");
      return;
    }
    clearMessages();
    // Cada manifiesto parte sin excepciones: una aprobación de ayer no vale hoy.
    setConAcreditacionAprobada([]);
    // Si ya hay viajes marcados no se tocan: pisarlos hacía que quien marcaba
    // tres terminara marcando trece como solicitados sin darse cuenta.
    const hayMarcados = requestableTrips.some((trip) =>
      selectedTrips.includes(trip.id),
    );
    if (!hayMarcados) setSelectedTrips(requestableTrips.map((trip) => trip.id));
    abrirModal("manifest");
  }

  function exportCsv() {
    // Lo mismo que lleva el texto y el PDF: lo que el manifiesto muestra.
    const rows = manifestTrips;
    if (!rows.length) {
      setNotice("No hay viajes futuros por solicitar con estos filtros.");
      return;
    }
    const csv = csvDeViajes(
      rows,
      personName,
      exigeAcreditacion
        ? (trip) =>
            resumenDeMotivos(
              motivosDeAcreditacion(
                trip.person_id,
                trip.date,
                documentTypes,
                documents,
              ),
            ) || "Al día"
        : undefined,
    );
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "daybook-travel-solicitud.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(
      "Lista descargada. Revísala y, cuando la envíes, marca la selección como solicitada.",
    );
  }

  async function markSelectedRequested(soloEstos?: string[]) {
    // El manifiesto pasa exactamente lo que mostró; sin argumento se usa la
    // selección de la tabla de viajes.
    const ids = (soloEstos ?? selectedTrips).filter((id) =>
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
              db()
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
    abrirModal("history");
    if (demo) return;
    try {
      const { data, error } = await db()
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
    isAdmin,
    people,
    setPeople,
    trips,
    setTrips,
    view,
    setView,
    query,
    setQuery,
    peopleQuery,
    setPeopleQuery,
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
    calendarShift,
    setCalendarShift,
    costMonth,
    setCostMonth,
    costStatus,
    setCostStatus,
    costCategory,
    setCostCategory,
    costTrips,
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
    purchaseWindow,
    savePurchaseWindow,
    purchaseFilter,
    setPurchaseFilter,
    showPurchaseQueue,
    compraDe,
    costos,
    referenciaDe,
    resumenCompra,
    peopleById,
    personName,
    activePeople,
    planificables,
    visiblePeople,
    visibleTrips,
    requestableTrips,
    manifestTrips,
    manifestPendientesDeAcreditacion,
    alternarAcreditacionAprobada,
    motivosDeAcreditacionDe,
    exigeAcreditacion,
    documentTypes,
    documents,
    addDocumentType,
    setDocumentTypeActive,
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
    closingModal,
    abrirModal,
    openPerson,
    openTrip,
    openGenerate,
    showPersonTrips,
    showTripGroup,
    clearTripFilters,
    savePerson,
    saveTrip,
    generateTrips,
    openManifest,
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
