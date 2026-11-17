# Bita en Daybook Travel (fase 1, 12 nov 2026; encendida el 16 nov 2026)

Bita es la misma asistente de Daybook Parte Diario y Daybook Ticket: mismo nombre, mismo casco dorado y mismo tono. En Travel ayuda a quienes organizan los viajes a saber quién sube y baja, qué hay que comprar, cuánto se ha gastado y qué documentos faltan.

**Lee y propone; no escribe.** El servidor de Bita no crea, edita, anula ni marca nada, y no cambia personas ni documentos. Lo único que se crea gracias a Bita son los viajes de una propuesta de documento (ver «Documentos»), y los crea **el navegador de quien confirma**, con su sesión, por la misma vía que «Planificar turnos». En el chat, si le piden que cambie algo, responde que eso se hace en la pantalla.

**Encendida en producción desde el 16 nov 2026** para todos los miembros de Travel (ver «Estado en producción»). Sin `BITA_ENABLED`, `/api/bita/estado` y `/api/bita` responden 404 sin leer nada, y la pantalla no muestra el botón.

## Qué hace

### 1. Resumen al abrir, sin IA y sin costo

El botón flotante «Bita» va abajo a la derecha. Al abrirlo, el panel muestra un resumen calculado en el navegador (`lib/bita-resumen.ts`) con los datos que la pantalla ya cargó y las mismas funciones que la agenda (`lib/purchase.ts`, `lib/accreditation.ts`). Bita y la agenda no pueden discrepar: si la tarjeta dice «9 por comprar», Bita dice 9.

- viajes por comprar ahora y fechas abiertas;
- viajes pasados sin cerrar;
- viajes de los próximos 14 días con documentos pendientes;
- quién sube y baja hoy y mañana;
- subidas y bajadas de la semana.

Cada línea lleva a su pantalla: la cola de compra, los sin cerrar, Personas o la Agenda. **Funciona también en la demostración**, que no tiene sesión: ahí Bita solo muestra este resumen.

### 2. Chat de consulta, de solo lectura

Con una cuenta real y la llave configurada, se le puede preguntar en el chat. Hay preguntas sugeridas. Las herramientas del modelo (`lib/bita-herramientas.ts`) son todas de lectura:

| Herramienta | Qué devuelve |
| --- | --- |
| `agenda` | Viajes entre dos fechas (máximo 31 días), sin anulados: quién, ruta, hora pedida, estado y si ya tiene reserva. |
| `viajes_de_persona` | Turno, vigencia y origen de una persona, sus próximos 10 viajes y los últimos 5. |
| `por_comprar` | La cola de compra de hoy: por comprar ahora, vencidos, sin cerrar y fechas abiertas. |
| `costos` | Gasto por mes o por ruta, **siempre con su cobertura** (cuántos viajes tienen monto). |
| `acreditacion` | Viajes con documentos faltantes o vencidos para su fecha. |
| `historial_de_viaje` | Qué cambió en un viaje, cuándo y con qué motivo. |

Las respuestas nombran a las personas por su nombre y los viajes como enlaces «ver viaje», que abren el diálogo del viaje.

### 3. Documentos: planificar vuelos desde un Excel, Word o PDF

El clip del panel (o «Planificar vuelos desde un documento») adjunta un archivo con vuelos de personal. Bita lo lee y **propone** los viajes; la persona elige cuáles crear y confirma. Un documento cuenta como un mensaje del cupo.

