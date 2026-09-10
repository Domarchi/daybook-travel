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

3. **Ventana de compra.** Hoy todo dice "Planificado" sin importar si el vuelo es mañana o en
   tres semanas. Falta la pregunta del día: *¿qué hay que comprar ya?* Colorear la agenda por
   urgencia (dentro de la ventana y sin gestionar = urgente) y una cola de fechas abiertas.

4. **Costos.** El campo `amount` existe en `trips` pero nada lo suma. Falta: precio de referencia
   por ruta, costo por persona/mes/ruta, y comparación de una cotización nueva contra el historial.

5. **Elegibilidad.** Hoy solo se valida vigencia por fechas. Falta acreditación (documentos al día)
   como condición para que alguien entre a un manifiesto — visible y con motivo, nunca oculto.

6. **Manifiesto por día y ruta.** Los viajes se compran por bloque (fecha + ruta), no de a uno.
   Mejorar "Lista para solicitar" hacia un manifiesto agrupado, listo para pegar en un correo.

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
