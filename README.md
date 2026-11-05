# Daybook Travel

Aplicación interna para organizar personas, turnos y pasajes en Copiapó.

Producción: [relevo-chi.vercel.app](https://relevo-chi.vercel.app/)

> El manual histórico se retiró del circuito distribuible porque mostraba la identidad anterior. Debe regenerarse desde una fuente reproducible antes de volver a publicarse.

## Funciones principales

- Agenda mensual navegable con movimientos 4×3 y 10×10.
- Registro de personas, rutas, vigencias, turnos y equipaje.
- Gestión de viajes desde Planificado hasta Completado.
- Preparación de solicitudes y registro de PNR, vuelo y monto.
- Importación y exportación controlada mediante Excel.
- Historial de cambios y acceso individual por usuario.
- Tema claro y oscuro.

## Tecnología

- Next.js y React.
- Supabase para autenticación y base de datos.
- Vercel para publicación.

## Desarrollo local

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` como `.env.local` y completa estas variables:

   ```text
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   ```

3. Inicia la aplicación:

   ```bash
   npm run dev
   ```

## Base de datos

Los archivos SQL versionados están en `supabase/` y deben aplicarse en orden numérico para preparar una instalación nueva.

Para publicar la corrección de planificación, Excel y edición simultánea, aplica
`supabase/009_trip_planning.sql` antes de actualizar la interfaz. La migración
añade dos funciones; no modifica viajes ni su historial. La planificación
recupera las fechas originales de viajes antiguos desde la auditoría. Si falta
esa evidencia, muestra un error y bloquea la generación de la persona afectada
en lugar de inventar una fecha. No elimina duplicados que ya existan.

## Comprobaciones

```bash
npm test
npm run build
```

Las pruebas PostgreSQL usan un contenedor Docker desechable por defecto. También
pueden ejecutarse contra un servidor local **aislado de pruebas**, por socket Unix,
con `TRAVEL_TEST_PG_BIN`, `TRAVEL_TEST_PG_SOCKET`, `TRAVEL_TEST_PG_PORT` y
`TRAVEL_TEST_PG_USER`. Cada prueba crea y elimina su propia base de datos; no usa
`DATABASE_URL`. Este modo necesita `createdb`, `dropdb`, `psql` y permisos para
preparar los roles de prueba. No lo apuntes a un servidor de producción.

No se almacenan contraseñas ni claves privadas en este repositorio.
