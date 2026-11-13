"use client";

// Accesos: quién puede entrar a Daybook Travel.
//
// Solo la ven los administradores, pero eso es comodidad, no seguridad: la
// regla vive en las funciones de `supabase/009_accesos.sql`, que vuelven a
// comprobar quién llama. Aquí no se borra a nadie: quitar un acceso lo
// desactiva y se puede reactivar.
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { StaticOverviewCard } from "@/components/ui/overview-card";
import { TableWrap } from "@/components/ui/table-wrap";
import {
  CELDA_PRINCIPAL,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui/data-table";
import {
  ETIQUETA_DE_ROL,
  correoValido,
  mensajeDeError,
  normalizarCorreo,
  resumenDeAccesos,
  type Miembro,
  type RolDeAcceso,
} from "../lib/members";
import { db } from "../lib/supabase";
import { useApp } from "../app/store";
import { avisoConDeshacer, avisoDeExito } from "@/lib/avisos";

export default function MembersView() {
  const { email: miCorreo, setNotice } = useApp();
  const [miembros, setMiembros] = useState<Miembro[] | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [nuevoCorreo, setNuevoCorreo] = useState("");
  const [nuevoRol, setNuevoRol] = useState<RolDeAcceso>("member");
  const [avisoDelFormulario, setAvisoDelFormulario] = useState("");

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await db().rpc("list_members");
    if (fallo) {
      setError(mensajeDeError(fallo));
      return;
    }
    setError("");
    setMiembros((data ?? []) as Miembro[]);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Una sola puerta para los cambios: bloquea los botones mientras se envía,
  // avisa con el mensaje que levantó la base y recarga la lista.
  async function ejecutar(
    clave: string,
    llamada: PromiseLike<{ error: { message?: string } | null }>,
    exito: string,
    deshacer?: () => void,
  ): Promise<boolean> {
    setOcupado(clave);
    setError("");
    const { error: fallo } = await llamada;
    if (fallo) {
      setError(mensajeDeError(fallo));
    } else {
      setNotice(deshacer ? avisoConDeshacer(exito, deshacer) : avisoDeExito(exito));
      await cargar();
    }
    setOcupado("");
    return !fallo;
  }

  async function darAcceso(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const correo = normalizarCorreo(nuevoCorreo);
    if (!correoValido(correo)) {
      setAvisoDelFormulario("Escribe un correo válido.");
      return;
    }
    setAvisoDelFormulario("");
    const listo = await ejecutar(
      "nuevo",
      db().rpc("add_member", { p_email: correo, p_role: nuevoRol }),
      `${correo} ya puede entrar.`,
    );
    if (listo) {
      setNuevoCorreo("");
      setNuevoRol("member");
    }
  }

  const resumen = resumenDeAccesos(miembros ?? []);

  return (
    <section aria-label="Accesos">
      <div className="mb-5 grid grid-cols-3 gap-3 max-[760px]:grid-cols-1">
        <StaticOverviewCard className="grid-cols-1 [&>strong]:col-start-1">
          <span>Con acceso</span>
          <strong>{resumen.activos}</strong>
          <small>Pueden entrar hoy</small>
        </StaticOverviewCard>
        <StaticOverviewCard className="grid-cols-1 [&>strong]:col-start-1">
          <span>Administradores</span>
          <strong>{resumen.administradores}</strong>
          <small>Manejan esta lista</small>
        </StaticOverviewCard>
        <StaticOverviewCard className="grid-cols-1 [&>strong]:col-start-1">
          <span>Desactivados</span>
          <strong>{resumen.desactivados}</strong>
          <small>Se pueden reactivar</small>
        </StaticOverviewCard>
      </div>

      <form
        onSubmit={darAcceso}
        noValidate
        aria-busy={ocupado === "nuevo"}
        className="mb-5 grid gap-3 rounded-lg border border-line bg-surface p-4"
      >
        <h2 className="text-emphasis">Dar acceso</h2>
        <p className="text-meta leading-relaxed text-muted">
          La cuenta es la misma de Daybook Asistencia y se crea fuera de esta
          aplicación. Aquí solo se decide cuáles cuentas pueden entrar a Travel.
        </p>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] items-end gap-3 max-[760px]:grid-cols-1">
          <Label>
            Correo
            <Input
              name="email"
              type="email"
              autoComplete="off"
              placeholder="nombre@empresa.cl"
              value={nuevoCorreo}
              onChange={(evento) => setNuevoCorreo(evento.target.value)}
              aria-invalid={avisoDelFormulario ? true : undefined}
              aria-describedby={avisoDelFormulario ? "accesos-aviso" : undefined}
            />
          </Label>
          <Label>
            Rol
            <Select
              name="role"
              value={nuevoRol}
              onChange={(evento) => setNuevoRol(evento.target.value as RolDeAcceso)}
            >
              <option value="member">{ETIQUETA_DE_ROL.member}</option>
              <option value="admin">{ETIQUETA_DE_ROL.admin}</option>
            </Select>
          </Label>
          <Button type="submit" variant="primary" disabled={ocupado === "nuevo"}>
            {ocupado === "nuevo" ? "Dando acceso…" : "Dar acceso"}
          </Button>
        </div>
        {avisoDelFormulario && (
          <p id="accesos-aviso" role="alert" className="text-meta text-danger">
            {avisoDelFormulario}
          </p>
        )}
      </form>

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-md border border-[color-mix(in_srgb,var(--danger)_45%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-[11px] text-meta text-danger"
        >
          {error}
        </p>
      )}

      <TableWrap role="region" aria-label="Lista de accesos" tabIndex={0}>
        <Table className="min-w-[640px]">
          <THead>
            <Tr>
              <Th>Correo</Th>
              <Th>Rol</Th>
              <Th>Estado</Th>
              <Th>
                <span className="sr-only">Acciones</span>
              </Th>
            </Tr>
          </THead>
          <TBody>
            {miembros === null ? (
              <Tr>
                <Td colSpan={4}>{error ? "No se pudo cargar la lista." : "Cargando…"}</Td>
              </Tr>
            ) : miembros.length === 0 ? (
              <Tr>
                <Td colSpan={4}>Todavía no hay nadie en la lista.</Td>
              </Tr>
            ) : (
              miembros.map((miembro) => {
                const esMio = miembro.email === miCorreo?.toLowerCase();
                const trabajando = ocupado === miembro.email;
                return (
                  <Tr key={miembro.email}>
                    <Td data-label="Correo" className={CELDA_PRINCIPAL}>
                      <div className="grid gap-0.5">
                        <strong className="break-all text-foreground">{miembro.email}</strong>
                        {esMio && <small className="text-muted">Tu cuenta</small>}
                      </div>
                    </Td>
                    <Td data-label="Rol">
                      <StatusPill status={miembro.role === "admin" ? "Administrador" : "Miembro"} />
                    </Td>
                    <Td data-label="Estado">
                      <StatusPill status={miembro.active ? "Activo" : "Desactivado"} />
                    </Td>
                    <Td data-label="Acciones" className="max-[760px]:col-span-full">
                      <div className="flex flex-wrap items-center justify-end gap-[6px]">
                        {esMio ? (
                          <small className="text-muted">No puedes cambiar tu propia cuenta</small>
                        ) : (
                          <>
                            {miembro.active && (
                              <Button
                                type="button"
                                disabled={trabajando}
                                onClick={() =>
                                  ejecutar(
                                    miembro.email,
                                    db().rpc("set_member_role", {
                                      p_email: miembro.email,
                                      p_role: miembro.role === "admin" ? "member" : "admin",
                                    }),
                                    miembro.role === "admin"
                                      ? `${miembro.email} ya no administra los accesos.`
                                      : `${miembro.email} ahora administra los accesos.`,
                                    // Quitar el rol se revierte desde el mismo
                                    // aviso (Fase 5); darlo no necesita salida.
                                    miembro.role === "admin"
                                      ? () =>
                                          void ejecutar(
                                            miembro.email,
                                            db().rpc("set_member_role", { p_email: miembro.email, p_role: "admin" }),
                                            `${miembro.email} vuelve a administrar los accesos.`,
                                          )
                                      : undefined,
                                  )
                                }
                              >
                                {miembro.role === "admin" ? "Quitar administrador" : "Hacer administrador"}
                              </Button>
                            )}
                            <Button
                              type="button"
                              disabled={trabajando}
                              onClick={() =>
                                ejecutar(
                                  miembro.email,
                                  db().rpc("set_member_active", {
                                    p_email: miembro.email,
                                    p_active: !miembro.active,
                                  }),
                                  miembro.active
                                    ? `${miembro.email} ya no puede entrar.`
                                    : `${miembro.email} puede volver a entrar.`,
                                  miembro.active
                                    ? () =>
                                        void ejecutar(
                                          miembro.email,
                                          db().rpc("set_member_active", { p_email: miembro.email, p_active: true }),
                                          `${miembro.email} puede volver a entrar.`,
                                        )
                                    : undefined,
                                )
                              }
                            >
                              {miembro.active ? "Quitar acceso" : "Reactivar"}
                            </Button>
                          </>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })
            )}
          </TBody>
        </Table>
      </TableWrap>
    </section>
  );
}
