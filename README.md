# Daybook Travel

Aplicación interna para organizar personas, turnos y pasajes en Copiapó.

Producción: [relevo-chi.vercel.app](https://relevo-chi.vercel.app/)

> **Guía de uso:** [`docs/Manual_Daybook_Travel.pdf`](docs/Manual_Daybook_Travel.pdf), versión 2.1, con la identidad Daybook. El manual anterior se retiró y no se reutiliza.
> Se regenera con `python3 docs/manual/hacer_manual.py docs/manual/manual.html` y luego
> `google-chrome --headless=new --no-pdf-header-footer --print-to-pdf=docs/Manual_Daybook_Travel.pdf docs/manual/manual.html`.
> Si cambia una pantalla, se edita el texto de `hacer_manual.py` y se vuelven a correr los dos comandos.

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

## Comprobaciones

```bash
npm test
npm run build
```

No se almacenan contraseñas ni claves privadas en este repositorio.
