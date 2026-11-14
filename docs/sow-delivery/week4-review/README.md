# Semana 4 — Cierre del SOW

> Nota de copia pública · 22-10-2026: Las referencias a evidencias nuevas o propuestas excluidas conservan la procedencia histórica; esos archivos no están incluidos en esta copia y sus comprobaciones no se repitieron.

> **Actualización 27-09-2026:** el responsable confirmó que la grabación y el changelog ya fueron entregados. La aceptación del revisor sigue pendiente. Las menciones inferiores a «pendiente de grabar» describen el estado histórico del 23 de septiembre, no una solicitud de repetir la grabación. Falta identificar y auditar los recibos del material nuevo antes de atribuirle resultados. Véanse el [estado actualizado de resultados](../../proposals/sow-cycle-2/RESULTADOS-D4.md) y la [propuesta del segundo ciclo](../../proposals/sow-cycle-2/PROPUESTA.md). La preparación del worker #134 está separada y no significa alojamiento activo.


Estado al 23 de septiembre: **producto integrado y publicado; complemento de video y cierre de evidencia pendientes**. Este documento no declara entregado ni aceptado D4.

## Versión y accesos

- #125 está fusionada en main (`0d9ba91`): Iniciar sesión abre Privy desde la landing y el paciente entra automáticamente tras autenticarse. El usuario confirmó el ingreso nuevo sin segundo clic.
- `/login`, `/login/patient` y los enlaces antiguos del paciente mantienen compatibilidad hacia la landing con intención de acceso. Visitar la landing con sesión no redirige automáticamente.
- Médico: `/login/doctor`; administrador: `/login/admin`, sin enlaces públicos. La ruta no concede permisos.
- EN/ES/PT-BR cubren landing, waitlist y accesos. Portales internos conservan español.
- #126 (waitlist), #128 (QA) y #129 (móvil) están fusionadas. Versión publicada: `6e8dfb450f0a4451544ea01c87e368d84814ff8e`; CI aprobado y Vercel Ready `dpl_3EjERAuckTattcdY8ntSNRvywVfR`, con alias canónico comprobado.
- La candidata probada `1c694ba` y el squash publicado comparten árbol Git `a0d73050980791c3a709d4223cf1db7c76e12025`: 644 pruebas de aplicación, 45 privadas, 11 contractuales, TypeScript y build aprobados. No se presentan como una nueva ejecución de pruebas de hoy.
- #130 permanece en borrador y no bloquea D4; todavía no existe una comparación fiable que acredite su beneficio de rendimiento.

## Evidencia disponible y pendientes

| Área | Evidencia acreditada | Pendiente |
| --- | --- | --- |
| Waitlist #126 | Publicada en `6fb3e42`; esquema/configuración comprobados; dos envíos sintéticos normalizados en main produjeron una fila | Sin bloqueo de publicación conocido |
| Panel de waitlist | Administrador abrió, buscó, actualizó y recargó; paciente rechazado sin correos visibles en preview | No confundir rechazo del panel con petición directa autenticada al endpoint |
| API de waitlist | GET sin token: 401/no-store/sin correos en local, preview con acceso legítimo de Vercel y main | Reutilizar evidencia mientras no cambie el control |
| QA #128 | Publicada en `2467aa9`, CI/Vercel aprobados; enlaces de landing PT observados; distinción de médicos cubierta por regresión | Dataset aislado con un médico no acredita observación visual de duplicados |
| Móvil #129 | Preview aislado autorizado y autenticado; Inicio/Consultas/Recetas/Cuenta a 360/390/430/1280 sin desbordamiento horizontal; reserva abierta y cerrada sin enviar; 200% confirmado por el usuario | Geometría y muestras de foco no equivalen a auditoría exhaustiva de accesibilidad |
| Main y documentos | Paciente abre #10 activa y #11 revocada; orden activas primero; administración y entrada médica observadas; salida a landing sin abrir Privy | Revalidar sesiones e infraestructura justo antes de grabar |
| Video original | Receta #12: cinco transacciones auditadas, sin activación | Sanear códigos/cuentas; añadir complemento separado |

Guía del waitlist y su almacenamiento: [WAITLIST.md](WAITLIST.md). El rechazo del panel no se describe como una petición autenticada directa a su API.

## Versión congelada y revisión restante

Resultados sin transacciones: [ADDITIONAL-QA.md](ADDITIONAL-QA.md), 131 casos seleccionados de aplicación y 22 privados aprobados. La [auditoría intensiva](INTENSIVE-AUDIT.md) posterior añade 186 casos y una observación diagnóstica; cierra la recuperación del recibo de consentimiento desde paciente en main. Mantiene pendiente el contraste de foco nativo y registra discrepancias de narrativa, enlaces del pie y estado anterior tras fallo de actualización, sin corregir producto.

1. Conservar la versión publicada. Corregir únicamente bloqueos reproducidos mediante PR; repetir los controles afectados si cambia el árbol probado.
2. Reutilizar el QA acreditado y distinguir observación de navegador, pruebas aisladas y confirmación del usuario.
3. No crear consultas durante la preparación del día anterior. Comprobar worker único, relayer, colas y sesiones nuevamente al grabar.
4. Usar un navegador alternando cuentas existentes; pausar la captura para los códigos Privy. No exigir sesiones simultáneas.

No repetir pruebas manuales acreditadas si el cambio no las afecta. Mientras el usuario utilice el computador, limitarse a código, pruebas aisladas y documentación.

## Complemento de grabación

Preparación del 23 de septiembre: [PRE-RECORDING.md](PRE-RECORDING.md), con cierre ordenado del worker, límites del QA y mapa separado por ejecución.

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
