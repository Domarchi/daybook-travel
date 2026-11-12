@AGENTS.md

# DAYBOOK TRAVEL — guía para Claude Code

App interna Daybook Travel para organizar personas, turnos y pasajes aéreos de la operación en Copiapó.
La usan Katy y Tamara. Producción: relevo-chi.vercel.app

**La idea que ordena todo:** las fechas de viaje deberían derivarse del turno de cada persona
(4×3 o 10×10) y su fecha de inicio, no digitarse. Hoy eso está a medio construir (ver Pendientes).

## Arquitectura

No hay servidor propio. El navegador habla directo con Supabase y **la seguridad vive en la
base de datos**, no en el código de pantalla. Consecuencias que hay que tener presentes:

- Cualquiera con la llave pública puede intentar consultar; lo que lo detiene son las políticas RLS.
- Las validaciones de negocio están en triggers de Postgres, no en React. Si una regla debe
  cumplirse siempre, va en SQL.
- Lo que necesita credenciales secretas o correr solo vive en **un único Route Handler**:
  `app/api/cron/alertas-urgentes/route.ts` (los avisos por correo, ver más abajo). Aparte del
  demo interno de Qwen es lo único que corre en servidor; el resto de la aplicación sigue
  hablando directo con Supabase desde el navegador.

## Mapa del código

| Ruta | Qué es |
|---|---|
| `app/page.tsx` | 14 líneas. Enchufa `AppProvider` con `Workspace`, nada más. |
| `app/store.tsx` | 53 líneas. **Junta el estado**: llama a los hooks de `app/estado/` y los expone todos juntos. Cualquier pieza lo pide con `useApp()`; no se pasan props entre vistas. |
| `app/estado/use-*.ts` | **El estado, por tema** (antes era un solo hook de 1.422 líneas). `use-tema`, `use-avisos` (avisos y `runAction`), `use-sesion`, `use-datos` (lo que viene de la base y `reload`), `use-navegacion` (pantalla y filtros), `use-dialogos` (modal, salida animada, foco), `use-derivados` (listas filtradas, costos, compra), `use-acreditacion`, y las acciones: `use-acciones-sesion`, `-viajes`, `-personas`, `-generar` y `use-manifiesto`. Cada hook declara en su tipo `Entrada` de cuáles depende y `store.tsx` le pasa solo esos. |
| `components/workspace.tsx` | El armazón: decide qué pantalla se ve y ordena las piezas. |
| `components/*.tsx` | Pantallas y diálogos, una pieza por archivo: `login-view`, `side-nav` (la barra lateral), `access-state`, `agenda-view`, `people-view`, `trips-view`, `costs-view`, `modal-layer` y los diálogos (`person-dialog`, `trip-dialog`, `generate-dialog`, `history-dialog`, `manifest-dialog`). |
| `components/ui/*.tsx` | Primitivas reutilizables: botón, campos, pastillas, tabla de datos, encabezado de página, partes de diálogo, marca (`brand-*`). |
| `components/members-view.tsx` | La pantalla Accesos. Su lógica de presentación (correos, mensajes que se pueden mostrar) está en `lib/members.ts`; la regla de verdad, en `supabase/009_accesos.sql`. |
| `components/document-types-panel.tsx` | El recuadro «Documentos exigidos» de Personas. Lo ven todos; solo un administrador agrega o desactiva tipos. |
| `lib/accreditation.ts` | **La acreditación.** `motivosDeAcreditacion(persona, fecha, tipos, documentos)` dice qué documentos faltan o vencen antes de un viaje. Sin React ni Supabase. 9 pruebas, más `accreditation-postgres.test.ts` contra la migración 010. |
| `lib/personas-repetidas.ts` | **Personas con el mismo nombre.** El diálogo de persona avisa mientras se escribe (no bloquea: dos personas pueden llamarse igual) y la lista marca «Nombre repetido» en las fichas que ya comparten nombre. Salió de una persona con dos fichas activas en producción. 6 pruebas. |
| `app/excel-sync-panel.tsx` | La pantalla del importador Excel en 3 pasos (Preparar → Revisar → Aplicar), 818 líneas. Bien hecho, no romper. Sus cuentas están en `lib/excel-preview.ts` (leer hojas, comparar, armar la vista previa; 10 pruebas) y sus piezas chicas en `app/excel-sync-parts.tsx`. |
| `app/year-view.tsx` | El calendario de la Agenda (vista Mes y Semana). El panel del día seleccionado está en `app/year-day-detail.tsx`. |
| `lib/trips-csv.ts` | El CSV de la solicitud a la agencia, con la defensa contra fórmulas de Excel. 5 pruebas. |
| `app/globals.css` | ~435 líneas. Tokens en `:root` y `:root[data-theme="light"]`, el velo y la caja de los diálogos y lo que Tailwind no cubre. |
| `lib/costs.ts` | **Las cuentas de costos.** Totales por mes, ruta y persona, cobertura, precio de referencia (mediana) y aviso de precio fuera de lo normal. 17 pruebas. |
| `lib/cierre.ts` | **Cerrar viajes sin cerrar.** Qué cambio le toca a cada viaje al anularlo o al registrarle una reserva común, y qué falta para poder hacerlo. 6 pruebas. |
| `lib/purchase.ts` | **La ventana de compra.** `estadoDeCompra(viaje, hoy, ventana)` dice si un viaje está resuelto, cerrado, sin cerrar, vencido, urgente o próximo. 18 pruebas. |
| `lib/cycles.ts` | **El motor de ciclos.** `movimientos(persona, hasta)` decide qué días sube y baja cada persona. Única fuente de esas fechas. Tiene 18 pruebas. |
| `lib/historial.ts` | **Qué cambió en cada entrada del historial.** Compara `before_data` y `after_data` y devuelve los campos que se reconocen (fecha, reserva, estado, turno, vigencia…) ya escritos para leer, y solo lo que la nota agregó en ese cambio. Lo usa el historial de viajes y el de personas (botón en la ficha), que incluye los cambios de vencimiento de sus documentos. 7 pruebas. |
| `lib/actividad.ts` y `components/activity-view.tsx` | **Actividad reciente.** Pantalla con los últimos cambios de viajes, personas y documentos de todo el proyecto, por día, con quién y qué cambió, y un botón para abrir cada uno. La ven todos los miembros; carga sus datos al abrirse (como Accesos), de a 50. Los cambios de accesos no aparecen: tienen su pantalla. 5 pruebas. |
| `lib/calendar.ts` | Solo `addDays()`. Suma días sobre cadenas AAAA-MM-DD fijando el mediodía UTC. |
| `lib/excel-sync.ts` | Lógica de comparación del importador. Tiene tests. |
| `lib/supabase.ts` | Cliente. Dos líneas. |
| `app/api/cron/alertas-urgentes/route.ts` | El cron de los avisos por correo. Delgado a propósito: la lógica está en `lib/urgent-alerts-handler.ts` (autorización, configuración, respuesta), `lib/urgent-alerts.ts` (qué viajes y qué dice el correo) y `lib/send-mail.ts` (Resend). Todo se prueba sin red. |
| `docs/manual/hacer_manual.py` | **La fuente de la guía de uso** (`docs/Manual_Daybook_Travel.pdf`, 17 páginas). Arma `manual.html` y Chrome lo imprime a PDF; los comandos están en el README. La numeración de páginas se calcula ahí, no en el navegador. No lleva correos ni nombres de personas: la lista de accesos vive en la pantalla Accesos. Al cambiar una pantalla, se actualiza el texto y se regenera. |
| `supabase/00*.sql` | Migraciones, se aplican **en orden numérico**. Aquí vive la verdad del sistema. |

