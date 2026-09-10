@AGENTS.md

# FCC TRAVEL — guía para Claude Code

App interna para organizar personas, turnos y pasajes aéreos del proyecto FCC en Copiapó.
La usan Katy y Tamara. Producción: relevo-chi.vercel.app

**La idea que ordena todo:** las fechas de viaje deberían derivarse del turno de cada persona
(4×3 o 10×10) y su fecha de inicio, no digitarse. Hoy eso está a medio construir (ver Pendientes).

## Arquitectura

No hay servidor propio. El navegador habla directo con Supabase y **la seguridad vive en la
base de datos**, no en el código de pantalla. Consecuencias que hay que tener presentes:

- Cualquiera con la llave pública puede intentar consultar; lo que lo detiene son las políticas RLS.
- Las validaciones de negocio están en triggers de Postgres, no en React. Si una regla debe
  cumplirse siempre, va en SQL.
- No hay dónde correr tareas programadas ni llamadas con credenciales secretas (Duffel, correos).
  Para eso habría que agregar Route Handlers o Server Actions de Next, que hoy no existen.

## Mapa del código

| Ruta | Qué es |
|---|---|
| `app/page.tsx` | 14 líneas. Enchufa `AppProvider` con `Workspace`, nada más. |
| `app/store.tsx` | **Todo el estado**: las variables, los efectos y las funciones que cambian datos. Cualquier pieza lo pide con `useApp()`; no se pasan props entre vistas. |
| `app/components/workspace.tsx` | El armazón: decide qué pantalla se ve y ordena las piezas. |
| `app/components/*.tsx` | Una pieza por archivo: `login-view`, `top-bar`, `page-head`, `access-state`, `agenda-panel`, `people-view`, `trips-view`, `modal-layer` y los cuatro formularios (`person-dialog`, `trip-dialog`, `generate-dialog`, `history-dialog`), más las hojas `agenda-view`, `empty-state`, `dialog-actions`, `theme-toggle`. |
| `app/excel-sync-panel.tsx` | Importador Excel en 3 pasos (Preparar → Revisar → Aplicar). Bien hecho, no romper. |
| `app/year-view.tsx` | Vista anual de calor. |
| `app/globals.css` | ~3.000 líneas. Tokens en `:root` y `:root[data-theme="light"]`. |
| `lib/costs.ts` | **Las cuentas de costos.** Totales por mes, ruta y persona, cobertura, precio de referencia (mediana) y aviso de precio fuera de lo normal. 17 pruebas. |
| `lib/purchase.ts` | **La ventana de compra.** `estadoDeCompra(viaje, hoy, ventana)` dice si un viaje está resuelto, cerrado, vencido, urgente o próximo. 14 pruebas. |
| `lib/cycles.ts` | **El motor de ciclos.** `movimientos(persona, hasta)` decide qué días sube y baja cada persona. Única fuente de esas fechas. Tiene 18 pruebas. |
| `lib/calendar.ts` | Solo `addDays()`. Suma días sobre cadenas AAAA-MM-DD fijando el mediodía UTC. |
| `lib/excel-sync.ts` | Lógica de comparación del importador. Tiene tests. |
| `lib/supabase.ts` | Cliente. Dos líneas. |
| `supabase/00*.sql` | Migraciones, se aplican **en orden numérico**. Aquí vive la verdad del sistema. |

## Reglas que NO hay que romper

Todo esto está implementado en SQL y es deliberado:

1. **Nadie borra nada.** No existe policy de DELETE en ninguna tabla. Los viajes se anulan
   (estado `Anulado`), no se eliminan. No agregues borrado.
2. **Toda escritura queda auditada.** El trigger `audit_change()` guarda antes/después y actor
   en `history`. No lo desactives ni escribas saltándotelo.
3. **Editar un viaje exige motivo.** El trigger `validate_trip()` rechaza un UPDATE con `notes`
   vacío. Es lo que hace posible reconstruir por qué se compró algo.
4. **La persona y el sentido de un viaje no se cambian.** Se anula y se crea otro.
5. **Estado Emitido/Completado/No presentado exige PNR.** Constraint en la tabla.
6. **Un viaje debe caer dentro de la vigencia de una persona activa.**
7. **Acceso por lista blanca.** Solo entran los correos en `public.members` (función `is_member()`).
   Las policies RLS dependen de eso. Si no hay correos, no entra nadie: falla cerrado, así debe ser.

Antes de tocar `supabase/*.sql`: las migraciones ya aplicadas en producción **no se editan**,
se agrega una nueva con el número siguiente.

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

2. **Un solo motor de ciclos. HECHO** (rama `motor-de-ciclos`). `lib/cycles.ts` es ahora el
   único que decide fechas de viaje, y la base solo guarda lo que él genera.

   - **4×3**: semanal, con el día de subida y el de bajada en la ficha de cada persona
     (`up_weekday` / `down_weekday`, por omisión lunes y jueves). La fecha de inicio ya no
     tiene que caer un lunes. Si el día de bajada cae antes en la semana que el de subida,
     la bajada es de la semana siguiente.
   - **10×10**: ciclo de veinte días desde la fecha de inicio, que es además la primera
     subida. **Sin grupos A y B**: dos personas desfasadas diez días quedan cruzadas solas.
     Es la decisión que tomó Joaquín, y evita agregar columnas de grupo.
   - `generate_pulse()` en SQL **ya no se llama**: la aplicación inserta los viajes con
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

5. **Elegibilidad.** Hoy solo se valida vigencia por fechas. Falta acreditación (documentos al día)
   como condición para que alguien entre a un manifiesto — visible y con motivo, nunca oculto.

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

