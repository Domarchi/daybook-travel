# Recuperación de contraseña · Daybook Travel

Corrección local del candidato de 2026-10-05. No implica publicación ni cambios en RELEVO.

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

- `npm test`: tests Node puros, timeout por test de 10 segundos. La concurrencia usa también timeout de 1 segundo y libera todas las promesas en finally: el mutante sin exclusión falla por aserción sin colgarse.
- Focales sin procesos hijos: `node --experimental-strip-types lib/password-recovery.test.ts`, equivalente para password-request y mcp-compilation.
- `node node_modules/typescript/bin/tsc --noEmit` y `npm run build`.
- Lint: N/A; no hay script ni se agregó toolchain.
- `npm run test:browser`: baseline de login, 390×844 táctil y 1440×900, geometría, tema, teclado y demo.
- `npm run test:browser:recovery`: mismo navegador propio por CDP nativo, ambos viewports y temas. Incluye SSR sin JS, readiness en cada solicitud, éxito/ausente/cuota/transporte, Tab/Shift+Tab/Enter reales, doble submit, callbacks ausente/arbitrario/malformado/vencido/normal, error inmediato/lento/network, URL/historial/Atrás, broadcast entre pestañas reales, hidden→visible con SIGNED_IN del SDK, identidad distinta/getUser fallido, política, update, consumo, cierre global fallido y retry.

### T1 · Secuencia exacta de teclado

Cada Tab o Shift+Tab debe aterrizar en la siguiente parada declarada, en orden forward y reverse; no se busca el destino mediante Tabs adicionales. Los recorridos explícitos abarcan login, solicitud, actualización válida e invalidada, errores, enfriamiento, reintento y salida, según los controles efectivos de cada estado. En `/actualizar-clave`, «Pedir un nuevo enlace» y «Volver a iniciar sesión» se activan con Enter nativo. No se usa `.focus()` ni click JavaScript para sustituir la secuencia.

Se comprueban readiness semántica y medidas efectivas en móvil táctil 390×844 y desktop 1440×900. Tras Back/Forward se reaplica la misma emulación y se vuelven a exigir las dimensiones y el touch originales. `node scripts/browser-recovery-tab-mutants.mjs` ejecuta mutantes nombrados que quitan cada acción relevante del tab order y alteran el orden. Cada muerte debe alcanzar una assertion específica; un timeout o fallo de arranque no sirve. La mutación es privada al DOM del browser y su restauración se comprueba byte a byte, sin modificar el checkout.

### T2 · Callbacks query y diagnóstico estricto

Los casos `code-malformed`, `code-no-verifier` y `provider-error` se navegan mediante query real, cada uno sin sesión y con sesión ordinaria obtenida por el formulario de login y el SDK real contra la fixture HTTP existente: seis casos por viewport. El error de proveedor incluye una descripción sintética privada que nunca se imprime. Se exige UI genérica segura, ausencia del formulario de nueva clave y de grants, cero updates y limpieza de query/hash en la URL y en todas las entradas del historial. Back y Forward son navegaciones reales; esperan la solicitud hidratada y la actualización rechazada, respectivamente.

En el SDK instalado 2.115.0, `_isPKCECallback` exige tanto `code` como un verificador almacenado. Estos casos no crean verificadores ni reemplazan métodos auth: no producen exchange PKCE. La frontera cuenta y rechaza con HTTP 400 cualquier exchange inesperado; jamás devuelve una sesión para un code arbitrario. La sesión ordinaria se conserva sin conceder permiso de recuperación. **La fixture no acredita un flujo PKCE válido ni éxito PKCE real.**

El collector mantiene Runtime, Log y excepciones activos y exige cero errores inesperados. Todo `Runtime.consoleAPICalled` de tipo `error` es siempre inesperado y se añade a `errors` y al contador `unexpected.console-error`, incluso si parece `AuthApiError` o `TypeError` del SDK, en cualquier escenario. `Runtime.exceptionThrown` también permanece estricto. Las únicas clasificaciones esperadas corresponden a Log: los diagnósticos HTTP/transporte requieren correlación con el request registrado por la fixture, endpoint, método y resultado exactos; el status del mensaje debe coincidir con el emitido. Se contabilizan por separado los diagnósticos de ciclo de vida HMR: sólo la frase completa de Chromium que termina en `Page entered Back-Forward Cache.`, para un WebSocket local `/_next/hmr` observado previamente en el mismo client/documento, durante Back/Forward esperado, con restore BFCache confirmado y máximo uno por transición. URLs e identidades de correlación permanecen únicamente en RAM. Mensajes distintos, sockets externos, duplicados y entradas fuera de transición siguen fallando.

En la medición T3 de recovery con sandbox activo hubo **23 entradas Log de nivel error por viewport**: 11 de fixture HTTP/transporte y 12 de HMR BFCache esperado. El resultado fue `unexpected=0`, no cero diagnósticos brutos ni cero mensajes de consola. El marcador `console.error` real inyectado por el supervisor fue capturado por Runtime y provocó la assertion final `collector sin errores inesperados`.

### T3 · Sandbox en el arranque compartido