## Reglas que NO hay que romper

Todo esto está implementado en SQL y es deliberado:

1. **Nadie borra nada.** No existe policy de DELETE en ninguna tabla. Los viajes se anulan
   (estado `Anulado`), no se eliminan. No agregues borrado.
2. **Toda escritura queda auditada.** El trigger `audit_change()` guarda antes/después y actor
   en `history`. No lo desactives ni escribas saltándotelo.
   El actor es un uuid; la pantalla muestra el **correo** gracias a `history_actors()`
   (migración 013), que lo busca en `auth.users`. Solo responde a un miembro y solo por quien
   aparece en un historial que ese miembro ya puede leer: a un miembro común no le revela a
   quien solo cambió accesos. Si la 013 no está aplicada, se ve el número corto de antes.
3. **Editar un viaje exige motivo.** El trigger `validate_trip()` rechaza un UPDATE con `notes`
   vacío. Es lo que hace posible reconstruir por qué se compró algo.
   Además la pantalla exige un motivo de **al menos 5 letras** (`lib/motivo.ts`): en producción
   había viajes anulados con el motivo ".". Es de letras y no de palabras porque «Duplicado» o
   «No viajó» son motivos buenos.
   **Las notas guardan las observaciones y solo el último motivo** (`lib/notas.ts`). Antes cada
   edición sumaba su motivo y volvía a guardar los anteriores, y «Información útil» se llenaba
   de motivos; los anteriores están en el historial. Una columna aparte para el motivo (para que
   la base exija el mínimo) se descartó por ahora: obliga a reescribir en producción las
   funciones del importador de Excel (003/004) y de propuestas (008), que también editan viajes.
4. **La persona y el sentido de un viaje no se cambian.** Se anula y se crea otro.
5. **Estado Emitido/Completado/No presentado exige PNR.** Constraint en la tabla.
6. **Un viaje debe caer dentro de la vigencia de una persona activa.**
7. **Acceso por lista blanca.** Solo entran los correos en `public.members` (función `is_member()`).
   Las policies RLS dependen de eso. Si no hay correos, no entra nadie: falla cerrado, así debe ser.
   **Se administra desde la pantalla Accesos** (migración 009), visible solo para administradores.
   `members` tiene `role` (`admin`/`member`) y `active`: quitar un acceso lo **desactiva**, nunca lo
   borra, y `is_member()` ya cuenta solo a los activos. Todo pasa por funciones SQL que exigen
   `is_admin()` (`list_members`, `add_member`, `set_member_active`, `set_member_role`); la tabla
   sigue sin permisos para el navegador. Nadie puede quitarse su propio acceso ni su rol de
   administrador, y el historial de accesos solo lo lee un administrador. La cuenta de Auth se crea
   fuera (es la de Daybook Asistencia): aquí solo se decide quién de esas cuentas entra a Travel.

8. **Acreditación por documentos** (migración 010). Qué documentos se exigen **no está en el
   código**: es la tabla `document_types`, que mantiene un administrador (policy con `is_admin()`).
   Cada persona tiene una fecha de vencimiento por tipo en `person_documents`, que cualquier
   miembro carga; `expires_on` en null significa «sin registrar» (no se borra la fila). Ambas
   tablas están auditadas y sin DELETE. Un tipo que ya no se exige se **desactiva**.

Antes de tocar `supabase/*.sql`: las migraciones ya aplicadas en producción **no se editan**,
se agrega una nueva con el número siguiente.

**La base de RELEVO la comparte Daybook Asistencia** (sus tablas son `asistencia_*` y sus
migraciones se registran como `001_asistencia`, `002_padron`…). Por eso las de Travel se
registran en Supabase con el prefijo `travel_`: `travel_013_historial_con_correo`. Desde el
12-nov-2026 están registradas la 009 a la 013. La 009 a la 012 se habían aplicado por el editor
SQL sin quedar en el registro; se verificaron (funciones, tablas y permisos) y se registraron
solo como constancia, sin volver a ejecutarlas. De antes quedan tres con otro nombre
(`dias_de_viaje_por_persona`, `excel_sin_regla_del_lunes`, `ventana_de_compra`) y la 001 a 004,
007 y 008 sin registrar.

## Pendientes, en orden

1. **Partir `app/page.tsx`. HECHO** (rama `partir-page-en-componentes`, nueve commits).
   De 2.630 líneas a 14, con el estado en `app/store.tsx` y una pieza por archivo en
   `app/components/`. Cada paso fue movimiento puro, comparado línea por línea contra el
   commit anterior y verificado con un recorrido en el navegador.

   Corrección a lo que decía antes esta nota: partir archivos **no reduce los redibujos**.
   Todas las piezas leen del mismo store, así que se redibujan igual que cuando estaban en
   un solo archivo. Lo que se gana es poder encontrar y cambiar una cosa sin leer 2.630
   líneas. Si algún día los redibujos molestan, eso se resuelve aparte (dividir el store o
   memorizar), no partiendo archivos.

   **Después se partió también el hook** (rama `parte-el-store`): `app/store.tsx` pasó de 1.422
   líneas a 53 y su contenido vive en trece hooks de `app/estado/`. Mismo método: movimiento puro
   (un script copió rangos de líneas del original, sin reescribir), una etapa por commit, y al
   final todas las líneas del original comparadas contra las nuevas: la única diferencia son
   imports, listas de nombres y el tipo `Entrada`. El orden de los efectos se conservó. Para
   agregar estado nuevo: ponerlo en el hook de su tema y, si otro lo necesita, pedirlo en su
   `Entrada`. Dos hooks no pueden declarar el mismo nombre (el store los mezcla con `...`).

