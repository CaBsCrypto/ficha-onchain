# Semana 2 · Publicación de consulta en trustleaf.org

## Alcance

La entrega añade **Ficha clínica** a MI PORTAL del paciente, conservando `/patient?tab=historial`. En producción las escrituras clínicas permanecen apagadas: consulta de antecedentes, archivos, versiones, permisos observados y recibos existentes. La capacidad de escritura la decide el servidor; la interfaz falla cerrada si no la recibe. Los endpoints mantienen su comprobación independiente antes de preparar, firmar o transmitir.

## Datos e infraestructura

- Stellar Testnet y contratos existentes. No se desplegaron contratos ni se generaron transacciones para publicar.
- Neon de destino separado del desarrollo y del proyecto que sirve `cannabis.trustleaf.org`.
- Se copia exclusivamente una ficha sintética: cuatro entradas, cinco versiones y nueve operaciones confirmadas. Se excluyen intentos cancelados, ejecuciones de semana 1 y colas pendientes.
- Los cinco documentos se reenvuelven con una clave exclusiva del servidor: ciphertext clínico, contexto y comprobantes permanecen iguales. La clave local no se traslada. Respaldo DPAPI local ligado al usuario de Windows; no constituye recuperación independiente del equipo.
- Los sobres firmados y fingerprints históricos se conservan íntegros. Sus UUID no se reutilizan para nuevas preparaciones. El nuevo keyring permite leer las versiones reenvueltas; no habilita reintentar preparaciones históricas con la clave anterior.
- Migración clínica explícita, restringida al host Testnet autorizado; sin ejecutar migraciones generales ni modificar recetas o perfiles existentes.

## Comprobaciones previas

2026-10-21: lectura actual de Testnet y autenticación local de las cinco versiones aprobadas. Nueve sobres confirmados conservan hash y firmas válidas. Cero pendientes en origen y destino. Ensayo de importación con rollback aprobado antes de aplicar.

Aplicación: 1.016 pruebas. Servicios privados: 263 pruebas. TypeScript y compilación local aprobados. CI y comprobación del despliegue se registran con la versión publicada.

## Recorrido para revisar

1. Iniciar sesión en `https://www.trustleaf.org/patient?tab=historial`.
2. La cuenta `brownsonchain@gmail.com` no tiene ficha: debe mostrar el estado vacío y no permitir crearla en este modo.
3. El historial existente para la demostración pertenece a `brownsstudiocontact@gmail.com`: verificar notas, PDF con dos versiones, imagen y recibos.
4. Consultar permisos sin editarlos y recargar. No pulsar firmas ni activar escrituras.
5. Los códigos se ingresan únicamente en Privy; la sesión autenticada y la revisión visual final del historial alojado se comprueban en el navegador.

La disponibilidad de lectura depende de RPC y TTL de Testnet. Si un estado está archivado o no puede verificarse, se muestra error y reintento; no se presenta evidencia histórica como una consulta vigente. Una restauración requiere una autorización separada y queda fuera de esta publicación.

## Reversión

Reasignar la versión anterior de **trustleaf-demo** si aparece un problema; mantener escrituras apagadas. Conservar las tablas nuevas, el respaldo de claves y los recibos importados. No borrar evidencia ni desactivar triggers para retroceder. No modificar el proyecto **trustleaf**, CNAME, alias ni rutas QR de cannabis.

## Corrección de la consulta del directorio médico

La revisión autenticada del 21 de octubre encontró un bloqueo: después de verificar las cinco versiones y sus recibos, una consulta de autorización de otro médico cancelaba el snapshot completo. La ficha del propietario no requiere el acceso de ese médico.

Las lecturas de cada médico se realizan en secuencia para no solapar el watermark del ledger. Si no puede verificarse su identidad, autorización o permiso, ese médico no se incluye entre los estados comprobados y el portal muestra un aviso de verificación incompleta. No se inventan permisos ni se habilitan controles para entradas desconocidas. La comprobación del propietario, contenido, integridad y recibos sigue siendo obligatoria y un fallo mantiene bloqueados los documentos.

El proveedor de producción se selecciona explícitamente como SDF Testnet tras comprobar que vuelve a responder. No hay fallback automático, nuevas firmas ni restauraciones. El estado del directorio incompleto se registra como límite, separado de la disponibilidad de la ficha propia.
