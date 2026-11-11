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
  const avisos = useAvisos({ ...tema });
  const sesion = useSesion({ ...tema, ...avisos });
  const datos = useDatos({ ...tema, ...avisos, ...sesion });
  const navegacion = useNavegacion({ ...tema, ...avisos, ...sesion, ...datos });
  const dialogos = useDialogos({ ...tema, ...avisos, ...sesion, ...datos, ...navegacion });
  const derivados = useDerivados({ ...tema, ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos });
  const acreditacion = useAcreditacion({ ...tema, ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados });
  const acciones_sesion = useAccionesSesion({ ...tema, ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados, ...acreditacion });
  const acciones_viajes = useAccionesViajes({ ...tema, ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados, ...acreditacion, ...acciones_sesion });
  const acciones_personas = useAccionesPersonas({ ...tema, ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados, ...acreditacion, ...acciones_sesion, ...acciones_viajes });
  const acciones_generar = useAccionesGenerar({ ...tema, ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados, ...acreditacion, ...acciones_sesion, ...acciones_viajes, ...acciones_personas });
  const manifiesto = useManifiesto({ ...tema, ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados, ...acreditacion, ...acciones_sesion, ...acciones_viajes, ...acciones_personas, ...acciones_generar });

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
