# Operación técnica · Semana 1

## Entorno

Stellar Testnet y Neon dev ep-lingering-water-ahzh89z5 con SSL. PDF/PNG/JPEG cifrados hasta 3.000.000 bytes originales. Cada versión usa clave aleatoria y blinding privado, protegidos por KEK versionada fuera de Neon. Sin cambios de configuración en main o Vercel.

## Lectura y auditoría

Comandos:

- node scripts/deploy-clinical-testnet.mjs --preflight
- node scripts/deploy-clinical-testnet.mjs --audit
- node --env-file=.env.local scripts/validate-clinical-testnet.mjs --readback
- node --env-file=.env.local scripts/clinical-lock-smoke.mjs
- node --env-file=.env.local scripts/restore-clinical-testnet.mjs --inspect

readback requiere una demostración terminada. No crea, firma, transmite ni restaura. Los getters simulados no prolongan TTL real.

## Migración y escrituras

TRUSTLEAF_CLINICAL_MIGRATION=true habilita exclusivamente scripts/migrate.mjs --step=clinical-history-v1 en Neon dev. La migración general omite clínica. El mecanismo administrativo conserva autenticación y exige el mismo flag/host para las tablas nuevas.

TRUSTLEAF_CLINICAL_TESTNET_WRITES=true habilita deploy-clinical-testnet --deploy o validate-clinical-testnet --run. No repetir run sobre una demostración terminada; usar readback. No borrar journals ni sustituir un intento incierto por otro ID/firma. Primero reconciliar su hash. El runner permite retransmitir explícitamente el mismo sobre aún vigente.

Cada intento reserva la wallet antes de firmar; el sobre se persiste antes de transmitir. Una reserva preparada sin sobre requiere revisión tras un fallo. Un intento firmado sigue bloqueando hasta SUCCESS/FAILED comprobado. La pérdida de conexión o bloqueo detiene firmas y transmisiones.

Se usa conexión directa Neon y bloqueo de sesión private-user, compartido con recetas. La aplicación de recetas comprueba el journal clínico antes de preparar otra operación. No usar pooling transaccional para este bloqueo.

## Claves

La herramienta local guarda secrets.dpapi y secrets.backup.dpapi en .trustleaf-local/sow2-clinical, excluido de Git. Windows DPAPI exige la misma cuenta Windows. Se probó recuperación bajo esa cuenta; no es recuperación portable ni un gestor de claves de producción. Perder cuenta y respaldo puede impedir descifrar.

La rotación reenvuelve la clave sin cambiar el payload ni compromiso. Antes de cambiar de equipo o alojar el servicio, definir transferencia protegida y recuperación probada. Nunca incluir secretos o sobres en el paquete público.

Paciente/deployer son sintéticos nuevos y médico una identidad sintética ya autorizada. El challenge Ed25519 técnico no es login Privy ni se transmite a Stellar.

## TTL

Las operaciones reales extienden TTL de las claves alcanzadas. Simulaciones no lo persisten. Un estado archivado bloquea; no se interpreta como ausencia para recrear permisos. Restauración/mantenimiento exige footprints exactos, simulación, persistencia de sobre/hash y recibo auditado. No se acredita restauración real en esta entrega.

`restore-clinical-testnet.mjs --inspect` revisa únicamente las claves conocidas de la demostración; no firma, transmite ni modifica Neon. Al 5 de octubre, las 16 claves estaban disponibles. No se ha forzado su expiración.

`--restore` requiere `TRUSTLEAF_CLINICAL_TESTNET_WRITES=true`, host Neon dev y bloqueo directo por wallet. Conserva el plan en el journal local y el sobre firmado en Neon antes de transmitir. Si no hay claves faltantes ni intento previo, termina como `not_required`, sin transacción. Una respuesta incierta conserva el mismo intento; no borrar el journal. Tras SUCCESS se comprueban despliegue, revocación y los compromisos históricos. Los pendientes/errores no se describen como restaurados.

## Validación

npm test; npm run test:private; npx tsc --noEmit; npm run build.

Contratos: `cargo test --locked --manifest-path contracts/Cargo.toml --workspace` y `stellar contract build --locked --manifest-path contracts/clinical-history-private/Cargo.toml --out-dir contracts/dist-deployed`.

El despliegue y readback usan el WASM optimizado de `contracts/dist-deployed`, no el archivo intermedio de Cargo. Rust 1.96.0 y Stellar CLI 27.0.0 están fijados. CI Windows reproduce y compara el SHA desplegado; Linux genera otro hash. No se afirma reproducibilidad entre sistemas operativos.

Comparar hash WASM/manifiesto. CI no despliega ni escribe en Neon/Testnet. Resultados locales, SQL real y recibos reales permanecen distinguidos en VALIDACION-2026-10-05.md.