- **Formatos:** Excel (`.xlsx`), Word (`.docx`) y PDF **con texto**. Hasta 4 MB (Vercel corta el cuerpo en 4,5 MB). El formato se reconoce por el contenido, no por el nombre. Un `.xls` o `.doc` antiguo, un PDF escaneado (solo imagen) o con contraseña se rechazan con un mensaje que dice qué hacer, **sin gastar ningún mensaje ni llegar al modelo**.
- **Topes de lectura** (`lib/bita-documento.ts`): 6 hojas, 500 filas por hoja, 30 columnas, 40 páginas, 60.000 caracteres hacia el modelo, y un `.xlsx` o `.docx` no puede ocupar más de 64 MB descomprimido (protege de un zip que se expande de más). Si se corta, la propuesta lo avisa.
- **La propuesta** (tarjeta en el panel): cada viaje sale como **nuevo** (se puede crear), **ya en la agenda** (con enlace «ver viaje») o **con problema**, con su motivo: fecha que no existe, ya pasada o a más de 400 días, persona inactiva o fuera de la vigencia de su ficha, o sin poder saber si sube o baja. Las personas sin ficha en Travel se listan aparte. Los nuevos vienen elegidos y se pueden desmarcar.
- **Sube o baja** sale de comparar el origen y el destino del documento con la ficha de la persona; manda sobre lo que diga el modelo. Si el documento trae otra ruta, se avisa y se usa la de la ficha. La hora se guarda si está escrita.
- **Crear:** el botón «Crear N viajes» inserta desde el navegador, con la sesión de quien confirma, igual que «Planificar turnos» (`app/estado/use-acciones-documento.ts`): estado «Planificado», sin reserva, vuelo ni monto, con la maleta de la ficha y la nota «Planificado desde «archivo» con Bita.». Lo que ya existe no se pisa (`ignoreDuplicates`), la base valida la vigencia, y el historial queda a nombre de quien confirmó. Antes de insertar se dejan fuera las filas que dejaron de servir desde la propuesta, para que una sola no haga fallar el lote. Nada se borra.
- **Al cerrar y abrir el panel** la propuesta queda como estaba; una ya creada no ofrece crear otra vez.

## Cómo lee y qué sale hacia Anthropic

**Lee con la sesión de la persona.** Travel no tiene servidor propio y la seguridad vive en las políticas de Supabase. La ruta `/api/bita` recibe el token de la sesión y lee **con ese token** (llave publicable + token), así que rigen las mismas políticas que en pantalla: Bita ve exactamente lo que la persona puede ver. La llave de servicio no lee ningún dato de la operación; solo cuenta mensajes (ver «Cupo»).

**Seudónimos.** Anthropic nunca recibe el nombre de una persona (`lib/bita-seudonimos.ts`).

- Cada persona tiene un seudónimo corto y estable, sacado de su id («P-3f2a»), y cada viaje el suyo («V-91c0»).
- Lo que escribe la persona pasa por el mismo filtro: «¿cuándo sube Juan Pérez?» viaja como «¿cuándo sube P-3f2a?».
- Un nombre de pila que comparten dos personas no se adivina: viaja como «(puede ser P-…, P-…)» y Bita pregunta a cuál se refiere.
- El servidor vuelve a poner los nombres en la respuesta antes de mostrarla.

**Nunca salen:**

- el nombre de una persona;
- el código de reserva (solo si el viaje tiene o no tiene reserva);
- el número de vuelo;
- el monto de un viaje o de una persona (sí los totales por mes o por ruta, con su cobertura);
- correos, teléfonos ni RUT escritos en preguntas o notas (se enmascaran);
- quién hizo cada cambio del historial.

**Las notas y los motivos son datos, no instrucciones.** El prompt lo dice, y el texto llega enmascarado y con los nombres reemplazados.

**Documentos.** Mismas reglas, con un paso más (`lib/bita-documento-mascara.ts`): el archivo se lee en el servidor de Travel y **ya enmascarado** llega al modelo.

- Las personas con ficha pasan a su seudónimo por nombre completo, por código de persona, o cuando **todas** las palabras de lo escrito están en el nombre de una sola ficha («Pérez Soto, Juan» sí). «Carlos Díaz Mena» **no** es la ficha que se apellida Díaz: es una persona sin ficha, no se le atribuye ningún viaje y no sale ni «Carlos» ni «Mena».
- En las tablas se reconocen las columnas por su encabezado: las de nombre se reemplazan entera (seudónimo o «Persona sin ficha N», que vuelve a su nombre solo en la pantalla de quien subió el archivo), y las de reserva, vuelo, monto, RUT, correo y teléfono se vacían. «Fecha de vuelo» no se vacía.
- En el texto suelto se quitan RUT, correos, teléfonos, montos, reservas con etiqueta o mezcla de letras y números, y números de vuelo; y dos o más palabras con mayúscula que no son lugares ni palabras de tabla se tratan como un nombre sin ficha.
- El nombre del archivo también se enmascara.
- Lo que queda en la conversación para las preguntas siguientes es una frase con cifras: ni el nombre del archivo ni lo que dijo el modelo.

**Límite que hay que conocer:** en texto libre (Word y PDF) un nombre de una sola palabra de alguien sin ficha, una reserva de seis letras sin etiqueta o un nombre en minúsculas pueden pasar. Un archivo con esos datos conviene revisarlo antes de subirlo. En Excel, las columnas se reconocen por su encabezado: una columna de nombres sin encabezado no se detecta.

