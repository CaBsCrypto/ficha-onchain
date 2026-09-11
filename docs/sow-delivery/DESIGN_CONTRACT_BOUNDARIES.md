# Límites de diseño y aceptación — contratos de semana 1

Documento de diseño: 2026-09-07 UTC. Basado exclusivamente en [SOW aportado](SOW_WEEK_1_SOURCE.md), [mapa de datos](MEDICAL_DATA_FLOW.md) y [reconciliación de versiones](SOW_WEEK_1_RECONCILIATION.md). Describe responsabilidades y condiciones propuestas de aceptación; no acredita implementación, pruebas nuevas, despliegue ni seguridad clínica.

## Alcance y propiedad de la receta

La semana 1 comprende DoctorRegistry, PrescriptionSoulbound, sus pruebas y disponibilidad verificable en Stellar Testnet, además de infraestructura de relay. No incorpora automáticamente ClinicalRecord, DocumentSoulbound, producción clínica ni pruebas de conocimiento cero.

La decisión de producto confirmada interpreta patient transfer como entrega inicial a la cuenta del paciente al emitir. La receta conserva ese titular y no admite retransferencia. Revocar modifica su estado y conserva su historial. Conservar historial no implica publicar contenido clínico ni dar acceso irrestricto a documentos privados.

## Responsabilidades por actor

| Actor o componente | Responsabilidad | Límite que debe documentarse y comprobarse |
| --- | --- | --- |
| Administrador de DoctorRegistry | Gestionar registro, autorización, revocación y transferencia administrativa | La identidad y autoridad administrativa deben quedar establecidas para la versión entregada; no se presume equivalencia del Registry actual con el fuente local. |
| Médico emisor | Emitir dentro de su habilitación y revocar sus recetas | Una sesión HTTP y una wallet habilitada son identidades diferentes hasta que el flujo demuestre su vinculación. La clave demo custodial no representa una firma personal del profesional conectado. |
| Paciente | Recibir la receta y conservar acceso autorizado a su historial privado | La entrega no habilita retransferencia. Consentimiento declarado por formulario no equivale por sí solo a consentimiento firmado. |
| Farmacia o dispensario | Operar únicamente dentro de permisos específicos del flujo | Que el médico ejecute una acción no concede permisos de farmacia. Las rutas que alteran estado deben respetar sus propias autorizaciones aunque no sean una funcionalidad separada del hito. |
| Relayer | Facilitar envío y pago de transacciones autorizadas | Pagar la comisión no sustituye autoridad del actor ni consentimiento. Evidencia SDK no prueba configuración efectiva del portal. |
| API y almacenamiento privado | Vincular sesión, rol y operación; conservar documentos recuperables con acceso y llaves definidos | No deducir cifrado, persistencia completa o relación asistencial de comentarios o de controles presentes en otra ruta. |

## Evidencia pública mínima y clínica privada

El diseño objetivo debe distinguir evidencia verificable de ejecución de la información necesaria para la atención. En público se propone conservar únicamente identificadores técnicos y compromisos documentales necesarios, estado y evidencia de las transacciones, con una evaluación explícita de los metadatos y vínculos que puedan revelar. Las wallets, tiempos y relaciones entre operaciones también permiten correlación: no se describen como anónimos.

Documento clínico completo, datos identificatorios, diagnóstico, medicamento y dosis deben tratarse como contenido privado sujeto a permisos, retención y gestión de llaves definidos. La información necesaria para una farmacia debe entregarse por un canal autorizado; que sea necesaria para dispensar no la vuelve apta para publicación permanente.

El mapa de datos registra que la implementación base publica medicamento y dosis junto a wallets. Por tanto, este objetivo **no está acreditado como cumplido**. Cambiar el diseño futuro tampoco elimina datos previamente publicados. La demostración debe usar exclusivamente valores sintéticos.

Un hash permite comprobar correspondencia con un documento bajo un formato definido; no cifra ese documento ni prueba su veracidad, consentimiento o autoría humana. La aplicación debe establecer dónde se conserva el original, quién puede recuperarlo y cómo se administran y revocan accesos y llaves. Este documento no confirma esas operaciones.

## Condiciones de aceptación

| Condición | Evidencia necesaria para cerrar |
| --- | --- |
| Alcance contractual | Requisito vinculado a DoctorRegistry o PrescriptionSoulbound, con interpretación de entrega inicial y revocación aceptada. |
| Versión identificada | Commit, fuente, artefacto y hash vinculados al Contract ID correspondiente; procedencia del Registry aclarada. |
| Operaciones autorizadas | Pruebas de rechazo y flujos válidos de la misma versión final, cubriendo autoridad de cada operación que pueda modificar el ciclo. |
| Ciclo e identidad | Registered → Active → Revoked, titular inmutable, historial conservado y prevención de reemisión de la misma identidad según regla documentada. |
| Estado e información | Consultas coherentes con estados y vigencia, cambios rastreables y límites de información pública descritos con precisión. |
| Entrega Testnet | Ambos IDs verificables y evidencia sintética de la versión final; pago del relayer distinguido de firma/autorización del actor. |
| Presentación del portal, si se muestra | Ensayo autenticado sintético del flujo real, con modo, destino de datos y Contract IDs comprobados. No reemplazarlo por resultados SDK. |
| Aceptación formal | Responsable revisa evidencia y límites; resultados nominales anteriores no equivalen a aceptación de modificaciones posteriores. |

La reconciliación registra cambios locales parciales sin validación ni despliegue. El estado defendible sigue siendo demostración funcional de una versión anterior, con remediación y evidencia final pendientes. No presentar este diseño como cierre de esos pendientes.

## Reparación frente a reescritura

Para diferencias acotadas de controles, conviene conservar requisitos, contratos de interfaz e historial y preparar una reparación trazable. Una reescritura requiere justificar qué requisito no puede atenderse de forma acotada y añadir su propio plan de compatibilidad, migración y validación; no aporta seguridad por el solo hecho de reemplazar código.

La decisión se toma sobre el cambio concreto y su impacto. Una reparación local también puede producir otro WASM y requerir otra ID. Ni reparar ni reescribir permite atribuir evidencia de un binario anterior a uno nuevo.

Cambios de ABI o Contract ID requieren una decisión explícita y evidencia de compatibilidad para SDK, API y portal. Preparar fuente, build, manifiesto y referencias históricas antes de solicitar la operación externa correspondiente. No asumir una función de actualización existente ni sobrescribir la referencia de recetas antiguas. Este documento no autoriza publicar, fusionar, migrar, desplegar o enviar transacciones.

## ZK como opción específica

ZK solo se considera cuando exista un predicado concreto que deba probarse sin revelar sus entradas, por ejemplo una propiedad delimitada de una credencial. Antes de incorporarlo se deben definir emisor, entradas públicas, vinculación con la solicitud, revocación, prevención de reutilización y verificación compatible con la plataforma.

ZK no aporta anonimato automático, no corrige autorización HTTP, no configura cifrado y no elimina datos ya publicados. No es requisito de esta semana ni sustituye minimización de datos, permisos o gestión de llaves.

## Límites del trabajo documental

No se inspeccionó código nuevo, no se realizaron auditorías adicionales, pruebas, operaciones de red ni cambios de contrato en este bloque. El diseño no constituye certificación externa ni habilitación para recetas reales. La restricción de plataforma sobre la corrección anterior permanece: este documento no la reanuda por otra vía.
