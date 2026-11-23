import type { Metadata } from "next";
import MisVuelosView from "@/components/mis-vuelos-view";

// La pantalla del trabajador: solo sus vuelos, con RUT y código. Aparte de la
// de la coordinación (app/page.tsx), sin su store ni su sesión.
export const metadata: Metadata = {
  title: "Mis vuelos · Daybook Travel",
  description: "Tus vuelos de obra, con fecha, vuelo, hora y código de reserva.",
};

export default function Page() {
  return <MisVuelosView />;
}
