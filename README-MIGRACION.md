# Continuidad de ficha-onchain en otra PC

Preparado el 22 de octubre de 2026. Esta documentación describe una copia de migración, no una entrega probada en la notebook.

## Procedencia y destino

- Repositorio verificado mediante GitHub y Git: https://github.com/CaBsCrypto/ficha-onchain (público; propietario `CaBsCrypto`; permisos de lectura/escritura/admin comprobados).
- Origin autorizado: `https://github.com/CaBsCrypto/ficha-onchain.git`.
- Rama predeterminada remota comprobada: `main`, en `d96425dd3467cde74b60caf54f94e9291fc26564` durante la preparación. El `main` local estaba desactualizado; no fue cambiado.
- Rama de trabajo de origen: `codex/clinical-recording-mode`.
- SHA exacto de origen: `66c4deff76b8837628714f5890e41f4ad773c705`. El remoto homónimo tenía exactamente ese SHA. No había commits de esta rama pendientes de envío.
- Rama principal de migración: `codex/migracion-ficha-onchain-2026-10-22`, creada desde ese SHA real, sin mezclar `main`.
- Original: `C:/Users/MGC/Desktop/Dev/ficha-onchain`; repositorio normal, con `.git` propio, no un worktree enlazado.
- Copia aislada: `C:/Users/MGC/.codex/visualizations/2026/10/22/01a16228-8558-7453-84be-76ff36deffcb/ficha-migration-20261022-01/prepared`.

El SHA final debe obtenerse del resumen de entrega y comprobarse con `git rev-parse HEAD`; este archivo no contiene ni pretende predecir el hash del commit que lo incluye.

## Estado de preparación

**Publicación: NO REALIZADA al preparar estos documentos. Continuidad: BLOCKED para reproducción completa del entorno privado; código NOT VERIFIED en la notebook.**

Vercel está integrado con el repositorio (`trustleaf-demo`). El commit de origen tiene un check Vercel exitoso. Los filtros remotos de ramas no pudieron leerse: el conector respondió 403. Un push de esta rama podría producir un preview. El usuario no autorizó deployments; no se debe publicar hasta resolver expresamente ese efecto. No se cambiaron CI, hosting, protecciones ni permisos para evitarlo.

El usuario autorizó un paquete cifrado de las claves de wallets Testnet **sólo local, para traslado privado**. El paquete y su clave de apertura separada quedan fuera de esta copia Git y no se subirán a GitHub. El informe privado de recuperación distingue las wallets incluidas de cualquier identidad pendiente. No sustituir las wallets por otras para conseguir que arranque. Las claves de cifrado de datos de la aplicación no están incluidas en esa autorización de claves de wallets y continúan como dependencia privada separada.

El paquete privado se completó: trece wallets distintas de dieciséis referencias, incluidas las cuatro identidades del almacén seguro de Windows; siete frases de recuperación. Una verificación independiente offline comprobó autenticación del cifrado, direcciones derivadas, frases y rechazo de clave incorrecta/paquete alterado. No se generaron wallets, no se alteró el almacén y no hubo firmas/transmisiones. Esto no prueba todavía la recepción en la notebook.

No se ejecutaron instalaciones, aplicaciones, scripts del proyecto, tests, builds, migraciones de base, worker, firmas ni operaciones on-chain. Un clon recuperable no prueba el funcionamiento en otra PC.

## Trabajo incorporado y exclusiones

La selección conserva siete scripts locales nuevos, sin alterar su lógica ni sus bytes, y documentación local seleccionada. La documentación copiada se saneó para quitar identificadores personales y enlaces a documentos restringidos; las notas añadidas explican la procedencia y la evidencia ausente. Las versiones originales siguen intactas en la PC original.

Se excluyeron del cambio de migración:

- `docs/proposals/sow-cycle-2/`: propuesta y presupuesto comerciales sin autorización de publicación pública.
- Las 26 evidencias locales nuevas bajo `docs/evidence/` y la modificación local de `docs/evidence/sow2-week1-2026-10-05/readback.json`: vinculaciones de identidades/recibos y material de auditoría. Si el archivo ya estaba en Git, la rama conserva su versión de origen.
- `.env.local`, valores de la plantilla local anterior, `.claude/settings.local.json`, `.vercel/`, logs de autorización y `.trustleaf-local/`: configuración, credenciales y continuidad operativa privada.
- Dependencias instaladas, `.next/`, salidas Rust, snapshots y grafos generados. No se necesita copiarlos para preservar fuentes.

No se exportaron bases, datos reales de pacientes ni claves a Git. `.env.example` es una plantilla nueva con nombres y placeholders; está añadida explícitamente pese a la regla `.env*` de `.gitignore`.

`INVENTARIO-MIGRACION.md` registra 94 ramas locales, seis worktrees y once stashes. Las rutas externas de worktrees sólo se inventariaron por metadatos: su árbol e índice no se inspeccionaron. Las ramas se mantienen separadas. Los stashes se inspeccionaron sin aplicarlos ni eliminarlos: su contenido se corresponde con versiones ya presentes en el árbol original; no se recuperaron como tareas nuevas.

Se preservaron en la copia aislada 14 referencias auxiliares `codex/migracion-ficha-20261022/<tarea>`, con los tips originales exactos y 17 commits distintos de trabajo local auditado. No agregan documentos ni combinan tareas; el inventario central de esta rama contiene su procedencia. Cuatro ramas adicionales quedan fuera de publicación por identidades vinculadas a evidencia o propuestas internas; no basta borrar el dato del último árbol porque permanecería en sus commits anteriores. No se reescribió ninguno de esos historiales.

