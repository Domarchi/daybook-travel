"use client";

// El encabezado de cada pantalla: titulo, bajada y el boton de crear.
//
// El "kicker" que habia arriba del titulo ya no se dibuja. No es un cambio de
// diseno: estaba con display:none desde que compactamos el encabezado, o sea
// que no lo veia nadie ni lo leia un lector de pantalla. Se saca el markup
// muerto en vez de traducirlo escondido.
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "../../app/store";

const TITULOS: Record<string, { titulo: string; bajada: string }> = {
  Agenda: {
    titulo: "Agenda de viajes",
    bajada: "Revisa el movimiento del equipo y atiende lo que sigue.",
  },
  Personas: {
    titulo: "Personas del proyecto",
    bajada: "Administra rutas, turnos, vigencia y equipaje.",
  },
  Costos: {
    titulo: "Costos de la obra",
    bajada:
      "Consulta montos registrados y distingue reservas pendientes de planes sin precio.",
  },
  Viajes: {
    titulo: "Viajes y solicitudes",
    bajada: "Prepara solicitudes y completa cada reserva.",
  },
};

export default function PageHead() {
  const { view, openPerson, openTrip } = useApp();
  const { titulo, bajada } = TITULOS[view] ?? TITULOS.Viajes;

  return (
    <header className="mb-4 flex items-center justify-between gap-7 max-[760px]:gap-3">
      <div className="min-w-0">
        <h1 className="text-[clamp(22px,1.9vw,27px)] leading-[1.15] font-semibold tracking-[-0.035em] text-foreground">
          {titulo}
        </h1>
        <p className="mt-1.5 max-w-[660px] text-[13px] leading-[1.5] text-muted">
          {bajada}
        </p>
      </div>
      {view !== "Costos" && (
        <Button
          type="button"
          variant="primary"
          className="shrink-0 max-[430px]:px-3 max-[430px]:text-[12px] max-[430px]:[&_svg]:hidden"
          onClick={() => (view === "Personas" ? openPerson() : openTrip(null))}
        >
          <Plus size={18} />
          {view === "Personas" ? "Nueva persona" : "Nuevo viaje"}
        </Button>
      )}
    </header>
  );
}
