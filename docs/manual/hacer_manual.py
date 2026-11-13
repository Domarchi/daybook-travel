#!/usr/bin/env python3
# Arma docs/manual/manual.html a partir de las páginas de abajo. La numeración
# de páginas se calcula aquí: no depende de que el navegador soporte cajas de margen.
import html, sys

SALIDA = sys.argv[1]
LOGO = "daybook-travel-logo-on-light.svg"
MARCA = "daybook-mark-on-light.svg"
VERSION = "2.2"
FECHA = "13 de noviembre de 2026"
URL = "https://relevo-chi.vercel.app"

def e(t):
    return html.escape(t, quote=False)

def pasos(items):
    return '<ol class="pasos">' + "".join(f"<li><span>{i}</span><p>{t}</p></li>" for i, t in enumerate(items, 1)) + "</ol>"

def lista(items):
    return '<ul class="lista">' + "".join(f"<li>{t}</li>" for t in items) + "</ul>"

def col(titulo, cuerpo):
    return f'<div class="col"><h3>{titulo}</h3>{cuerpo}</div>'

def dos(a, b):
    return f'<div class="dos">{a}{b}</div>'

def nota(titulo, texto, tono=""):
    return f'<aside class="nota {tono}"><strong>{titulo}</strong><p>{texto}</p></aside>'

def tarjetas(items):
    return '<div class="tarjetas">' + "".join(
        f'<div class="tarjeta"><small>{n}</small><h3>{t}</h3><p>{d}</p></div>' for n, t, d in items) + "</div>"

paginas = []

def pagina(seccion, titulo, intro, cuerpo):
    paginas.append((seccion, titulo, intro, cuerpo))

# ---------------------------------------------------------------- contenido
pagina("Para comenzar", "Para qué vamos a usar Daybook Travel",
  "La aplicación existe para que los datos de los viajes no queden repartidos en correos y planillas.",
  tarjetas([
    ("01", "Personas", "Aquí dejamos la ruta, el turno, las fechas, el equipaje y los documentos de cada persona."),
    ("02", "Agenda", "Aquí vemos quién sube o baja, qué días necesitan atención y qué hay que comprar ahora."),
    ("03", "Viajes", "Aquí seguimos cada pasaje desde la planificación hasta el cierre."),
  ]) +
  tarjetas([
    ("04", "Costos", "Cuánto se gasta por mes, por ruta y por persona, siempre con cuántos viajes tienen monto."),
    ("05", "Accesos", "Solo para administradores: quién puede entrar a la aplicación."),
    ("06", "Actividad", "Los últimos cambios de todo el proyecto, con quién los hizo y qué cambió. Nada se borra."),
  ]) +
  '<h2>Así vamos a trabajar</h2>' +
  '<div class="flujo">' + "".join(f'<div><span>{i}</span><strong>{t}</strong><small>{d}</small></div>' for i, (t, d) in enumerate([
    ("Entrar", "Cada una con su cuenta"),
    ("Registrar", "Cargar personas y rutas"),
    ("Planificar", "Crear los próximos viajes"),
    ("Solicitar", "Preparar los pasajes"),
    ("Confirmar", "Anotar PNR, vuelo y monto"),
    ("Cerrar", "Dejar el resultado final"),
  ], 1)) + '</div>' +
  nota("Cómo está organizado", "La ficha de la persona está separada de sus viajes. Así se puede corregir un pasaje sin alterar los demás, y siempre queda registrado qué cambió y quién lo cambió."))

pagina("Primer ingreso", "Cómo entrar",
  "Cada persona tiene su propia cuenta. La demostración sirve para practicar sin tocar datos reales.",
  dos(
    col("Para entrar a la agenda real", pasos([
      f"Abre <strong>{URL}</strong> desde el computador o el celular.",
      "Escribe tu correo y tu contraseña. Son los mismos de Daybook Asistencia.",
      "Si quieres comprobar lo que escribes, marca <strong>Mostrar contraseña</strong>, justo debajo del campo.",
      "Al entrar verás la misma agenda y los mismos datos que el resto del equipo.",
    ])),
    col("Para practicar", lista([
      "<strong>Abrir demostración</strong> usa datos ficticios.",
      "Nada de lo que hagas ahí pasa a la agenda real.",
      "Los cambios duran hasta que cierres la demostración.",
    ]))) +
  nota("Si olvidaste tu contraseña", "Pulsa <strong>¿Olvidaste tu contraseña?</strong> en la pantalla de entrada, escribe tu correo y sigue el enlace que te llegará. La contraseña es la misma de Daybook Asistencia.") +
  nota("Si ves «Tu cuenta todavía no está habilitada»", "Tu correo inició sesión, pero todavía no está en la lista de accesos de Daybook Travel. Pídele a un administrador que lo agregue en la pantalla <strong>Accesos</strong>. Si ni siquiera puedes iniciar sesión, la cuenta de Daybook Asistencia aún no existe.", "aviso"))

