# Recuperación de contraseña · Daybook Travel

Implementación local solicitada el 2026-10-05. No implica publicación ni cambios de configuración de RELEVO.

## Flujo y límites

- El login ofrece «¿Olvidaste tu contraseña?» hacia `/recuperar-clave`.
- La solicitud llama al SDK real `db().auth.resetPasswordForEmail` con el correo del input, igual que el login actual: sin convertir a minúsculas ni otra normalización añadida.
- `redirectTo` es exactamente `new URL('/actualizar-clave', window.location.origin).href`. No usa Site URL como sustituto ni acepta un destino desde parámetros.
- Cuenta existente y desconocida muestran la misma confirmación. Errores de transporte, configuración y cuota muestran un mensaje genérico; nunca `error.message` del proveedor.
- Un envío en vuelo y un minuto de espera limitan reenvíos accidentales. Sólo el timestamp de espera se conserva en `sessionStorage`; no correos ni contraseñas. Si storage está bloqueado, queda la protección en memoria. Esto **no sustituye** rate limits, controles antiabuso o CAPTCHA del proveedor.
- `/actualizar-clave` es pública y monta únicamente el formulario de recuperación. No monta `AppProvider`, `Workspace` ni consultas de membresía.
- Al crear el singleton lazy se registra el observador **antes** de `auth.initialize()`, usando `skipAutoInitialize`. Guarda sólo id de usuario, vencimiento y estado en memoria. El SDK procesa el callback y administra sus tokens; la aplicación no extrae, copia ni persiste tokens manualmente.
- Sólo `PASSWORD_RECOVERY` con usuario y vencimiento válido abre el formulario. `INITIAL_SESSION`, sesión normal, `SIGNED_IN`, `TOKEN_REFRESHED` y fragmentos arbitrarios no conceden permiso. El registro temprano conserva el evento aunque la pantalla se suscriba después. El callback es síncrono y no espera llamadas auth.
- La ruta observa la salida de `checking` y reemplaza la URL completa por `/actualizar-clave`, sin leer sus parámetros. Así también limpia callbacks rechazados cuya validación tarda más de un segundo, sin intervenir mientras el SDK inicializa.
- Antes de actualizar se valida longitud y confirmación, y se revalida la identidad mediante `auth.getUser()`. Sólo una actualización puede estar en vuelo. Expiración/rechazo de sesión falla cerrado y permite pedir otro enlace.
- `updateUser({ password })` exitoso limpia ambos campos y consume la autorización en memoria antes de `signOut({ scope: 'local' })`. Sólo después de un cierre exitoso vuelve al login. Si el cierre falla, lo dice y ofrece reintentarlo sin repetir la actualización.
- Travel y Daybook Asistencia comparten identidad RELEVO: la nueva contraseña también se usa en Asistencia. Recuperar una identidad **no concede membresía**, no cambia roles, lista blanca, RLS ni datos.

## Política de contraseña

El mínimo local es de **6 caracteres**, coherente con `minLength={6}` del login vigente. No se inventaron requisitos de composición ni se consultó configuración remota. Se recomienda en UI una contraseña larga y única; el proveedor puede imponer requisitos mayores y sigue siendo la autoridad. Rechazos `weak_password` / `same_password` permiten elegir otra clave con un mensaje propio.

Supabase recomienda un mínimo de 8 y permite configurar longitud, composición y contraseñas filtradas. Antes de publicar, el responsable debe revisar la política real de RELEVO y reconciliar este mínimo si corresponde. Este documento no certifica la política desplegada.

Fuentes primarias revisadas el 2026-10-05:

- [Contraseñas y recuperación](https://supabase.com/docs/guides/auth/passwords)
- [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser)
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Política de seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security)
- SDK instalado `@supabase/auth-js`: inicialización, `PASSWORD_RECOVERY`, `INITIAL_SESSION` y procesamiento de callback. El cliente usa el flujo implícito de la app CSR existente, sin intercambio manual de tokens.

## Callbacks exactos de producción que debe revisar el responsable

| Aplicación | URL |
| --- | --- |
| Travel | `https://relevo-chi.vercel.app/actualizar-clave` |
| Asistencia | `https://daybook-asistencia.vercel.app/actualizar-clave` |
| Asistencia, host adicional a mantener | `https://fcc-asistencia.vercel.app/actualizar-clave` |

