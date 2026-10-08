# SOW 2 · Semana 2 · Registro de QA

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

Cada reporte SQL conserva el commit observado y el hash exacto del validador. El ensayo concurrente ocurrió antes del último guard de selección del médico; el bloqueo de wallet no cambió después. No se atribuye esa observación a una nueva ejecución.

- [Restricciones SQL](../evidence/sow2-week2-2026-10-08/clinical-web-schema.json).
- [Concurrencia SQL](../evidence/sow2-week2-2026-10-08/clinical-web-concurrency.json).
- [Verificación integrada](../evidence/sow2-week2-2026-10-08/verification.json) y [manifiesto de archivos](../evidence/sow2-week2-2026-10-08/manifest.json).

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

Sin transacciones clínicas nuevas ni cambios de main en este trabajo. Semana 1 sigue separada en `2d13e07`. La comprobación médica final y los controles de recuperación están integrados y probados. Falta acreditar los checks del último commit remoto, completar Privy y recibos reales, texto al 200 % y preview autorizado. No declarar semana 2 lista para grabar hasta cerrar esos puntos.
