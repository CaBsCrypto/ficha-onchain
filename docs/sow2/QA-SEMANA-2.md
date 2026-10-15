# SOW 2 · Semana 2 · Registro de QA

## Actualización · 15 de octubre de 2026

La reapertura local encontró un **bloqueo real de lectura por archivo de la instancia y código del registro médico**. RPC devolvía TTL cero y una simulación exitosa; la extensión de recursos mostró dos entradas archivadas. No se considera cargado ni verificado el historial actual. El ensayo del 11 de octubre conserva su evidencia histórica.

Corrección `daf18d6`: TTL desconocido exige simulaciones estrictas sin restauración automática; se rechazan estados archivados, TTL vencido/inválido, datos malformados y cambios de identidad/contrato. **950 pruebas de aplicación, 263 privadas, TypeScript y build aprobados** sobre esas fuentes. No se repitieron transacciones. Restauración específica propuesta y pendiente de autorización, con escrituras locales apagadas. Ver [diagnóstico, límites y plan de recuperación](../evidence/sow2-week2-read-recovery-2026-10-15/INFORME.md).

## Actualización · 11 de octubre de 2026

**Ensayo real del paciente aprobado:** ocho transacciones distintas en Testnet con Privy, recibos y contenido auditados; PDF v1/v2 conservados; lectura y agregado independientes, retirados al terminar. La recarga tras reiniciar la aplicación con escrituras apagadas mantuvo tres entradas, cuatro versiones y permisos finales sin conceder. La reauditoría completa desde otro proceso también aprobó los mismos ocho recibos y contenido, sin nuevas transacciones.

Ver [informe y recibos](../evidence/sow2-week2-testnet-2026-10-11/INFORME.md), [ejecución original](../evidence/sow2-week2-testnet-2026-10-11/execution.json) y [persistencia desde otro proceso](../evidence/sow2-week2-testnet-2026-10-11/persistence.json). Aplicación `6b9041f`: 938 pruebas, TypeScript y build aprobados. Validador `2189c1d`: 260 pruebas privadas; CI/Vercel aprobados. Las 25 contractuales siguientes son históricas del 8 de octubre, no una ejecución nueva.

Observado en sesión real: filtros, versiones, corrección propia sin preparar una operación, cierre y retorno del foco, Tab/Shift+Tab, descarga de PNG legible, móvil 360/390 px y ausencia de desbordamiento en DOM a 430 px. La captura a 430 px quedó recortada por la herramienta; revisión visual completa, texto al 200 %, legibilidad de PDF, cambio de cuenta y firma desde el botón del producto siguen pendientes. El preview requiere autorización específica; no se trasladaron secretos ni se fusionó main.

Se corrigieron la firma clínica mediante el mecanismo de navegador ya utilizado por recetas, el límite de patrocinio de Soroban y el diagnóstico saneado del ensayo. Una lectura real tardó 47.191 ms: superaba los 45 segundos del script. Sus GET de historial/documentos ahora admiten 120 segundos; no se afirma mejora de rendimiento. La ejecución conservó su UUID y las seis confirmaciones anteriores al continuar con los dos pasos finales. Detalles y límites en el informe.

## Registro histórico · 8 de octubre de 2026

Fecha: 8 de octubre de 2026. Rama `codex/sow2-sprint-2`. Este registro distingue pruebas aisladas, SQL real reversible, observaciones visuales con fixtures y comprobaciones autenticadas pendientes. No acredita aceptación del revisor ni ausencia total de errores.

## Resultados acreditados

