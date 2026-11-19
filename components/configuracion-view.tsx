"use client";

// Configuración: el tema, la cuenta y salir, en tres tarjetas, como la de Parte
// Diario. No decide nada por su cuenta: el tema lo guarda `use-tema` y salir es
// `salir()` de `use-acciones-sesion`, que pregunta antes con la confirmación
// común.
//
// El selector de tema son radios de verdad dentro de un `fieldset`: una sola
// elegida, las flechas del teclado recorren las tres y el lector de pantalla
// anuncia «Tema, Oscuro, 2 de 3». Se ocultan los círculos, no las radios: el
// foco sigue cayendo en ellas y el anillo se dibuja sobre la opción.
import { useState } from "react";
import { LogOut, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { OPCIONES_DE_APARIENCIA, type PreferenciaDeTema } from "@/lib/tema";
import { accesoDeLaCuenta, nombreDeLaCuenta } from "@/lib/cuenta";
import { useApp } from "../app/store";

const ICONO: Record<PreferenciaDeTema, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };

const TARJETA = "grid gap-4 rounded-lg border border-line bg-surface p-5 max-[760px]:p-4";

function Cabecera({ rotulo, titulo }: { rotulo: string; titulo: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-caption leading-[1.4] font-semibold tracking-[0.08em] text-muted uppercase">{rotulo}</span>
      <h2 className="truncate text-emphasis leading-[1.25] font-semibold tracking-[-0.025em] text-foreground">{titulo}</h2>
    </div>
  );
}

function Dato({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface-soft p-3">
      <dt className="text-caption leading-[1.4] font-semibold tracking-[0.08em] text-muted uppercase">{nombre}</dt>
      <dd className="mt-1 truncate text-body leading-[1.4] font-semibold text-foreground" title={valor}>
        {valor}
      </dd>
    </div>
  );
}

export default function ConfiguracionView() {
  const { preferenciaTema, elegirTema, demo, email, isAdmin, accessStatus, salir } = useApp();
  // Cerrar sesión no tiene vuelta atrás y en la demostración borra todo lo que
  // se hizo: el botón pregunta antes, como en Parte Diario.
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
  const cuenta = { demo, email, isAdmin, accessStatus };

  return (
    <div className="grid max-w-[880px] gap-4">
      <section className={TARJETA}>
        <Cabecera rotulo="Apariencia" titulo="Cómo se ve la aplicación" />
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-2 p-0 text-meta leading-[1.4] font-semibold text-foreground-soft">Tema</legend>
          <div className="grid max-w-[520px] grid-cols-3 overflow-hidden rounded-sm border border-line bg-surface-soft max-[760px]:max-w-none max-[760px]:grid-cols-1">
            {OPCIONES_DE_APARIENCIA.map((opcion, indice) => {
              const Icono = ICONO[opcion.valor];
              return (
                <label
                  key={opcion.valor}
                  className={
                    "relative flex min-h-11 cursor-pointer " +
                    (indice > 0 ? "border-l border-line max-[760px]:border-t max-[760px]:border-l-0" : "")
                  }
                >
                  <input
                    type="radio"
                    name="tema"
                    value={opcion.valor}
                    checked={preferenciaTema === opcion.valor}
                    onChange={() => elegirTema(opcion.valor)}
                    className="peer pointer-events-none absolute m-0 size-px opacity-0"
                  />
                  <span
                    className={
                      "flex min-w-0 flex-1 items-center justify-center gap-2 px-3 text-meta leading-[1.4] font-semibold text-foreground-soft " +
                      "transition-[background-color,color] duration-[var(--db-duration-fast)] ease-[var(--ease-out)] raton:hover:text-foreground " +
                      "peer-checked:bg-surface peer-checked:text-[color:var(--db-brand)] peer-checked:shadow-[inset_0_-2px_var(--db-brand)] " +
                      "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-3px] peer-focus-visible:outline-[var(--focus)]"
                    }
                  >
                    <Icono size={18} aria-hidden="true" className="flex-none" />
                    {opcion.etiqueta}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <p className="text-meta leading-[1.5] text-muted">
          «Según el sistema» sigue el modo claro u oscuro del dispositivo, también cuando cambia.
        </p>
      </section>

      <section className={TARJETA}>
        <Cabecera rotulo="Cuenta" titulo={nombreDeLaCuenta(cuenta)} />
        <dl className="m-0 grid grid-cols-3 gap-3 max-[760px]:grid-cols-1">
          <Dato nombre="Correo" valor={demo ? "Sin cuenta" : email || "Sin correo"} />
          <Dato nombre="Acceso" valor={accesoDeLaCuenta(cuenta)} />
          <Dato nombre="Proyecto" valor="Traslados · Copiapó" />
        </dl>
      </section>

      <section className={TARJETA}>
        <Cabecera rotulo="Sesión" titulo={demo ? "Salir de la demostración" : "Salir de este dispositivo"} />
        <p className="text-meta leading-[1.5] text-muted">
          {demo
            ? "Se pierden los cambios que hiciste en la demostración."
            : "Tendrás que ingresar de nuevo para seguir."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="danger"
            className="max-[760px]:flex-1"
            onClick={() => setConfirmandoSalida(true)}
          >
            <LogOut size={17} aria-hidden="true" />
            {demo ? "Salir de la demostración" : "Cerrar sesión"}
          </Button>
        </div>
      </section>

      {confirmandoSalida &&
        (demo ? (
          <ConfirmDialog
            title="Salir de la demostración"
            description="Se pierden los cambios que hiciste en la demostración. Si vuelves a entrar, empieza de nuevo con los datos ficticios."
            cancelLabel="Seguir trabajando"
            confirmLabel="Salir de la demostración"
            onCancel={() => setConfirmandoSalida(false)}
            onConfirm={() => {
              setConfirmandoSalida(false);
              void salir();
            }}
          />
        ) : (
          <ConfirmDialog
            title="Cerrar sesión"
            description="Vas a salir de Daybook Travel en este dispositivo y tendrás que ingresar de nuevo para seguir."
            cancelLabel="Seguir trabajando"
            confirmLabel="Cerrar sesión"
            onCancel={() => setConfirmandoSalida(false)}
            onConfirm={() => {
              setConfirmandoSalida(false);
              void salir();
            }}
          />
        ))}
    </div>
  );
}