Baseline y recovery importan o invocan el mismo `startBrowser`. Chrome se lanza con sandbox activo en Linux y sin bypass alternativo por plataforma o entorno. Antes del spawn, una assertion valida una lista cerrada de argumentos y valores permitidos; rechaza flags adicionales, duplicados y cambios de features fuera del contrato. El recibo `Chrome sandbox` contiene sólo el estado y los nombres de flags efectivos, sin valores de perfil, puertos ni URLs.

Todos los requests de navegador pasan por una frontera que permite sólo el servidor loopback propio y el proveedor fixture `http://127.0.0.1:54321`. Los demás se bloquean y cuentan; se exige **egress remoto 0**, mutaciones externas 0 y consultas inesperadas 0. No se inicia un proveedor real, no se usa correo humano y no se leen credenciales. Las respuestas auth se fabrican únicamente en esa frontera HTTP: el cliente y los eventos son del SDK instalado. La fixture expone la cabecera de versión requerida por auth-js para interpretar sus códigos de error.

La readiness espera estados semánticos, no pausas fijas. Los retrasos de 350 ms simulan respuestas pendientes para probar concurrencia; la retención deliberada de más de 1,2 s prueba inicialización lenta. Ninguno sustituye la readiness. Cada operación CDP, espera de estado y arranque tiene límite; recovery tiene además un máximo global de 240 segundos. Los procesos y perfiles son propios y se cierran en finally. Las capturas sólo admiten correo y claves vacíos. No se registran bodies auth, tokens, hashes ni URLs completas de callback.

El runner consulta el MCP real del Next local. Sólo anuncia éxito de MCP tras llamar a `get_compilation_issues` y assertar un array `issues` vacío. Si la integración no está expuesta, lo declara sin certificar issues; no imprime un catálogo como si fuera validación. El test puro rechaza catálogo, resultado vacío, errores e issues presentes.

Los scripts no dependen de rutas ThinkPad ni de agent-browser. `CHROME_PATH` permite seleccionar Chrome/Chromium; por omisión se buscan ubicaciones estándar. `RECOVERY_EVIDENCE_DIR` permite elegir capturas; por omisión quedan bajo el directorio temporal del sistema. El guard de browser-login usa `fileURLToPath`; un test ejecuta una copia real desde una ruta con espacios y comprueba que entra a main, bloqueando el primer socket con un hook de prueba.

### T4 · Chrome fijado en CI

CI configura Node 24, `npm ci` y `browser-actions/setup-chrome@v2` con id `chrome`, `chrome-version: '154.0.8037.92'` e `install-dependencies: true` sobre Ubuntu 24.04. Ambos steps browser reciben `CHROME_PATH: ${{ steps.chrome.outputs.chrome-path }}`. Los timeouts son 20 minutos para el job, 5 para baseline y 10 para recovery.

El supervisor verificó la disponibilidad del pin en el manifiesto oficial Chrome for Testing de 2026-10-05T23:13:57.538Z, revisión 1689415, y la descarga Linux64 mediante HEAD HTTP 200. Los recibos están en `official-chrome-pin-evidence.json` y `setup-chrome-v2-action.yml.txt`, en el directorio externo de evidencia. El Chrome usado en las mediciones locales fue **154.0.8037.97**, distinto del pin CI **154.0.8037.92**. Configuración y disponibilidad del binario no acreditan ejecución de GitHub Actions: **CI remoto sigue externo pendiente**.

### Estado al congelar esta edición T1–T4

La medición supervisada de T3, previa a esta edición final de CI/documentación, terminó con exit 0 en baseline y recovery con sandbox activo. Recovery completó los 12 casos query entre ambos viewports, MCP con `issues` vacío y egress/mutaciones externas 0. Los mutantes con sandbox activo terminaron con **176/176 muertos y restaurados: 88 móvil y 88 desktop**. El marcador Runtime real alcanzó y disparó la assertion final. Las corridas anteriores con el bypass Linux eran provisionales y no sustituyen estos recibos.

**Pendientes sobre la fuente final congelada:** GREEN de `T4_CONTRACT`, suite unitaria completa, tipos, build, baseline final y tres rondas finales de recovery. Esta documentación no atribuye PASS a esas ejecuciones aún no medidas. El supervisor registra sus resultados posteriores en la evidencia externa.

## Pendientes del responsable antes de publicar

1. Confirmar la política real de contraseña compartida y revisar ambos candidatos.
2. Verificar allowlist de callbacks exactos, sin comodines amplios ni reemplazar hosts existentes:
   - Travel: `https://relevo-chi.vercel.app/actualizar-clave`.
   - Asistencia: `https://daybook-asistencia.vercel.app/actualizar-clave` y `https://fcc-asistencia.vercel.app/actualizar-clave`.
3. Revisar Site URL y plantilla de recovery para que respeten el redirect explícito, sin construir tokens manualmente.
4. Autorizar despliegue por separado y luego comprobar correo/SMTP, enlace vencido/reutilizado, consumo y revocación global reales.
5. Verificar login con la nueva clave en ambas apps y conservación independiente de sus membresías.

El escritor modifica source/tests/docs y solicita gates mediante JSON cerrado al supervisor, congelando ediciones hasta recibir cada respuesta. Diario TDD y reporte sanitizados quedan en el directorio de evidencia designado fuera del repo. Commit y pasada FINAL corresponden al supervisor después de la salida del escritor; no se hace push, PR, merge ni deploy.
