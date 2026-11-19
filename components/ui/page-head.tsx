"use client";

// El encabezado de cada pantalla: titulo y el boton de crear.
//
// El "kicker" que habia arriba del titulo ya no se dibuja. No es un cambio de
// diseno: estaba con display:none desde que compactamos el encabezado, o sea
// que no lo veia nadie ni lo leia un lector de pantalla. Se saca el markup
// muerto en vez de traducirlo escondido.
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "../../app/store";

// Sin bajada: la pantalla se explica sola y un subtítulo descriptivo solo
// repetía lo que se ve debajo.
const TITULOS: Record<string, string> = {
  Agenda: "Agenda de viajes",
  Personas: "Personas del proyecto",
  Costos: "Costos de la obra",
  Actividad: "Actividad reciente",
  Accesos: "Accesos",
  Viajes: "Viajes y solicitudes",
  Configuración: "Configuración",
};

// Las pantallas donde no se crea nada desde el encabezado.
const SIN_BOTON = new Set(["Costos", "Accesos", "Actividad", "Configuración"]);

export default function PageHead() {
  const { view, openPerson, openTrip } = useApp();
  const titulo = TITULOS[view] ?? TITULOS.Viajes;

  return (
    <header className="mb-4 flex items-center justify-between gap-7 max-[760px]:gap-3">
      <h1 className="min-w-0 text-[clamp(22px,1.9vw,27px)] leading-[1.15] font-semibold tracking-[-0.035em] text-foreground">
        {titulo}
      </h1>
      {!SIN_BOTON.has(view) && (
        <Button
          type="button"
          variant="primary"
          className="shrink-0 max-[430px]:px-3 max-[430px]:text-caption max-[430px]:[&_svg]:hidden"
          onClick={() => (view === "Personas" ? openPerson() : openTrip(null))}
        >
          <Plus size={18} />
          {view === "Personas" ? "Nueva persona" : "Nuevo viaje"}
        </Button>
      )}
    </header>
  );
}
