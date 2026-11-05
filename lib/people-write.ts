import type { SupabaseClient } from "@supabase/supabase-js";
import type { Person } from "./types.ts";

export class PersonEditConflict extends Error {
  constructor() {
    super("Otra persona modificó esta ficha. Tus cambios no se guardaron. Cierra y vuelve a abrir la ficha para revisar la versión actual.");
    this.name = "PersonEditConflict";
  }
}

export type PersonChanges = Pick<Person,
  "name" | "origin" | "destination" | "shift" | "start_date" | "end_date" |
  "up_weekday" | "down_weekday" | "baggage" | "active"
>;

/** Compara y escribe en una sola operación: nunca sobrescribe una ficha más nueva. */
export async function updatePersonWithVersion(
  client: SupabaseClient,
  original: Pick<Person, "id" | "version">,
  changes: PersonChanges,
): Promise<void> {
  if (!Number.isSafeInteger(original.version) || Number(original.version) < 1) {
    throw new PersonEditConflict();
  }
  const { data, error } = await client.from("people")
    .update(changes)
    .eq("id", original.id)
    .eq("version", original.version!)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new PersonEditConflict();
}
