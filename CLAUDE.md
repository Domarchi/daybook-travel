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
| `app/page.tsx` | **2.630 líneas.** Todo: login, agenda, personas, viajes, modales, historial, estado global. Necesita partirse (Pendiente 1). |
| `app/excel-sync-panel.tsx` | Importador Excel en 3 pasos (Preparar → Revisar → Aplicar). Bien hecho, no romper. |
| `app/year-view.tsx` | Vista anual de calor. |
| `app/globals.css` | ~3.000 líneas. Tokens en `:root` y `:root[data-theme="light"]`. |
| `lib/calendar.ts` | `pulseDates()` — genera el 4×3 en TypeScript. **Solo se usa en modo demo.** |
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

1. **Partir `app/page.tsx`.** Separar agenda, personas, viajes y modales en componentes, sin
   cambiar comportamiento. Es invisible para el usuario y obligatorio antes de lo demás:
   hoy cualquier cambio toca un archivo de 2.630 líneas y redibuja toda la app.

2. **Un solo motor de ciclos.** Hoy el 4×3 está duplicado: `lib/calendar.ts` (demo) y
   `generate_pulse()` en SQL (real). Ambos tienen **lunes y jueves grabados a fuego** y exigen
   que la fecha de inicio sea lunes. El 10×10 **no se genera**: se carga viaje por viaje a mano.
   Objetivo: un motor único en TypeScript, con días configurables, que cubra 4×3 (pulso semanal)
   y 10×10 (relevo cruzado A/B cada 10 días), con tests. La base solo guarda lo que el motor genera.

3. **Ventana de compra.** Hoy todo dice "Planificado" sin importar si el vuelo es mañana o en
   tres semanas. Falta la pregunta del día: *¿qué hay que comprar ya?* Colorear la agenda por
   urgencia (dentro de la ventana y sin gestionar = urgente) y una cola de fechas abiertas.

4. **Costos.** El campo `amount` existe en `trips` pero nada lo suma. Falta: precio de referencia
   por ruta, costo por persona/mes/ruta, y comparación de una cotización nueva contra el historial.

5. **Elegibilidad.** Hoy solo se valida vigencia por fechas. Falta acreditación (documentos al día)
   como condición para que alguien entre a un manifiesto — visible y con motivo, nunca oculto.

6. **Manifiesto por día y ruta.** Los viajes se compran por bloque (fecha + ruta), no de a uno.
   Mejorar "Lista para solicitar" hacia un manifiesto agrupado, listo para pegar en un correo.

## Convenciones

- Español en UI, nombres de dominio y comentarios.
- Estilos solo en `app/globals.css` con los tokens existentes. Sin Tailwind ni librerías de UI.
- Iconos: `lucide-react`, ya instalado.
- Al cambiar el esquema: nueva migración numerada en `supabase/`, nunca editar una existente.
- Cambios en lógica de fechas requieren test en `lib/*.test.ts`.

## Comandos

```bash
npm install
npm run dev      # http://127.0.0.1:3000
npm test         # node --test sobre lib/*.test.ts
npm run build
```

Variables en `.env.local` (copiar de `.env.example`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Modo demo: hay un botón en el login que carga datos ficticios sin tocar Supabase. Útil para
probar la interfaz sin credenciales — pero ojo, ese camino usa `lib/calendar.ts` y el real no.

## Detalles a corregir cuando toque

- `package.json` dice `"name": "relevo"` y el proyecto en Vercel también. Se confunde con otro
  proyecto distinto llamado Relevo. Conviene renombrar a `fcc-travel`.
- Usa TypeScript 7 y `@types/node` 26 — versiones muy nuevas. Si aparecen errores raros de tipos,
  mirar ahí antes de dar vueltas.
- `AGENTS.md` lo regenera `next dev`; no lo edites a mano.
