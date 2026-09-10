"use client";

// La pagina solo enchufa la bodega de estado con la aplicacion.
// Todo lo demas vive en app/store.tsx y en app/components/.
import { AppProvider } from "./store";
import Workspace from "@/components/workspace";

export default function Page() {
  return (
    <AppProvider>
      <Workspace />
    </AppProvider>
  );
}