2. **Un solo motor de ciclos. HECHO** (rama `motor-de-ciclos`). `lib/cycles.ts` es ahora el
   único que decide fechas de viaje, y la base solo guarda lo que él genera.

   - **4×3**: semanal, con el día de subida y el de bajada en la ficha de cada persona
     (`up_weekday` / `down_weekday`, por omisión lunes y jueves). La fecha de inicio ya no
     tiene que caer un lunes. Si el día de bajada cae antes en la semana que el de subida,
     la bajada es de la semana siguiente.
   - **10×10**: ciclo de veinte días desde la fecha de inicio, que es además la primera
     subida. **Sin grupos A y B**: dos personas desfasadas diez días quedan cruzadas solas.
     Es la decisión que tomó Joaquín, y evita agregar columnas de grupo.
   - `generate_pulse()` en SQL **ya no se llama** (y desde la migración 011 ya no existe): la aplicación inserta los viajes con
     `upsert` e `ignoreDuplicates`, así que nunca pisa un viaje existente.
   - Una prueba compara el motor nuevo contra el calendario retirado en cuatro fechas de
     inicio y tres períodos: nadie que ya esté cargado cambia de fechas.

3. **Ventana de compra. HECHO** (rama `ventana-de-compra`). `lib/purchase.ts` clasifica cada
   viaje y la agenda muestra la tarjeta "Por comprar ahora", que lleva a la cola filtrada.

   - Un viaje está **resuelto** cuando tiene PNR. Solicitado sin PNR sigue pendiente: decisión
     de la obra, porque hasta que no hay código nadie tiene asiento.
   - La ventana vive en `public.settings` (una sola fila, auditada), por omisión 21 días, y se
     cambia desde la agenda. Es política de la obra, no preferencia de cada persona: lo que
     cambia Katy lo ve Tamara.
   - Las **fechas abiertas** son fechas distintas, no viajes: los pasajes se compran por bloque.
   - Cada fila de Viajes lleva "Faltan N días" coloreado, y hay un filtro "Solo por comprar".
   - **Vencido dura 14 días** (`DIAS_VENCIDO`). Pasado eso, un viaje sin reserva queda
     **«sin cerrar»**: ya no se compra, se cierra (con su reserva o anulándolo), y no cuenta en
     «Por comprar ahora». La Agenda lo muestra aparte, como un enlace bajo las tarjetas que
     abre Viajes filtrado. Salió de revisar producción el 12-nov-2026: la tarjeta decía 96 por
     comprar y eran viajes de septiembre y octubre importados de «VUELOS A SOLICITAR.ods» que
     nadie actualizó. Los 14 días son los mismos que usa `purchase_alert_data()` (migración
     012) para el correo; una prueba compara los dos números.
   - **Cerrar en bloque** (`lib/cierre.ts`, `components/close-dialog.tsx`). En la lista de
     pasados sin reserva la selección múltiple sirve para cerrarlos; en el resto sigue siendo
     para marcar como solicitados, y las dos no se mezclan. «No se volaron» los anula con un
     motivo. «Se volaron con una misma reserva» les pone el código y los deja Completado, y
     solo se ofrece si todos son del mismo día y la misma ruta: un código es un vuelo. Si cada
     uno tiene su código, se abren de a uno. El motivo queda como último motivo de las notas,
     igual que al editar o al marcar como solicitados.

4. **Costos. HECHO** (rama `costos`). Vista "Costos" con gasto por mes, por ruta y por persona.

   - **El monto es por pasajero.** Dos personas en la misma reserva son dos montos que se suman;
     el Excel de la agencia repite el valor en cada fila y esa fila es una persona. Lo confirmó
     la obra a partir de la reserva DJVHQQ, que trae dos pasajeros con el mismo monto.
   - **Todo total muestra su cobertura**: cuántos de esos viajes tienen monto. Sin eso, un total
     que cubre 3 de 41 viajes parece el gasto completo. Es deliberado y no se debe quitar.
   - El precio de referencia de una ruta es la **mediana**, no el promedio: una tarifa de última
     hora carísima no debe mover la referencia contra la que se comparan las demás.
   - Al escribir un monto que se aparta más de un 40% de esa referencia, el diálogo lo dice. No
     bloquea: una tarifa cara puede ser legítima. Existe para que un cero de más no pase.

5. **Elegibilidad por acreditación. HECHO** (rama `acreditacion`). Documentos con vencimiento,
   evaluados contra la **fecha del viaje**, no contra hoy: vale hasta el día de su vencimiento.

   - **No bloquea al guardar nada.** Actúa solo al armar el manifiesto: quien tiene un documento
     faltante o vencido sale del manifiesto y aparece en «Acreditación pendiente» con el motivo.
     Katy o Tamara pueden marcar «Incluir igual». La decisión es de ellas y está a la vista.
   - Cada manifiesto parte sin excepciones: lo aprobado no se recuerda de un manifiesto al otro.
   - Texto, PDF, CSV y «Marcar como solicitados» usan **la misma lista**: lo que el manifiesto
     muestra. Antes el CSV y el marcado ignoraban la selección parcial.
   - Sin tipos activos la acreditación no aparece en ninguna pantalla.
   - La lista de documentos la define la obra y **todavía no está cargada**: se agregan desde
     Personas → «Documentos exigidos» (administrador). La demostración trae tres de ejemplo.
   - Si la migración 010 no está aplicada, la aplicación carga igual y no exige nada.