El servidor no guarda conversaciones ni archivos. El registro (`bita_pregunta`) anota el resultado, las herramientas usadas, el largo de la pregunta y los tokens; nunca el texto ni el token de sesión. Para un documento, `bita_documento` anota el formato, el largo, el resultado, cuántos viajes salieron nuevos, ya existentes o con problema, cuántas personas sin ficha había y los tokens: nunca el nombre del archivo, ni nombres, ni texto.

## Cupo y costo

| Tope | Valor | Dónde |
| --- | --- | --- |
| Modelo | `claude-haiku-5-5` | `BITA_MODEL` |
| Mensajes por persona y día de Santiago | 10 (rango 1–200) | `BITA_DAILY_LIMIT` |
| Historial que se paga por mensaje | últimos 8 | `lib/bita-agente.ts` |
| Vueltas de herramientas por mensaje | 3 | `lib/bita-agente.ts` |
| Herramientas por vuelta | 3 | `lib/bita-agente.ts` |
| Tokens de salida por llamada | 2048 | `lib/bita-agente.ts` |
| Documento: tamaño, texto y viajes | 4 MB, 60.000 caracteres, 60 viajes | `lib/bita-documento.ts`, `lib/bita-documento-propuesta.ts` |
| Documento: salida y tiempo | 4096 tokens, 45 s, una sola llamada, sin razonamiento | `lib/bita-documento-modelo.ts` |
| Entrada acumulada por mensaje | 80.000 tokens | `lib/bita-agente.ts` |
| Tiempo | 50 s en total, 25 s por llamada, sin reintentos | `lib/bita-agente.ts` |
| Resultado de una herramienta | 9.000 caracteres | `lib/bita-herramientas.ts` |

Un documento es una sola llamada con la herramienta `proponer_viajes` forzada y el razonamiento desactivado (el adaptativo de Haiku 5.5 se come el cupo de salida; mismo ajuste que Daybook Ticket); su costo depende del largo del archivo, del orden de USD 0,01–0,03 con 20.000 tokens de entrada. Se usa esfuerzo `low` y caché del prompt: el prompt de sistema y las herramientas son idénticos entre preguntas y solo cambia la fecha, una vez al día. Una pregunta típica cuesta del orden de USD 0,002–0,005. Si la API falla sin haber cobrado nada, el mensaje vuelve al cupo.

**Cupo (migración 014, `travel_014_bita_uso`).**

- La tabla `bita_usage` solo cuenta mensajes por persona y día; no guarda preguntas ni respuestas.
- Tiene tres funciones (`bita_reserve_message`, `bita_refund_message` y `bita_messages_today`) que **solo puede ejecutar la llave de servicio**. Si el navegador pudiera llamarlas, cualquiera se devolvería mensajes a sí mismo.
- La reserva es una sola sentencia atómica: varias preguntas a la vez no pasan el tope.
- **Falla cerrado:** si el contador no responde, Bita contesta 503 en vez de dejar pasar el mensaje.
- Todo es nuevo y con nombre `bita_*`. No toca nada de Travel ni de Daybook Asistencia, con quien se comparte la base.

## Rutas

| Ruta | Qué hace |
| --- | --- |
| `GET /api/bita/estado` | 404 con Bita apagada; si no, `{ disponible }` (si hay llave). No lee sesión ni datos. |
| `GET /api/bita` | Con `Authorization: Bearer <token>`: `{ restantes, limite }`. No gasta. El panel ya no lo consulta. |
| `POST /api/bita` | Con token y `{ messages }`: `{ respuesta, viajes, restantes, limite }`. |
| `POST /api/bita/documento` | Con token y un formulario con el archivo en el campo `archivo`: `{ archivo, formato, truncado, resumen, filas, sinIdentificar, omitidos, restantes, limite }`. No escribe nada. |

Orden de comprobaciones en la pregunta:

1. interruptor → 404;
2. llave → 503;
3. sesión → 401;
4. miembro de Travel (`is_member()`) → 403;
5. formato y tamaño → 415, 413 o 400;
6. cupo → 429, o 503 si el contador no responde;
7. lectura de datos → 503, devolviendo el mensaje;
8. modelo.

En el documento el orden es el mismo hasta el miembro, y sigue: formulario → 415; tamaño → 413 (también por `Content-Length`, antes de leer el cuerpo); archivo legible → 415, 413 o 422; **cupo** → 429 o 503; lectura de datos → 503 (el mensaje vuelve); enmascarado; modelo. El cupo se reserva **después** de abrir el archivo: uno que no se puede leer no gasta un mensaje.

