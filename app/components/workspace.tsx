"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  LogOut,
  Plane,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import YearView from "../year-view";
import AccessState from "./access-state";
import AgendaPanel from "./agenda-panel";
import PeopleView from "./people-view";
import ModalLayer from "./modal-layer";
import PageHead from "./page-head";
import TopBar from "./top-bar";
import AgendaView from "./agenda-view";
import DialogActions from "./dialog-actions";
import EmptyState from "./empty-state";
import { LoadingView, LoginView } from "./login-view";
import ThemeToggle from "./theme-toggle";
import TripsView from "./trips-view";
import ExcelSyncPanel from "../excel-sync-panel";
import { useApp } from "../store";
import { db } from "../../lib/supabase";
import { addDays, pulseDates } from "../../lib/calendar";
import { makeDemoPeople, makeDemoTrips } from "../../lib/demo";
import {
  formatDate,
  formatDateTime,
  localDate,
  nextWeekday,
  normalize,
  statusClass,
} from "../../lib/format";
// Se importan con los nombres locales de siempre para no tocar el JSX que los usa.
import {
  BAGGAGE_OPTIONS as baggageOptions,
  TRIP_STATUSES as statuses,
} from "../../lib/types";
import type {
  AccessStatus,
  HistoryItem,
  ModalName,
  Person,
  Trip,
} from "../../lib/types";

export default function Workspace() {
  const {
    theme,
    ready,
    email,
    demo,
    setDemo,
    accessStatus,
    setAccessStatus,
    people,
    setPeople,
    trips,
    setTrips,
    view,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    dateFilter,
    setDateFilter,
    personFilter,
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
    editTrip,
    newDate,
    newPerson,
    pendingTripDate,
    tripStatus,
    setTripStatus,
    reservationOpen,
    setReservationOpen,
    generateSelection,
    setGenerateSelection,
    generateUntil,
    setGenerateUntil,
    history,
    notice,
    setNotice,
    formError,
    busy,
    setBusy,
    loading,
    historyLoading,
    busyRef,
    reload,
    peopleById,
    personName,
    activePeople,
    eligibleFourByThree,
    visiblePeople,
    visibleTrips,
    requestableTrips,
    plannedCount,
    requestedCount,
    nextTrip,
    generationPeople,
    generationPreview,
    reservationRequired,
    toggleTheme,
    clearMessages,
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
  } = useApp();

  if (!ready) {
    return <LoadingView />;
  }

  if (!email && !demo) {
    return (
      <LoginView
        theme={theme}
        toggleTheme={toggleTheme}
        login={login}
        busy={busy}
        notice={notice}
        enterDemo={enterDemo}
      />
    );
  }

  return (
    <div className="shell">
      <div
        className="app-content"
        inert={modal ? true : undefined}
        aria-hidden={modal ? true : undefined}
      >
        <TopBar />

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
            <AccessState />
          ) : (
            <>
              <PageHead />

              {view === "Agenda" ? (
                <AgendaPanel />
              ) : view === "Personas" ? (
                <PeopleView />
              ) : (
                <TripsView />
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>FCC TRAVEL / Copiapó</span>
            <span>Personas · Planificación · Pasajes</span>
          </footer>
        </main>
      </div>

      <ModalLayer />
    </div>
  );
}









