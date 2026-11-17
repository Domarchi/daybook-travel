// Punto de entrada de Next para scripts/browser-bita-documento.mjs.
//
// El arnés de browser-login.mjs arranca `next dev` con la Supabase de la prueba de
// entrada (puerto 54321) y sin llave de Anthropic. Aquí se cambia eso solo para
// esta prueba: el entorno viene serializado en BITA_PRUEBA_ENV y se pone antes de
// cargar Next, para que las variables NEXT_PUBLIC_* y las del servidor lo vean.
Object.assign(process.env, JSON.parse(process.env.BITA_PRUEBA_ENV ?? "{}"));
await import("../node_modules/next/dist/bin/next");