La lógica está en `lib/bita-handler.ts` (y `lib/bita-documento-handler.ts`), con todo lo externo inyectado. La conexión real está en `app/api/bita/_dependencias.ts`.

## Interfaz

- **Botón:** fijo abajo a la derecha (24 px; 16 px en el teléfono). Queda bajo el menú lateral del teléfono (z-30) y sobre la página.
- **Panel:** se abre en el mismo rincón, sobre la página y bajo los diálogos (z-100). Así, un viaje abierto desde Bita aparece encima. En el teléfono ocupa toda la pantalla.
- **Foco:** al abrir, va al campo de pregunta o, si no hay campo, al botón de cerrar. Escape cierra el panel y devuelve el foco al botón.
- **Espacio bajo la página:** mientras Bita está, la página deja 96 px abajo, para que lo último siempre pueda quedar por encima del botón.
- **Sin llave de Anthropic:** con Bita encendida pero sin llave, solo se muestra el resumen y se avisa que las preguntas no están configuradas.

## Activarla

Requiere autorización explícita del dueño.

1. Aplicar `supabase/014_bita_uso.sql` en Supabase y registrarla como `travel_014_bita_uso`.
2. En la Console de Anthropic, crear un workspace propio de Travel con tope de gasto (sugerido: USD 10 al mes) y una clave en ese workspace. No reutilizar la de Ticket.
3. En Supabase, crear una llave secreta propia de Travel (no usar la `default`, que es de Daybook Asistencia): así se puede revocar sin tocar Asistencia.
4. En Vercel, solo en Production:
   - `ANTHROPIC_API_KEY` (Sensitive);
   - `SUPABASE_SERVICE_ROLE_KEY` (Sensitive), con la llave del paso 3. **No existía en Vercel**: el cron de alertas también la necesita, pero nunca se había configurado. Agregarla no enciende los correos del cron, que además exige `CRON_SECRET`, `RESEND_API_KEY`, `ALERT_FROM` y `ALERT_RECIPIENTS`;
   - `BITA_ENABLED=1`.

   Opcionales: `BITA_MODEL` y `BITA_DAILY_LIMIT`.
5. Redesplegar.

**Ojo con el orden.** Una variable nueva entra en el siguiente despliegue de producción, sea un redespliegue o la fusión de cualquier PR. Si `BITA_ENABLED` llega antes que las llaves, la pantalla muestra el botón con el resumen y avisa que las preguntas no están configuradas (pasó entre el 13 y el 16 nov 2026). Conviene dejar `BITA_ENABLED` para el final.

**Apagarla:** quitar `BITA_ENABLED` y redesplegar.

## Estado en producción (16 nov 2026)

| Qué | Valor |
| --- | --- |
| Quién la ve | Todos los miembros activos de Travel |
| Cupo | 10 mensajes por persona y día (el valor por omisión; eran 20 hasta el 16 nov 2026). El panel no muestra cuántos quedan: al llegar al tope, Bita lo avisa |
| Costos | Solo totales por mes o por ruta, con su cobertura |
| Workspace de Anthropic | `daybook-travel-bita`, tope USD 10 al mes |
| Clave de Anthropic | `daybook-travel-bita-prod-2`, vence el 16 nov 2027 |
| Llave de Supabase | llave secreta `daybook_travel` |
| Migración | `travel_014_bita_uso`, aplicada |

Primera prueba con una sesión real: nueve preguntas (agenda, cola de compra, costos), todas con resultado `ok` en el registro; los nombres vuelven en pantalla, los enlaces «ver viaje» abren el viaje y el contador de la 014 sumó una por pregunta.

## Pruebas

- `lib/bita-datos.test.ts`:
  - configuración y seudónimos, incluidos nombres ambiguos y palabras comunes;
  - que ninguna herramienta saque nombres, reservas, vuelos ni montos de un viaje;
  - agenda, cola de compra, costos con cobertura, acreditación e historial sin la reserva;
  - resumen al abrir y piezas de pantalla.
- `lib/bita-agente.test.ts`:
  - bucle con un cliente falso: el nombre no sale y vuelve en la respuesta, topes, negativas y fallos con lo ya gastado;
  - todas las respuestas de las rutas, el cupo y la devolución solo cuando no se cobró;
  - que el registro no lleve texto ni token.
