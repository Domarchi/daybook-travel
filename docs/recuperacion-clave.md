# Recuperación de contraseña · Daybook Travel

Contratos locales del harness y correcciones de revisión sobre BASE `3e17d86bd85efd874df76f65d1af3243324aa991`. No implica publicación ni cambios en RELEVO. Las mediciones históricas de BASE se identifican al final; los resultados finales del sucesor pertenecen al handoff externo asociado a su fuente congelada.

## Solicitud y privacidad

El login enlaza a `/recuperar-clave`. El SDK real llama a `resetPasswordForEmail` con la misma normalización del login (sin conversión añadida a minúsculas) y `redirectTo = new URL('/actualizar-clave', window.location.origin).href`.

Éxito y `user_not_found` muestran exactamente la misma confirmación. Transporte, configuración y cuota muestran un error genérico; nunca mensajes crudos del proveedor. Un envío en vuelo y 60 segundos de espera previenen reenvíos accidentales. Sólo se conserva un timestamp en sessionStorage; esto no sustituye los controles antiabuso del proveedor.

El HTML servido tiene el correo y el botón deshabilitados. Un efecto los habilita después de hidratar; el formulario expone esa readiness mediante `data-recovery-ready`. Antes de hidratar el correo no se serializa en un envío HTML nativo. Sin JavaScript se explica que no se ha enviado ninguna solicitud y que hace falta activarlo. No se ofrece una solicitud ficticia sin JS.

## Grant local y limpieza del callback

`/actualizar-clave` es pública y no monta el store de la aplicación ni consulta membresías. El singleton registra `onAuthStateChange` antes de inicializar el SDK. Su callback es síncrono: no espera ninguna llamada auth dentro del observador.

`detectSessionInUrl` recibe los parámetros ya extraídos por el SDK. La aplicación sólo comprueba nombres de parámetros, ruta y tipo recovery; no extrae ni copia valores de tokens. Marca un callback local pendiente y reemplaza inmediatamente la URL por `/actualizar-clave`. El SDK conserva sus parámetros internos y valida el callback. El reemplazo temprano evita que el posterior `location.hash=''` del SDK deje la URL original en una entrada anterior del historial. La pantalla también reemplaza la URL al finalizar la comprobación, incluso ante rechazo o error de inicialización.

Sólo `PASSWORD_RECOVERY` con callback local, identidad y vencimiento válidos concede el grant. Un fragmento arbitrario, una sesión normal, INITIAL_SESSION o un broadcast en una pestaña sin callback no lo conceden. INITIAL_SESSION puede llegar antes de PASSWORD_RECOVERY; se mantiene «Comprobando enlace» hasta que termina la inicialización y se procesa el evento diferido del SDK, sin destello inválido.

Una vez concedido, SIGNED_IN de visibilidad y otros eventos de la misma identidad conservan el grant vigente. No amplían su vencimiento original. Cambio de identidad, SIGNED_OUT, sesión vencida/inválida o consumo cierran el permiso sin rearmarlo en ese documento. No se guardan tokens, URLs de callback ni grants manualmente; el almacenamiento de sesión pertenece al SDK.

Antes de `updateUser`, `getUser` revalida la identidad original y se vuelve a comprobar el grant vigente. Error, ausencia, cambio de usuario o revocación durante esa espera implican cero updates. Sólo puede haber una actualización en vuelo, incluyendo la verificación previa.

## Nueva clave y cierre

La **nueva contraseña exige al menos 8 caracteres localmente**, tanto en HTML como en lógica. El login normal conserva su mínimo de **6**. No se inventan requisitos de composición: confirmar la política real de RELEVO sigue pendiente. El proveedor puede exigir más; `weak_password` y `same_password` muestran una explicación propia.

Después de actualizar, se vacían ambos campos y se consume el grant antes de `signOut({ scope: 'global' })`. Sólo un cierre confirmado permite volver al login. Si falla, la pantalla queda sin formulario de clave ni enlace de retorno; explica que la clave cambió y ofrece un reintento explícito del cierre global. Ese reintento no repite el update.

