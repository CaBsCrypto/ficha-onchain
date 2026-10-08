# SOW 2 · Semana 2

Estado: desarrollo; no aprobado para grabar. Base clínica y grabación de semana 1 conservadas en `2d13e07`.

## Acuerdo de integración

Una identidad es el DID de Privy y una wallet Stellar comprobada de nuevo en el servidor. El correo no es el identificador del historial. Un cambio de wallet falla cerrado; no reasigna una historia.

Rutas nuevas, autenticadas y sin caché:

- `GET /api/private-clinical-history`: historia propia, cronología verificada, permisos y operaciones.
- `GET /api/private-clinical-history/document?entryId=<hex>&version=<n>`: versión exacta, con acceso e integridad comprobados; adjuntos como descarga privada.
- `POST /api/private-clinical-operations`: prepara un intento idempotente con UUID solicitado por el cliente. No firma.
- `POST /api/private-clinical-operations/<UUID>/sign`: confirmación expresa, firma de la wallet mediante Privy, sobre patrocinado persistido antes de transmisión.
- `GET /api/private-clinical-operations/<UUID>`: reconcilia el mismo intento.
- `POST /api/private-clinical-operations/<UUID>/cancel`: cancela sólo si aún no hay sobre firmado.

Los tipos públicos están en `src/types/clinical.ts`. El índice y los intentos web se separan de las ejecuciones sintéticas. El contenido y sus metadatos permanecen dentro del sobre cifrado de `clinical_private_versions`. Claves web versionadas en secretos del servicio, nunca en Neon ni en respaldo DPAPI anterior. No hay fallback de texto plano.

Los índices nuevos son `clinical_web_histories` y `clinical_web_operations`. Los intentos clínicos, las recetas y los scripts comparten la exclusividad de la wallet. Un sobre incierto no se reemplaza por una firma nueva.

## Responsables y evidencia

| Frente | Responsable | Dependencia | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| 1 Identidad | Agente identidad/claves | Wallet existente | En desarrollo | Pendiente |
| 2 Cifrado/claves | Agente identidad/claves | Cifrado semana 1 | En desarrollo | Pendiente |
| 3 Persistencia | Agente persistencia | Tipos comunes | En desarrollo | Pendiente |
| 4 Stellar/firmas | Agente Stellar | Contrato existente | En desarrollo | Pendiente |
| 5 APIs | Coordinador + revisión delegada | 1–4 | Pendiente | Pendiente |
| 6 Archivos/antecedentes | Agente interfaz | API acordada | Pendiente | Pendiente |
| 7 Cronología/correcciones | Agente interfaz | 5–6 | Pendiente | Pendiente |
| 8 Permisos | Agente permisos | 4–5 | Pendiente | Pendiente |
| 9 Seguridad/integración | Agente QA | Integración | Pendiente | Pendiente |
| 10 Visual/documentación | Agente entrega | Integración | Pendiente | Pendiente |

Máximo tres subagentes activos junto al coordinador. Un responsable por archivo; navegación, configuración y tipos compartidos se integran por el coordinador. Sin contratos nuevos, main, despliegue, transferencias de secretos ni transacciones reales durante las pruebas aisladas. El preview autenticado requiere autorización específica de configuración y las comprobaciones reales se registrarán aparte.
