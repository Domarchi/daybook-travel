// Los diálogos: cuál está abierto, qué se edita en él, la salida animada y el foco
// atrapado mientras están abiertos.
//
// El texto de las funciones es el mismo que tenían dentro de `store.tsx`; solo
// cambió dónde viven. Lo que usan de los otros hooks lo reciben en `e`.

import { useEffect, useRef, useState } from "react";
import { addDays } from "../../lib/calendar";
import { localDate } from "../../lib/format";
import { HistoryItem, ModalName, Person, Trip } from "../../lib/types";
import type { Avisos } from "./use-avisos";

/** Lo que dura la salida del diálogo. Tiene que calzar con el CSS. */
const MS_CIERRE_DIALOGO = 200;

type Entrada = Avisos;

export function useDialogos(e: Entrada) {
  const {
    busyRef,
    setFormError,
  } = e;

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

  const [historyLoading, setHistoryLoading] = useState(false);

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
    modal,
    setModal,
    closingModal,
    setClosingModal,
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
    historyLoading,
    setHistoryLoading,
    cierreRef,
    abrirModal,
    limpiarModal,
    closeModal,
  };
}

export type Dialogos = ReturnType<typeof useDialogos>;
