# Creación clínica única en local

Este control permite una creación nueva autorizada para grabación sin habilitar el resto de las escrituras privadas. No añade una pantalla, ruta pública, contrato ni esquema. La ejecución anterior y sus recibos se conservan.

## Condiciones técnicas

- `TRUSTLEAF_PRIVATE_WRITES_ENABLED` debe seguir en **`false`**. Los demás flujos privados conservan ese bloqueo.
- La excepción requiere tres variables de servidor: `TRUSTLEAF_CLINICAL_CREATE_ONCE_WALLET`, `TRUSTLEAF_CLINICAL_CREATE_ONCE_RELAYER` y `TRUSTLEAF_CLINICAL_CREATE_ONCE_UNTIL` (segundos Unix).
- Sólo se admite entorno **local**, Neon dev, Stellar Testnet, configuración clínica vigente y ausencia de un entorno Vercel. El plazo debe estar vigente y no superar diez minutos; el procedimiento de grabación utiliza ocho minutos.
- Sólo el paciente autenticado cuya wallet coincida puede preparar y firmar **`create_history`**. Agregados, archivos, correcciones y cambios de permiso quedan rechazados.
- El relayer debe coincidir con la dirección configurada. El presupuesto total real del fee bump se limita a **1 XLM de Testnet**, incluyendo recursos, antes de persistir el intento, solicitar la firma y retransmitir.
- Una consulta bajo el bloqueo transaccional de la misma wallet reserva una única operación clínica por contrato y red. No se admite otro UUID, incluso si el primero termina, falla o se cancela. Se puede consultar o recuperar el mismo intento; no se borra para eludir la cuota.
- Un vencimiento o configuración parcial falla cerrado. Las lecturas y la reconciliación de recibos confirmados siguen disponibles; no se transmite desde un GET.

No configurar estas variables en `.env`, `next.config`, el cliente ni Vercel para la grabación. Se pasan sólo al proceso local temporal, sin secretos en argumentos. Al finalizar, reiniciar sin las tres variables y conservar el interruptor general apagado. Si el usuario se demora, el plazo bloquea firmas/transmisiones nuevas y el monitor local intenta volver al proceso de lectura; ante fallo detiene su proceso temporal.

## Procedimiento

1. Comprobar identidad/wallet con Privy, ausencia de historia en Neon y mediante `get_history_for_patient`, contratos/WASM/red, saldo y tres colas sin pendientes. La pantalla «Comienza tu historial» no basta para comprobar ausencia en cadena.
2. Conservar la autorización concreta del paciente, método, relayer y máximo. Una estimación sin firma no equivale al intento real ni a una transacción.
3. Arrancar la versión comprobada con el interruptor general apagado y la excepción temporal. Abrir «Preparar mi historial» una sola vez.
4. Auditar el intento persistido: actor, wallet, contrato, método, argumentos, firma pendiente, hash, vencimiento y comisión ofrecida ≤ 1 XLM. No continuar si hay discrepancia o vencimiento.
5. El usuario confirma manualmente con su cuenta Privy. Conservar sobre e intento antes de transmitir; si hay incertidumbre, recuperar el mismo intento sin nueva firma.
6. Comprobar recibo y resultado exactos, historial persistido, firma del paciente y pagador, comprobante contractual y colas finales. Apagar la excepción y recargar para comprobar persistencia. Crear el espacio no carga archivos ni concede permisos.

## Validación del control

Las pruebas aisladas cubren el rechazo de otro actor, método, configuración, red, base, relayer, plazo, comisión superior al máximo y segundo UUID. El recorrido de operaciones comprueba persistencia antes de transmisión, bloqueo de otros aportes y lectura de recibos tras vencer la excepción. La cuota reutiliza el bloqueo por wallet existente; las nuevas regresiones de cuota son secuenciales, no una nueva prueba SQL concurrente real.

El 19 de octubre de 2026: **992 pruebas de aplicación en 76 archivos**, **263 privadas** y TypeScript aprobados sobre las fuentes de esta rama. Estos resultados son aislados; no demuestran una creación nueva en Testnet. Build, commit, activación, recibo real y grabación deben registrarse por separado al ocurrir. No se presume aceptación del revisor.
