# SOW 2 · Modelo de amenazas de la historia clínica privada

Fecha: 5 de octubre de 2026. Alcance: semana 1, Stellar Testnet e información sintética. Este documento define controles y evidencia necesaria; no acredita por sí mismo que estén implementados, desplegados o aprobados.

## Activos y límites de confianza

- El contenido de notas, PDF e imágenes y sus claves son privados. Neon conserva registros y adjuntos cifrados de hasta 3 MB por archivo, según la decisión del usuario. El contrato no depende de dónde se guarden los bytes.
- La historia pertenece a una identidad interna estable asociada a una wallet verificada. Un correo no es la identidad estable, ni Privy acredita identidad civil o matrícula profesional.
- Stellar conserva propietarios, autorizaciones y pruebas de versiones. Las wallets, relaciones, tiempos y volumen de operaciones son públicos; cifrar documentos no oculta esos metadatos.
- El paciente controla lectura y agregado por separado. Un médico necesita además autorización vigente en el registro médico existente. El permiso para agregar no otorga permiso para descargar la historia.
- TrustLeaf custodia las claves y descifra para usuarios autorizados. No es cifrado de extremo a extremo. Comprometer el servidor y sus claves puede comprometer la confidencialidad.
- El relayer paga comisiones; no sustituye la firma del paciente ni la del médico. Un worker apagado puede retrasar reconciliación, pero no debe producir una confirmación inventada.

## Amenazas y controles que deben probarse

| ID | Amenaza | Control requerido | Evidencia de aceptación |
| --- | --- | --- | --- |
| T01 | Una identidad concede acceso a la historia de otra | Propietario derivado de una identidad autenticada y binding verificado; firma exacta del propietario en contrato | Otro paciente y el relayer no pueden crear o modificar el permiso; cambiar wallet o historia en argumentos invalida la firma |
| T02 | Un médico no autorizado agrega o lee información | Registro médico vigente y permiso correspondiente del paciente; denegar ante error al consultar el registro | Probar autorizado, revocado, vencido, pausado y proveedor inaccesible; lectura y agregado independientes |
| T03 | Una firma tardía restablece un permiso revocado | Revisión monotónica del permiso, incluida en las intenciones; revocación conserva un marcador en lugar de eliminar y reiniciar el estado | Firma preparada antes de revocar y antes de revocar/reconceder rechazada; la revisión nunca vuelve a cero |
| T04 | Una corrección sobrescribe un registro de otro autor | Autor original inmutable, versiones nuevas y cabeza previa esperada; médico requiere permiso actual también al corregir | Paciente no modifica nota médica, médico no modifica aportes ajenos; conflicto concurrente no pierde la versión anterior |
| T05 | Doble envío o respuesta RPC perdida produce duplicados | Identificador estable de operación ligado a todo su contexto; persistir sobre firmado y hash antes de transmitir; reconciliar el mismo intento | Dos solicitudes equivalentes generan una versión; mismo ID con contenido diferente rechazado; caída/reinicio no crea otra firma para un resultado incierto |
| T06 | Dos flujos compiten por la secuencia de una wallet | Coordinación compartida entre recetas y clínica antes de preparar o firmar; misma exclusividad durante reconciliación | Carrera entre ambos journals permite un solo intento activo por origen; una transacción incierta conserva su reserva |
| T07 | Un operador o atacante altera ciphertext o referencias | Cifrado autenticado y compromiso vinculado a red, contrato, historia, autor, entrada, versión y contexto anterior | Cambiar bytes, clave, historia, versión o referencia rompe descifrado/verificación antes de devolver contenido |
| T08 | Un atacante adivina antecedentes comparando hashes públicos | Compromisos con aleatoriedad privada e impredecible; esa aleatoriedad viaja sólo dentro del contenido cifrado | El mismo contenido preparado dos veces tiene comprobantes distintos; ABI/eventos/logs no contienen datos clínicos ni la aleatoriedad |
| T09 | Tras revocar se descarga usando permiso o enlace antiguo | Consulta vigente antes de cada entrega; ninguna URL pública o caché compartida de documentos; denegar si no se puede verificar | Retirar lectura impide la siguiente entrega; un estado anterior no se presenta como vigente; respuesta lleva política de no almacenamiento |
| T10 | Una respuesta de la sesión anterior revela contenido | Validar identidad en servidor en cada petición, y descartar respuestas tardías en el cliente | Sesión vencida, cambio de cuenta y cierre durante carga no muestran datos de la identidad anterior |
| T11 | Archivar datos del contrato reinicia permisos o evita controles | Persistencia y TTL de propietario, revisiones, versiones e idempotencia; restauración explícita sin asumir ausencia por error | Extensión y restauración conservan revocaciones y revisiones; estado no disponible bloquea la operación en vez de recrearlo |
| T12 | Una clave ausente, perdida o rotada hace fallar custodia | No hay fallback a texto plano; clave identificada/versionada fuera de Neon; respaldo, recuperación y rotación comprobados | Arranque rechaza clave ausente/incorrecta; clave histórica recupera contenido anterior; rotación no cambia el compromiso clínico |
| T13 | Un archivo excesivo o tipo engañoso daña servicio o interfaz | Límite de 3 MB sobre bytes originales, lista explícita PDF/PNG/JPEG y comprobación de firma binaria; no SVG/HTML; servir como descarga privada | Se rechazan archivo vacío, excedido, tipo discordante y bytes no admitidos; no hay previsualización activa de archivos no confiables |
| T14 | Un log, recibo o error expone información privada | Errores tipados y evidencia saneada; no imprimir contenido, credenciales, claves, tokens o mensajes completos del proveedor | Revisión de eventos, ABI y captura de logs de pruebas; recibos públicos sólo contienen datos mínimos del contexto técnico |
| T15 | Se publica contra main o se reutiliza una autoridad entre bases | Guardas de red, contrato y host de Neon; manifiesto de entorno; datos nuevos aislados y claves de prueba independientes | Configuración equivocada rechazada antes de escribir; no se procesan trabajos ajenos; evidencia distingue dev/Testnet de main |
| T16 | Un administrador altera las reglas o sustituye al propietario | Contrato sin función de upgrade ni transferencia administrativa de historias; dirección de registro médico fijada al desplegar | Revisar ABI y WASM; pruebas de ausencia de bypass y preservar huellas de despliegue |

