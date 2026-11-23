// RUT, teléfono y correo de la ficha de una persona: cómo se escriben y cómo se
// guardan. La base exige lo mismo (migración 016: rut_valido(), people_phone_check
// y people_email_check); aquí se valida antes, para decir qué está mal en el
// formulario en vez de mostrar el rechazo de Postgres.
//
// Sin React ni Supabase, para poder probarlo.

/** El dígito verificador de un cuerpo de RUT (módulo 11). */
export function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i -= 1) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  return resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
}

/**
 * Lo que escribe la persona («12.345.678-k», «12345678k», con espacios) llevado
 * a la forma guardada («12345678-K»). No valida: igual que rut_normalizado() en
 * la base, que hace lo mismo con lo que llega al entrar.
 */
export function normalizarRut(valor: string): string {
  const limpio = valor.replace(/[^0-9kK]/g, "").toUpperCase();
  return limpio.length < 2 ? limpio : `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

/** Si el RUT, ya normalizado, tiene la forma y el dígito verificador correctos. */
export function rutValido(rut: string): boolean {
  const partes = /^(\d{7,8})-([\dK])$/.exec(rut);
  return Boolean(partes && digitoVerificador(partes[1]) === partes[2]);
}

/** «12345678-5» → «12.345.678-5», como se lee en Chile. */
export function formatearRut(rut: string): string {
  const [cuerpo, dv] = rut.split("-");
  if (!cuerpo || !dv) return rut;
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

/**
 * Un teléfono en formato internacional con «+», como lo pide WhatsApp. Lo que
 * se escribe sin código de país se toma como chileno: «9 1234 5678» y
 * «912345678» → «+56912345678». Devuelve null si no se entiende.
 */
export function normalizarTelefono(valor: string): string | null {
  const conMas = valor.trim().startsWith("+");
  let digitos = valor.replace(/\D/g, "");
  if (!digitos) return null;
  if (!conMas) {
    if (digitos.startsWith("00")) digitos = digitos.slice(2);
    else if (digitos.length === 9 && digitos.startsWith("9")) digitos = "56" + digitos;
    else if (digitos.length === 8) digitos = "569" + digitos;
  }
  const telefono = "+" + digitos;
  return /^\+[1-9]\d{7,14}$/.test(telefono) ? telefono : null;
}

/** «+56912345678» → «+56 9 1234 5678»; otros países quedan como están. */
export function formatearTelefono(telefono: string): string {
  const chileno = /^\+569(\d{4})(\d{4})$/.exec(telefono);
  return chileno ? `+56 9 ${chileno[1]} ${chileno[2]}` : telefono;
}

/** El correo en minúscula y sin espacios, o null si no parece un correo. */
export function normalizarCorreo(valor: string): string | null {
  const correo = valor.trim().toLowerCase();
  return correo.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? correo : null;
}

export type Contacto = { rut: string | null; phone: string | null; email: string | null };

/**
 * Lee los tres campos del formulario de la ficha. Vacío es null (los tres son
 * opcionales); escrito y mal escrito es un error que dice cuál.
 */
export function leerContacto(campos: { rut: string; phone: string; email: string }): Contacto {
  const rutEscrito = campos.rut.trim();
  const rut = rutEscrito ? normalizarRut(rutEscrito) : null;
  if (rut && !rutValido(rut)) {
    throw new Error("El RUT no es válido: revisa los números y el dígito verificador.");
  }
  const telefonoEscrito = campos.phone.trim();
  const phone = telefonoEscrito ? normalizarTelefono(telefonoEscrito) : null;
  if (telefonoEscrito && !phone) {
    throw new Error("El teléfono no es válido: escríbelo como +56 9 1234 5678.");
  }
  const correoEscrito = campos.email.trim();
  const email = correoEscrito ? normalizarCorreo(correoEscrito) : null;
  if (correoEscrito && !email) {
    throw new Error("El correo no es válido.");
  }
  return { rut, phone, email };
}

/**
 * Si la base ya tiene las columnas de contacto (migración 016). Las personas se
 * cargan con `select *`, así que basta con mirar si traen la clave `rut`. Mientras
 * la 016 no esté aplicada, la ficha no muestra ni manda estos campos: mandarlos
 * haría fallar cualquier guardado de una persona.
 */
export function baseConContacto(personas: object[]): boolean {
  return personas.some((persona) => "rut" in persona);
}
