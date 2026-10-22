# Instrucciones para el agente de la notebook

Continuá únicamente el proyecto `ficha-onchain` de https://github.com/CaBsCrypto/ficha-onchain. El repositorio es público. Rama de migración exacta: `codex/migracion-ficha-onchain-2026-10-22`; origen `codex/clinical-recording-mode`, SHA `66c4deff76b8837628714f5890e41f4ad773c705`.

## 1. Recibir sin sobrescribir trabajo

Primero comprobá en el resumen del agente emisor si la publicación fue VERIFICADA y anotá el SHA final indicado allí. Si figura NO REALIZADA, esta rama todavía no se puede clonar desde GitHub: resolver el bloqueo con el emisor. No sustituirla por `main` ni por una rama parecida.

En una carpeta nueva elegida por el usuario, sin contenido existente:

```powershell
git clone --no-checkout --branch codex/migracion-ficha-onchain-2026-10-22 --single-branch https://github.com/CaBsCrypto/ficha-onchain.git ficha-onchain-notebook
cd ficha-onchain-notebook
git rev-parse HEAD
git show HEAD:README-MIGRACION.md
git show HEAD:INVENTARIO-MIGRACION.md
git show HEAD:.gitattributes
git config --show-origin --get-regexp '^(core\.hooksPath|filter\.|init\.templateDir)'
```

Compará `git rev-parse HEAD` con el SHA final del resumen ANTES del checkout. Revisá hooks/filtros/plantillas locales; si hay automatizaciones desconocidas, no ejecutarlas ni eludir políticas obligatorias. El árbol recibido no requiere LFS ni submódulos según la auditoría del emisor. Una vez verificado, `git checkout` materializa la rama actual. No ejecutar scripts durante esta lectura.

Un clon de una sola rama no trae las demás: habrá que solicitarlas explícitamente. En un clon existente, primero revisar raíz, origin, `git status`, ramas y trabajo local; no hacer reset, clean, stash ni checkout que sobrescriba cambios. Si hace falta, usar otra carpeta nueva.

Revisar README-MIGRACION, este prompt, inventario y `MANIFIESTO-MIGRACION.json`. Verificar cada SHA-256 contra los bytes del blob Git de su ruta, no contra un checkout CRLF sin normalización. El manifiesto excluye sólo su propia ruta; sus entradas deben coincidir exactamente con el resto del árbol. No dar por recibidos archivos excluidos ni ramas locales que nunca se publicaron.

## 2. Recuperar configuración sin perder las wallets

No asumir que iniciar sesión con la misma cuenta configura servicios, bases, claves ni almacenes locales. Recuperar las credenciales mediante un canal privado autorizado; nunca desde texto en GitHub o el chat.

Las wallets Testnet deben conservar las mismas claves y direcciones. Si se entregó un paquete cifrado, verificar su hash y la herramienta de recuperación antes de abrirlo. Obtener la clave de apertura por separado; no guardarla en Git, logs ni mensajes. No ejecutar una importación automática, no generar wallets sustitutas y no fondear ni firmar hasta verificar offline las direcciones derivadas. Un archivo DPAPI original por sí solo no se abre en otra PC: requiere recuperación portátil autorizada desde el usuario Windows original.

Recuperar también las claves de cifrado históricas (`TRUSTLEAF_DATA_KEY`, `TRUSTLEAF_CLINICAL_KEYRING`, ID activo), pepper y secretos de autenticación necesarios. No regenerarlos para forzar el arranque. No existe garantía de recuperación de datos cifrados si falta una clave histórica.

Crear `.env.local` a partir de `.env.example` sólo con autorización local. Configurar Neon de prueba separado; no usar producción ni cambiar la rama local a producción. `TRUSTLEAF_DATABASE_URL` definida vacía anula el fallback; el worker usa `DATABASE_URL` directamente. Verificar mismo entorno seguro antes de operarlo. No exportar datos de pacientes desde la PC original ni restablecer bases.

Mantener flags de escrituras, migraciones y demos apagados. No copiar autorizaciones temporales `CREATE_ONCE`, `HOSTED_CREATE_ONCE` ni `PATIENT_DEMO`. Configurar un nuevo `STELLAR_CONFIG_DIR` local y el alias correcto con las mismas claves recuperadas; revisar validadores que conservan fallbacks a `C:/Users/MGC/.config/stellar`.

