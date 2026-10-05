# Semana 1 · Evidencia técnica

Rama: codex/sow2-clinical-foundation. Contrato desplegado y demostración técnica comprobada; CI y revisión pendientes. Sin fusión a main.

## Resultados

- Aplicación: 634 pruebas en 61 suites aprobadas.
- Servicios privados: 98 pruebas aprobadas.
- Contratos: 25 pruebas (14 clínicas, 4 registro médico y 7 recetas).
- TypeScript y build aprobados. Formato Rust normalizado; recompilación con el mismo WASM.
- WASM: 15.533 bytes; 29e5510efc758f66bebc44c156fe13fb288a2ef339159467dd787bf4231e1ce0.

## Evidencia real

Contrato CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U, vinculado al registro existente, sin upgrade ni consentimiento administrativo.

Dos transacciones de despliegue y seis del recorrido confirmadas. Ver [despliegue](../evidence/sow2-week1-2026-10-05/deployment.json), [demostración](../evidence/sow2-week1-2026-10-05/demonstration.json) y [lectura tras reinicio](../evidence/sow2-week1-2026-10-05/readback.json).

Paciente sintético concede leer/agregar; médico ya autorizado agrega PDF, corrección y PNG; paciente verifica los tres documentos. Médico lee antes de revocar y su siguiente acceso se rechaza después. Las nuevas escrituras quedan rechazadas por can_append=false. Se conservan ambas versiones del PDF. Cero intentos pendientes.

Neon dev acepta exactamente 3.000.000 bytes originales (envelope 5.334.480 bytes). Prueba de límite, inmutabilidad y rotación ejecutada en una transacción revertida con recibo simulado; no se confunde con los seis recibos reales. Dos conexiones directas demostraron exclusividad, liberación y pérdida de bloqueo sin escrituras de datos.

KEK y claves sintéticas protegidas con Windows DPAPI fuera de Neon. Respaldo recuperado bajo la misma cuenta y lectura desde un proceso nuevo. No acredita recuperación en otra máquina.

## Cobertura simulada

Firmas exactas, permisos independientes, correcciones ajenas, revisiones antiguas, archivos alterados, respuestas tardías, cambio de sesión y recuperación de sobres. No acredita observaciones de Privy ni auditoría externa.

## Pendientes y límites

- CI del commit y revisión de PR.
- Restauración real de footprint archivado: pruebas locales acreditan rechazo seguro, no restauración real.
- Integración clínica con pantallas/Privy corresponde a semanas siguientes; el harness usa challenges Ed25519 reales.
- Custodia portable y alojamiento permanente no entregados. Neon dev está configurado y probado mediante herramientas locales.

TrustLeaf descifra para usuarios autorizados; revocar no elimina copias descargadas. Integridad no certifica veracidad clínica. Wallets y metadatos son públicos. Validación de firma de archivo no constituye antivirus.