**El consumo en memoria y pedir scope global no prueban consumo ni revocación reales en el proveedor.** Un navegador nuevo podría volver a validar un enlace si el proveedor no lo invalida. La fixture prueba lo que la app solicita y cómo reacciona; confirmar revocación de sesiones, reutilización/expiración reales y política del proveedor queda externo.

Travel y Asistencia comparten identidad RELEVO. Recuperar esa identidad no concede membresía, no cambia roles, RLS, listas blancas ni datos. El browser gate inicia sesión con la identidad sintética recuperada y comprueba que `is_member=false` sigue bloqueando la aplicación.

## Gates locales reproducibles

- `npm test`: tests Node, incluyendo fixtures HTTP loopback para MCP, con timeout por test de 10 segundos. La concurrencia de recovery usa también timeout de 1 segundo y libera todas las promesas en finally: el mutante sin exclusión falla por aserción sin colgarse.
- Focales sin procesos hijos: `node --experimental-strip-types lib/password-recovery.test.ts`, equivalente para password-request y mcp-compilation.
- `node node_modules/typescript/bin/tsc --noEmit` y `npm run build`.
- Lint: N/A; no hay script ni se agregó toolchain.
- `npm run test:browser`: baseline de login, 390×844 táctil y 1440×900, geometría, tema, teclado y demo.
- `npm run test:browser:recovery`: mismo navegador propio por CDP nativo, ambos viewports y temas. Incluye SSR sin JS, readiness en cada solicitud, éxito/ausente/cuota/transporte, Tab/Shift+Tab/Enter reales, doble submit, callbacks ausente/arbitrario/malformado/vencido/normal, error inmediato/lento/network, URL/historial/Atrás, broadcast entre pestañas reales, hidden→visible con SIGNED_IN del SDK, identidad distinta/getUser fallido, política, update, consumo, cierre global fallido y retry.

### T1 · Secuencia exacta de teclado

Cada Tab o Shift+Tab debe aterrizar en la siguiente parada declarada, en orden forward y reverse; no se busca el destino mediante Tabs adicionales. Los recorridos explícitos abarcan login, solicitud, actualización válida e invalidada, errores, enfriamiento, reintento y salida, según los controles efectivos de cada estado. En `/actualizar-clave`, «Pedir un nuevo enlace» y «Volver a iniciar sesión» se activan con Enter nativo. No se usa `.focus()` ni click JavaScript para sustituir la secuencia.

Se comprueban readiness semántica y medidas efectivas en móvil táctil 390×844 y desktop 1440×900. Tras Back/Forward se reaplica la misma emulación y se vuelven a exigir las dimensiones y el touch originales. `node scripts/browser-recovery-tab-mutants.mjs` ejecuta mutantes nombrados que quitan cada acción relevante del tab order y alteran el orden. Cada muerte debe alcanzar una assertion específica; un timeout o fallo de arranque no sirve. La mutación es privada al DOM del browser y su restauración se comprueba byte a byte, sin modificar el checkout.

M1 exige inventario de todo el documento, incluidos shadow roots, bajo el helper de certificación. BODY debe tener tabIndex negativo y no ser editable antes del primer input. Después del último control, Tab exige ese BODY de salida, aunque headless mantenga `document.hasFocus()`, y Shift+Tab vuelve al último exacto. Shift+Tab desde el primero admite salida a BODY o vuelta directa al último exacto: esta segunda variante requiere dos Tabs fijos, BODY y primero. No se aceptan botones genéricos ni búsquedas de foco. El catálogo conserva los 176 mutantes T1 y añade 72 M1 para controles antes/después de main y BODY tabulable, con guards nombrados y restauración exacta.

