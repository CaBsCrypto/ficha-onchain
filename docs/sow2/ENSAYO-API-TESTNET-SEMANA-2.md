# Semana 2 · Ensayo por scripts antes de grabar

## Qué acredita

El validador usa las APIs clínicas de la aplicación local, una sesión auténtica de Privy y Stellar Testnet. No utiliza las claves técnicas de semana 1 ni accede directamente a Neon. Se conserva aquella ejecución y su visor.

El ensayo automatiza **el recorrido del paciente de semana 2**. No sustituye la revisión de la interfaz ni el ingreso manual de códigos; tampoco acredita el portal médico de semana 3. Las pruebas aisladas, la inspección autenticada y las transacciones reales se registran por separado.

## Preparación

1. Reiniciar la aplicación local desde el commit revisado en `127.0.0.1:3016`. El commit del script no demuestra por sí solo qué versión atiende ese puerto.
2. Comprobar Neon dev, clave clínica web y sus versiones, contratos y Testnet. Conservar el entorno de semana 1 y los respaldos. No trasladar secretos a un preview.
3. Seleccionar la wallet **existente** del paciente de prueba, el ID y wallet de un médico autorizado y la clave **pública** del relayer. No usar el médico sintético vencido de semana 1 como si estuviera vigente.
4. Empezar con escrituras apagadas. El validador no crea wallets, financia cuentas, despliega, restaura contratos ni cambia variables del servidor.

El preflight consulta red, WASM e interfaces del contrato clínico y registro médico, autoridad, autorización médica con al menos 15 minutos de margen, existencia de la cuenta paciente y saldo del relayer. La API mantiene sus propias comprobaciones de entorno, identidad, permisos e intentos de otras colas.

## Inspección sin nuevas transacciones

```powershell
node scripts/validate-clinical-web-testnet.mjs --inspect --patient G_PUBLICA_PACIENTE --doctor-id ID_MEDICO --doctor-wallet G_PUBLICA_MEDICO --relayer G_PUBLICA_RELAYER
```

Sustituir los cuatro valores por identificadores públicos reales. La terminal muestra un enlace local en el puerto **3018**. Abrirlo, ingresar a Privy y pulsar el botón del modo de inspección. Los códigos van únicamente en el modal de Privy. No pegar tokens en terminal, chat o archivos.

La inspección no llama a preparación, firma o reintento. Sus GET pueden actualizar el vínculo de wallet o reconciliar operaciones en Neon: significa **cero transacciones nuevas**, no cero escrituras de base. Un intento incierto o un fallo de consulta detiene el ensayo y queda pendiente; no aprueba el recorrido.

## Ejecución sintética

Tras revisar la inspección, acordar el ensayo real y habilitar explícitamente las escrituras **sólo en el entorno local aislado**. La herramienta no lo hace automáticamente.

```powershell
node scripts/validate-clinical-web-testnet.mjs --run --run-id UUID_V4 --confirm-synthetic-testnet --patient G_PUBLICA_PACIENTE --doctor-id ID_MEDICO --doctor-wallet G_PUBLICA_MEDICO --relayer G_PUBLICA_RELAYER
```

Crear un UUID una vez, conservarlo y reutilizarlo al reanudar. El acompañante explica el alcance y exige otra confirmación antes de entregar la sesión al script. Autoriza únicamente los fixtures sintéticos de este ensayo, no operaciones con datos clínicos reales.

| Paso | Firma | Resultado comprobado |
| --- | --- | --- |
| Crear historial | Paciente, mediante Privy | Propietario e identificador del historial |
| Agregar PDF | Paciente | Versión 1 y descarga idéntica al fixture |
| Agregar antecedente | Paciente | Texto sintético y procedencia del paciente |
| Agregar imagen PNG | Paciente | Archivo legible y descarga íntegra |
| Corregir PDF propio | Paciente | Versión 2; versión 1 sigue disponible |
| Conceder sólo lectura | Paciente | Lectura sí, agregado no |
| Conceder sólo agregado | Paciente | Lectura no, agregado sí |
| Retirar ambos permisos | Paciente | Ambos permisos apagados |

Son **ocho operaciones previstas** en el contrato clínico existente, con patrocinio del relayer. El médico es destinatario del permiso; no firma aportes en este ensayo del paciente. El validador requiere un historial web nuevo para una ejecución nueva; no adopta uno existente sin su journal. Si ya existe, conservar sus datos y definir una comprobación distinta, sin recrearlo.

PDF y PNG son pequeños, sintéticos y legibles. El máximo del producto continúa en **3.000.000 bytes originales**; no se cambia ni se comprime automáticamente. JPEG y rechazos de tamaño/formato están cubiertos por pruebas aisladas y deberán identificarse como tales hasta observarlos realmente.

## Confirmaciones y recuperación

Se guarda el UUID y payload antes de preparar y la fase antes de pedir firma. Una preparación con respuesta perdida se recupera con el mismo UUID y payload. Si se pierde una respuesta de firma, se consulta **el mismo intento**; no se pide otra firma ni se crea otro UUID. Un estado `submitted`, incluso vencido, sigue siendo incierto mientras no haya prueba de resolución. El script no retransmite automáticamente.

Cada confirmación exige el recibo RPC, hash del sobre fee-bump, firma del paciente y del pagador, contrato, método, argumentos y resultado, además del comprobante persistente del contrato. El documento se descarga autenticado y se compara con el fixture. Su comprobante cegado lo verifica el servidor al leer: el script no promete reconstruirlo desde el texto sin su aleatoriedad privada.

Journal e informe quedan bajo `.trustleaf-local/clinical-web-rehearsal/<run-id>/`, ignorados por Git. El token sólo se mantiene en memoria del proceso; Privy conserva su propia sesión habitual en el navegador. El acompañante no agrega almacenamiento propio de tokens. No publicar el journal completo ni capturar códigos, correos o encabezados. Ante cierre abrupto, comprobar el proceso propietario antes de retirar un bloqueo local; conservar siempre el journal.

Para lectura posterior, iniciar otro proceso con `--inspect --run-id EL_MISMO_UUID` y nueva sesión. Un recibo fuera de la retención del RPC queda no verificable por este auditor; no se reemplaza por un resultado histórico guardado.

## Gate antes de grabar

Exigir resultado real aprobado, persistencia desde otro proceso, cero intentos inciertos y revisión autenticada de presentación, recarga y cambio de cuenta. Completar móvil/teclado/texto al 200 % pendientes. Una suite verde o una inspección aprobada no significan que las ocho transacciones ya ocurrieron.

La preparación de esta herramienta no habilita escrituras ni declara listo el video. Registrar commit, fecha, categoría de evidencia y recibos reales cuando se ejecute el ensayo.
