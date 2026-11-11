"use client";

// Aqui vive todo el estado de la aplicacion. Desde que se partio, este archivo
// solo junta los hooks de `app/estado/`: cada uno tiene un tema (la sesion, los
// datos, los filtros, los dialogos, las acciones). Cualquier pieza de la
// aplicacion pide lo que necesita con useApp(), igual que antes.
import { createContext, ReactNode, useContext } from "react";
import { useTema } from "./estado/use-tema";
import { useAvisos } from "./estado/use-avisos";
import { useSesion } from "./estado/use-sesion";
import { useDatos } from "./estado/use-datos";
import { useNavegacion } from "./estado/use-navegacion";
import { useDialogos } from "./estado/use-dialogos";
import { useDerivados } from "./estado/use-derivados";
import { useAcreditacion } from "./estado/use-acreditacion";
import { useAccionesSesion } from "./estado/use-acciones-sesion";
import { useAccionesViajes } from "./estado/use-acciones-viajes";
import { useAccionesPersonas } from "./estado/use-acciones-personas";
import { useAccionesGenerar } from "./estado/use-acciones-generar";
import { useManifiesto } from "./estado/use-manifiesto";

function useStoreValue() {
  const tema = useTema();
  const avisos = useAvisos();
  const sesion = useSesion({ ...avisos });
  const datos = useDatos({ ...avisos, ...sesion });
  const navegacion = useNavegacion({ ...avisos, ...datos });
  const dialogos = useDialogos({ ...avisos });
  const derivados = useDerivados({ ...datos, ...navegacion, ...dialogos });
  const acreditacion = useAcreditacion({ ...avisos, ...datos, ...navegacion, ...derivados });
  const acciones_sesion = useAccionesSesion({ ...avisos, ...sesion, ...datos, ...navegacion });
  const acciones_viajes = useAccionesViajes({ ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados });
  const acciones_personas = useAccionesPersonas({ ...avisos, ...sesion, ...datos, ...dialogos, ...acreditacion, ...acciones_viajes });
  const acciones_generar = useAccionesGenerar({ ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados });
  const manifiesto = useManifiesto({ ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados, ...acreditacion });

  return { ...tema, ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados, ...acreditacion, ...acciones_sesion, ...acciones_viajes, ...acciones_personas, ...acciones_generar, ...manifiesto };
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