- `lib/bita-documento.test.ts`, `lib/bita-documento-ruta.test.ts` y `lib/bita-documento-ui.test.ts` (los archivos de prueba se arman con write-excel-file, fflate y jsPDF):
  - lectura de Excel (fechas y horas), Word (tablas, entidades) y PDF, y el rechazo de `.xls`, escaneados, vacíos, demasiado grandes y zip que se expanden de más;
  - enmascarado: **un manifiesto realista no deja salir ni un nombre, RUT, reserva, vuelo, monto, correo ni teléfono**; y que un apellido compartido con una ficha no le dé el viaje a esa ficha;
  - la propuesta: nuevo, ya existe y cada motivo de problema, sube o baja por ruta, repetidos y sobrantes, y una salida mal formada del modelo;
  - la ruta: el orden de comprobaciones, que un archivo ilegible no gaste mensaje ni llegue al modelo, la herramienta forzada con razonamiento desactivado, lo que sale hacia el cliente falso, y que el registro no lleve nombres;
  - la pantalla: validar lo que llega y el archivo antes de subirlo, y las filas que se insertan.
- `lib/bita-contratos.test.ts`:
  - la llave se lee en dos archivos del servidor;
  - nada de Bita escribe en tablas, y los viajes de un documento los inserta el navegador por la misma vía que «Planificar turnos»;
  - el navegador no importa lectores de archivos, pdf.js ni el SDK;
  - el cupo de un documento se reserva después de abrir el archivo, y el enmascarado va antes del modelo;
  - la llave de servicio solo llama a las tres funciones del contador;
  - el interruptor va primero;
  - la 014 no da nada al navegador.
- `lib/bita-uso-postgres.test.ts`, contra PostgreSQL real en Docker:
  - el navegador no toca el contador;
  - el tope se respeta con 8 preguntas en paralelo;
  - devolver nunca baja de cero;
  - cada persona tiene su cupo.
- `scripts/browser-bita-documento.mjs` (`npm run test:browser:bita`), con la app real, una Supabase falsa y un Anthropic falso, y clics del mouse del navegador:
  - un archivo que no sirve y uno dañado: se avisa y no gastan mensajes;
  - un Excel: la propuesta, lo que salió hacia el modelo (sin nombres, RUT, reservas, vuelos ni montos), elegir y quitar;
  - un fallo al crear y el reintento, con las filas exactas que se insertaron;
  - cerrar y abrir el panel sin poder crear dos veces;
  - un Word y un PDF;
  - teléfono de 390 px en modo oscuro: sin desbordes y con botones táctiles.
- `scripts/browser-flujos.mjs`, escenario «Bita», en la demostración:
  - botón fijo abajo a la derecha;
  - resumen sin IA;
  - una línea lleva a su pantalla;
  - Escape devuelve el foco;
  - teléfono de 390 px en modo oscuro sin desbordes;
  - sin errores en la consola.

## Pendiente y límites conocidos

- **El arnés de navegador no prueba el chat.** Usa la demostración, que no tiene sesión; las rutas y el bucle se prueban con dobles. El chat real se probó a mano al activarla (ver «Estado en producción»).
- **Respuestas que no llegan a la pantalla.** En los primeros minutos tras activarla, dos de las primeras cuatro preguntas terminaron `ok` en el servidor pero el panel mostró «se cortó la conexión» (una vez el navegador recibió un 503). Las siete siguientes llegaron bien, con Enter y con el botón, y Vercel no registró errores. Esos mensajes cuentan en el cupo, porque el modelo sí contestó. Si se repite, mirar primero el registro de Vercel por id de petición.
- **El manual (`docs/Manual_Daybook_Travel.pdf`) no menciona a Bita:** conviene agregarla.
- **Documentos, sin probar con la API real.** El cliente de Anthropic de las pruebas es falso: la llamada con la herramienta forzada y el razonamiento desactivado sigue la forma que ya funciona en Daybook Ticket, pero la primera vez con la API real conviene probarla con un archivo corto y mirar el registro (`bita_documento`).
- **Documentos: lo que no hace.** No lee PDF escaneados ni fotos, ni `.xls` o `.doc` antiguos. No completa reserva, vuelo ni monto (no los ve): esos se registran en la pantalla de siempre. No crea personas: una persona sin ficha se agrega en Personas. Un documento con más de 60 viajes se corta (hay que subirlo en partes).
- **Fases siguientes, cada una con aprobación aparte:**
  - fase 2: explicar el manifiesto y revisar consistencias;
  - fase 3: acciones con confirmación, reutilizando la migración 008, con motivo y auditadas.