6. **Manifiesto por día y ruta. HECHO** (rama `manifiesto`). `lib/manifest.ts` arma los bloques
   y el texto; "Lista para solicitar" abre una ventana con ese texto y un botón para copiarlo.

   - El manifiesto es de **lo que esté marcado**. Si no hay nada marcado, se marcan todos los
     pendientes. Al revés —pisar la selección al abrir la ventana— hacía que quien marcaba tres
     terminara marcando trece como solicitados: como aquí nada se borra, deshacerlo son trece
     ediciones a mano. Cuando el manifiesto es parcial, el resumen dice "de N pendientes".
   - Copiar no toca la base. Marcar como solicitados sí, y es un botón aparte, para después de
     mandar el correo.
   - Copiar tiene tres intentos: portapapeles moderno, método antiguo, y dejar el texto
     seleccionado. El navegador integrado bloquea el primero; en Chrome sobre HTTPS anda.
   - Cuando falta la hora o el equipaje se escribe "Por confirmar", **con mayúscula en ambos**.
     El equipaje que sí existe va en minúscula ("maleta en bodega").
   - Dentro de un mismo día los bloques van por orden alfabético de origen, así que la bajada
     sale antes que la subida. Está sin decidir si conviene: alfabético, subidas primero, o por
     hora de vuelo.
   - **Ojo al probar en la demo**: los 13 viajes de ejemplo caen en 13 días y rutas distintos, así
     que todos los bloques dicen "1 pasajero" y el agrupamiento no se ve. Para verlo hacen falta
     dos personas el mismo día y la misma ruta.

7. **Retirar `generate_pulse()`. HECHO** (migración 011, rama `retira-generate-pulse`). Nadie la
   llamaba desde que `lib/cycles.ts` es el único motor de fechas; la 011 hace `drop function`.
   Su definición sigue en 001 y 002 por si hiciera falta volver atrás. Una prueba contra
   PostgreSQL real comprueba que desaparece sin tocar ninguna otra función.

8. **Cliente de Supabase perezoso. HECHO** (rama `entrada`). `lib/supabase.ts` exporta ahora
   `db()`, una función que crea el cliente la primera vez que alguien lo pide y lo reutiliza
   después. `npm run build` funciona en un clon sin `.env.local` — comprobado sacando el
   archivo y compilando.

   - Si faltan las variables, el mensaje dice qué copiar y qué completar, en vez del
     `supabaseUrl is required` de antes.
   - El efecto que revisa la sesión atrapa ese error: sin variables se ve la pantalla de
     entrada con el motivo, no una página en blanco, y la demostración entra igual.
   - Todas las llamadas pasaron de `db.from(...)` a `db().from(...)`.

