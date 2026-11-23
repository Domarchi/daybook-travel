"use client";

// El acceso a Mis vuelos dentro de la ficha de una persona: si tiene código,
// entregarle uno nuevo (que se muestra una sola vez, para mandárselo por
// WhatsApp) o quitárselo. Como la pantalla Accesos, carga lo suyo al abrirse:
// es una consulta chica y solo hace falta aquí.
//
// La regla de verdad está en la base (migración 016): solo un miembro entrega
// códigos, la base los genera y guarda solo su resumen, y nunca devuelve uno
// ya entregado.

import { useEffect, useState } from "react";
import { KeyRound, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormSection, Hint } from "@/components/ui/dialog-parts";
import { BotonCopiar } from "@/components/ui/copy-button";
import { useCopiar } from "@/components/ui/use-copiar";
import { db } from "@/lib/supabase";
import { formatDateTime } from "@/lib/format";
import { mensajeDeError } from "@/lib/errores";
import { formatearRut } from "@/lib/contacto";
import { direccionDeMisVuelos, enlaceDeWhatsapp, mensajeDeCodigo } from "@/lib/mis-vuelos";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/types";

type Acceso = { pin_set_at: string; locked: boolean } | null;

export default function AccesoMisVuelos({ persona, demo }: { persona: Person; demo: boolean }) {
  // undefined: cargando. null: sin código todavía.
  const [acceso, setAcceso] = useState<Acceso | undefined>(demo ? null : undefined);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (demo || !persona.rut) return;
    let vigente = true;
    db()
      .rpc("worker_access_list")
      .then(({ data, error: fallo }) => {
        if (!vigente) return;
        // Sin la migración 016 aplicada la función no existe: se dice, sin romper la ficha.
        if (fallo) {
          setAcceso(null);
          setError("No se pudo leer el acceso a Mis vuelos.");
          return;
        }
        const fila = ((data ?? []) as { person_id: string; pin_set_at: string; locked: boolean }[]).find(
          (item) => item.person_id === persona.id,
        );
        setAcceso(fila ? { pin_set_at: fila.pin_set_at, locked: fila.locked } : null);
      });
    return () => {
      vigente = false;
    };
  }, [demo, persona.id, persona.rut]);

  const direccion = direccionDeMisVuelos(typeof window === "undefined" ? "" : window.location.origin);
  const mensaje = codigo ? mensajeDeCodigo(persona.name, codigo, direccion) : "";
  const { copiado, copiar } = useCopiar(mensaje);

  async function darCodigo() {
    setOcupado(true);
    setError("");
    try {
      let nuevo: string;
      if (demo) {
        nuevo = String(1000 + Math.floor(Math.random() * 9000));
      } else {
        const { data, error: fallo } = await db().rpc("worker_access_give_code", { p_person: persona.id });
        if (fallo) throw fallo;
        nuevo = String(data ?? "");
      }
      setCodigo(nuevo);
      setAcceso({ pin_set_at: new Date().toISOString(), locked: false });
    } catch (causa) {
      setError(mensajeDeError(causa));
    } finally {
      setOcupado(false);
    }
  }

  async function quitarAcceso() {
    setOcupado(true);
    setError("");
    try {
      if (!demo) {
        const { error: fallo } = await db().rpc("worker_access_revoke", { p_person: persona.id });
        if (fallo) throw fallo;
      }
      setCodigo("");
      setAcceso((actual) => (actual ? { ...actual, locked: true } : actual));
    } catch (causa) {
      setError(mensajeDeError(causa));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <FormSection aria-labelledby="person-mis-vuelos" data-acceso-mis-vuelos>
      <h3 id="person-mis-vuelos" className="text-foreground">Mis vuelos</h3>
      {!persona.rut ? (
        <Hint>
          Con su RUT guardado, la persona puede ver sus vuelos desde el teléfono con un código de 4
          dígitos. Escribe el RUT arriba y guarda la ficha.
        </Hint>
      ) : (
        <>
          <p className="text-meta text-foreground-soft" aria-live="polite">
            {acceso === undefined
              ? "Revisando el acceso…"
              : acceso === null
                ? `Entra con el RUT ${formatearRut(persona.rut)}. Todavía no tiene código.`
                : acceso.locked
                  ? "Acceso bloqueado (intentos fallidos o quitado). Con un código nuevo vuelve a entrar."
                  : `Tiene código desde el ${formatDateTime(acceso.pin_set_at)}.`}
          </p>
          {codigo && (
            <div
              className="grid gap-2 rounded-sm border border-l-2 border-line border-l-success bg-surface-soft p-3"
              data-codigo-mis-vuelos
            >
              <p className="text-meta text-foreground-soft">
                Código para {persona.name.split(/\s+/)[0]}:{" "}
                <strong className="font-mono text-title tracking-[0.3em] text-foreground">{codigo}</strong>
              </p>
              <small className="text-muted">
                Se muestra solo ahora: mándalo antes de cerrar la ficha. Si se pierde, da uno nuevo.
              </small>
              <div className="flex flex-wrap gap-2">
                <a
                  href={enlaceDeWhatsapp(persona.phone, mensaje)}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "primary" }))}
                >
                  <MessageCircle size={16} /> Enviar por WhatsApp
                </a>
                <BotonCopiar copiado={copiado} onClick={copiar} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={darCodigo} disabled={ocupado || acceso === undefined}>
              <KeyRound size={16} /> {acceso ? "Dar código nuevo" : "Dar código"}
            </Button>
            {acceso && !acceso.locked && (
              <Button type="button" onClick={quitarAcceso} disabled={ocupado}>
                Quitar acceso
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-meta text-danger">
              {error}
            </p>
          )}
          <Hint>
            Un código nuevo cierra la sesión del teléfono anterior. Cinco códigos equivocados seguidos
            bloquean el acceso hasta que le des uno nuevo.
          </Hint>
        </>
      )}
    </FormSection>
  );
}
