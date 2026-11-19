// Quién está en el pie del riel y en Configuración → Cuenta. Sin React: lo usan
// el riel, la pantalla y las pruebas.
//
// Travel solo sabe el correo, si es administrador (el rol de `members`) y si
// el acceso ya se comprobó. No inventa más que eso.

export type Cuenta = {
  demo: boolean;
  email: string | null;
  isAdmin: boolean;
  accessStatus: string;
};

/** El nombre que se muestra: el correo, o «Demostración». */
export function nombreDeLaCuenta({ demo, email }: Cuenta): string {
  return demo ? "Demostración" : email || "Sin correo";
}

/** La inicial del cuadro del pie. */
export function inicialDeLaCuenta(cuenta: Cuenta): string {
  return (nombreDeLaCuenta(cuenta)[0] || "D").toUpperCase();
}

/** La línea de abajo en el pie del riel. */
export function rolEnElRiel({ demo, isAdmin }: Cuenta): string {
  if (demo) return "Datos ficticios";
  return isAdmin ? "Administrador" : "Sesión activa";
}

/** El acceso, en Configuración → Cuenta. */
export function accesoDeLaCuenta({ demo, isAdmin, accessStatus }: Cuenta): string {
  if (demo) return "Demostración";
  if (isAdmin) return "Administrador";
  if (accessStatus === "allowed") return "Miembro";
  if (accessStatus === "checking") return "Comprobando…";
  if (accessStatus === "error") return "Sin comprobar";
  return "Sin habilitar";
}