9. **Avisos diarios de viajes por comprar. HECHO** (migración 012, rama `alertas-urgentes`).
   Cada día hábil, el cron de Vercel (`vercel.json`, `0 11 * * 1-5` UTC: las 08:00 en horario de
   verano de Chile y las 07:00 en el de invierno) llama a `/api/cron/alertas-urgentes` y, si hay
   viajes **sin código de reserva** vencidos o urgentes, manda un correo a la lista de la obra.

   - **Qué cuenta como urgente o vencido lo decide `lib/purchase.ts`**, el mismo código que pinta la
     agenda: correo y pantalla no pueden discrepar. La base solo acota la consulta.
   - **El cron no pasa por las políticas de las tablas.** Llama a una sola función,
     `purchase_alert_data()`, que ejecuta únicamente `service_role` (ni el navegador con sesión ni
     sin ella). Devuelve lo mínimo para armar el aviso y no escribe nada.
   - **Falla cerrado.** Sin `CRON_SECRET` responde 503; con otro secreto, 401; sin la configuración
     del correo no envía ni inventa un remitente. Las respuestas del cron solo traen cantidades:
     nunca nombres ni correos. Sin viajes por comprar no manda nada.
   - **Para probarlo sin enviar:** `GET /api/cron/alertas-urgentes?simular=1` con
     `Authorization: Bearer $CRON_SECRET` devuelve el asunto y el texto sin mandar el correo.
   - **Variables en Vercel** (las pone una persona; nunca en el repositorio ni con `NEXT_PUBLIC_`):
     `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (Vercel lo manda solo en el cron), `RESEND_API_KEY`,
     `ALERT_FROM` (el dominio tiene que estar verificado en Resend; sin dominio verificado Resend solo
     envía al correo de la cuenta) y `ALERT_RECIPIENTS` (correos separados por coma). `APP_URL` es
     opcional. Hasta que estén puestas el cron responde 503 cada mañana: es lo esperado.
   - Los destinatarios son una lista aparte, no la de Accesos, a pedido de la obra.

## Reconstrucción en Tailwind (en curso, rama `tailwind`)

Decisión de Joaquín: reescribir la interfaz en Tailwind + shadcn, para aprender esa forma de
trabajar y para poder traer componentes de 21st.dev. **La aplicación está en producción y la
usan dos personas todos los días**, así que se migra pieza por pieza y producción nunca queda
rota. Nada de reescritura de una sentada.

### Reglas del proceso

1. **Traducir, no rediseñar.** Cada componente migrado tiene que verse idéntico al anterior.
   Si algo parece mejorable, se anota y se cambia después, en un paso aparte. Rediseñar y
   migrar a la vez es la forma más segura de no saber cuál de los dos rompió algo.
2. **Se comprueba midiendo, no mirando.** Antes de tocar, se registran los estilos calculados
   del componente; después, los mismos. Tienen que coincidir propiedad por propiedad. La
   página `/prueba-tailwind` existe para eso: pone el viejo y el nuevo uno al lado del otro.
3. **Los colores salen de los tokens**, nunca de la paleta de Tailwind. `bg-surface`, sí;
   `bg-zinc-900`, no. Si un color no tiene token, se agrega al bloque `@theme` primero.
4. Una rama por paso, con `npm run build` y `npm test` en verde antes de guardar.
5. **Buscar las reglas huérfanas antes de dar por migrado un componente.** Esta es la que
   faltaba y la que más daño hizo. Cuando un contenedor pierde su clase al pasar a Tailwind,
   toda regla del CSS viejo que pintaba a sus hijos *a través de él* (`.person-name h2`,
   `.person-actions button`, `.dialog-head p`) deja de aplicar en silencio: no hay error, no
   hay aviso, el componente simplemente pierde parte de su estilo. Mirar la pantalla no
   basta, porque lo que se pierde suele ser un tamaño o un recorte de texto, no un color
   chillón.

   La comprobación, con el proyecto delante:

   ```bash
   # 1. clases que el CSS todavía menciona
   grep -oE '\.[a-z][a-z0-9-]*' app/globals.css | sed 's/^\.//' | sort -u > /tmp/cssclases.txt
   # 2. las que ya no aparecen en ningún .ts/.tsx: ahí están las huérfanas
   while read -r c; do
     grep -rqF "$c" --include=*.tsx --include=*.ts app components lib || echo "$c"
   done < /tmp/cssclases.txt
   ```

   De esa lista interesan las reglas con **descendiente** (`.huerfana algo { ... }`): cada
   una es un estilo que hay que reescribir como clase de Tailwind en el hijo. Ojo con dos
   falsos positivos: las clases que se arman concatenando (`"compra-" + estado`,
   `"status-" + ...`) y las que quedaron muertas a propósito.

   Y ojo con el punto ciego de esa busqueda: una clase puede estar huérfana **en un
   componente** y seguir viva en otro, y entonces no aparece en la lista. Pasó con
   `.results-line button`, que Personas perdió mientras Viajes todavía la usaba. Por eso,
   además del barrido general, al migrar un componente hay que mirar **todas** las reglas
   que mencionan las clases que ese componente usaba, no solo las suyas propias:

   ```bash
   grep -n "\.la-clase" app/globals.css
   ```

### Orden

1. **Primitivas. HECHO** — `components/ui/button.tsx`, `field.tsx` (input, select, textarea,
   label) y `status-pill.tsx`. Son las que usan todas las demás; migrar un componente antes
   que sus primitivas obliga a hacerlas dos veces.
2. **Piezas sin lógica. HECHO** — `empty-state`, `theme-toggle`, `dialog-actions` y
   `page-head` viven ahora en `components/ui/` y la aplicación ya los usa. Los archivos
   viejos de `app/components/` se borraron.
3. **Diálogos. HECHO** — los cinco, más el armazón de `modal-layer`. Las piezas de armado
   que comparten están en `components/ui/dialog-parts.tsx`.
4. **Vistas. HECHO** — costos, personas, agenda y viajes. La tabla de Viajes trajo sus
   propias primitivas: `components/ui/data-table.tsx` (tabla, cabecera, fila, celda y el
   modo tarjeta de pantalla angosta) y `components/ui/trip-pills.tsx` (movimiento y ventana
   de compra). El calendario (`app/year-view.tsx`) y el panel de Excel
   (`app/excel-sync-panel.tsx`) también están HECHOS. No queda ningún componente
   por migrar: lo que sigue es la limpieza.
5. **Armazón. HECHO** — la barra superior ya no existe (la reemplazó `side-nav`), y
   `workspace`, `login-view`, `access-state`, la **barra lateral** y la **marca** están en
   Tailwind (rama `barra-lateral-tailwind`). La barra lateral se escribió en CSS cuando llegó
   el riel de Daybook, después de la migración, y fue lo último en pasar:

   - Sus colores son los tokens `--rail-*`, solo en `:root`: el riel es oscuro en los dos
     temas, así que el tema claro **no** los redefine. En Tailwind son `bg-rail`,
     `text-rail-link`, `border-rail-line`, etc.
   - El logo y el isotipo eligen su dibujo con la variante `claro:` (ver abajo).
     `tono="oscuro"` fija la variante para fondo oscuro; lo usa la barra.
   - El hover de la barra se tradujo primero literal (`[&:hover]:`, que aplica también en un
     teléfono) y después, en un paso aparte, se pasó a `raton:hover:` como el resto.
   - Se midió a 1440, 800 y 400 px en los dos temas, más el hover. Coincide todo salvo el
     estilo y el color de bordes de **ancho 0** (`border-right: 0` también los reiniciaba) y
     la transición, que ahora anima `translate`/`scale` en vez de `transform`. Como la regla
     de movimiento reducido apaga esas dos, ahora el corrimiento del enlace también se apaga
     para quien pide menos movimiento; antes se le escapaba.
   - Exactamente a 820 px: `max-[820px]` es «menos de 820», el CSS viejo era «820 o menos».
     El `<main>` ya usaba `max-[820px]`, así que ahora barra y contenido cambian juntos.
   - La identidad de la entrada tenía un isotipo escondido que nunca se veía (la entrada lo
     anulaba en todos los anchos); se quitó. Los arneses de navegador buscan la marca por
     `data-brand-identity`, `data-brand-logo` y `data-brand-mark`, no por clases.
6. **Limpieza. HECHO** — `app/globals.css` pasó de 3.286 líneas a ~435, y lo que queda es lo
   que Tailwind no cubre: los tokens de los dos temas, la tipografía base de los elementos
   (`h1`–`h3`, `p`, `small`, `strong`), el armazón (`.shell`, `.app-content`), el velo y la
   caja de los diálogos (`.overlay`, `.dialog`, `.excel-dialog`), un `@keyframes` y el bloque
   de movimiento reducido. **Cero clases huérfanas.**

### Lo que ya está montado

- **El `preflight` de Tailwind está encendido** (`@import "tailwindcss/preflight.css"`). Es su
  propio reset, y estuvo fuera durante toda la migración porque desarmaba el CSS a mano.
  Se encendió al final, midiendo la aplicación entera antes y después: lo único que cambió
  fue el relleno de los `<option>`, que dibuja el sistema operativo. Con el reset puesto, un
  componente de shadcn o de 21st.dev entra sin retoques, que es de lo que se trataba.

  Lo que el reset se lleva y hubo que devolver: **los títulos pierden tamaño y negrita**. El
  tamaño lo pone cada componente; la negrita vuelve con una regla `h1, h2, h3` en la capa
  base, porque la usaban todos. Si aparece un título nuevo sin tamaño propio, va a salir del
  tamaño del texto que lo rodea: hay que ponérselo.

- `@custom-variant raton` traduce la condición `(hover: hover) and (pointer: fine)` que el
  CSS usa para los estados de hover. Escribirla a mano dentro de una clase (`[@media(...)]:`)
  no sirve: hay que poner guiones bajos donde van los espacios y, si se escapa uno, Tailwind
  genera CSS inválido y la aplicación entera se cae con "Parsing CSS source code failed".
- `@custom-variant claro` es el tema claro elegido con el botón (`data-theme="light"` en
  `<html>`). **No uses `dark:`** para el tema: el `dark:` de Tailwind sigue a la preferencia
  del sistema operativo, no a la elección de la persona.
- `@layer daybook` envuelve todo el CSS propio y lo deja **por debajo** de las utilidades de
  Tailwind. Sin eso, `button { ... }` le ganaba a `bg-primary` y los componentes de shadcn
  llegaban con el estilo viejo pegado.
- Los tokens que chocaban con los espacios de nombres de Tailwind se renombraron:
  `--text-soft` → `--fg-soft`, `--radius-*` → `--rad-*`. **No vuelvas a nombrar un token
  `--text-algo` ni `--radius-algo`**: Tailwind se los apropia y el choque es silencioso.
- El bloque `@theme inline` conecta los tokens con los nombres que espera Tailwind, incluidos
  los radios. `--ease-out` y `--ease-drawer` se dejaron sin renombrar a propósito: ahí el
  choque es deseable, hace que `ease-out` de Tailwind use la curva de la aplicación.
- El "kicker" que iba sobre el título ya no se dibuja. No es un cambio de diseño: estaba con
  `display:none` desde que compactamos el encabezado, así que no lo veía nadie ni lo leía un
  lector de pantalla. Se sacó el markup muerto en vez de traducirlo escondido.
- **`.overlay` y `.dialog` se quedan en CSS a propósito**, no por pereza. Ahí vive la entrada
  y la salida del panel: `@starting-style` para entrar y `.overlay[data-cerrando] .dialog`
  para salir. Eso es un selector de padre que decide el estado de un hijo — CSS lo dice en
  cuatro líneas legibles y Tailwind lo diría en una sopa de clases. Lo demás de la cabecera
  sí está traducido.
- **`rotate-90` de Tailwind no es `transform: rotate(90deg)`**: usa la propiedad `rotate`,
  que es distinta aunque se vea igual. Si mides el giro de la flecha del desplegable, mira
  `rotate` y no `transform`, o vas a creer que no funciona.
- **Dónde va cada cosa**: `components/ui/` son las piezas reutilizables (botón, campos,
  pastilla, partes de diálogo, estado vacío, encabezado, barra de botones, interruptor);
  `components/` son las pantallas y diálogos concretos. Todo con el alias `@/`. TypeScript 7 eliminó
  `baseUrl`, así que el alias va solo con `paths`.

## Convenciones

- Español en UI, nombres de dominio y comentarios.
- Estilos con Tailwind 4 y los tokens existentes (`bg-surface`, nunca la paleta de Tailwind). Lo que Tailwind no cubre vive en `app/globals.css`, dentro de `@layer daybook`. Sin otras librerías de UI.
- Iconos: `lucide-react`, ya instalado.
- Al cambiar el esquema: nueva migración numerada en `supabase/`, nunca editar una existente.
- Cambios en lógica de fechas requieren test en `lib/*.test.ts`.

## Decisiones de diseño ya tomadas

No las deshagas sin medir de nuevo; salieron de mirar la aplicación en el navegador, no de
opinión.

- **Contraste del tema claro.** Con la paleta de Daybook los valores actuales son `--fg-soft`
  `#34352d` (11.7 sobre `#f7f8f9`) y `--muted` `#5f6058` (6.0), los dos sobre el mínimo AA de 4.5.
  Antes de la paleta de Daybook estaban en 4.36 y se habían oscurecido; si se vuelve a tocar un
  gris, medir de nuevo. El tema oscuro va holgado (8.5 el más bajo).
- **Encabezado compacto.** El kicker (`.section-kicker`) está oculto a propósito: repetía lo
  que ya dicen el título y la pestaña activa, en 126px. Con el cambio el encabezado mide 51px
  y se ve una fila más de datos sin desplazar. Si vuelves a mostrarlo, di por qué.
- **La casilla de selección de viajes NO es un problema de accesibilidad.** El `<input>` mide
  18×18 pero la etiqueta `.selection-toggle` que lo envuelve mide 44×44 y es el área que
  recibe el clic. Ya me equivoqué una vez midiendo el input; no repitas la medición mala.
- Las skills de diseño de Emil Kowalski están en `.claude/skills/`, versionadas. Se
  reinstalan con `npx skills add emilkowalski/skill`.
- **El movimiento sigue el criterio de Emil Kowalski** (`.claude/skills/emil-design-eng`).
  Tres reglas que no se negocian: nada que se use decenas de veces al día se anima (pestañas,
  casillas, filtros); la salida es más corta que la entrada; y transiciones, no keyframes, para
  todo lo que se pueda disparar rápido, porque una transición se redirige y un keyframe vuelve
  a empezar. Las curvas son `--ease-out` (entra/sale), `--ease-in-out` (se mueve dentro de la
  pantalla) y `--ease-drawer` (los paneles laterales).
- **Los diálogos salen por donde entran.** El estado `closingModal` retrasa 200ms el desmontaje;
  `MS_CIERRE_DIALOGO` en `store.tsx` tiene que calzar con la duración del CSS. `abrirModal()`
  cancela un cierre en curso: sin eso, cerrar y abrir otro dentro de esos 200ms dejaba el nuevo
  marcado como "cerrando".
- **La Agenda tiene vista «Mes» y «Semana».** La semanal muestra una sola fila (454 px contra 834
  del mes con los datos de la demostración), con flechas de semana anterior y siguiente, y la
  elección se recuerda en el navegador (`localStorage`, clave `agenda-vista`; si no se puede leer,
  parte en «Mes»). Las flechas del teclado cruzan de semana y de mes. Además el título del mes ya
  no salta a dos líneas (`whitespace-nowrap`, y los controles bajan con `flex-wrap`) y las celdas
  bajaron de 78 a 64 px.
- **La barra de selección de Viajes vive siempre en el DOM**, dentro de `.bulk-bar-slot`, y el
  hueco crece con ella. Antes aparecía de golpe y empujaba la tabla 76px. La cuenta se congela
  en el último valor mientras se cierra, si no se leería "0 viajes" al encogerse.
- **`prefers-reduced-motion` no apaga todo.** Quita desplazamientos y escalas, y conserva las
  opacidades a 140ms: quien pide menos movimiento no pide una interfaz que teletransporte cosas.
- **El tema oscuro es gris neutro, no azul marino.** Toda la escala de grises tiraba a azul
  (`--bg` era `#0a0f16`); se pasó a gris puro manteniendo casi la misma luminosidad de cada
  peldaño, así que ningún contraste bajó. Los colores con significado —turnos, estados, foco—
  no se tocaron: ahí el color informa y neutralizarlo sería borrar información. El velo de los
  diálogos también se neutralizó. Si alguien vuelve a meter un azul en los grises, es a
  contrapelo de una decisión, no un olvido.
- **La pantalla de entrada sigue el patrón de las apps hermanas** (Daybook Ticket y Parte
  Diario): una tarjeta centrada, el rótulo "Acceso seguro" en dorado, el botón de ancho
  completo con la flecha al final y el enlace de recuperación centrado. Sin fondo decorativo.
  Se quitó el titular "Tu equipo viaja. La obra continúa." y la tira de rutas: lo pidió
  Joaquín, quien entra ahí viene a entrar, no a que le expliquen el producto.

  **Mostrar contraseña.** Es una casilla (`input[data-show-password]`) justo después del campo,
  no un icono dentro de él: así `form button` sigue siendo el botón de entrar y teclado y lectores
  de pantalla la usan sin ayuda. El orden del tabulador es tema → correo → contraseña → casilla →
  entrar → recuperación → demostración. Para que cupiera sin scroll en 390×844 y en 1440×900 se
  recortaron márgenes del login.

  **Cambiar el login sigue exigiendo volver a medir, pero ya no hay que reescribir las pruebas.**
  Se aflojaron a propósito: `lib/login-view.test.ts` ya no lee el CSS con expresiones regulares ni
  fija clases exactas (los tamaños del logo y del isotipo los mide el navegador), y el contrato
  del teclado se comprueba por **orden relativo**, así que un control nuevo entre medio no lo
  rompe. `scripts/browser-login.mjs` acepta una tarjeta de 450 a 700 px en vez de 581,77 ± 1, y
  sigue exigiendo que no haya desbordamiento. El arnés `scripts/browser-recovery*.mjs` calcula sus
  mutantes del orden del tabulador desde `orders` (exportado por `browser-recovery.mjs`), en vez de
  un total fijo de 248. Al agregar un control al login hay que: añadirlo a `stops` y a `loginOrder`,
  y pasar por él con `tabTo` donde el arnés teclea correo y contraseña (`fill` y `activate` avanzan
  de a una parada).

- **Barra lateral y tema claro de Daybook.** La barra superior se reemplazó por el riel lateral
  oscuro de Daybook Ticket y Parte Diario (`components/side-nav.tsx`): 232 px fijos, marca,
  navegación y, abajo, el usuario con el cambio de tema y la salida. Por debajo de 820 px pasa a
  una franja superior y por debajo de 430 px esconde los iconos. El tema claro usa el lienzo gris
  frío (`#f7f8f9`) con tarjetas blancas y los bordes de Daybook.
- **No hay fondo de círculos.** `BrandBackground` (los círculos de las esquinas) se eliminó de
  toda la aplicación, la pantalla de carga y las de contraseña; no hay que volver a ponerlo.
- **El campo de puntos se eliminó** (`components/dot-field.tsx` y los tokens `--dot` y
  `--dot-alpha`) cuando el login perdió el fondo. Estaba escrito con canvas normal, a propósito:
  la referencia de 21st.dev usa three.js, @react-three/fiber y framer-motion, y traer una
  librería 3D para dibujar cuadraditos en un proyecto de siete dependencias no se justifica.
  Si alguien lo vuelve a pedir: que el color salga de un token para que ande en los dos temas,
  que respete `prefers-reduced-motion`, y que con la pestaña en segundo plano dibuje el estado
  asentado (el navegador congela `requestAnimationFrame` y el fondo quedaría vacío). Está en el
  historial de git.
- **El recuadro del manifiesto crece con `flex: 1 1 auto`.** Si se le pone el alto del texto
  queda un hueco suelto entre la frase de abajo y los botones; si se le deja imponer su alto
  con `rows`, esa frase se corta por la mitad. Ya se probaron las tres.

## Comandos

```bash
npm install
npm run dev      # http://127.0.0.1:3000 (o el puerto que indique)
npm test         # node --test sobre lib/*.test.ts
npm run test:browser:flujos  # los flujos principales en Chrome, con la demostración
npm run build
```

Variables en `.env.local` (copiar de `.env.example`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Tienen que ser las del
proyecto **RELEVO** (`bdavsvymilxxeqfookci`), no de `relevo1`, que es otro proyecto.

**No pongas valores de relleno.** Hasta el 10-sep-2026 esta guía recomendaba rellenar el
archivo con cualquier cosa para que `npm run build` no fallara, y en la máquina de Joaquín
quedó apuntando a `placeholder.supabase.co`: la aplicación levantaba, el modo demostración
andaba, y entrar con correo y clave fallaba sin decir por qué. Ese parche ya no hace falta —
el cliente se crea perezosamente (pendiente 8) y el build funciona sin el archivo. Si faltan
las variables, el mensaje lo dice; con valores falsos, no.

Next lee `.env.local` **al arrancar**. Si lo cambias, hay que detener `npm run dev` y volver
a levantarlo.

Modo demo: hay un botón en el login que carga datos ficticios sin tocar Supabase. Útil para
probar la interfaz sin credenciales — pero ojo, ese camino usa `lib/calendar.ts` y el real no.
Que el demo funcione **no** prueba que la conexión a Supabase esté bien: son caminos distintos.

## Trampas conocidas

- **Con la pestaña en segundo plano, Chrome devuelve estilos viejos.** `getComputedStyle`
  informa el valor anterior al último cambio de clases, así que una medición hecha justo
  después de navegar puede mentir. Se nota poco porque al cambiar de vista el DOM se rehace
  y los elementos nuevos sí traen su estilo; muerde en lo que **persiste y cambia de
  clase**, como la pestaña marcada de la barra superior. Antes de medir hay que forzar el
  recálculo:

  ```js
  const r = document.documentElement;
  r.classList.add("__refresco"); void r.offsetHeight;
  r.classList.remove("__refresco"); void r.offsetHeight;
  ```

- **Sin `preflight`, borrar una regla de elemento deja al navegador poner lo suyo.** Al
  quitar `button { padding: 0 14px }` los botones se fueron a los 1px que pone Chrome por su
  cuenta; al quitar `label { font-size: 13px; font-weight: 650 }`, las etiquetas de búsqueda
  saltaron a 15px normal. Si se borra una regla de elemento, hay que mirar qué ponía y
  llevarlo a la primitiva, incluso lo que parecía obvio.

- **Tailwind escribe los movimientos en `translate` y en `scale`, no en `transform`.** Las
  reglas viejas que apagaban el movimiento (la de `prefers-reduced-motion`) decían
  `transform: none`, y desde la migración ya no alcanzaban a nada: los botones seguían
  hundiéndose al apretarlos para alguien que pidió menos movimiento. Hoy la regla apaga las
  tres propiedades. Si aparece una animación nueva, comprobar en qué propiedad la escribe
  Tailwind antes de dar por hecho que la regla la cubre.
- **`cn()` borra un `leading-*` que vaya ANTES de un `text-<tamaño>`.** La librería que
  junta las clases (tailwind-merge) viene de Tailwind 3, donde `text-lg` también fijaba el
  interlineado, así que cree que las dos clases pelean y se queda con la última. En Tailwind 4
  ya no es así, pero la librería lo sigue creyendo. Pasó en `shift-badge.tsx`: el
  `leading-none` estaba en la base y cada variante traía su `text-<tamaño>`, así que el
  interlineado se perdía en silencio y la pastilla crecía un píxel. **Regla: el `leading-*`
  va siempre después del tamaño de letra, en la misma variante.** No da error ni aviso; solo
  se nota midiendo.

- **El velo de los diálogos (`.overlay`) es `position: fixed` y no se le toca la posición.**
  Al meter el campo de puntos en el armazón se le puso `position: relative` para levantarlo
  por encima del canvas, y eso lo devolvió al flujo del documento: dejó de cubrir la pantalla
  y aparecía a media página, con el encabezado y media agenda sin tapar. Ya tiene `z-index: 100`,
  que dentro del contexto de `.shell` lo pone por encima del canvas sin tocar la posición.

- El indicador de desarrollo de Next agrega botones y texto que no son de la aplicación. Si
  mides el DOM para comparar antes y después, mide `.shell`, no `document.body`.

## Detalles a corregir cuando toque

- **Pruebas de flujos en navegador** (`scripts/browser-flujos.mjs`, también en el CI). Con la
  demostración: planificar turnos, el manifiesto con la acreditación pendiente e «Incluir igual»,
  marcar como solicitado, el motivo mínimo al editar, el aviso de persona repetida y cerrar en
  bloque (con el reloj de la página adelantado 40 días **después** de entrar, porque la demo arma
  sus viajes desde la fecha de hoy). Buscan los botones por su texto, no por clases. Si cambias
  el texto de un botón o de un aviso que la prueba usa, hay que cambiarlo ahí también.
- **Cómo carga los datos.** Primero se comprueba el acceso (`is_member`); después personas,
  viajes, ajustes, acreditación y rol van **en paralelo** (`app/estado/use-datos.ts`). Antes
  iban en cadena y eran ~1,3 s de espera en producción. Se trae toda la historia: en
  noviembre de 2026 eran 179 viajes en unas diez semanas (~1.000 al año), y Costos, los
  viajes sin cerrar y la actividad necesitan el pasado. Cargar por rango se justifica recién
  con varios miles de viajes; `allRows` ya pide de a 1.000, así que no hay un tope silencioso.
- **El CI corre una sola vez por cambio.** `.github/workflows/ci.yml` escucha `pull_request` y
  `push` solo a `main` (antes escuchaba `push` sin filtro y todo corría dos veces; el `verify` del
  push era el que fallaba de forma intermitente, casi siempre con "Chrome no expuso CDP", que es
  del servidor de GitHub y no del código). Si aun así falla así, se relanza con
  `gh run rerun <id> --failed`. Una prueba (`lib/ci-workflow.test.ts`) fija los disparadores.
- **La prueba B2 de PostgreSQL esperaba mal el arranque.** La imagen de Docker levanta primero un
  servidor temporal solo por socket y luego el definitivo; ahora `waitForPostgres` exige TCP y
  después el socket (PR #13). Si reaparece, mirar ahí antes de relanzar a ciegas.
- **Cerrar `npm run dev` antes de correr `npm test`.** Una prueba arranca su propio `next dev` y
  choca con el que ya está abierto ("Another next dev server is already running"). Para cerrarlo,
  matar solo al que escucha (`kill $(lsof -ti :3111 -sTCP:LISTEN)`); `lsof -ti` a secas también
  lista a los clientes conectados, y `pkill -f` puede matar tu propia terminal.
- **Dar de alta a alguien son dos pasos:** crear su usuario en Supabase Auth y agregar su correo a
  `public.members`, que se hace desde la pantalla **Accesos** (solo administradores). Sin el segundo,
  inicia sesión pero ve "Tu cuenta todavía no está habilitada"; sin el primero, no puede iniciar
  sesión. La pantalla no crea cuentas de Auth.

- **Nada dice FCC en la aplicación.** El paquete se llama `daybook-travel`, la capa CSS es
  `daybook`, la clave del tema en el navegador es `daybook-travel-theme` (al cambiarla cada quien
  vuelve una vez al tema oscuro) y el rótulo de la entrada dice «Gestión de traslados». Quedan
  tres «FCC» a propósito: los alias de `lib/excel-sync.ts` que leen planillas viejas con la
  columna de identificador antigua, los mensajes de las migraciones 003 y 004 (aplicadas, no se editan; el
  navegador los traduce con `mensajePublicoExcel`) y la lista de frases prohibidas de
  `lib/brand-guard.test.ts`. El proyecto de Vercel sigue llamándose `relevo`. El repositorio
  se llama `daybook-travel` desde el 12-nov-2026 (antes `fcc-travel`; GitHub redirige el nombre
  viejo). La carpeta local puede seguir llamándose `fcc/travel`: no importa.
- Usa TypeScript 7 y `@types/node` 26 — versiones muy nuevas. Si aparecen errores raros de tipos,
  mirar ahí antes de dar vueltas.
- `AGENTS.md` lo regenera `next dev`; no lo edites a mano.
