# Semana 4 — Cierre del SOW

Estado: **QA y publicación pendientes**. Este documento no declara entregado ni aceptado D4.

## Versión y accesos

- #125 está fusionada en main (`0d9ba91`): Iniciar sesión abre Privy desde la landing y el paciente entra automáticamente tras autenticarse. El usuario confirmó el ingreso nuevo sin segundo clic.
- `/login`, `/login/patient` y los enlaces antiguos del paciente mantienen compatibilidad hacia la landing con intención de acceso. Visitar la landing con sesión no redirige automáticamente.
- Médico: `/login/doctor`; administrador: `/login/admin`, sin enlaces públicos. La ruta no concede permisos.
- EN/ES/PT-BR cubren landing, waitlist y accesos. Portales internos conservan español.
- #126 (waitlist), #128 (QA) y #129 (móvil) siguen pendientes de publicación gradual. Registrar el commit final después de integrarlas; ninguna cifra de una rama acredita por sí sola esa versión.

## Evidencia disponible y pendientes

| Área | Evidencia acreditada | Pendiente |
| --- | --- | --- |
| Waitlist, #126 `82aaff2` | 613 pruebas de aplicación, 45 privadas, 11 contractuales, TypeScript, build, CI y Vercel; duplicado sintético en preview produjo una fila | Comprobar rechazo anónimo de la API en preview y publicar |
| Panel de waitlist | Administrador abrió, buscó, actualizó y recargó el listado; paciente rechazado en /admin/doctors y /admin/waitlist, sin correos visibles | Revisión de despliegue main tras merge |
| API de waitlist | HTTP anónimo real local: 401 y no-store; pruebas aisladas de administrador y no autorizado | La navegación del preview fue bloqueada por la herramienta/Vercel; no cuenta como rechazo de la aplicación |
| QA #128 | Médicos duplicados diferenciados en `7b56daa`; enlaces PT/accesos corregidos en `f979a82`, 588 pruebas y build/TypeScript locales | Integración, checks y revisión del commit que se publique |
| Móvil #129 | Revisión local parcial; `798960a`: 592 pruebas, TypeScript y build, incluidos orden/filtros y respuestas tardías | Matriz 360/390/430, escritorio, teclado, foco y 200%; preview autenticado requiere autorización específica |
| Video original | Receta #12: cinco transacciones auditadas, sin activación | Sanear códigos/cuentas; añadir complemento separado |

Guía del waitlist y su almacenamiento: [WAITLIST.md](WAITLIST.md). El rechazo del panel no se describe como una petición autenticada directa a su API.

## Publicación y revisión agrupada

1. Fusionar #126 sólo al completar su revisión. Verificar esquema/configuración antes de habilitar el registro en main; comprobar un correo sintético controlado, manteniendo las escrituras clínicas separadas.
2. Actualizar #128 sobre main, preservar acceso médico discreto, idioma y aviso de privacidad; ejecutar pruebas afectadas, TypeScript, build y CI/Vercel.
3. Actualizar #129 sobre el main resultante, aprobar diseño y regresiones. Mantener el preview aislado y escrituras clínicas apagadas.
4. Tras cada despliegue confirmar commit y tramo afectado. Detener la siguiente publicación si hay regresión; corregir o revertir mediante PR, sin borrar historiales.
5. Ejecutar aplicación, servicios privados, contratos, TypeScript y build sobre el commit integrado. Registrar resultados nuevos y comprobar accesos/salida, agenda, documentos y recibos tras recarga.

No repetir pruebas manuales acreditadas si el cambio no las afecta. Mientras el usuario utilice el computador, limitarse a código, pruebas aisladas y documentación.

## Complemento de grabación

Conservar el video original de #12 y sus cinco recibos como **ejecución A**. No activar la receta revocada, alterar su historial ni presentarla como activa. El complemento será **ejecución B**, con cuentas existentes y otra consulta/receta:

1. Verificar worker único con bloqueo exclusivo, relayer y colas resueltas. Preparar las sesiones antes de iniciar la consulta.
2. Paciente reserva y confirma asistencia; médico inicia y espera acreditación.
3. Paciente concede consentimiento independiente; médico emite dentro de los 30 minutos de vigencia contractual. Si vence, registrar otra consulta explícitamente.
4. Médico activa; paciente muestra estado activo y abre el documento. Médico finaliza la consulta.
5. Auditar todos los recibos reales. Para una cuenta médica ya autorizada se prevén acreditación, consentimiento, emisión y activación; registrar cualquier transacción adicional sin imponer un conteo.

No se requiere una nueva autorización médica ni una segunda revocación para este complemento. La reserva en interfaz, asistencia, lectura y finalización no se presentan como transacciones independientes.

## Paquete del revisor

Aplicación canónica: https://trustleaf-demo.vercel.app. Incorporar video saneado, versión de cada ejecución, QA, guía de usuario, arquitectura, operación del worker, límites y manifiesto de integridad.

| Ejecución | Tiempo del video final | Actor / acción | Contrato y método | Consulta / receta | Hash / Stellar Expert | Resultado |
| --- | --- | --- | --- | --- | --- | --- |
| A: original #12 | Pendiente de edición | Cada una de sus cinco operaciones reales | Según auditoría | #12 | Recibo real correspondiente | Según auditoría |
| B: complemento | Pendiente de grabación | Acreditación, consentimiento, emisión y activación | Según recibo | Nuevo ID real | Pendiente | Pendiente |
| A o B | Según edición | Acción de interfaz | Sin transacción | ID correspondiente | No aplica | Observación de interfaz |

Ocultar OTP de 00:37–00:43 y 03:38–03:44 del original y el selector de cuentas alrededor de 01:27; verificar también el resto del corte para no dejar exposiciones breves. Conservar el original local, sin publicar fotogramas sensibles. Los tiempos finales se toman después de editar, sin simular continuidad entre ejecuciones.

Antes del cierre exigir ausencia de duplicados e intentos inciertos. Incorporar de #119 sólo evidencia vigente y saneada; no fusionar documentación obsoleta automáticamente. [Semana 2](../week2-review/README.md) y [Semana 3](../week3-review/README.md) se conservan.

Stellar Testnet y contenido clínico sintético; el waitlist puede contener correos reales y tiene acceso restringido. El worker depende del equipo local encendido. PDF, landing de verificación y traducción de portales internos quedan fuera del cierre. El QR enlaza al recibo de emisión: no certifica el PDF ni consulta su estado vigente. La aceptación formal corresponde al revisor.
