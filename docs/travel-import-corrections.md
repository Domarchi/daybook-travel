Importación Excel: contrato y verificación segura del carril A

El libro .xlsx se lee localmente y no se sube ni se encola al seleccionarlo. La pantalla de mapeo permite elegir hoja, entidad y fila, y renombrar cada etiqueta. La representación entre comillas muestra exactamente los strings que recibiría IA, incluidos espacios y saltos de línea. Para IA se requiere seleccionar explícitamente la fila y confirmar que las etiquetas son nombres de columnas y no datos personales. Seleccionar otra hoja/fila/entidad, renombrar o desmarcar la confirmación descarta la propuesta pendiente; las respuestas tardías se ignoran. Los mapeos ya revisados se conservan por hoja para reunir ambas entidades en una vista previa. El modo manual funciona sin confirmar y sin RPC de IA; aplicar desde la vista previa es una acción separada.

Los filtros locales bloquean emails y RUT evidentes en etiquetas, también en el constructor del payload. No detectan todo dato personal: nombres y etiquetas arbitrarias requieren revisión humana. Los campos headers son etiquetas Unicode; nunca son muestras de celdas sin máscara. El payload de IA contiene exclusivamente schema, entity, headers y samples, sin libro, nombre del archivo, nombre de hoja ni números de fila.

Límites: 1..40 encabezados únicos, 1..80 bytes UTF-8 por encabezado; 0..3 muestras, ancho igual al número de encabezados y 0..24 bytes UTF-8 por celda. TS usa TextEncoder; SQL 009 usa octet_length. No se recortan encabezados. Las celdas se normalizan NFC, se recorren por code point y se transforman a ASCII antes de recortar a 24 bytes: letras x/X según caja, números Unicode 9, whitespace espacio ASCII, marcas combinantes restantes eliminadas, puntuación ASCII imprimible conservada y todo otro carácter ?. El validador admite sólo U+0020..U+007E y rechaza letras distintas de x/X y dígitos distintos de 9. SQL usa COLLATE "C" con rangos ASCII explícitos, sin clases POSIX Unicode. El archivo compartido fixtures/travel-import-contract.json contiene emojis, letras descompuestas, tildes, ñ, ², dígitos árabes, tabulador, salto de línea y NBSP para reutilizar en B. El límite de carga es 5000 filas por hoja y por entidad combinada, incluso en libros con varias hojas de la misma entidad.

Inventario previo: package.json contiene test:browser (scripts/browser-login.mjs), test:browser:recovery y scripts/travel-agent-confirmation-browser.mjs. Este último usa Chrome/Chromium local + CDP/WebSocket de Node, crea una ruta de Next y exige sockets loopback, un perfil de Chrome escribible y subprocesses. No cubría Excel ni RPC falso. No hay dependencia instalada declarada de Playwright/Puppeteer; se reutilizó el enfoque CDP. Dependencias reales locales: Node24.19.0, Next16.3.6, React19.2.8, read-excel-file5.8.0, write-excel-file2.3.10, TypeScript7.0.2. Chrome encontrado en /Applications/Google Chrome.app/Contents/MacOS/Google Chrome. Los permisos de browser/sockets no fueron sondeados: la asignación prohíbe iniciar Next/browser pesado aquí. Browser sigue NOT RUN.

Harness creado: scripts/travel-excel-import-browser.mjs; fixtures scripts/fixtures/excel-import-page.tsx y travel-import-fake.ts. --prepare-only genera un snapshot acotado de fuentes en un directorio nuevo browser-import-* bajo TRAVEL_IMPORT_ARTIFACTS, dos libros XLSX reales y un manifiesto SHA256. No modifica las fuentes de la worktree. No copia .env ni credenciales; sustituye lib/supabase.ts únicamente dentro del proyecto fixture por db() que lanza REAL DATABASE FORBIDDEN. Next recibe un entorno mínimo, sin variables Supabase. node_modules se enlaza para usar dependencias ya instaladas. El perfil Chrome es nuevo y separado. El harness intercepta red browser y rechaza todo origen diferente al loopback del fixture.

