# SOW 2 · Semana 2

Estado: código integrado y suites locales aprobadas en `cdddc17`; revisión autenticada y checks remotos pendientes; no aprobado para grabar. Semana 1 conserva su base `2d13e07`. Véanse [estado](SEMANA-2-ESTADO.md), [QA](QA-SEMANA-2.md) y [guía](GUIA-VALIDACION-SEMANA-2.md).

## Acuerdo de integración

Identidad = DID estable de Privy y wallet Stellar comprobada en servidor. El correo no identifica el historial. Un cambio de wallet falla cerrado; no reasigna historias.

Rutas autenticadas con `no-store`:

- `GET /api/private-clinical-history`: historial propio, cronología verificada, permisos e intentos.
- `GET /api/private-clinical-history/document?entryId=<hex>&version=<n>`: versión exacta; identidad, permisos e integridad antes de entregar contenido.
- `POST /api/private-clinical-operations`: UUID idempotente, preparación sin firma.
- `POST /api/private-clinical-operations/<UUID>/sign`: confirmación, firma Privy y sobre patrocinado persistido antes de transmitir.
- `GET /api/private-clinical-operations/<UUID>`: consulta sin transmisión.
- `POST /api/private-clinical-operations/<UUID>/retry`: confirmación y retransmisión del sobre guardado, sin otra firma.
- `POST /api/private-clinical-operations/<UUID>/cancel`: cancela sólo antes de tener sobre firmado.

Tipos comunes: `src/types/clinical.ts`. Contenido y metadatos clínicos dentro del sobre cifrado de `clinical_private_versions`. Claves web versionadas separadas de Neon; no se reutilizan las sintéticas. Índices nuevos: `clinical_web_histories` y `clinical_web_operations`, separados de ejecuciones de semana 1.

Web, recetas y scripts clínicos comparten exclusividad por wallet. No se sustituye un sobre incierto por otra firma. Lectura verificada exige contexto, integridad y comprobante del contrato; no se muestra una lista parcial como verificada.

## Coordinación

Los diez frentes, responsables y commits están en [SEMANA-2-ESTADO.md](SEMANA-2-ESTADO.md). Se trabajó por tandas de tres subagentes y un coordinador, con worktrees aislados para escritores concurrentes. Navegación, migraciones, configuración y tipos compartidos se integraron por el coordinador; un responsable activo por archivo.

Las contribuciones se revisan mediante PR dirigidas al sprint; la PR principal conserva base clínica y permanece en borrador. No se fusiona main durante esta preparación.

Sin semana 3, contratos nuevos, magic links/QR externos, compresión automática ni worker permanentemente alojado. Preview requiere autorización específica de configuración; firmas y observaciones reales se registran aparte de mocks.
