# Operación técnica · Semana 1

## Entorno

Stellar Testnet y Neon dev ep-lingering-water-ahzh89z5 con SSL. PDF/PNG/JPEG cifrados hasta 3.000.000 bytes originales. Cada versión usa clave aleatoria y blinding privado, protegidos por KEK versionada fuera de Neon. Sin cambios de configuración en main o Vercel.

## Lectura y auditoría

Comandos:

- node scripts/deploy-clinical-testnet.mjs --preflight
- node scripts/deploy-clinical-testnet.mjs --audit
- node --env-file=.env.local scripts/validate-clinical-testnet.mjs --readback
- node --env-file=.env.local scripts/clinical-lock-smoke.mjs

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

## Validación

npm test; npm run test:private; npx tsc --noEmit; npm run build.

Contratos: cargo test --locked --manifest-path contracts/Cargo.toml --workspace y stellar contract build --manifest-path contracts/clinical-history-private/Cargo.toml.

Comparar hash WASM/manifiesto. CI no despliega ni escribe en Neon/Testnet. Resultados locales, SQL real y recibos reales permanecen distinguidos en VALIDACION-2026-10-05.md.