Contrato fake: request_trip_import_mapping registra el payload completo y devuelve UUID sintético; get_trip_ai_request devuelve una propuesta cerrada de campos permitidos; sync_excel_batch valida arrays/límite y devuelve un recibo sintético en memoria. Toda RPC distinta falla. No existe login, usuario, transporte Supabase, worker ni inferencia real en este recorrido. Los tests Node también ejecutan una respuesta maliciosa campoSecreto y verifican el rechazo.

La ejecución browser realiza 8 escenarios (manual/IA × preámbulo/libro mixto × 390/1440 píxeles): DOM.setFileInputFiles carga XLSX real; verifica cero RPC antes de selección/confirmación; selecciona fila; renombra; mapea manualmente o confirma y solicita IA; compara el RPC entero; modifica etiquetas y verifica revocación; reúne Personas/Viajes; aplica al fake; verifica filas, relación por código y recibo. En libro mixto comprueba además que cambiar entidad cambia las etiquetas/matriz. Guarda JSON de RPCs y PNG de revisión, vista previa y resultado, junto con logs Next/Chrome. No se ha ejecutado este recorrido browser en el sandbox. --prepare-only y node --check no acreditan browser.

Comandos exactos para el padre, desde la worktree candidata, con fuentes congeladas:

```sh
cd /Users/domarchimac/Developer/fcc-travel/.worktrees/travel-ia-cola-20261011
export TRAVEL_IMPORT_ARTIFACTS=/Users/domarchimac/Developer/travel-cola-runs/sol-correcciones/A
/Users/domarchimac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --experimental-strip-types scripts/travel-excel-import-browser.mjs --prepare-only
/Users/domarchimac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --experimental-strip-types scripts/travel-excel-import-browser.mjs
```

TRAVEL_IMPORT_ARTIFACTS debe ser un directorio absoluto existente y escribible. TRAVEL_IMPORT_CHROME_PATH es opcional y sólo admite las rutas allowlisted de Chrome/Chromium del script. No añadir variables Supabase. Conservar browser-import-* como evidencia sintética; el script detiene sólo sus subprocesses y no borra los artefactos. Si hay denegación de socket/browser, registrar NOT RUN con stderr; no escalar ni cambiar configuración.

Gates dirigidos:

```sh
/Users/domarchimac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --experimental-strip-types --test --test-timeout=30000 lib/excel-import-corrections.test.ts lib/excel-sync-panel.test.ts lib/travel-import-mapping.test.ts lib/travel-ai-queue.test.ts lib/travel-ai-queue-migration.test.ts lib/excel-sync.test.ts lib/travel-ai-queue-ui.test.ts
/Users/domarchimac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc --noEmit --incremental false
```

El driver lib/excel-panel-test-driver.ts compila el panel real con Babel incluido en Next y ejecuta sus handlers con hooks/JSX simulados. Lee XLSX reales con read-excel-file/node. Es integración Node; no es DOM/browser. Las aserciones SQL de lib/travel-ai-queue-migration.test.ts son inspección estática, no ejecución PostgreSQL.

SQL puro para el padre:

```sh
/Users/domarchimac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --experimental-strip-types scripts/travel-import-sql-check.mjs --emit-only
/Users/domarchimac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --experimental-strip-types scripts/travel-import-sql-check.mjs --docker-pg18
```

--emit-only genera travel-import-validator.sql y travel-import-sql-vectors.json, sin abrir DB. --docker-pg18 requiere Docker permitido y la imagen postgres:18 ya disponible (--pull=never); crea un contenedor propio sin red ni puertos publicados, verifica versión 18 y UTF8, ejecuta sólo el validador puro de 009 con 37 casos y hace rollback. No usa URL/credenciales de una DB existente ni aplica 009 a Supabase. El contenedor propio se elimina al terminar. PostgreSQL18 y migración completa/roles/RLS reales siguen NOT RUN; la migración 009 permanece sin aplicar.

Fuente congelada para revisión del padre después de los gates nativos finales. Sin commit, push, edición PR, merge ni deploy. La verificación de identidad/permisos reales de worker y el carril B quedan fuera de esta entrega.