7. **Retirar `generate_pulse()`.** Quedó en la base sin que nadie la llame. Una migración
   nueva puede eliminarla; conviene esperar a que la versión nueva lleve un tiempo en
   producción, para poder volver atrás sin tocar SQL.

8. **Cliente de Supabase perezoso.** `lib/supabase.ts` crea el cliente al cargar el módulo, lo
   que rompe `npm run build` en un clon sin `.env.local` (ver Trampas conocidas). Crearlo la
   primera vez que se usa y dar un mensaje claro si faltan las variables.

## Convenciones

- Español en UI, nombres de dominio y comentarios.
- Estilos solo en `app/globals.css` con los tokens existentes. Sin Tailwind ni librerías de UI.
- Iconos: `lucide-react`, ya instalado.
- Al cambiar el esquema: nueva migración numerada en `supabase/`, nunca editar una existente.
- Cambios en lógica de fechas requieren test en `lib/*.test.ts`.

## Decisiones de diseño ya tomadas

No las deshagas sin medir de nuevo; salieron de mirar la aplicación en el navegador, no de
opinión.

- **Contraste del tema claro.** `--text-soft` y `--muted` estaban en 4.36 sobre el fondo, bajo
  el mínimo AA de 4.5. Se oscurecieron a `#485360` y `#5f6b78` (5.0 y 5.4). El tema oscuro ya
  iba holgado y no se toca.
- **Encabezado compacto.** El kicker (`.section-kicker`) está oculto a propósito: repetía lo
  que ya dicen el título y la pestaña activa, en 126px. Con el cambio el encabezado mide 51px
  y se ve una fila más de datos sin desplazar. Si vuelves a mostrarlo, di por qué.
- **La casilla de selección de viajes NO es un problema de accesibilidad.** El `<input>` mide
  18×18 pero la etiqueta `.selection-toggle` que lo envuelve mide 44×44 y es el área que
  recibe el clic. Ya me equivoqué una vez midiendo el input; no repitas la medición mala.
- Las skills de diseño de Emil Kowalski están en `.claude/skills/`, versionadas. Se
  reinstalan con `npx skills add emilkowalski/skill`.
- **El tema oscuro es gris neutro, no azul marino.** Toda la escala de grises tiraba a azul
  (`--bg` era `#0a0f16`); se pasó a gris puro manteniendo casi la misma luminosidad de cada
  peldaño, así que ningún contraste bajó. Los colores con significado —turnos, estados, foco—
  no se tocaron: ahí el color informa y neutralizarlo sería borrar información. El velo de los
  diálogos también se neutralizó. Si alguien vuelve a meter un azul en los grises, es a
  contrapelo de una decisión, no un olvido.
- **La pantalla de entrada es una sola columna centrada sobre un campo de puntos**
  (`app/components/dot-field.tsx`). Se quitó el titular "Tu equipo viaja. La obra continúa."
  y la tira de rutas: lo pidió Joaquín, quien entra ahí viene a entrar, no a que le expliquen
  el producto.
- **El campo de puntos está escrito con canvas normal, a propósito.** La referencia que lo
  inspiró (21st.dev) usa three.js, @react-three/fiber, framer-motion y Tailwind. Traer una
  librería 3D para dibujar cuadraditos en un proyecto de siete dependencias no se justifica.
  Si alguien propone reemplazarlo por la versión original, esa es la razón por la que no.
  Además la referencia era una maqueta: su "login" daba por buena cualquier clave.
- **Tres cosas del campo de puntos que no son adorno**: el color sale del token `--dot`, así
  que funciona en los dos temas; respeta `prefers-reduced-motion`; y si la pestaña está en
  segundo plano dibuja el estado asentado y se salta la entrada, porque el navegador congela
  `requestAnimationFrame` y si no el fondo quedaría vacío.
- **El recuadro del manifiesto crece con `flex: 1 1 auto`.** Si se le pone el alto del texto
  queda un hueco suelto entre la frase de abajo y los botones; si se le deja imponer su alto
  con `rows`, esa frase se corta por la mitad. Ya se probaron las tres.

## Comandos

```bash
npm install
npm run dev      # http://127.0.0.1:3000 (o el puerto que indique)
npm test         # node --test sobre lib/*.test.ts
npm run build
```

Variables en `.env.local` (copiar de `.env.example`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Modo demo: hay un botón en el login que carga datos ficticios sin tocar Supabase. Útil para
probar la interfaz sin credenciales — pero ojo, ese camino usa `lib/calendar.ts` y el real no.

## Trampas conocidas

- **`npm run build` falla en un clon limpio** con `Error: supabaseUrl is required`. La causa
  está en `lib/supabase.ts`: crea el cliente al cargar el módulo, y Next evalúa ese módulo al
  prerenderizar `/`. Solución de parche: tener un `.env.local`, aunque sea con valores de
  relleno. Arreglo de verdad: crear el cliente de forma perezosa, la primera vez que se usa.
- El indicador de desarrollo de Next agrega botones y texto que no son de la aplicación. Si
  mides el DOM para comparar antes y después, mide `.shell`, no `document.body`.

## Detalles a corregir cuando toque

- `package.json` dice `"name": "relevo"` y el proyecto en Vercel también. Se confunde con otro
  proyecto distinto llamado Relevo. Conviene renombrar a `fcc-travel`.
- Usa TypeScript 7 y `@types/node` 26 — versiones muy nuevas. Si aparecen errores raros de tipos,
  mirar ahí antes de dar vueltas.
- `AGENTS.md` lo regenera `next dev`; no lo edites a mano.