pagina("Agenda", "Por dónde conviene empezar",
  "Al abrir la aplicación, estas cuatro tarjetas muestran lo que hay que revisar primero.",
  tarjetas([
    ("Próximo movimiento", "Fecha y hora", "Lleva al viaje más cercano."),
    ("Por comprar ahora", "Un número", "Viajes sin código de reserva que vuelan pronto o que volaron hace menos de dos semanas. Abre la lista filtrada."),
    ("Pendientes de confirmación", "Solicitudes enviadas", "Lo que ya pedimos y todavía no tiene respuesta, y hace cuánto se pidió lo más antiguo."),
    ("Personas activas", "En el proyecto", "Abre la nómina vigente."),
  ]) +
  '<h2>La anticipación de compra</h2>' +
  dos(
    col("Cómo se decide qué es urgente", lista([
      "Un viaje está <strong>resuelto</strong> cuando tiene código de reserva (PNR). Pedirlo a la agencia no basta: hasta que no hay código, nadie tiene asiento.",
      "Es <strong>urgente</strong> si vuela dentro de la anticipación elegida y no tiene PNR.",
      "Está <strong>vencido</strong> si la fecha pasó hace menos de 14 días y nadie registró la compra. Después queda <strong>sin cerrar</strong> (ver «Viajes sin cerrar»).",
      "Un viaje anulado no se vuelve a comprar.",
    ])),
    col("Dónde se cambia", lista([
      "El selector <strong>Anticipación</strong>, arriba a la derecha de la agenda: 7, 14, 21, 30, 45 o 60 días. Por omisión son 21.",
      "Es una decisión del proyecto, no de cada persona: lo que cambie una lo ve la otra.",
      "Cada fila de Viajes muestra «Faltan N días», con color según la urgencia.",
    ]))) +
  nota("Mi recomendación", "Al comenzar el día, revisemos <strong>Por comprar ahora</strong>, <strong>Próximo movimiento</strong> y <strong>Pendientes de confirmación</strong>. Con eso sabemos de inmediato qué falta hacer."))

pagina("Agenda mensual y semanal", "Cómo leer el calendario",
  "El calendario abre en el mes actual y permite revisar cualquier mes anterior o futuro.",
  dos(
    col("Qué muestra", lista([
      "Naranja corresponde al turno 4×3 y azul al 10×10.",
      "El número dentro del día indica cuántos viajes hay.",
      "Los viajes anulados no aparecen.",
      "Los filtros Todos, 4×3, 10×10, Sin turno y Por confirmar solo cambian la vista.",
      "Al seleccionar un día aparecen las personas, las rutas y las horas.",
    ])),
    col("Cómo moverse", lista([
      "<strong>Mes / Semana</strong>: la vista semanal muestra una sola fila y ocupa mucho menos pantalla. Se recuerda en tu navegador.",
      "Las flechas cambian de mes (o de semana, en la vista semanal).",
      "El selector del centro permite elegir mes y año.",
      "<strong>Hoy</strong> vuelve a la fecha actual.",
    ]))) +
  nota("También funciona con teclado", "Las flechas cambian de día, Inicio y Fin recorren la semana, y Re Pág o Av Pág cambian de mes. En la vista semanal, las flechas cruzan de una semana a la siguiente.") +
  '<h2>Qué pasa al abrir un día</h2>' +
  pasos([
    "Arriba dice <strong>En obra: N personas</strong>. Ábrelo para ver quiénes están ese día y quién sube o baja. Sale de los viajes registrados.",
    "Selecciona una fila para abrir el viaje y revisar todos sus datos.",
    "Usa <strong>Agregar viaje</strong> si falta un viaje en esa fecha.",
    "Cierra el detalle para volver al calendario.",
  ]) +
  nota("Subida y bajada", "Subida es el viaje hacia Copiapó. Bajada es el regreso al origen habitual. Si todavía no hay horario, queda como «Por confirmar»."))

pagina("Personas", "La ficha de cada integrante",
  "La ruta, el turno y el equipaje se guardan una vez y después se reutilizan al crear viajes.",
  dos(
    col("Buscar y filtrar", lista([
      "Se puede buscar por nombre, ciudad o turno.",
      "Los filtros son Activas, 4×3, 10×10, Sin turno, Por confirmar, Inactivas y Todas.",
      "Cada ficha resume la ruta, el turno, el inicio y el equipaje.",
      "Si dos fichas tienen el mismo nombre, la lista las marca y la ficha avisa al escribirlo.",
    ])),
    col("Acciones por persona", lista([
      "<strong>Nuevo viaje</strong> toma como base su ruta habitual.",
      "<strong>Ver viajes</strong> muestra solamente los de esa persona.",
      "<strong>Editar</strong> cambia la información para los viajes que se creen después.",
      "En la ficha, <strong>Ver historial de la persona</strong> muestra sus cambios y los de sus documentos.",
    ]))) +
  '<h2>Cómo completar una ficha</h2>' +
  dos(
    col("Lo que hay que completar", lista([
      "Nombre completo, origen habitual y destino de subida.",
      "El <strong>turno</strong>: 4×3, 10×10, Sin turno, o Por confirmar mientras se define.",
      "En 4×3, los días en que <strong>sube</strong> y <strong>baja</strong> (por omisión lunes y jueves).",
      "El inicio de vigencia (en 10×10, la primera subida) y, si se sabe, hasta cuándo está vigente.",
      "Equipaje habitual y si la persona está activa.",
    ])),
    col("Detalles que conviene revisar", lista([
      "La fecha de término no puede quedar antes del inicio.",
      "Una persona inactiva no puede recibir viajes nuevos.",
      "Cambiar su ruta no modifica los viajes que ya existen.",
      "Si hay documentos exigidos, la ficha trae una sección <strong>Documentos</strong> con su vencimiento.",
    ]))) +
  nota("Si alguien sale del proyecto", "Desactiva su ficha en vez de borrarla. Al desmarcar <strong>Persona activa</strong>, la ficha ofrece anular sus viajes futuros sin reserva; los que tienen reserva hay que revisarlos."))

