# Mis vuelos (23 nov 2026)

Un espacio para que cada trabajador vea **solo sus propios vuelos** desde el teléfono y reciba un recordatorio el día antes. Lo pidió el dueño: «algo como su RUT y un código de 4 dígitos fácil y que se guarde».

- Pantalla: `/mis-vuelos` (`components/mis-vuelos-view.tsx`), aparte de la de la coordinación: sin su store ni su sesión.
- Base: `supabase/016_mis_vuelos.sql`. **No está aplicada en producción** hasta que el dueño lo apruebe; se registraría como `travel_016_mis_vuelos`.
- Ficha: RUT, teléfono y correo (opcionales) y la sección «Mis vuelos» (`components/acceso-mis-vuelos.tsx`).

## Decisiones

| Tema | Decisión |
| --- | --- |
| Cómo entra | RUT + código de 4 dígitos. Sin cuenta de Supabase Auth. El teléfono guarda la sesión 180 días. |
| Quién crea el código | La base, al azar, sin los obvios (`1111`, `1234`, `4321`…). La coordinación lo entrega por WhatsApp desde la ficha. Se muestra una sola vez. |
| Intentos | 5 fallidos seguidos bloquean ese RUT hasta que la coordinación dé un código nuevo. |
| Qué ve | Sus viajes no anulados, de 60 días atrás en adelante: fecha, ruta, hora, vuelo, código de reserva y equipaje. **Nunca** el monto ni las notas. |
| Recordatorios | Calendario del teléfono (suscripción `.ics`), correo (Resend) y WhatsApp (Cloud API de Meta). |
| Qué se recuerda | Solo los viajes de mañana **con código de reserva** (Solicitado o Emitido). Un Planificado sin pasaje la víspera casi siempre es un viaje que no se va a volar. |

## Cómo se protege

Todo vive en la base. El navegador del trabajador habla con Supabase como `anon`, y `anon` no tiene ningún permiso sobre tablas: solo puede llamar a cuatro funciones.

| Función | Quién | Qué hace |
| --- | --- | --- |
| `worker_sign_in(rut, pin)` | anon | Devuelve `{ok, token}` o `{ok:false, motivo}` (`incorrecto` o `bloqueado`). Un RUT que no existe y un código equivocado responden lo mismo. No lanza errores: deshacerían la cuenta de intentos. |
| `worker_trips(token)` | anon | Los viajes de la persona dueña del token, y la llave de su calendario. |
| `worker_sign_out(token)` | anon | Revoca esa sesión. |
| `worker_calendar(llave)` | anon | Lo mismo que `worker_trips`, con la llave del calendario. La llama `app/api/mis-vuelos/calendario/[llave]` con la llave pública. |
| `worker_access_give_code(persona)` | miembro | Genera y devuelve el código, desbloquea, corta las sesiones abiertas y cambia la llave del calendario. Exige ficha activa con RUT. |
| `worker_access_revoke(persona)` | miembro | Bloquea y corta sesiones (teléfono perdido). |
| `worker_access_list()` | miembro | Por persona: desde cuándo tiene código y si está bloqueado. Nunca el resumen. |
| `worker_reminder_data()` | service_role | Los viajes de mañana con código de reserva, de personas activas con correo o teléfono. Para el cron. |

- `worker_access` (resumen del código con sal, intentos, bloqueo, llave del calendario) y `worker_sessions` (resumen del token, vencimiento, revocación) no tienen permisos para `anon` ni `authenticated`: ni la coordinación lee el código.
- Nada se borra: una sesión se revoca y un acceso se bloquea.
- El historial guarda, con la entidad `worker_access` y la persona como `record_id`, cada código entregado y cada bloqueo, **sin** el resumen ni la llave. La ficha lo muestra («Mis vuelos: código entregado»). Los intentos y las sesiones no van al historial: son cuentas, como el cupo de Bita.
- Un RUT entra a una sola ficha activa (índice único parcial). La base comprueba el dígito verificador (`rut_valido`).
- Bita lee personas con columnas nombradas, así que RUT, teléfono y correo no le llegan (lo fija `lib/bita-contratos.test.ts`).