## 3. Instalar y validar sólo con autorización en la notebook

Leer `AGENTS.md` y las guías de Next en `node_modules/next/dist/docs/` antes de editar código Next. Esta recepción no autoriza instalaciones, migraciones ni firmas. Con autorización y desde la raíz nueva:

```powershell
npm ci
npx tsc --noEmit --incremental false
npm test
npm run test:private
npm run build
npm run dev -- --hostname 127.0.0.1 --port 3016
```

Requisitos: Node 22.x; conservar lockfile y `.npmrc`. `npm ci` descarga dependencias y crea/reemplaza `node_modules`; `npx` sin dependencias puede descargar herramientas. Build escribe `.next` y puede descargar fuentes Google. Dev escribe cachés; abrir rutas puede llamar a Privy, Neon, Stellar y CDN. Coordinar el puerto con otras sesiones. URL local: http://127.0.0.1:3016.

Para contratos, sólo si es necesario y autorizado: Rust 1.96.0, Stellar CLI 27.0.0, target `wasm32v1-none`; `cargo test --locked --manifest-path contracts/Cargo.toml --workspace`. Desde `contracts/`, `stellar contract build` compila sin desplegar; puede descargar dependencias y escribir artefactos. Hay tres contratos privados activos, no el inventario antiguo del README. Los hashes WASM pueden diferir entre Windows/Linux.

No ejecutar automáticamente `scripts/migrate.mjs` (escribe esquema), `worker-private-portal.mjs --watch` (DB y posibles firmas/transmisiones), validadores Testnet ni `validate:clinical:web:testnet -- --inspect`: incluso ese modo inicia autenticación/journal y sus GET pueden persistir vínculos/reconciliación. `npm run test:onchain` es legado y no demuestra el historial clínico privado actual.

Checklist de aceptación que debe registrar evidencia nueva sin datos reales:

- [ ] SHA y manifiesto recibidos coinciden; archivos previstos presentes.
- [ ] Configuración privada recuperada, mismo entorno de prueba y mismas wallets verificadas offline.
- [ ] Typecheck, suites autorizadas y build correctos.
- [ ] App local abre sin errores relevantes; login Privy y portales de roles autorizados funcionan.
- [ ] Flujo principal: paciente sintético, lectura de historia clínica/recetas y controles de permisos; verificación de que otro actor no ve datos ajenos.
- [ ] Body map y assets locales/CDN cargan correctamente.
- [ ] Si se autoriza una escritura Testnet, realizar una operación sintética acotada y verificar recibo/readback. No reutilizar una operación incierta ni crear otra historia por probar.
- [ ] Repetir el flujo con la PC original apagada o desconectada, manteniendo internet para servicios remotos; no depender de su worker, túnel, rutas ni almacén Windows.

La migración no queda probada hasta completar y verificar el flujo en la notebook. Una preview requiere autorización separada y no reemplaza esta validación local.

## 4. Continuar trabajo e integrar después

Desde la rama recibida, crear una rama nueva de continuación, por ejemplo `git switch -c codex/continuacion-notebook-2026-10-22`. Comprobar antes que el nombre esté libre. Mantener trazable la rama de migración y la de trabajo posterior; hacer commits/pushes cuando estén autorizados. No modificar el respaldo original.

Una rama no se conecta a `main` por iniciar sesión. Comparte historial cuando corresponde; incorporar trabajo requiere revisión y merge. Confirmar la rama predeterminada real con `git ls-remote --symref origin HEAD` (el emisor verificó `main`; no renombrarla). Para traer explícitamente esa rama en el clon de una sola rama:

```powershell
git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main
git merge-base origin/main HEAD
git log --oneline --left-right origin/main...HEAD
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
```

Fetch trae referencias y objetos sin mezclar archivos. Un merge sí modifica archivos y puede producir conflictos; no ejecutarlo automáticamente. No rebase destructivo ni force-push.

El futuro PR deberá usar base `main` (o la predeterminada comprobada) y compare la migración o la continuación elegida. Revisar diferencias reales, commits, checks, conflictos, información privada y posibles deployments antes de publicarlo. Cada PR requiere autorización separada; si se autoriza sin otra indicación, crearlo como borrador. Nunca push directo a `main`, auto-merge ni merge automático. No cambiar CI/hosting/protecciones para sortear el efecto Vercel.