La fixture Next DEV usa la opción oficial `devIndicators:false` sólo cuando la fase es desarrollo y su hijo Next recibe `TRAVEL_BROWSER_FIXTURE=document-boundaries-v1`. El inicio habitual y build conservan defaults. Esto elimina una parada del indicador de desarrollo identificada mediante CDP; no excluye portales ni controles fuera de main del inventario. La copia privada del runner I1 incluye `next.config.mjs` para conservar esa misma fixture.

### T2 · Callbacks query y diagnóstico estricto

Los casos `code-malformed`, `code-no-verifier` y `provider-error` se navegan mediante query real, cada uno sin sesión y con sesión ordinaria obtenida por el formulario de login y el SDK real contra la fixture HTTP existente: seis casos por viewport. El error de proveedor incluye una descripción sintética privada que nunca se imprime. Se exige UI genérica segura, ausencia del formulario de nueva clave y de grants, cero updates y limpieza de query/hash en la URL y en todas las entradas del historial. Back y Forward son navegaciones reales; esperan la solicitud hidratada y la actualización rechazada, respectivamente.

En el SDK instalado 2.115.0, `_isPKCECallback` exige tanto `code` como un verificador almacenado. Estos casos no crean verificadores ni reemplazan métodos auth: no producen exchange PKCE. La frontera cuenta y rechaza con HTTP 400 cualquier exchange inesperado; jamás devuelve una sesión para un code arbitrario. La sesión ordinaria se conserva sin conceder permiso de recuperación. **La fixture no acredita un flujo PKCE válido ni éxito PKCE real.**

I1 exige vivacidad positiva de Runtime.consoleAPICalled, Runtime.exceptionThrown y Log.entryAdded en cada viewport antes de exigir cero errores inesperados. Runtime usa canaries CDP reales con marcador, clase y contexto aislado exactos; sólo esos canaries se clasifican como esperados. Un `console.error` ordinario, incluso parecido a `AuthApiError` o `TypeError` del SDK, se añade a `errors`; las excepciones ordinarias también fallan. Log exige el catálogo completo de once diagnósticos de fixture, no un total incidental de mensajes HMR.

Los diagnósticos HTTP/transporte requieren correlación con el request registrado por la fixture, endpoint, método, resultado y contexto exactos; el status del mensaje debe coincidir con el emitido. M5 consume esa correlación sólo después de validarla y exactamente una vez: una entrada idéntica repetida se clasifica como inesperada. Un cruce inválido no consume la correlación legítima y el contexto diferido permitido sigue siendo válido. Se contabilizan por separado los diagnósticos de ciclo de vida HMR: sólo la frase completa de Chromium que termina en `Page entered Back-Forward Cache.`, para un WebSocket local `/_next/hmr` observado previamente en el mismo client/documento, durante Back/Forward esperado, con restore BFCache confirmado y máximo uno por transición. URLs e identidades de correlación permanecen únicamente en RAM. Mensajes distintos, sockets externos, duplicados y entradas fuera de transición siguen fallando.

En las mediciones históricas de BASE descritas en `review-input/REPORT.md` hubo **23 entradas Log de nivel error por viewport**: 11 de fixture HTTP/transporte y 12 de HMR BFCache esperado. El resultado fue `unexpected=0`, no cero diagnósticos brutos. El marcador `console.error` real provocó la assertion final `collector sin errores inesperados`. Esos conteos históricos no sustituyen el contrato de vivacidad del sucesor.

### T3 · Sandbox en el arranque compartido

Baseline y recovery comparten `startBrowser`. Antes del spawn, una assertion valida una lista cerrada de argumentos y valores permitidos; rechaza flags adicionales, duplicados y cambios de features fuera del contrato. M2 resuelve `CHROME_PATH` mediante realpath y sólo acepta rutas canónicas explícitas de Chrome/Chromium del sistema; un ELF/Mach-O arbitrario, incluso a través de un symlink privado, se rechaza sin fallback. La única resolución de wrapper vendor conocida, `/opt/google/chrome/google-chrome`, selecciona directamente su binario hermano permitido sin ejecutar el script. El selector abre el binario permitido y el spawn usa ese descriptor mediante `/proc/self/fd`, en vez de devolver una ruta sustituible. No confía en `GITHUB_ACTIONS` ni en archivos del checkout. Esto no acredita que CI remoto haya corrido.

