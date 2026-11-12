"use client";

// Documentos exigidos: qué debe tener al día una persona para entrar a un
// manifiesto. Los ven todos los miembros; solo un administrador los cambia (lo
// vuelve a comprobar la base). Aquí no se borra nada: dejar de exigir un
// documento lo desactiva y se puede volver a exigir.
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { useApp } from "../app/store";

export default function DocumentTypesPanel() {
  const { addDocumentType, busy, demo, documentTypes, isAdmin, setDocumentTypeActive } =
    useApp();
  const [nombre, setNombre] = useState("");
  const puedeEditar = isAdmin && !demo;

  // Quien no administra y no hay nada que mostrar no necesita ver el recuadro.
  if (!puedeEditar && documentTypes.length === 0) return null;

  async function agregar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (await addDocumentType(nombre)) setNombre("");
  }

  return (
    <section
      aria-labelledby="document-types-title"
      className="mb-4 grid gap-3 rounded-lg border border-line bg-surface p-4"
    >
      <div className="grid gap-1">
        <h2 id="document-types-title" className="text-emphasis">
          Documentos exigidos
        </h2>
        <p className="text-meta leading-relaxed text-muted">
          {documentTypes.length
            ? "Quien tenga uno de estos documentos faltante o vencido para la fecha del viaje aparece marcado, con el motivo, al armar el manifiesto."
            : "Todavía no se exige ningún documento. Agrega los que cuentan para viajar y cada persona tendrá su fecha de vencimiento."}
        </p>
      </div>
      {documentTypes.length > 0 && (
        <ul className="m-0 grid list-none gap-2 p-0">
          {documentTypes.map((tipo) => (
            <li
              key={tipo.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-surface-soft px-3 py-2"
            >
              <span className="flex items-center gap-2 text-body text-foreground">
                <strong>{tipo.name}</strong>
                <StatusPill status={tipo.active ? "Activo" : "Desactivado"} />
              </span>
              {puedeEditar && (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void setDocumentTypeActive(tipo.id, !tipo.active)}
                >
                  {tipo.active ? "Dejar de exigir" : "Volver a exigir"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {puedeEditar && (
        <form
          onSubmit={agregar}
          noValidate
          className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 max-[760px]:grid-cols-1"
        >
          <Label>
            Nuevo documento
            <Input
              name="document-type"
              autoComplete="off"
              maxLength={80}
              placeholder="Examen médico"
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
            />
          </Label>
          <Button type="submit" variant="primary" disabled={busy}>
            Agregar documento
          </Button>
        </form>
      )}
    </section>
  );
}