`lib/mis-vuelos-postgres.test.ts` lo comprueba contra PostgreSQL real, con los permisos que Supabase pone por omisión: sin sesión no se lee ninguna tabla, un token ve solo lo suyo, el monto y las notas no salen, cinco fallos bloquean, un código nuevo corta lo anterior y el historial no guarda resúmenes.

## Recordatorios

### Calendario del teléfono

«Agregar a mi calendario» abre `webcal://…/api/mis-vuelos/calendario/<llave>`. El teléfono lo vuelve a pedir cada tanto (pedimos 6 horas), así que un cambio de vuelo llega solo. Cada evento lleva un aviso: 24 horas antes si tiene hora, o a las 18:00 de la víspera si es de día completo. En Google Calendar se pega el enlace en «Otros calendarios → Desde URL».

Ojo: el iPhone, por omisión, quita los avisos de los calendarios suscritos («Quitar alertas» en Ajustes → Calendario → Cuentas). Los eventos se ven igual; el aviso lo cubren el correo y WhatsApp.

### Correo y WhatsApp: `GET /api/cron/recordatorios`

Cron de Vercel todos los días a las 21:00 UTC (`vercel.json`): las 18:00 en el horario de verano de Chile y las 17:00 en el de invierno. Mismo modelo que las alertas de compra: lógica en `lib/recordatorios.ts` y `lib/recordatorios-handler.ts`, envíos en `lib/send-mail.ts` y `lib/send-whatsapp.ts`, todo probado sin red.

- Falla cerrado: sin `CRON_SECRET`, 503; con otro, 401; sin ningún canal configurado, 503 con los nombres de las variables que faltan. Con un solo canal, manda por ese.
- Para probar sin enviar: `GET /api/cron/recordatorios?simular=1` con `Authorization: Bearer $CRON_SECRET` devuelve los mensajes armados.
- La respuesta normal solo trae cantidades. Si un envío falla, sigue con los demás; si fallan todos, responde 502.
- No guarda qué ya mandó: si alguien vuelve a llamar la ruta el mismo día, se repite el aviso. El cron corre una vez al día.

### Variables en Vercel

Las pone una persona; nunca en el repositorio ni con `NEXT_PUBLIC_`.

| Variable | Para |
| --- | --- |
| `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` | Las mismas de las alertas de compra. |
| `RESEND_API_KEY`, `ALERT_FROM` | Correo. El mismo remitente de las alertas (dominio verificado en Resend). |
| `WHATSAPP_TOKEN` | Token permanente de un usuario del sistema de Meta Business con permiso `whatsapp_business_messaging`. |
| `WHATSAPP_PHONE_NUMBER_ID` | El id del número que envía (no el número). |
| `WHATSAPP_TEMPLATE` | El nombre de la plantilla aprobada, por ejemplo `recordatorio_vuelo`. |
| `WHATSAPP_TEMPLATE_LANG` | Opcional: el idioma con que se aprobó (por omisión `es`). |

### La plantilla de WhatsApp

Un mensaje que inicia la empresa necesita una plantilla aprobada por Meta, de categoría **Utilidad**. Cuerpo sugerido, con cinco variables:

```
Hola {{1}}, te recordamos tu vuelo de mañana {{2}}: {{3}}, {{4}}. Código de reserva: {{5}}. Buen viaje.
```

Ejemplos para la revisión de Meta: `Persona`, `martes 24 de noviembre`, `Santiago → Copiapó`, `LA 340, a las 08:30`, `ABC123`. El orden lo fija `parametrosDeWhatsapp` en `lib/recordatorios.ts`; si se cambia la plantilla, se cambia ahí y su prueba. La versión de la API está en `VERSION_DE_LA_API` (`lib/send-whatsapp.ts`).

Costo aproximado: unos US$0,02 por mensaje de utilidad a Chile (tarifa de Meta, puede cambiar).

## Pasos para encenderlo

1. Aprobar y aplicar `016_mis_vuelos.sql` en RELEVO como `travel_016_mis_vuelos`.
2. Cargar RUT (y teléfono o correo) en las fichas y entregar los códigos desde la ficha.
3. Para el correo: las variables de Resend (ya pendientes por las alertas).
4. Para WhatsApp: cuenta de Meta Business verificada, número, plantilla aprobada y sus tres variables.
5. Probar con `?simular=1` antes del primer envío real.