El recibo `Chrome sandbox` distingue `sandboxRequested`, `argvValidated` y `executableAllowlistVerified`: evidencia intención y validaciones previas al spawn, no estado efectivo del kernel. Declara seccomp y namespaces como no medidos. La instrumentación Linux separada puede observar procesos propios, renderers, UID, seccomp y namespaces; requiere evidencia real por corrida. El proceso principal puede tener seccomp0 mientras renderers tienen seccomp2. Ni el recibo constante ni la allowlist prueban sandbox activo, y no se promete una garantía portable de seccomp Linux en macOS. No se habilitan flags de bypass ni cambios del sistema para obtener un resultado verde.

Todos los requests de navegador pasan por una frontera que permite sólo el servidor loopback propio y el proveedor fixture `http://127.0.0.1:54321`. Los demás se bloquean y cuentan; se exige **egress remoto 0**, mutaciones externas 0 y consultas inesperadas 0. No se inicia un proveedor real, no se usa correo humano y no se leen credenciales. Las respuestas auth se fabrican únicamente en esa frontera HTTP: el cliente y los eventos son del SDK instalado. La fixture expone la cabecera de versión requerida por auth-js para interpretar sus códigos de error.

La readiness espera estados semánticos, no pausas fijas. Los retrasos de 350 ms simulan respuestas pendientes para probar concurrencia; la retención deliberada de más de 1,2 s prueba inicialización lenta. Ninguno sustituye la readiness. Cada operación CDP, espera de estado y arranque tiene límite; recovery tiene además un máximo global de 240 segundos. Los procesos y perfiles son propios y se cierran en finally. Las capturas sólo admiten correo y claves vacíos. No se registran bodies auth, tokens, hashes ni URLs completas de callback.

M5 consulta el MCP real del Next local después de completar ambos viewports. Exige respuesta HTTP válida, envelope/result JSON-RPC válidos, catálogo bien formado y exactamente una tool `get_compilation_issues`. HTTP404, tool ausente o duplicada, error de protocolo/call, contenido inválido e issues presentes rechazan con assertions nombradas. Sólo anuncia éxito tras llamar la tool y assertar `issues` vacío; no reutiliza una observación anterior ante issues tardíos. Los tests ejecutan el guard real contra HTTP loopback y el validador real; no sustituyen la medición Next/browser final.

Los harnesses baseline/recovery no dependen de agent-browser. `CHROME_PATH` selecciona el ejecutable bajo la validación anterior; por omisión se buscan ubicaciones estándar. `RECOVERY_EVIDENCE_DIR` permite elegir capturas; por omisión quedan bajo el directorio temporal del sistema. El guard de browser-login usa `fileURLToPath`; un test ejecuta una copia real desde una ruta con espacios y comprueba que entra a main, bloqueando el primer socket con un hook de prueba. Los nuevos runners de mutantes y probes con roots cerrados son herramientas locales de esta revisión supervisada, no gates portables de CI. Requieren inspección y aprobación de script/hash/argv antes de ejecutarse.

### T4 · Chrome fijado en CI

CI configura Node 24, `npm ci` y `browser-actions/setup-chrome@v2` con id `chrome`, `chrome-version: '154.0.8037.92'` e `install-dependencies: true` sobre Ubuntu 24.04. Un step del workflow canónico copia el bundle del output de setup a `/opt/travel-ci-chrome/bundle/chrome`, fija propiedad `root:root` y elimina escritura de grupo/otros; esa es una ruta explícita de allowlist. Los gates browser no reciben `CHROME_PATH`. M3 exige timeouts exactos de 20 minutos en el job verify, 5 en baseline y 10 en recovery, dentro de sus scopes correctos; no basta un entero positivo ni el valor en otro job/step.