pagina("Turnos", "Cómo se crean los viajes",
  "La aplicación calcula las fechas desde el turno de cada persona: no hace falta digitarlas una por una.",
  dos(
    col("4×3 — semanal", lista([
      "Sube y baja cada semana, en los días que tenga la ficha.",
      "Por omisión: subida el lunes y bajada el jueves.",
      "La fecha de inicio no tiene que caer un lunes.",
    ])),
    col("10×10 — ciclo de veinte días", lista([
      "La fecha de inicio es la primera subida.",
      "Baja diez días después y vuelve a subir a los veinte.",
      "No hay grupos A y B: dos personas desfasadas diez días quedan cruzadas solas.",
    ]))) +
  '<h2>Planificar turnos</h2>' +
  pasos([
    "En Personas o en la Agenda, pulsa <strong>Planificar turnos</strong>.",
    "Elige una persona o todas las activas con turno 4×3 o 10×10.",
    "Indica hasta qué fecha quieres planificar y revisa la cantidad de viajes.",
    "Genera los viajes. Si alguno ya existe, no se vuelve a crear ni se pisa.",
  ]) +
  nota("Sin turno y Por confirmar", "Las personas <strong>Sin turno</strong> (jefaturas o viajes ocasionales) no entran en ciclos automáticos: cada movimiento se agrega con <strong>Nuevo viaje</strong>. Con <strong>Por confirmar</strong> pasa lo mismo hasta que se complete la ficha."))

pagina("Viajes", "Dónde revisar cada pasaje",
  "En esta lista se puede buscar, filtrar y abrir cualquier viaje del proyecto.",
  dos(
    col("Filtros", lista([
      "Se busca por persona, ruta, vuelo o código de reserva.",
      "También se filtra por estado, fecha o persona.",
      "<strong>Próximos</strong> muestra desde hoy en adelante; <strong>Todos los periodos</strong> abre el historial completo.",
      "<strong>Por comprar</strong> deja solo lo que espera una gestión; el botón cambia a <strong>Solo por comprar</strong> mientras está activo.",
    ])),
    col("Lectura y acciones", lista([
      "Cada fila muestra ruta, fecha, subida o bajada, hora, estado y los días que faltan. Lo solicitado dice además hace cuánto se pidió.",
      "Abrir permite editar. El reloj muestra el historial de ese viaje.",
      "En el celular, la misma información aparece en tarjetas.",
      "Se pueden marcar varios viajes para operar sobre ellos a la vez.",
    ]))) +
  nota("Si trabajamos al mismo tiempo", "La información se actualiza más o menos cada minuto. Si alguien cambió un viaje antes que tú, la aplicación avisa («Uno de los viajes cambió mientras trabajabas») para que no se reemplace ese cambio por error.") +
  '<h2>Cómo completar un viaje</h2>' +
  dos(
    col("Datos del viaje", lista([
      "Persona, fecha, subida o bajada, origen, destino, hora y equipaje.",
      "Al elegir la persona y el sentido, la aplicación propone la ruta habitual.",
      "La fecha tiene que estar dentro de la vigencia de la persona.",
    ])),
    col("Reserva y control", lista([
      "Código de reserva (PNR), vuelo, monto y observaciones. Al poner el código, el diálogo pide el monto si falta.",
      "No se puede repetir la misma persona, fecha y sentido.",
      "Al modificar un viaje existente hay que anotar el motivo, de al menos 5 letras.",
      "Si el monto se aparta mucho del precio de referencia de esa ruta, el diálogo lo avisa, pero no lo impide.",
    ]))))

pagina("Seguimiento", "Qué significa cada estado",
  "Usamos los estados de la misma forma para saber qué falta en cada pasaje.",
  '<table class="estados">' + "".join(
    f'<tr><td><span class="pill {c}">{n}</span></td><td>{d}</td><td>{a}</td></tr>' for n, c, d, a in [
      ("Planificado", "p", "Viaje creado, todavía no enviado.", "Hay que solicitar"),
      ("Solicitado", "s", "La solicitud ya fue enviada a la agencia.", "Falta respuesta y código"),
      ("Emitido", "e", "El pasaje está confirmado y emitido.", "PNR obligatorio"),
      ("Completado", "c", "La persona realizó el viaje.", "Viaje terminado"),
      ("Anulado", "a", "El viaje fue cancelado.", "Sale de la agenda"),
      ("No presentado", "n", "La persona no tomó el vuelo.", "PNR obligatorio"),
    ]) + '</table>' +
  nota("Orden habitual", "Planificado → Solicitado → Emitido → Completado. Si el viaje se cancela usamos Anulado; si la persona no aborda, No presentado.") +
  '<h2>Reglas que vamos a seguir</h2>' +
  lista([
    "<strong>No borramos viajes.</strong> Si se cancela, queda como Anulado para conservar el historial.",
    "Cuando editamos un viaje, anotamos el <strong>motivo del cambio</strong>: algo que se entienda después, como «No viajó» o «Duplicado». Un punto no sirve.",
    "El código de reserva (PNR) es obligatorio en Emitido, Completado y No presentado.",
    "Para cambiar la persona o el sentido, se anula el viaje y se crea uno nuevo.",
    "Cada cambio queda en el historial con quién lo hizo y qué cambió: se ve con el reloj de cada viaje.",
  ]))

