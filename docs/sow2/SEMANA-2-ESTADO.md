# SOW 2 · Semana 2 · Estado de la entrega

Referencia: `codex/sow2-sprint-2`, 8 de octubre de 2026. Código comprobado: `cdddc179fa707168d9bb90d5b1554f9dad4425ac`. Historial, archivos, cronología y permisos ya están integrados. Los resultados y sus commits están en [QA-SEMANA-2.md](QA-SEMANA-2.md). No se ha publicado en main ni se acredita aún un recorrido autenticado listo para grabar.

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
| 1 · Identidad y acceso | Agente identidad | Integrado; sesión real pendiente | `5b0482e`: DID y wallet vinculados |
| 2 · Cifrado y claves | Agente identidad | Integrado; configuración y recuperación locales comprobadas | `5b0482e`; clave web y respaldo privados |
| 3 · Persistencia | Agente persistencia | Integrado; 62 comprobaciones SQL y 5 escenarios concurrentes aprobados con rollback | `8682d47`, `6e8f1bf`, `dda2dd2`, `68e4259`, `cdddc17` |
| 4 · Stellar y firmas | Agente Stellar | Integrado; firma real pendiente | `a5790b1`, `2019b79`: validación estricta y comprobantes durables |
| 5 · APIs | Coordinador y revisión delegada | Integrado; identidad, errores e integridad probados | `916617b`, `2019b79` |
| 6 · Antecedentes y archivos | Agente interfaz | Integrado; formularios y descargas comprobados con fixtures | `31ad3f8`, `64a37fd` |
| 7 · Cronología y correcciones | Agente interfaz | Integrado; filtros, autor y versiones probados | `31ad3f8` |
| 8 · Permisos | Agente permisos | Integrado; lectura/agregado independientes; médico comprobado otra vez antes de firmar | `12cf461`, `8c21c69` |
| 9 · Seguridad e integración | Coordinador y agente QA | 928 pruebas de aplicación, 163 privadas, 25 contractuales y TypeScript aprobados; build registrado en QA | `3d3b5fd`, `8c21c69`, `cdddc17` |
| 10 · Visual y entrega | Coordinador y agente entrega | Fixtures y foco corregido revisados; 200 % y sesión real pendientes | `68f4559`; [QA](QA-SEMANA-2.md), [guía](GUIA-VALIDACION-SEMANA-2.md) |

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

1. Entrar con Privy en local, primero sólo lectura.
2. Realizar el recorrido sintético acordado, auditar recibos y persistencia.
3. Completar texto al 200 % y contrastar presentación con la sesión real.
4. Autorizar específicamente la configuración aislada del preview antes de trasladar claves o conexión.

Usar un único entorno de escritura por paciente, contrato y red. La misma wallet determina el mismo historial en cadena; cambiar de base sin conservar su índice y contenido cifrado no crea otra historia. No adoptar registros automáticamente ni intentar crearlos otra vez para eludir esa separación.

El estado archivado por TTL y los intentos inciertos fuera de la retención RPC requieren inspección explícita. No se presentan como recuperados ni confirmados sin evidencia.

La grabación de semana 1 conserva su base `2d13e07`, informes, guion y recibos. Semana 3, magic links/QR externos, compresión automática, contratos nuevos y worker permanentemente alojado siguen fuera de este sprint. La aceptación del revisor se registra por separado.