La revocación bloquea entregas posteriores realizadas por la plataforma, pero no elimina archivos ya descargados. Una descarga autorizada que ya se completó no se puede retirar. Debe definirse y probarse la comprobación inmediatamente anterior a entregar bytes, especialmente si revocación y lectura ocurren a la vez.

El límite de 3 MB corresponde a bytes originales del adjunto, no al tamaño de la envoltura cifrada o a su representación base64. El cifrado y los formatos de transporte añaden tamaño. La validación de firma binaria reduce tipos engañosos; no constituye un antivirus ni acredita que un PDF carezca de contenido malicioso.

## Reutilización y diferencias respecto del flujo existente

La revisión inicial encontró patrones reutilizables: cifrado AES-256-GCM con contexto autenticado; comprobantes de recetas con aleatoriedad; binding firmado de wallet; firma Privy de una intención persistida; comprobación de recibos exactos antes de confirmar. Son antecedentes, no evidencia de cobertura de la nueva historia clínica.

`private_operations` está limitado a acciones de receta y exige una consulta. La clínica necesita un journal separado: no se deben crear consultas ficticias para reutilizar esa tabla. El bloqueo actual por wallet y el índice de una operación activa protegen el journal de recetas; un segundo índice independiente no coordina ambos flujos. Se requiere una reserva compartida o una comprobación de ambos journals bajo el mismo bloqueo transaccional.

El contrato clínico archivado y las rutas antiguas no acreditan el nuevo modelo. Tampoco deben reutilizarse excepciones de lectura histórica de recetas para permitir leer historias después de retirar un permiso.

## Preparación de una demostración aislada

1. Leer la configuración sin mostrar valores sensibles. Verificar Testnet, host de Neon dev permitido, IDs de contrato y correspondencia entre manifiesto y WASM. Rechazar producción, host desconocido o discrepancias; no inferir que `--test` significa que un script es de lectura.
2. Comprobar esquema y colas mediante una conexión en transacción de sólo lectura. Informar existencia de tablas y conteos de pendientes, sin correos ni documentos. Si hay intentos inciertos de las wallets elegidas, reconciliarlos antes de preparar operaciones nuevas.
3. Aplicar exclusivamente el esquema nuevo autorizado en el entorno aislado. Los datos existentes y las tablas de SOW 1 se conservan; la demostración utiliza IDs capturados y nombres de ejecución distintos.
4. Registrar un manifiesto público con red, commit, hash WASM y contratos. Mantener claves y sobres privados en almacenamiento excluido de Git. Los actores sintéticos y sus claves no deben reutilizar autoridades con trabajos activos en otro entorno.
5. Demostrar autorización → aporte sintético con adjunto → lectura e integridad → revocación → rechazo posterior. Guardar por operación su intención, hash, recibo y resultado comprobado; no llamar confirmado a un intento pendiente.
6. Auditar todas las operaciones guardadas tras el recorrido, comprobar que no quedan resultados inciertos y separar pruebas con mocks, SQL real, transacciones Testnet y acceso real mediante Privy.

Los antiguos scripts `validate-private-flow-testnet` y `validate-private-registry-testnet` realizan escrituras y firmas. No son un preflight de sólo lectura y no deben ejecutarse para comprobar simplemente configuración o disponibilidad. El migrador general también ejecuta todas sus etapas y debe revisarse antes de aplicarlo; no protege por sí solo el host de destino.

## Estado acreditado y pendientes

Contrato, permisos, cifrado, SQL real y coordinación de journals están acreditados en la matriz de aceptación. CI/Vercel aprobados para db9bc2f. Quedan revisión de PR, grabación y restauración real de estado archivado. Privy clínico, recuperación portable y alojamiento permanente no se presentan como entregados. No se acredita certificación ni auditoría externa.