pagina("Viajes sin cerrar", "Lo que ya pasó y quedó sin reserva",
  "Un viaje sin código de reserva cuya fecha pasó hace más de dos semanas ya no se compra: hay que cerrarlo.",
  dos(
    col("Dónde están", lista([
      "Bajo las tarjetas de la Agenda aparece «N viajes pasados quedaron sin reserva». Abre la lista.",
      "No cuentan en <strong>Por comprar ahora</strong> ni en el aviso por correo.",
      "Cada uno lleva la marca <strong>Sin cerrar</strong>.",
    ])),
    col("Cómo se cierran", pasos([
      "Marca los viajes, de a uno o todos con la casilla de arriba.",
      "Pulsa <strong>Cerrar N viajes</strong> y elige qué pasó.",
      "Escribe el motivo y confirma.",
    ]))) +
  '<h2>Las dos opciones</h2>' +
  dos(
    col("No se volaron", '<p>Quedan <strong>Anulados</strong>, con el motivo. Nada se borra.</p>'),
    col("Se volaron con una misma reserva", '<p>Quedan <strong>Completados</strong> con su código y, si lo tienes, el monto por pasajero. Solo se puede si todos son del mismo día y la misma ruta: un código es un vuelo. Si cada uno tiene su código, ábrelos de a uno.</p>')) +
  nota("Antes de anular", "Si alguno se voló con un pasaje comprado por fuera, no lo anules: regístrale la reserva. Anular dejaría un registro que no es cierto.", "aviso"))

pagina("Viajes para revisar", "Lo que viene y tiene algo raro",
  "La aplicación avisa de los viajes próximos que probablemente están mal, antes de comprarlos. No bloquea nada: solo avisa.",
  dos(
    col("Los tres avisos", lista([
      "<strong>Repetido</strong>: la misma persona tiene dos viajes iguales ese día. Uno sobra.",
      "<strong>Sube sin haber bajado</strong>, o <strong>baja sin haber subido</strong>: falta registrar un movimiento entre medio, o sobra uno.",
      "<strong>No calza con su turno</strong>: el viaje está planificado en un día que ya no corresponde a su turno, porque se cambió la ficha.",
    ])),
    col("Dónde están", lista([
      "Bajo las tarjetas de la Agenda aparece «N viajes próximos para revisar». Abre la lista.",
      "En Viajes, cada uno lleva su aviso bajo la ruta, en cualquier lista.",
      "Al guardar una ficha con otro turno, el aviso dice cuántos viajes quedaron fuera.",
    ]))) +
  '<h2>Si cambió el turno de alguien</h2>' +
  pasos([
    "Abre cada viaje marcado <strong>No calza con su turno</strong> y anúlalo, con un motivo como «Cambio de turno».",
    "Pulsa <strong>Planificar turnos</strong> para esa persona: crea los viajes del turno nuevo sin tocar los demás.",
  ]) +
  nota("Por qué solo los planificados", "Un viaje solicitado o con reserva ya lo vio alguien; si está en otro día, suele ser a propósito (alguien que bajó antes, un cambio de vuelo). Por eso el aviso de turno solo mira los planificados. Lo que ya pasó no se revisa: se cierra."))

pagina("Actividad e historial", "Quién cambió qué, y cuándo",
  "Cada cambio queda guardado con su autor. Hay dos formas de verlo: todo el proyecto, o un viaje o una persona.",
  dos(
    col("Actividad", lista([
      "En la barra lateral. Muestra los últimos cambios de viajes, personas y documentos de todo el proyecto, agrupados por día.",
      "Cada entrada dice quién lo hizo, qué cambió (por ejemplo «Reserva: — → ABC123») y el motivo.",
      "<strong>Abrir</strong> lleva al viaje o a la ficha. <strong>Ver cambios anteriores</strong> trae más.",
    ])),
    col("Historial de un viaje o una persona", lista([
      "El reloj de cada viaje, o <strong>Ver historial de la persona</strong> en su ficha.",
      "Muestra lo mismo, solo de ese viaje o esa persona, desde que se creó.",
      "En una persona también aparecen los cambios de vencimiento de sus documentos.",
    ]))) +
  nota("Para qué sirve", "Para entender por qué un viaje está como está antes de corregirlo, y para revisar al final del día qué se movió. Los cambios de accesos no aparecen aquí: los ve un administrador en Accesos."))