El host Travel procede de las fuentes de este checkout. Los hosts de Asistencia son requisitos de entrega; este checkout sólo implementa Travel. No se ha comprobado ni publicado la ruta de la otra aplicación.

Gates externos **pendientes**, sin modificar configuración:

1. Revisión de ambos códigos, callbacks y política real de contraseñas.
2. Allowlist del proyecto RELEVO con los callbacks exactos que se desplieguen, sin sustituir los hosts existentes ni usar comodines amplios.
3. Site URL del proyecto compartido: revisar que sea la intencionada y que no anule el `redirectTo` explícito. No cambiarla automáticamente a Travel.
4. Plantilla de recovery: verificar que el enlace generado por el proveedor (`ConfirmationURL` / `RedirectTo`, según la plantilla vigente) conserve el destino autorizado y el flujo de recuperación; no construir/copiar tokens manualmente.
5. Deployment autorizado por separado.
6. Correo real, enlace vencido/reutilizado del proveedor real y acceso desde el correo. La fixture local no certifica SMTP, cuotas reales ni configuración de plantillas.
7. Login con la nueva contraseña en ambas apps; comprobar que los permisos/membresías de cada app siguen independientes y que el modo demo no depende de Supabase.

## Verificación local y evidencia

- Unidad: `npm test`. Los módulos de request y recuperación también se ejecutan directamente con `node --experimental-strip-types lib/password-request.test.ts` y `lib/password-recovery.test.ts`, sin red.
- Tipos: `npx --no-install tsc --noEmit`.
- Build: `npm run build`, mediante supervisor sin `.env.local`; el cliente continúa siendo lazy.
- Lint: **N/A**; Travel no tiene script de lint. No se añadió ESLint ni se cambió toolchain.
- Baseline: `npm run test:browser` (`scripts/browser-login.mjs`), móvil 390×844/touch y escritorio 1440×900, teclado/tema/demo/geometría. La acción nueva añade 44 px y reemplaza un margen de 16 px; incremento neto de tarjeta de 28 px. Se conserva el contrato global de ausencia de overflow.
- Recovery: `node scripts/browser-recovery.mjs`, archivo exacto ejecutado por el supervisor. Reutiliza ownership/CDP/readiness del baseline; usa el SDK instalado y respuestas HTTP controladas sólo en la frontera de un origen LOCAL. Genera identidades, tokens y claves sintéticos en runtime. No hay cuenta humana, correo real ni estado final de React/auth inyectado.
- La fixture intercepta y bloquea requests externos de auth/db; exige cero requests externos, cero mutaciones fuera de fixture y cero consultas de datos protegidos. El carril de login normal posterior usa el SDK real y permite únicamente `rpc/is_member` con respuesta falsa de la fixture para comprobar que recuperar identidad no concede membresía; la recuperación misma no consulta la base. Incluye validación del proveedor retenida durante más de 1,2 segundos y verifica que, al resultar inválida, la ruta limpie la URL y siga sin formulario. Casos negativos: sesión ausente, malformada, normal y preexistente, vencida y enlace reutilizado respondido por proveedor local. Casos positivos: callback, request, validación, update, errores, signOut, limpieza y navegación.
- CDP recoge console/Log/excepciones sin imprimir contenidos sensibles. Las capturas se toman con campos de contraseña vacíos, antes de escribir o después de limpiar. El perfil de Chrome y procesos son propios y se cierran en `finally`. agent-browser se conecta sólo a ese Chrome, con el id devuelto en el checkout por `agent-browser session id --scope worktree --prefix travel-recovery`; `open`, `get` y `close` usan ese mismo id, `--restore` y `--restore-save never`.
- Se consulta `/_next/mcp` (`tools/list` y `get_compilation_issues`) en el servidor LOCAL del gate.
- Evidencia fuera del repo: `/home/domarchithinkpad/.hermes/cache/scratch/password-recovery-20261005/travel/build-v2`, con requests/recibos del supervisor, logs RED/GREEN y capturas sin claves.

El escritor sólo modifica source/tests/docs y ejecuta pruebas puras. Los gates con socket/build se solicitan mediante JSON atómico con gate cerrado; mientras están pendientes no se edita fuente. Commit, revisión final y bundle corresponden al supervisor tras detener al escritor. No se ha hecho push, PR, merge, deploy, correo real ni cambios de Supabase.
