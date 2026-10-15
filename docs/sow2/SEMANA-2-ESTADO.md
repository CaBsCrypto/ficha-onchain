# SOW 2 · Semana 2 · Estado de la entrega

**Reapertura con Gateway, 15 de octubre:** el usuario aprobó la opción explícita `TRUSTLEAF_CLINICAL_RPC_PROVIDER=gateway` tras observar SDF HTTP 503. Rama `codex/sow2-testnet-rpc-provider`, código `f98f0e7`, PR #143 en borrador. Pasaron 965 pruebas de aplicación, 263 privadas, TypeScript y build; 24 lecturas reales en Gateway y la carga autenticada del historial. Ocho hashes originales conservados, cero transacciones clínicas nuevas, permisos retirados y escrituras apagadas. El usuario aplicó el 200 %; faltan confirmar su legibilidad, el cambio real de cuenta y la firma desde el producto. [Informe actual](../evidence/sow2-week2-gateway-2026-10-15/INFORME.md). La recuperación anterior y sus dos mantenimientos se conservan a continuación.

**15 de octubre de 2026:** versión local corregida `daf18d6`, rama `codex/sow2-clinical-ledger-read-fix`, PR #142 en borrador. El código pasó 950 pruebas de aplicación, 263 privadas, TypeScript y build; CI/Vercel aprobaron `4d7f09b`. Las dos restauraciones autorizadas están confirmadas: `966fe5e7` (instancia/código) y `ae17e228` (registro del médico), con comisión total de 3,0159417 XLM de Testnet dentro de sus límites. **La lectura autenticada volvió a cargar**, con 24 consultas finales correctas, ocho hashes clínicos sin cambios, tres entradas y cuatro versiones. Sin intentos inciertos del relayer en las tablas inspeccionadas. PDF v1/v2 y móvil completo a 430 px comprobados. Firma desde el botón del producto, cambio real de cuenta y zoom al 200 % siguen pendientes; no se declara el cierre de semana 2. Escrituras clínicas apagadas, sin publicación en main. [Informe y evidencia](../evidence/sow2-week2-read-recovery-2026-10-15/INFORME.md). La actualización siguiente describe el ensayo histórico del 11 de octubre.