pagina("Solicitud de pasajes", "Cómo preparar la lista para la agencia",
  "La aplicación arma el texto; nosotros lo revisamos y lo enviamos por el canal que acordemos.",
  pasos([
    "En <strong>Viajes</strong>, filtra la fecha o las personas que vas a solicitar.",
    "Marca los viajes planificados que quieres incluir. Si no marcas ninguno, entran todos los pendientes.",
    "Pulsa <strong>Lista para solicitar</strong>: se abre una ventana con el texto, agrupado por día y ruta y, dentro de cada día, por hora de vuelo.",
    "Revisa y pulsa <strong>Copiar</strong>, o descarga el <strong>PDF</strong> o el <strong>CSV</strong>.",
    "Pega el texto en el correo a la agencia y envíalo.",
    "Después de enviarlo, pulsa <strong>Marcar N como solicitados</strong> sobre esa misma lista.",
    "Cuando llegue la respuesta, abre <strong>Pendientes de confirmación</strong>, marca los pasajeros de un mismo vuelo y pulsa <strong>Registrar reserva</strong>: quedan Emitido con el código y, si los tienes, el vuelo y el monto.",
  ]) +
  dos(
    col("Qué conviene saber", lista([
      "Copiar no cambia nada en la base. Marcar como solicitados sí, y por eso es un paso aparte.",
      "Si marcaste solo algunos viajes, el resumen dice «de N pendientes»: el correo lleva menos de lo que hay por pedir.",
      "Donde falta la hora o el equipaje, el texto dice «Por confirmar».",
    ])),
    col("Qué lleva cada formato", lista([
      "El texto, el PDF, el CSV y el botón de marcar usan <strong>siempre la misma lista</strong>.",
      "El CSV se abre bien en Excel, y trae la columna Acreditación si hay documentos exigidos.",
    ]))) +
  nota("El envío sigue siendo manual", "Daybook Travel prepara la lista y guarda el estado, pero no envía el correo ni compra el pasaje. Ese paso se sigue haciendo por el canal habitual."))

pagina("Acreditación", "Documentos al día para entrar al manifiesto",
  "Una persona entra al manifiesto si sus documentos valen para el día del viaje. Si no, se ve el motivo.",
  dos(
    col("Quién define los documentos", lista([
      "En <strong>Personas</strong>, el recuadro <strong>Documentos exigidos</strong> lista lo que cuenta para viajar.",
      "Solo un administrador agrega documentos nuevos o deja de exigir uno.",
      "Dejar de exigir un documento lo desactiva: se puede volver a exigir cuando haga falta.",
      "Mientras no haya documentos exigidos, la acreditación no aparece en ninguna pantalla.",
    ])),
    col("Quién carga las fechas", lista([
      "Cualquier miembro, en la ficha de la persona, sección <strong>Documentos</strong>.",
      "Cada documento tiene su fecha de vencimiento.",
      "Sin fecha, el documento figura como «sin registrar».",
    ]))) +
  '<h2>Qué pasa en el manifiesto</h2>' +
  pasos([
    "Al abrir <strong>Lista para solicitar</strong>, quien tiene un documento faltante o vencido para la fecha de su viaje <strong>no entra</strong> al texto.",
    "Aparece en <strong>Acreditación pendiente</strong>, con su nombre, su viaje y el motivo, por ejemplo «Examen médico: vence el 21 oct 2026».",
    "Si ya lo confirmaste por otro lado, marca <strong>Incluir igual</strong> y esa persona vuelve a la lista.",
    "Esa decisión vale solo para este manifiesto: la próxima vez vuelve a aparecer pendiente.",
  ]) +
  nota("Cómo se cuenta la fecha", "Un documento vale hasta el día de su vencimiento, inclusive, y se compara con la fecha <strong>del viaje</strong>, no con la de hoy. Un examen que vence el 30 de octubre sirve para un viaje del 29, pero no para uno del 2 de noviembre."))

pagina("Costos", "Cuánto se gasta y en qué",
  "La vista Costos suma lo que ya tiene monto registrado, por mes, por ruta y por persona.",
  dos(
    col("Qué muestra", lista([
      "El monto registrado por mes, por ruta y por persona.",
      "<strong>Siempre cuántos viajes tienen monto.</strong> Un total que cubre 3 de 41 viajes no es el gasto completo, y la pantalla lo dice.",
      "Un precio de referencia por ruta, para comparar.",
      "<strong>Descargar para Excel</strong> baja los viajes del período elegido, con su monto, para contabilidad.",
    ])),
    col("Cómo se calcula", lista([
      "<strong>El monto es por pasajero.</strong> Dos personas en la misma reserva son dos montos que se suman.",
      "La referencia de una ruta es la <strong>mediana</strong>, no el promedio: una tarifa de última hora carísima no la mueve.",
      "Al escribir un monto que se aparta más de un 40 % de esa referencia, el diálogo avisa. No bloquea: una tarifa cara puede ser legítima.",
    ]))) +
  nota("Anotemos el monto al registrar la reserva", "Es el momento en que tenemos el precio delante, y el diálogo lo pide. Costos solo suma lo que tiene monto. La aplicación todavía no consulta precios de aerolíneas en tiempo real."))

