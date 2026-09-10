# TrustLeaf · Evidencia del preview · Semana 2

**Corte:** 10 de septiembre de 2026. **Entorno:** preview aislado, Neon aislado y Stellar Testnet. **Datos:** exclusivamente sintéticos.

Este paquete respalda el recorrido de administrador, médico y paciente sobre la versión `dda4bf5cf9ee95cf21dc4e7d9248df162e755efe` del preview. Registra dos consultas completadas, una receta activa (`#5`) y una revocada (`#6`), apertura autorizada por médico y paciente, y cero operaciones pendientes o duplicadas en el corte final.

## Enlaces de revisión

- [Portal del médico](https://trustleaf-demo-git-cod-50a880-cabscryptocontacto-6028s-projects.vercel.app/login?role=doctor)
- [Portal del paciente](https://trustleaf-demo-git-cod-50a880-cabscryptocontacto-6028s-projects.vercel.app/login?role=patient)
- [PR #101 — contratos y servicios](https://github.com/CaBsCrypto/ficha-onchain/pull/101)
- [PR #102 — portales](https://github.com/CaBsCrypto/ficha-onchain/pull/102)

El enlace de rama puede cambiar en un despliegue posterior. El commit anterior fija la versión auditada.

## Resultado observado

| Participante | Evidencia |
| --- | --- |
| Administrador | Renovación del médico confirmada en `DoctorRegistryPrivate`; transición `pending → submitted → confirmed` con el mismo hash. |
| Médico | Dos consultas finalizadas; emisión y activación de ambas recetas; revocación posterior de `#6`; apertura de ambos documentos sintéticos. |
| Paciente | Misma sesión y asociación persistente; listado de `#5 Active` y `#6 Revoked`; apertura autorizada de ambos documentos; sin controles de activación o revocación. |

La tercera consulta quedó cancelada, sin reserva ni receta. La asistencia no concedió consentimiento: el paciente autorizó la emisión en una acción contractual posterior y separada. En la primera consulta retiró y volvió a conceder el permiso antes de emitir.

## Archivos

- [preview-receipts.json](preview-receipts.json): 12 hashes relevantes del recorrido, con contrato, método, estado y ledger. Incluye renovación, dos reservas, cuatro operaciones de consentimiento y cinco acciones de recetas.
- [prescription-audit.json](prescription-audit.json): estado final, participantes, compromisos, orden de cifrado, consumo y ausencia de pendientes/duplicados.
- [browser-observations.json](browser-observations.json): acciones observadas desde las sesiones autenticadas, sin publicar el contenido de los documentos.
- [validation-results.json](validation-results.json): resultados automatizados y sus límites.
- [manifest.json](manifest.json): tamaño y SHA-256 de los archivos del paquete; no incluye su propio hash.

## Privacidad y límites

No se incluyen documentos clínicos, ciphertext, sobres XDR, firmas sin procesar, tokens, correos personales, claves ni archivos de entorno. Las direcciones, contratos, métodos y hashes son datos públicos de prueba en Stellar Testnet.

La auditoría comparó metadatos persistidos, invocaciones firmadas, recibos RPC y entradas de almacenamiento. No volvió a descifrar documentos ni recalculó compromisos desde texto claro. La apertura de documentos es una observación separada de navegador. Los escenarios de proveedor caído y concurrencia se validan de forma controlada en pruebas y no se presentan como interrupciones reales de Privy, RPC o PostgreSQL.

El preview valida el hito técnico con datos sintéticos. No habilita atención clínica real ni representa aceptación formal del SOW.
