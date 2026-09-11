# Prescription: nueva interfaz de contenido privado

Estado: implementada, compilada y probada localmente en `contracts/prescription-private`. No desplegada ni conectada a `/api/mint`. El contrato histórico y sus lectores se conservan. No se ha cambiado la emisión de la app; no debe confundirse con esta versión nueva.

## Autorización de atención incorporada

El paciente debe autorizar previamente al médico para una emisión identificada y con vencimiento. La interfaz v2 exige además una atestación de reserva firmada por la autoridad configurada, con los mismos participantes e identificador y aún vigente. El contrato consume ambas autorizaciones al emitir. Ver [plan de consulta y consentimiento](PLAN_CONSULTA_CONSENTIMIENTO_RECETA.md).

## Qué publica

| En cadena | Fuera de cadena, cifrado |
|---|---|
| Cuenta del médico y del paciente | Identidad y datos de contacto |
| ID de receta y estado | Medicamento, dosis, cantidades, instrucciones |
| Huella de compromiso del documento | Documento clínico completo y sus adjuntos |
| Versión de esquema | Secreto aleatorio usado en el compromiso |
| Emisión y vencimiento | Evidencia privada y permisos de acceso |

El identificador de emisión aleatorio también es público como argumento de la transacción. Se genera una sola vez por emisión y se conserva en reintentos. No usar RUT, licencia, email, diagnóstico ni texto clínico para construir ese identificador.

Wallets, vínculos, actividad y tiempos siguen visibles. Esto protege el contenido, no proporciona anonimato. Datos publicados en contratos anteriores no se eliminan. No se exige que la cuenta del paciente sea secreta para que esta versión funcione, pero tampoco se promete su privacidad.

## Controles

`mint_prescription` exige la autorización Soroban del médico y consulta `is_authorized` en el Registry configurado. Un error de consulta no autoriza. El relayer puede pagar, pero no reemplazar al médico. La receta es intransferible: no existe función para cambiar su paciente.

`activate` requiere firma del médico o paciente y una receta registrada, no vencida. `revoke` requiere la firma del emisor; `block`, la del administrador. Estados terminales no se reactivan. Revocar al médico bloquea nuevas emisiones pero no revoca automáticamente sus recetas previas.

El contrato rechaza reutilizar el identificador de emisión del mismo médico y el mismo compromiso para médico/paciente, incluso después de revocar. No puede detectar que dos compromisos diferentes contienen el mismo documento oculto: el backend debe conservar el identificador y el secreto entre reintentos. No se afirma deduplicación semántica de contenido privado.

La huella v1 incluye dominio, red, contrato, médico, paciente, identificador de emisión, vencimiento, documento JSON normalizado y secreto aleatorio de 32 bytes. El módulo `scripts/lib/private-prescription.mjs` reutiliza el cifrado autenticado existente para expedientes privados y rechaza guardar sin clave. La normalización ordena claves de objetos, preserva el orden de arrays y no admite valores ajenos a JSON.

## Dispensación: decisión de alcance explícita

Esta versión implementa emisión, activación, consulta, revocación y bloqueo. No implementa dispensación parcial ni cantidades públicas; por ello no necesita aún DispensaryRegistry. No sustituye íntegramente el ciclo de dispensación del contrato anterior. Añadir dispensación privada exige definir quién verifica el saldo y evita doble dispensación, mediante otro diseño verificable; no se traslada silenciosamente esa garantía a una base de datos.

## Validación local realizada

- Siete escenarios Rust, con el Registry privado real en el host de pruebas: emisión autorizada y rechazada, firma ausente, bloqueo, activación, vencimiento, revocación y reintentos duplicados.
- Una prueba de compromiso/cifrado: documento recuperable con clave, rechazo sin clave, correspondencia determinista y cambio de huella al alterar contenido, destinatario o contexto.
- Compilación Stellar CLI para `wasm32v1-none`; WASM optimizado de 11358 bytes (interfaz v2).
- Inspección de la interfaz del WASM: no incluye medicamento, dosis, cantidad, diagnóstico, documento, URL ni argumentos de tipo String. Los eventos del código publican solo el ID de receta.

WASM SHA-256: `4703d26f7ed6321c4c5f1bcb20ac9392c43c79fae3e0f16adbc7ac70e738155c`.

## Próximo paso

Crear la persistencia de recetas privadas con estado de envío y conciliación; conectar autorización del médico y relayer sin fallback de éxito simulado; desplegar contra el Registry privado y verificar una emisión real con su recibo y lectura posterior. Integrar consultas privadas autenticadas para mostrar el contenido al paciente. No se afirma que esas piezas estén implementadas ni que las pruebas locales equivalgan a la validación en Testnet.

La interfaz v2 y el límite entre reserva privada y atestación pública se detallan en [arquitectura de atestación](ARQUITECTURA_ATESTACION_RESERVA.md). El constructor recibe administrador, Registry y autoridad de reservas; no reutilizar instrucciones de despliegue de la interfaz v1.