pagina("Excel", "Qué archivo usar",
  "Hay dos libros distintos. Cada uno sirve para un momento específico y no conviene mezclarlos.",
  dos(
    col("Plantilla vacía", '<p>Para agregar varias personas o viajes nuevos desde cero. Se descarga como <strong>daybook-travel-plantilla.xlsx</strong>.</p>'),
    col("Libro actual", '<p>Para corregir o completar lo que ya está en la aplicación. Se descarga con la fecha, por ejemplo <strong>daybook-travel-2026-11-10.xlsx</strong>.</p>')) +
  '<h2>Qué hay dentro del libro</h2>' +
  lista([
    "<strong>Personas</strong>: una fila por integrante, con su código, ruta, turno, fechas, equipaje y estado activo.",
    "<strong>Viajes</strong>: una fila por cada subida o bajada, con fecha, ruta, hora, estado, PNR, vuelo y monto.",
    "<strong>Instrucciones</strong>: una ayuda rápida. La aplicación solo lee las hojas Personas y Viajes.",
  ]) +
  '<h2>Cómo editar y volver a cargar</h2>' +
  pasos([
    "En Personas, abre <strong>Gestionar con Excel</strong> y descarga el <strong>Libro actual</strong> justo antes de empezar.",
    "Edita el archivo sin cambiar los nombres de las hojas ni de las columnas, y guárdalo como <strong>.xlsx</strong> (máximo 10 MB).",
    "Súbelo en la misma pantalla y revisa la vista previa: <strong>Nuevo</strong> crea, <strong>Cambio</strong> actualiza y <strong>Sin cambios</strong> se ignora.",
    "Si aparece <strong>Conflicto</strong>, descarga un Libro actual nuevo y repite el cambio. Si hay error, corrige la fila.",
    "Cuando la revisión esté limpia, pulsa <strong>Aplicar cambios</strong> y vuelve a descargar el libro.",
  ]))

pagina("Excel", "Qué se puede tocar y qué no",
  "La aplicación revisa el archivo antes de guardar. Nada cambia hasta que pulsas Aplicar cambios.",
  dos(
    col("En Personas", '<p>Código de persona (<em>codigoPersona</em>), nombre, origen, destino, turno, fecha de inicio y de término, equipaje y si está activa. Para una persona nueva, deja <em>daybookId</em> y <em>version</em> vacíos y usa un código que no se repita.</p>'),
    col("En Viajes", '<p>Fecha del viaje, ruta, hora, equipaje, estado, PNR, vuelo, monto y observaciones. Si cambias un viaje existente, completa <em>motivoCambio</em>. Para un viaje nuevo, copia <em>codigoPersona</em> desde la hoja Personas.</p>')) +
  nota("Columnas que no hay que tocar", "En filas existentes, conserva <em>daybookId</em>, <em>personaId</em>, <em>version</em>, <em>fechaPlanificada</em> y <em>actualizadoEn</em> tal como vienen. Deja <em>accion</em> y <em>errorSincronizacion</em> vacías: la vista previa decide qué hará con cada fila.") +
  nota("La regla de seguridad", "Si una fila tiene un error o un conflicto, la aplicación no guarda <strong>ninguna</strong> parte del archivo. Así se puede corregir sin dejar la agenda a medias ni reemplazar un cambio que otra persona hizo después.", "aviso") +
  nota("Cuál usar en el trabajo diario", "Para cambiar algo que ya está en Daybook Travel, descarga siempre un Libro actual justo antes de empezar. Para una carga completamente nueva, usa la Plantilla vacía."))

pagina("Accesos", "Quién puede entrar",
  "La pantalla Accesos aparece solo para los administradores. Aquí se decide qué cuentas entran a Daybook Travel.",
  dos(
    col("Dar acceso", pasos([
      "Asegúrate de que la persona ya tiene cuenta en Daybook Asistencia: la cuenta se crea fuera de esta aplicación.",
      "En <strong>Accesos</strong>, escribe su correo, elige el rol (Miembro o Administrador) y pulsa <strong>Dar acceso</strong>.",
      "Prueba que pueda entrar.",
    ])),
    col("Quitar o cambiar", lista([
      "<strong>Quitar acceso</strong> no borra a nadie: la persona queda <em>Desactivada</em> y se puede <strong>Reactivar</strong>.",
      "<strong>Hacer administrador</strong> y <strong>Quitar administrador</strong> cambian quién maneja esta lista.",
      "Nadie puede quitarse su propio acceso ni su propio rol de administrador, y siempre queda al menos un administrador.",
    ]))) +
  nota("Qué ve cada rol", "Los <strong>miembros</strong> trabajan con personas, viajes y costos. Solo los <strong>administradores</strong> ven Accesos, agregan o desactivan documentos exigidos y leen el historial de accesos.") +
  nota("Quiénes tienen acceso", "La lista vigente está siempre en la pantalla Accesos. Esta guía no la repite para que no quede desactualizada ni circule con correos de personas.", "aviso"))

pagina("Trabajo diario", "Cómo proponemos organizarnos",
  "Si seguimos el mismo orden, evitamos solicitar dos veces un pasaje o dejar datos incompletos.",
  dos(
    col("Al comenzar el día", pasos([
      "Revisemos <strong>Por comprar ahora</strong>, Próximo movimiento y Pendientes de confirmación.",
      "Preparemos y enviemos las solicitudes pendientes.",
      "Cuando llegue la confirmación, registremos PNR, vuelo, monto y estado Emitido.",
      "Después del viaje, cambiemos el estado a Completado, Anulado o No presentado.",
      "Si algo no calza, revisemos el historial antes de corregirlo.",
      "Una vez por semana, cerremos los <strong>viajes sin cerrar</strong> y miremos <strong>Actividad</strong>.",
    ])),
    col("Para coordinarnos", lista([
      "Antes de editar un viaje, revisemos que nadie más esté trabajando en él.",
      "Dejemos observaciones concretas y expliquemos cada cambio.",
      "Cada una ve la misma agenda y los mismos datos.",
      "Si alguien deja de usar Daybook Travel, un administrador desactiva su acceso.",
    ]))))

