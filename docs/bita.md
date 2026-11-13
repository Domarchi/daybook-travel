# Bita en Daybook Travel (fase 1, 12 nov 2026)

Bita es la misma asistente de Daybook Parte Diario y Daybook Ticket: mismo nombre, mismo casco dorado y mismo tono. En Travel ayuda a quienes organizan los viajes a saber quién sube y baja, qué hay que comprar, cuánto se ha gastado y qué documentos faltan.

**Solo lee.** No crea, edita, anula ni marca viajes, y no cambia personas ni documentos. Si se lo piden, responde que eso se hace en la pantalla.

**Viene apagada.** Sin `BITA_ENABLED`, `/api/bita/estado` y `/api/bita` responden 404 sin leer nada, y la pantalla no muestra el botón. Encenderla en producción es una decisión aparte (ver «Activarla»).

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

El servidor no guarda conversaciones. El registro (`bita_pregunta`) anota el resultado, las herramientas usadas, el largo de la pregunta y los tokens; nunca el texto ni el token de sesión.

## Cupo y costo

| Tope | Valor | Dónde |
| --- | --- | --- |
| Modelo | `claude-haiku-5-5` | `BITA_MODEL` |
| Mensajes por persona y día de Santiago | 20 (rango 1–200) | `BITA_DAILY_LIMIT` |
| Historial que se paga por mensaje | últimos 8 | `lib/bita-agente.ts` |
| Vueltas de herramientas por mensaje | 3 | `lib/bita-agente.ts` |
| Herramientas por vuelta | 3 | `lib/bita-agente.ts` |
| Tokens de salida por llamada | 2048 | `lib/bita-agente.ts` |
| Entrada acumulada por mensaje | 80.000 tokens | `lib/bita-agente.ts` |
| Tiempo | 50 s en total, 25 s por llamada, sin reintentos | `lib/bita-agente.ts` |
| Resultado de una herramienta | 9.000 caracteres | `lib/bita-herramientas.ts` |

Se usa esfuerzo `low` y caché del prompt: el prompt de sistema y las herramientas son idénticos entre preguntas y solo cambia la fecha, una vez al día. Una pregunta típica cuesta del orden de USD 0,002–0,005. Si la API falla sin haber cobrado nada, el mensaje vuelve al cupo.

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
| `GET /api/bita` | Con `Authorization: Bearer <token>`: `{ restantes, limite }`. No gasta. |
| `POST /api/bita` | Con token y `{ messages }`: `{ respuesta, viajes, restantes, limite }`. |

Orden de comprobaciones en la pregunta:

1. interruptor → 404;
2. llave → 503;
3. sesión → 401;
4. miembro de Travel (`is_member()`) → 403;
5. formato y tamaño → 415, 413 o 400;
6. cupo → 429, o 503 si el contador no responde;
7. lectura de datos → 503, devolviendo el mensaje;
8. modelo.

La lógica está en `lib/bita-handler.ts`, con todo lo externo inyectado. La conexión real está en `app/api/bita/_dependencias.ts`.

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
3. En Vercel, solo en Production:
   - `ANTHROPIC_API_KEY` (Sensitive);
   - `BITA_ENABLED=1`;
   - `SUPABASE_SERVICE_ROLE_KEY`, que ya existe por el cron.

   Opcionales: `BITA_MODEL` y `BITA_DAILY_LIMIT`.
4. Redesplegar.

**Apagarla:** quitar `BITA_ENABLED` y redesplegar.

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
- `lib/bita-contratos.test.ts`:
  - la llave se lee en dos archivos del servidor;
  - nada de Bita escribe en tablas;
  - la llave de servicio solo llama a las tres funciones del contador;
  - el interruptor va primero;
  - la 014 no da nada al navegador.
- `lib/bita-uso-postgres.test.ts`, contra PostgreSQL real en Docker:
  - el navegador no toca el contador;
  - el tope se respeta con 8 preguntas en paralelo;
  - devolver nunca baja de cero;
  - cada persona tiene su cupo.
- `scripts/browser-flujos.mjs`, escenario «Bita», en la demostración:
  - botón fijo abajo a la derecha;
  - resumen sin IA;
  - una línea lleva a su pantalla;
  - Escape devuelve el foco;
  - teléfono de 390 px en modo oscuro sin desbordes;
  - sin errores en la consola.

## Pendiente y límites conocidos

- **El chat con una sesión real no está probado en navegador.** El arnés usa la demostración, que no tiene sesión. Las rutas y el bucle se prueban con dobles; la primera prueba real es al activarla.
- **El manual (`docs/Manual_Daybook_Travel.pdf`) no menciona a Bita:** conviene agregarla cuando se active.
- **Fases siguientes, cada una con aprobación aparte:**
  - fase 2: explicar el manifiesto y revisar consistencias;
  - fase 3: acciones con confirmación, reutilizando la migración 008, con motivo y auditadas.