| Comprobación | Versión / entorno | Resultado | Tipo de evidencia |
| --- | --- | --- | --- |
| Aplicación | `cdddc17`, local | 928 pruebas / 73 archivos; todas aprobadas | Automatizado; sin operaciones reales |
| Servicios privados | `cdddc17`, local | 163 aprobadas, incluido el validador SQL aislado | Automatizado; mocks/fixtures |
| TypeScript | `cdddc17`, local | Cero errores | Automatizado |
| Build | `cdddc17`, local | Build Next.js 16.2.10 completado; TypeScript incluido | Automatizado |
| Contratos | `cdddc17`, local | 25 aprobadas: 14 clínicas, 4 de registro y 7 de recetas | Automatizado Rust; no despliegue nuevo |
| Restricciones SQL dev | `cdddc17`; validador identificado por SHA | 62 comprobaciones; rollback y cero filas restantes | Neon dev real, sin Stellar |
| Exclusividad SQL dev | `dda2dd2`; validador `68e4259` identificado por SHA | 5 escenarios / 14 comprobaciones; 10 rollbacks, cero filas en ambas sesiones | Dos conexiones reales; sólo datos sintéticos |
| Rechazo anónimo | Aplicación local en 3016, `64a37fd` | Historia, documento e intento: HTTP 401, `no-store`, sin contenido | Peticiones HTTP reales, sin token |
| Recuperación de clave local | Configuración web local | Respaldo DPAPI recuperado y comparación exacta | Local, mismo usuario de Windows; no recuperación alojada |
| CI y Vercel de contribuciones | #136 `2019b79`, #137 `e77dac1`, #138 `cf76346` | Aprobados antes de integrarlas al sprint | Remoto; no acredita configuración autenticada ni operaciones reales |
| Recorrido clínico encadenado | `49099ae`, validador `--isolated` | 296 pruebas / 14 suites de aplicación, 58 privadas seleccionadas y 14 del contrato clínico; aprobadas | Automatizado aislado; SQL, Privy y RPC simulados |
| TypeScript tras añadir el recorrido | `66dfb16`, local | Cero errores; el único cambio posterior de código fue el formato TAP del runner | Automatizado |

Cada reporte SQL conserva el commit observado y el hash exacto del validador. El ensayo concurrente ocurrió antes del último guard de selección del médico; el bloqueo de wallet no cambió después. No se atribuye esa observación a una nueva ejecución.

- [Restricciones SQL](../evidence/sow2-week2-2026-10-08/clinical-web-schema.json).
- [Concurrencia SQL](../evidence/sow2-week2-2026-10-08/clinical-web-concurrency.json).
- [Verificación integrada](../evidence/sow2-week2-2026-10-08/verification.json) y [manifiesto de archivos](../evidence/sow2-week2-2026-10-08/manifest.json).
- [Ensayo encadenado y suites seleccionadas](../evidence/sow2-week2-2026-10-08/clinical-web-flows.json), con commit, SHA, cifras y límites propios; no sustituye las cifras de la suite completa histórica.

El ensayo concurrente demostró que PostgreSQL retiene el mismo advisory lock y que el segundo INSERT espera al primer backend. Al revertir la primera transacción, el segundo continúa y también se revierte. **No demuestra un conflicto tras COMMIT**, porque no confirmó ninguna fila. Las restricciones entre colas se comprobaron por separado dentro de una transacción; no confundirlas con observación de transacciones de Stellar.

## Hallazgos y recorridos