pagina("Para terminar", "Qué está listo y qué viene después",
  "Este resumen deja claro con qué contamos hoy y qué queda para más adelante.",
  dos(
    col("Lo que ya podemos usar", lista([
      "Agenda mensual y semanal, con el detalle de cada día.",
      "Personas, rutas, turnos 4×3 y 10×10 generados desde la ficha.",
      "Estados, reservas, montos, costos e historial.",
      "Ventana de compra: lo urgente y lo vencido a la vista.",
      "Lista de solicitud con control de acreditación.",
      "Sincronización con Excel y administración de accesos.",
      "Actividad reciente, viajes sin cerrar, cierre en bloque y costos para Excel.",
    ])),
    col("Lo que queda para otra etapa", lista([
      "Avisos por correo de viajes urgentes sin PNR: ya está hecho, falta configurar el correo.",
      "Consulta de precios de aerolíneas en tiempo real.",
      "Compra o emisión directa de pasajes.",
      "Envío automático a la agencia.",
    ]))) +
  f'<div class="cierre"><small>Abrir Daybook Travel</small><strong>{URL}</strong><span>Agenda · Personas · Viajes · Costos</span></div>')

# ---------------------------------------------------------------- HTML
total = len(paginas) + 1

css = """
@page { size: A4; margin: 0; }
:root { --ink:#11120f; --gold:#d99b27; --gold-ink:#7a5200; --bg:#f7f8f9; --line:#d9dbdc; --muted:#5f6058; --soft:#eef0f1; --four:#c95728; --ten:#2177c6; }
* { box-sizing: border-box; margin: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Inter", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif; color: var(--ink); background: #fff; font-size: 11.5pt; line-height: 1.5; }
.page { width: 210mm; height: 297mm; padding: 16mm 18mm 14mm; position: relative; page-break-after: always; break-after: page; display: flex; flex-direction: column; overflow: hidden; background: #fff; }
.page:last-child { page-break-after: auto; break-after: auto; }
.tope { display: flex; justify-content: space-between; align-items: center; padding-bottom: 5mm; border-bottom: 1px solid var(--line); margin-bottom: 6mm; font-size: 8pt; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); font-weight: 650; }
.tope img { height: 8mm; }
.pie { margin-top: auto; padding-top: 4mm; flex: none; border-top: 1px solid var(--line); display: flex; justify-content: space-between; font-size: 8pt; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.seccion { font-size: 8.5pt; letter-spacing: .12em; text-transform: uppercase; color: var(--gold-ink); font-weight: 750; }
h1 { font-size: 23pt; line-height: 1.12; letter-spacing: -.03em; margin: 2mm 0 3mm; }
h2 { font-size: 13pt; letter-spacing: -.02em; margin: 5mm 0 2.5mm; }
h3 { font-size: 10.5pt; margin-bottom: 2mm; letter-spacing: -.01em; }
.intro { color: var(--muted); font-size: 11pt; margin-bottom: 5mm; max-width: 150mm; }
p { margin: 0 0 2mm; }
.dos { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin-bottom: 3mm; }
.col { border: 1px solid var(--line); border-radius: 3mm; padding: 4mm 4.5mm; background: var(--bg); }
.col p { font-size: 10.5pt; }
.lista { list-style: none; padding: 0; display: grid; gap: 1.6mm; font-size: 10.3pt; }
.lista li { position: relative; padding-left: 5mm; }
.lista li::before { content: ""; position: absolute; left: 0; top: 2.4mm; width: 2mm; height: 2mm; border-radius: 50%; background: var(--gold); }
.pasos { list-style: none; padding: 0; display: grid; gap: 2.5mm; margin-bottom: 4mm; }
.pasos li { display: grid; grid-template-columns: 7mm 1fr; gap: 3mm; align-items: start; font-size: 10.5pt; }
.pasos li span { width: 7mm; height: 7mm; border-radius: 50%; background: var(--ink); color: #f3efe4; display: inline-flex; align-items: center; justify-content: center; font-size: 8.5pt; font-weight: 750; margin-top: .4mm; }
.pasos li p { margin: 0; padding-top: .9mm; }
.nota { border-left: 1.2mm solid var(--gold); background: #fbf6ea; border-radius: 0 3mm 3mm 0; padding: 3.2mm 5mm; margin: 3mm 0; }
.nota.aviso { background: var(--soft); border-left-color: var(--ink); }
.nota > strong { display: block; font-size: 10.5pt; margin-bottom: 1mm; }
.nota p { margin: 0; font-size: 10.5pt; }
.tarjetas { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 5mm; margin-bottom: 5mm; }
.tarjeta { border: 1px solid var(--line); border-radius: 3mm; padding: 5mm; background: #fff; }
.tarjeta small { display: block; font-size: 8pt; letter-spacing: .1em; text-transform: uppercase; color: var(--gold-ink); font-weight: 750; margin-bottom: 1.5mm; }
.tarjeta h3 { font-size: 12pt; }
.tarjeta p { font-size: 10pt; color: var(--muted); margin: 0; }
.flujo { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3mm; margin: 3mm 0 5mm; }
.flujo div { text-align: center; padding: 4mm 2mm; border: 1px solid var(--line); border-radius: 3mm; background: var(--bg); }
.flujo span { display: inline-flex; width: 7mm; height: 7mm; border-radius: 50%; background: var(--ink); color: #f3efe4; align-items: center; justify-content: center; font-size: 8.5pt; font-weight: 750; margin-bottom: 2mm; }
.flujo strong { display: block; font-size: 10pt; }
.flujo small { display: block; font-size: 8.5pt; color: var(--muted); line-height: 1.3; margin-top: 1mm; }
table.estados { width: 100%; border-collapse: collapse; margin-bottom: 5mm; font-size: 10.5pt; }
table.estados td { padding: 3mm 3mm; border-bottom: 1px solid var(--line); vertical-align: middle; }
table.estados td:first-child { width: 38mm; }
table.estados td:last-child { text-align: right; color: var(--muted); font-size: 9.5pt; width: 40mm; }
.pill { display: inline-block; padding: 1mm 3.5mm; border-radius: 99px; font-size: 9pt; font-weight: 700; border: 1px solid var(--line); background: var(--soft); }
.pill.s { background: #fdf2e0; border-color: #ecc98a; color: #7a5200; }
.pill.e { background: #e3f3ec; border-color: #9bd0b8; color: #187a55; }
.pill.c { background: #e6eef8; border-color: #a9c6e6; color: #2177c6; }
.pill.a { background: #f1e7e4; border-color: #d6b8b0; color: #8a3b28; }
.pill.n { background: #f6e4e4; border-color: #e0a9a9; color: #a42d2d; }
.cierre { margin-top: 6mm; padding: 6mm; border-radius: 3mm; background: var(--ink); color: #f3efe4; display: grid; gap: 1mm; }
.cierre small { font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; color: var(--gold); font-weight: 750; }
.cierre strong { font-size: 15pt; letter-spacing: -.01em; }
.cierre span { font-size: 9.5pt; color: #cfcab8; }
.portada { background: var(--ink); color: #f3efe4; padding: 18mm; }
.portada .tope { color: #a8a496; border-color: #34352d; }
.portada .centro { margin: auto 0; }
.portada .logo { height: 24mm; margin-bottom: 22mm; }
.portada h1 { font-size: 37pt; line-height: 1.06; letter-spacing: -.04em; max-width: 150mm; color: #f3efe4; margin: 4mm 0 8mm; }
.portada .bajada { font-size: 13pt; color: #cfcab8; max-width: 135mm; }
.portada .etiqueta { display: inline-block; padding: 1.5mm 4mm; border: 1px solid var(--gold); border-radius: 99px; color: var(--gold); font-size: 8.5pt; letter-spacing: .12em; text-transform: uppercase; font-weight: 750; }
.portada .datos { display: flex; justify-content: space-between; padding-top: 6mm; border-top: 1px solid #34352d; font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; color: #a8a496; }
.portada .enlace { margin-top: 10mm; font-size: 11pt; color: var(--gold); }
"""