Actualización: 11 de octubre de 2026. Base integrada `codex/sow2-sprint-2`; ensayo en `codex/sow2-testnet-api-rehearsal`, [#141](https://github.com/CaBsCrypto/ficha-onchain/pull/141) en borrador. Aplicación comprobada `6b9041f`; validador final `2189c1d`. Historial, archivos, cronología y permisos están integrados y el ensayo autenticado de ocho transacciones del paciente está aprobado en Testnet. Ver [informe real](../evidence/sow2-week2-testnet-2026-10-11/INFORME.md) y [QA](QA-SEMANA-2.md). No está publicado en main; revisión manual restante y preview siguen separados.

## Alcance integrado

- Historial vinculado al DID estable de Privy y wallet comprobada; el correo no identifica el historial. Cambiar la wallet no reasigna datos automáticamente.
- Antecedentes y metadatos clínicos cifrados en Neon, con claves web nuevas y versionadas fuera de la base. Sin reutilizar las claves sintéticas de semana 1.
- PDF, PNG y JPEG hasta **3.000.000 bytes originales**. Validación de formato y tamaño en cliente y servidor; sin compresión automática.
- Cronología, filtros y versiones anteriores. El paciente sólo corrige sus aportes; no edita los de otro autor.
- Permisos independientes de lectura y agregado. Conceder requiere autorización médica vigente; retirar ambos permisos existentes sigue permitido si esa autorización expiró.
- Firma expresa del paciente mediante Privy, patrocinio del relayer y sobre persistido antes de transmitir. Un intento incierto no se reemplaza por otra firma.

Stellar Testnet registra propietarios, permisos y comprobantes de integridad. El contenido clínico permanece cifrado fuera de blockchain. TrustLeaf lo descifra para usuarios autorizados: no se promete cifrado de extremo a extremo ni borrar copias ya descargadas al revocar acceso.

## Diez frentes

Los commits identifican código integrado; no equivalen a aceptación manual ni a transacciones reales.

| Frente | Responsable | Estado | Evidencia |
| --- | --- | --- | --- |
| 1 · Identidad y acceso | Agente identidad | Integrado; sesión real del paciente observada; cambio de cuenta manual pendiente | `5b0482e`; ensayo `4fad0a02` |
| 2 · Cifrado y claves | Agente identidad | Integrado; configuración y recuperación locales comprobadas | `5b0482e`; clave web y respaldo privados |
| 3 · Persistencia | Agente persistencia | Integrado; 62 comprobaciones SQL y 5 escenarios concurrentes aprobados con rollback | `8682d47`, `6e8f1bf`, `dda2dd2`, `68e4259`, `cdddc17` |
| 4 · Stellar y firmas | Agente Stellar | Ocho firmas y recibos reales auditados; firma desde botón del producto pendiente | `6b9041f`; ocho recibos del informe |
| 5 · APIs | Coordinador y revisión delegada | Integrado; identidad, errores e integridad probados | `916617b`, `2019b79` |
| 6 · Antecedentes y archivos | Agente interfaz | Integrado; PNG y PDF v1/v2 descargados mediante sesión real; PDF renderizados legibles el 15 de octubre | `31ad3f8`, `64a37fd`; informe de recuperación |
| 7 · Cronología y correcciones | Agente interfaz | Integrado; filtros, autor y versiones probados | `31ad3f8` |
| 8 · Permisos | Agente permisos | Integrado; lectura/agregado independientes; médico comprobado otra vez antes de firmar | `12cf461`, `8c21c69` |
| 9 · Seguridad e integración | Coordinador y agente QA | 950 de aplicación, 263 privadas, TypeScript/build aprobados en la corrección; 25 contractuales históricas sin repetir | `daf18d6`; QA distingue fechas y entornos |
| 10 · Visual y entrega | Coordinador y agente entrega | Sesión real, filtros, foco y móvil 360/390/430 revisados; 200 % pendiente | [QA](QA-SEMANA-2.md), [recuperación](../evidence/sow2-week2-read-recovery-2026-10-15/INFORME.md) |

## Entorno local y claves

| Variable del servidor | Función |
| --- | --- |
| `TRUSTLEAF_CLINICAL_WEB_ENABLED` | Habilitación explícita del módulo |
| `CLINICAL_HISTORY_PRIVATE_CONTRACT_ID` | Contrato clínico existente, comprobado contra el configurado |
| `TRUSTLEAF_CLINICAL_KEYRING` | Mapa secreto de identificadores a claves de 32 bytes en hexadecimal |
| `TRUSTLEAF_CLINICAL_ACTIVE_KEY_ID` | Versión activa; conservar las claves anteriores necesarias |
| `TRUSTLEAF_CLINICAL_MIGRATION` | Guard explícito de migración clínica en dev |
| `TRUSTLEAF_PRIVATE_WRITES_ENABLED` | Preparación/transmisión; actualmente apagadas |

No incluir credenciales en capturas, Git, respuestas de API ni variables `NEXT_PUBLIC_*`. Se conservan los controles de Privy, Testnet, contratos, autoridad, relayer y base.

La fuente del esquema es `scripts/migrate.mjs`. Los pasos `clinical-history-v1` y `clinical-web-v1` sólo aceptan Neon dev `ep-lingering-water-ahzh89z5`. El script lee `DATABASE_URL`; la conexión efectiva de la aplicación, incluida `TRUSTLEAF_DATABASE_URL` si existe, debe coincidir. El esquema dev ya se aplicó; no se migraron main ni previews.

Una clave clínica web nueva se configuró localmente. Su respaldo DPAPI se recuperó y comparó bajo el mismo usuario de Windows; eso no acredita recuperación en otro equipo ni reemplaza la gestión de secretos alojados. Clave y respaldo permanecen ignorados por Git.

## Validación y próximos pasos

Contribuciones revisadas y fusionadas **sólo a la rama del sprint**, con CI y Vercel aprobados en sus heads:

- [#136 · Núcleo clínico](https://github.com/CaBsCrypto/ficha-onchain/pull/136), `2019b79`.
- [#137 · Interfaz del paciente](https://github.com/CaBsCrypto/ficha-onchain/pull/137), `e77dac1`.
- [#138 · Controles finales y evidencia](https://github.com/CaBsCrypto/ficha-onchain/pull/138), `cf76346`.

La PR principal está preparada en borrador contra `codex/sow2-clinical-foundation` (#135, aún sin fusionar). Consultar los checks del head actual en esa PR; los aprobados de las contribuciones no sustituyen su gate ni el recorrido real.

Las rutas `/api/private-clinical-*` exigen autenticación y responden con `no-store`. La lectura verifica identidad, permisos e integridad antes de entregar contenido. GET de una operación no transmite; el reintento confirmado reutiliza el sobre persistido.

Se corrigieron el foco tras preparar permisos, la comprobación del médico antes de firmar y la reconciliación de recibos históricos al cambiar el relayer. Las pruebas locales y SQL están registradas. Los checks remotos corresponden a cada PR y no sustituyen las comprobaciones siguientes:

1. Privy y ocho operaciones del paciente comprobados: historial, PDF, antecedente, imagen, corrección, lectura, agregado y revocación. Los seis recibos previos se conservaron durante la reanudación; sin duplicarlos.
2. Recarga tras reiniciar con escrituras apagadas y reauditoría desde otro proceso aprobadas; los ocho recibos y el contenido persistieron, sin nuevas transacciones. [Informe separado](../evidence/sow2-week2-testnet-2026-10-11/persistence.json).
3. Completar texto al 200 %, cambio real de cuenta y recorrido del botón de firma del producto. PDF y visual completo a 430 px quedaron comprobados el 15 de octubre. La demora de lectura medida queda documentada.
4. Autorizar específicamente la configuración aislada del preview antes de trasladar claves o conexión.

Usar un único entorno de escritura por paciente, contrato y red. La misma wallet determina el mismo historial en cadena; cambiar de base sin conservar su índice y contenido cifrado no crea otra historia. No adoptar registros automáticamente ni intentar crearlos otra vez para eludir esa separación.

El estado archivado por TTL y los intentos inciertos fuera de la retención RPC requieren inspección explícita. No se presentan como recuperados ni confirmados sin evidencia.

La grabación de semana 1 conserva su base `2d13e07`, informes, guion y recibos. Semana 3, magic links/QR externos, compresión automática, contratos nuevos y worker permanentemente alojado siguen fuera de este sprint. La aceptación del revisor se registra por separado.