El supervisor verificó la disponibilidad del pin en el manifiesto oficial Chrome for Testing de 2026-10-05T23:13:57.538Z, revisión 1689415, y la descarga Linux64 mediante HEAD HTTP 200. Los recibos están en `official-chrome-pin-evidence.json` y `setup-chrome-v2-action.yml.txt`, en el directorio externo de evidencia. El Chrome usado en las mediciones locales fue **154.0.8037.97**, distinto del pin CI **154.0.8037.92**. Configuración y disponibilidad del binario no acreditan ejecución de GitHub Actions: **CI remoto sigue externo pendiente**.

### Evidencia histórica de BASE y alcance del sucesor

Los gates de BASE `3e17d86bd85efd874df76f65d1af3243324aa991` ya fueron medidos; la antigua lista de pendientes T4/unit/tipos/build/baseline/recovery quedó obsoleta. La evidencia sanitizada externa `review-input/SUPERVISOR-VERIFICATION.json`, sección `parent_receipts_reused_not_rerun`, conserva exit0 para `closure-unit`, `closure-tsc`, `closure-build`, `closure-baseline` y `closure-recovery-1/2/3`, con manifest before/after `6d5f6363d4bade2146a8b9a88ebf1e4f136d0b4634277803b6a3f70325bae071`. El build registra la restauración exacta del artefacto generado `next-env.d.ts`; no fue una repetición del revisor.

La revisión independiente de esa misma BASE, `review-input/REPORT.md` (SHA256 `0c0b6449727bba11555f96eddf9be59b68d72f9e65ce2e6b14ec8a7560ae69b8`), midió unit238/238, tipos, baseline y otras **dos** rondas recovery con exit0, además de 176/176 mutantes T1 muertos/restaurados. No confundir esas dos rondas con las tres del padre. T4 estaba configurado; dos mutantes de timeout sobrevivían. El veredicto fue **CAMBIOS REQUERIDOS**: un collector sin eventos sobrevivía y se señalaron M1–M5. Los éxitos históricos no aprobaban esos huecos.

Las secciones anteriores describen los contratos corregidos de I1 y M1–M5. Las mediciones intermedias y sus manifests exactos están en `TDD-JOURNAL.md` y `responses/<id>.json` del directorio externo de evidencia; no certifican automáticamente una fuente posterior. Esta edición no atribuye GREEN a los gates finales del sucesor. Su fuente congelada, tres rondas recovery, matrices de mutantes, cleanup y resultados finales se registran fuera del source en `HANDOFF-PADRE.md` con recibos identificables, sin reescribir este documento después de los gates. GitHub Actions externo, SMTP, autenticación/cuentas reales y producción no fueron ejecutados en este cierre local.

## Pendientes del responsable antes de publicar

1. Confirmar la política real de contraseña compartida y revisar ambos candidatos.
2. Verificar allowlist de callbacks exactos, sin comodines amplios ni reemplazar hosts existentes:
   - Travel: `https://relevo-chi.vercel.app/actualizar-clave`.
   - Asistencia: `https://daybook-asistencia.vercel.app/actualizar-clave` y `https://fcc-asistencia.vercel.app/actualizar-clave`.
3. Revisar Site URL y plantilla de recovery para que respeten el redirect explícito, sin construir tokens manualmente.
4. Autorizar despliegue por separado y luego comprobar correo/SMTP, enlace vencido/reutilizado, consumo y revocación global reales.
5. Verificar login con la nueva clave en ambas apps y conservación independiente de sus membresías.

El escritor modifica source/tests/docs y solicita gates mediante JSON cerrado al supervisor, congelando ediciones hasta recibir cada respuesta. Diario TDD y reporte sanitizados quedan en el directorio de evidencia designado fuera del repo. Commit y pasada FINAL corresponden al supervisor después de la salida del escritor; no se hace push, PR, merge ni deploy.
