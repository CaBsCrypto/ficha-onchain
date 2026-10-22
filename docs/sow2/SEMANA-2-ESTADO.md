# SOW 2 · Semana 2 · Estado de la entrega

> Nota de copia pública · 22-10-2026: Las referencias a evidencias nuevas o propuestas excluidas conservan la procedencia histórica; esos archivos no están incluidos en esta copia y sus comprobaciones no se repitieron.

**19 de octubre · creación con otra cuenta preparada, todavía no ejecutada:** la cuenta secundaria elegida tiene wallet existente en Testnet, cero historias en Neon y en el contrato y cero pendientes en las tres colas (comprobación final: 20:24, hora de Chile). El usuario autorizó una sola `create_history`, máximo 1 XLM de Testnet, pero pospuso la firma y pidió dejar preparado. No se persistió un intento, no se firmó ni se transmitió. El servidor local sigue en lectura, con la excepción desactivada; la ejecución anterior se conserva.

Para respetar ese alcance se preparó [el control de creación única](CREACION-UNICA-LOCAL.md), commit `34d9b47`, [PR #144 en borrador](https://github.com/CaBsCrypto/ficha-onchain/pull/144), sin fusionar: interruptor general apagado, wallet/método/plazo delimitados, cuota de una solicitud bajo bloqueo y comisión total real ≤ 1 XLM. Pasaron 992 pruebas de aplicación, 263 privadas, TypeScript, build y CI. El monitor local tuvo dos fallos de arranque con reversión a lectura antes de cualquier operación; se corrigió la interpretación de fechas y pasaron diez pruebas aisladas de arranque, errores y reversión. La activación final del modo corregido y la firma real siguen pendientes de disponibilidad del usuario. Esta preparación no acredita una transacción ni una grabación nueva.

**19 de octubre de 2026 · lectura recuperada para la revisión local:** se restauraron 18 entradas archivadas por TTL del historial web mediante una única `restoreFootprint` autorizada, recibo `e9eefda5…`, ledger `5283349`, comisión `0,5530591 XLM de Testnet` (máximo aprobado: 1). Las 27 lecturas posteriores pasaron sin estado archivado; el portal volvió a mostrar cuatro entradas, cinco versiones, recibos y ambos permisos retirados. Se conservaron los ocho recibos originales y la nota adicional; cero intentos pendientes en las tres colas inspeccionadas. Escrituras de la aplicación apagadas y código funcional sin cambios. Pasaron 24 pruebas pertinentes de lectura/restauración; los conteos completos del 15 de octubre siguen siendo históricos. [Informe y límites de esta recuperación](../evidence/sow2-week2-read-recovery-2026-10-19/INFORME.md). Grabación, preview, publicación y aceptación siguen separados.

**Revisión local lista para grabar, 15 de octubre:** código `f98f0e7`, PR #143 en borrador. Pasaron 965 pruebas de aplicación, 263 privadas, TypeScript y build; la opción explícita Gateway recuperó la lectura ante SDF HTTP 503. Texto al 200 % aprobado por el usuario y cambio real de cuenta comprobado, incluida recarga vacía y retorno. Una nota nueva fue firmada desde el producto con Privy y auditada: `b991c3e6…`, ledger `5216962`, comisión `0,0828838 XLM de Testnet`. Tras reiniciar con escrituras apagadas y recargar se comprobaron cuatro entradas y cinco versiones, ocho hashes originales conservados y cero intentos pendientes. El médico sigue vencido y sus permisos retirados. La luz verde es para una revisión de lo ya ejecutado; preview, publicación y aceptación siguen pendientes por separado. [Informe actual](../evidence/sow2-week2-gateway-2026-10-15/INFORME.md) · [Guía para grabar](GRABACION-SEMANA-2.md). La recuperación anterior y sus dos mantenimientos se conservan a continuación.

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
| 1 · Identidad y acceso | Agente identidad | Integrado; cambio entre dos cuentas reales, recarga vacía y retorno al historial propio comprobados | `5b0482e`; revisión Gateway del 15 de octubre |
| 2 · Cifrado y claves | Agente identidad | Integrado; configuración y recuperación locales comprobadas | `5b0482e`; clave web y respaldo privados |
| 3 · Persistencia | Agente persistencia | Integrado; 62 comprobaciones SQL y 5 escenarios concurrentes aprobados con rollback | `8682d47`, `6e8f1bf`, `dda2dd2`, `68e4259`, `cdddc17` |
| 4 · Stellar y firmas | Agente Stellar | Ocho recibos originales conservados y una nota adicional firmada desde el botón del producto y auditada | `f98f0e7`; recibo nuevo `b991c3e6…` |
| 5 · APIs | Coordinador y revisión delegada | Integrado; identidad, errores e integridad probados | `916617b`, `2019b79` |
| 6 · Antecedentes y archivos | Agente interfaz | Integrado; PNG y PDF v1/v2 descargados mediante sesión real; PDF renderizados legibles el 15 de octubre | `31ad3f8`, `64a37fd`; informe de recuperación |
| 7 · Cronología y correcciones | Agente interfaz | Integrado; filtros, autor y versiones probados | `31ad3f8` |
| 8 · Permisos | Agente permisos | Integrado; lectura/agregado independientes; médico comprobado otra vez antes de firmar | `12cf461`, `8c21c69` |
| 9 · Seguridad e integración | Coordinador y agente QA | 965 de aplicación, 263 privadas, TypeScript/build aprobados; 25 contractuales históricas sin repetir | `f98f0e7`; QA distingue fechas y entornos |
| 10 · Visual y entrega | Coordinador y agente entrega | Sesión real, filtros, foco y móvil 360/390/430 revisados; 200 % aprobado por el usuario; grabación pendiente | [QA](QA-SEMANA-2.md), [guía](GRABACION-SEMANA-2.md) |

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
3. Texto al 200 % aprobado por el usuario; cambio real de cuenta, firma desde el producto y persistencia tras reiniciar/recargar aprobados el 15 de octubre. PDF y visual completo a 430 px también comprobados. Grabar según la [guía local](GRABACION-SEMANA-2.md), distinguiendo ocho operaciones previas y una nota nueva; la demora de lectura queda documentada.
4. Autorizar específicamente la configuración aislada del preview antes de trasladar claves o conexión.

Usar un único entorno de escritura por paciente, contrato y red. La misma wallet determina el mismo historial en cadena; cambiar de base sin conservar su índice y contenido cifrado no crea otra historia. No adoptar registros automáticamente ni intentar crearlos otra vez para eludir esa separación.

El estado archivado por TTL y los intentos inciertos fuera de la retención RPC requieren inspección explícita. No se presentan como recuperados ni confirmados sin evidencia.

La grabación de semana 1 conserva su base `2d13e07`, informes, guion y recibos. Semana 3, magic links/QR externos, compresión automática, contratos nuevos y worker permanentemente alojado siguen fuera de este sprint. La aceptación del revisor se registra por separado.