`MANIFIESTO-MIGRACION.json` enumera rutas y SHA-256 de los archivos del árbol de entrega, excluyendo el propio manifiesto y metadatos Git. Sus hashes se calculan sobre los bytes almacenados en Git; un checkout con conversión CRLF puede presentar bytes de trabajo distintos. Las evidencias históricas conservan sus propios manifiestos anteriores, que no certifican las copias de documentos saneadas.

`SELECCION-MIGRACION.json` detalla las rutas incorporadas, excluidas y saneadas sin revelar el contenido retirado.

## Herramientas y assets

- PC original: Windows x64. Node 22.x según CI; conservar `package-lock.json` v3 y `.npmrc` (`legacy-peer-deps=true`).
- Lock actual: Next 16.2.10, React 19.2.4, TypeScript 5.9.3, Stellar SDK 14.6.1, Vitest 4.1.10, Neon 1.1.0, Privy React 3.40.0 y servidor 1.32.5.
- Contratos activos: `doctor-registry-private`, `prescription-private`, `clinical-history-private`, definidos en `contracts/Cargo.toml`. Algunos documentos antiguos aún describen otros contratos; comprobar el código vigente.
- Rust 1.96.0 (`contracts/rust-toolchain.toml`), Stellar CLI 27.0.0 y target `wasm32v1-none`. No usar `wasm32-unknown-unknown`. La reproducción del WASM desplegado puede depender de Windows; no asumir igualdad de hashes entre sistemas operativos.
- Asset `public/models/body_1k.glb`: 4.903.236 bytes, presente en Git. Otros assets versionados permanecen en el árbol. BodyMap3D además requiere scripts CDN y conexión de red.
- No se detectaron submódulos, symlinks ni rutas con atributo LFS. El sistema tiene filtros LFS globales, pero el árbol no los usa. El historial de origen no contiene blobs de 100 MiB o más. `git fsck --connectivity-only` pasó en la copia.
- No se detectaron dependencias npm `file:`, `link:`, `workspace:` ni `git+`. No hay servicio Docker obligatorio identificado. No se inspeccionaron otras carpetas de proyectos.

## Configuración y claves que Git no recupera

Los flujos privados dependen de Neon PostgreSQL, Privy y Stellar Testnet. Google OAuth/Meet, Resend y Anthropic se necesitan sólo para sus integraciones específicas. No dar por configurado nada por usar la misma cuenta en la notebook.

Recuperar por canal privado las variables necesarias de `.env.example`, sin pegar valores en chat. La aplicación prioriza `TRUSTLEAF_DATABASE_URL` si la variable está definida, incluso vacía; después usa `DATABASE_URL`. El worker usa directamente `DATABASE_URL`. Preparar un entorno de prueba separado y comprobar que ambos apuntan al mismo entorno. Los previews pueden compartir producción: no validar escribiendo allí.

Conservar `TRUSTLEAF_DATA_KEY`, el mapa `TRUSTLEAF_CLINICAL_KEYRING` completo (incluidas claves históricas necesarias), `TRUSTLEAF_CLINICAL_ACTIVE_KEY_ID`, `TRUSTLEAF_RUT_PEPPER`, `JWT_SECRET` y credenciales específicas de las funciones utilizadas. Regenerarlas puede impedir descifrar datos existentes. Esta preparación no prueba su recuperación portátil.

`scripts/lib/clinical-local-secrets.mjs` utiliza Windows DPAPI, `CurrentUser` y `powershell.exe`. Copiar `secrets.dpapi` o `secrets.backup.dpapi` a otra PC no basta para descifrarlos. Los secretos locales de paciente/deployer y el keyring deben tratarse por un procedimiento privado autorizado. El almacén de Stellar CLI y sus aliases tampoco se clonan con Git; conservar las identidades concretas y sus claves, sin crear reemplazos.

Algunos validadores históricos usan `C:/Users/MGC/.config/stellar` como fallback. Configurar `STELLAR_CONFIG_DIR` y `DOCTOR_REGISTRY_ADMIN_ALIAS` antes de usarlos en la notebook. No arrancar el worker hasta recuperar y verificar las claves, configurar datos de prueba y autorizar firmas/transmisiones.

La plantilla mantiene escrituras/migraciones/demos desactivadas y autenticación requerida. No heredar las familias `TRUSTLEAF_CLINICAL_CREATE_ONCE_*`, `TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_*` ni `TRUSTLEAF_CLINICAL_PATIENT_DEMO_*`: pueden habilitar excepciones aunque el interruptor general esté apagado.

## Automatizaciones y revisión futura

`ci.yml` se dispara por PR y push a `main`; `contracts.yml`, por PR/push a `main` con paths de contratos y por ejecución manual. Los archivos actuales no ejecutan esos workflows por un simple push a una rama nueva. Esto no desactiva la integración Vercel. No hay hooks locales activos ni webhooks tradicionales remotos identificados; las GitHub Apps actúan por separado.

`main` exige PR y check `typecheck + build`, también para admins; impide force-push y eliminación y exige resolver conversaciones. No se debe empujar directamente a `main`. No se creó PR, merge ni deployment como parte de esta preparación.

La revisión de secretos combina inspección de contenido e indicadores estáticos; no es una garantía absoluta. El SHA de origen ya era alcanzable en GitHub y aportaba cero commits nuevos. Antes de cualquier push revisar todos los commits nuevos de cada referencia y verificar que ninguna copia privada ni clave de apertura esté incluida.

Seguir `PROMPT-RECEPTOR.md` para recepción, validación autorizada y futura revisión por PR.