| ID | Pantalla / frontera | Esperado y observado | Evidencia | Prioridad | Estado / siguiente acción |
| --- | --- | --- | --- | --- | --- |
| S2-01 | Identidad y sesión | DID estable; correo cambiado no reasigna historial; wallet/usuario distintos rechazan acceso y descartan contenido | `clinical-identity`, `clinical-api`, `clinical-client` | Alta | Automatizado aprobado; contraste real pendiente |
| S2-02 | Claves e integridad | Claves ausentes/erróneas fallan cerradas; versiones antiguas requieren su clave; contenido alterado no se entrega | `clinical-keys`, `clinical-history`, pruebas privadas de cifrado | Alta | Automatizado aprobado; clave local recuperada |
| S2-03 | Intentos y versiones | Contexto, autor, huella, sobre y estados inmutables; sólo correcciones propias; índice incompleto rechazado | `clinical-store`, `clinical-operations`, reportes SQL | Alta | Automatizado y SQL aprobados |
| S2-04 | Doble envío / incertidumbre | UUID y sobre persistidos; GET no transmite; NOT_FOUND no confirma ni reemplaza firmas | `clinical-operations`, `clinical-chain`, `clinical-client` | Alta | Automatizado aprobado; proveedor real pendiente |
| S2-05 | Recibos históricos | No depender sólo de un hash ni de disponibilidad del recibo RPC; comprobar sobre y operación del contrato | `2019b79`, pruebas `clinical-chain` y `clinical-history` | Alta | Corregido y probado de forma aislada |
| S2-06 | Archivos | Límite 3.000.000 bytes originales, formato comprobado, MIME de descarga coherente y sin caché | `clinical-input`, `clinical-document-route`, `64a37fd` | Alta | Corregido mismatch de MIME; integración aprobada |
| S2-07 | Permisos | Lectura/agregado independientes, revisión sin cambio optimista; retiro completo de permiso vencido | `clinical-permissions`, `clinical-history`; fixture 430 | Alta | Automatizado y presentación simulada aprobados |
| S2-08 | Médico cambia antes de firmar | Concesión comprueba de nuevo ID, wallet, estado y autorización del médico; retiro completo sigue permitido | `8c21c69`, `clinical-operations`; SQL `cdddc17` | Alta | Fallo reproducido, corregido y aprobado de forma aislada |
| S2-09 | Preparar permisos al pie | Intento aparece visible y recibe foco; no firma automáticamente | `68f4559`, regresiones `clinical-client`, captura 360 | Media | Corregido; foco y desplazamiento comprobados con fixture |
| S2-10 | Formulario y cronología | Títulos largos, versiones, filtros, validación, cierre y retorno al botón utilizables | Capturas y observación de componentes reales con respuestas simuladas | Media | Aprobado con fixtures; sesión real pendiente |
| S2-11 | Error de carga | No mostrar historial anterior como verificado; mantener reintento | `clinical-client`, fixture “Error de consulta” | Alta | Automatizado y visual simulado aprobados |
| S2-12 | Texto al 200 % | Mantener lectura y controles tras ampliar | Atajo de zoom en pestaña Chrome no modificó viewport ni DPR | Media | Pendiente manual; limitación de control, no fallo del producto |
| S2-13 | Recorrido autenticado | Entrar, crear, aportar, descargar, corregir, conceder/retirar, recargar y cambiar cuenta | Guía de validación; Privy local abierto | Alta | Pendiente de ingreso del usuario y prueba sintética acordada |
| S2-14 | Preview | Base y claves aisladas, escrituras apagadas antes de revisión | PR del sprint | Alta | Pendiente de autorización específica; no secretos transferidos |
| S2-15 | Cambio de relayer y recibo guardado | GET puede reconciliar un éxito comprobado con el firmante histórico aunque cambie el relayer; retry exige el actual y conserva el sobre | `8c21c69`, `clinical-operations`, `clinical-chain` | Alta | Corregido y aprobado de forma aislada; proveedor real pendiente |
| S2-16 | Estado archivado o recibo fuera de retención | No crear otra historia ni confirmar una respuesta incierta | Guardas y guía de inspección | Alta | Límite declarado; restauración real y recuperación excepcional pendientes de procedimiento/evidencia |
| S2-17 | Recorrido sobre un mismo historial | Rutas reales crean/confirman, cifran, leen y corrigen; PDF v1/v2 conservados, permiso de lectura sin agregado, retiro rechazando lectura técnica médica y otra cuenta sin contenido; retry conserva sobre y firma | `831d0f7`; runner en `49099ae`, reporte encadenado | Alta | Automatizado aprobado; no equivale a prueba con proveedores reales |