salida = ['<!doctype html><html lang="es"><head><meta charset="utf-8">',
          '<meta name="viewport" content="width=device-width, initial-scale=1">',
          '<title>Guía de uso · Daybook Travel</title>',
          f'<style>{css}</style></head><body>']

salida.append(f'''<section class="page portada">
  <div class="tope"><span>Daybook Travel / Copiapó</span><span>Guía de uso / versión {VERSION}</span></div>
  <div class="centro">
    <img class="logo" src="{'../../public/brand/daybook-travel-logo-on-dark.svg'}" alt="Daybook Travel">
    <span class="etiqueta">Para Katy y Tamara</span>
    <h1>Cómo vamos a organizar los viajes del proyecto.</h1>
    <p class="bajada">Esta guía deja en un solo lugar cómo llevar las personas, los turnos y los pasajes en Daybook Travel.</p>
    <p class="enlace">{URL}</p>
  </div>
  <div class="datos"><span>Preparado por Joaquín</span><span>{FECHA} / versión {VERSION}</span></div>
</section>''')

for i, (seccion, titulo, intro, cuerpo) in enumerate(paginas, 2):
    salida.append(f'''<section class="page">
  <div class="tope"><img src="../../public/brand/{MARCA}" alt="Daybook"><span>Daybook Travel / Copiapó</span></div>
  <span class="seccion">{e(seccion)}</span>
  <h1>{e(titulo)}</h1>
  <p class="intro">{e(intro)}</p>
  {cuerpo}
  <div class="pie"><span>Guía de uso · versión {VERSION}</span><span>{i:02d} / {total:02d}</span></div>
</section>''')

salida.append("</body></html>")
open(SALIDA, "w", encoding="utf-8").write("\n".join(salida))
print(f"{total} páginas -> {SALIDA}")
