// La autorización de los crons de Vercel: `Authorization: Bearer $CRON_SECRET`.
// La comparten los avisos de compra y los recordatorios de vuelo.

import { createHash, timingSafeEqual } from "node:crypto";

// Se comparan los resúmenes y no los textos: así el tiempo no depende de cuánto
// del secreto coincide, ni del largo de lo que mandó quien llama.
const iguales = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/** Si la petición trae el secreto. Sin secreto configurado, nadie está autorizado. */
export function cronAutorizado(request: Request, secreto: string | undefined): boolean {
  if (!secreto) return false;
  return iguales(request.headers.get("authorization") ?? "", `Bearer ${secreto}`);
}