El caso encadenado usa seis operaciones simuladas, seis firmas Ed25519 locales, siete envíos simulados (uno es reintento del mismo sobre), tres versiones cifradas y cero intentos pendientes. Las peticiones posteriores usan la misma memoria controlada: no acreditan persistencia después de reiniciar Neon. El lector médico es técnico, sin implementar el portal de semana 3. El PDF valida bytes y versiones, no su presentación visual. La respuesta perdida de este caso ocurre antes de aceptar el sobre; los demás fallos de RPC se cubren en las suites específicas.

El runner exige modo explícito `--isolated`, elimina credenciales heredadas y usa `envDir: false`; rechaza suites faltantes y cambios tracked de fuentes sin commit. El primer ensayo detectó que Node emitía un formato distinto al esperado: falló el conteo del runner aunque las pruebas privadas terminaron con exit 0. Se fijó `--test-reporter=tap`, se repitió el comando y el reporte enlazado acredita la ejecución aprobada.

## Revisión visual con fixtures

Componentes y CSS reales en `http://127.0.0.1:3017/`, identificados permanentemente como **datos simulados, sin firmas ni conexión a Neon**. Las fechas y recibos omitidos son fixtures; no son lecturas de Stellar.

Anchos efectivos observados: **360/390/430 px**, sin desbordamiento horizontal. Se revisaron encabezados, títulos largos, versiones, filtros, formularios, errores, permisos vencidos y navegación inferior. Tab/Shift+Tab mostraron foco visible. Abrir/cerrar formularios devuelve el foco a su control; la revisión de firma permite Escape y retorno al botón. Escape no se presenta como cierre de un diálogo para el formulario en línea.

Después de preparar permisos, el foco quedó en “Actualizar permisos · Pendiente de tu firma”, dentro del viewport; Tab conduce a consulta/revisión y Escape desde la revisión vuelve al botón. No se pulsó una firma real.

- [Escritorio](../evidence/sow2-week2-2026-10-08/historial-fixture-desktop.jpg).
- [360 px](../evidence/sow2-week2-2026-10-08/historial-fixture-360.jpg), [390 px](../evidence/sow2-week2-2026-10-08/historial-fixture-390.jpg), [430 px](../evidence/sow2-week2-2026-10-08/historial-fixture-430.jpg).
- [Error 360](../evidence/sow2-week2-2026-10-08/historial-fixture-error-360.jpg).
- [Versiones 390](../evidence/sow2-week2-2026-10-08/historial-fixture-versiones-390.jpg).
- [Corrección 390](../evidence/sow2-week2-2026-10-08/historial-fixture-correccion-390.jpg).
- [Permisos 430](../evidence/sow2-week2-2026-10-08/historial-fixture-permisos-430.jpg).
- [Foco del intento 360](../evidence/sow2-week2-2026-10-08/historial-fixture-intento-foco-360.jpg).

## Cierre de revisión

Sin transacciones clínicas nuevas ni cambios de main en este trabajo. Semana 1 sigue separada en `2d13e07`. La comprobación médica final y los controles de recuperación están integrados y probados. Las contribuciones se integraron con checks aprobados; el gate de la PR principal se consulta sobre su head actual. Falta completar Privy y recibos reales, texto al 200 % y preview autorizado. No declarar semana 2 lista para grabar hasta cerrar esos puntos.
# Ensayo por API y Privy · 8 de octubre de 2026

Se preparó una contribución independiente desde `0e66f9a`, sin nuevas transacciones ni cambios de main. Código comprobado `a79bfb9`: **929 pruebas de aplicación, 243 privadas, TypeScript y build aprobados**. Los nuevos 80 casos del validador están incluidos en la suite privada. El ingreso real de Privy, preflight efectivo y recorrido de ocho transacciones continúan pendientes; no se atribuyen a los resultados aislados.

Ver [registro de preparación](../evidence/sow2-week2-api-rehearsal-2026-10-08/PREPARATION.md) y [guía del ensayo](ENSAYO-API-TESTNET-SEMANA-2.md). La preparación y lectura se separan de la ejecución explícita; las respuestas inciertas conservan el mismo intento. Los resultados guardados no se presentan como vigentes cuando falla su nueva verificación.
