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
