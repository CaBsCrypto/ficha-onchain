# Semana 2 · Velocidad de consultas privadas

Actualizado el 21 de octubre de 2026. Alcance: lectura de la ficha clínica y recetas existentes; sin nuevas operaciones Stellar, cambios de permisos ni datos clínicos nuevos.

## Cambios

- Ficha clínica: una preparación estática por solicitud para red, código, interfaz y cuenta de simulación, reutilizada entre versiones. Se renueva a los 30 segundos; se conserva el ledger máximo y se comprueba el TTL conocido. Las consultas que comparten ese control se ejecutan en orden.
- Cada documento mantiene las comprobaciones nuevas de identidad, wallet, permiso, versión y comprobante antes y después de descifrar. La autenticación se consume una vez en cada puerta, sin duplicarla inmediatamente dentro de la misma comprobación. No se comparten permisos ni contenido entre solicitudes.
- La cuenta de simulación se obtiene una vez por instancia y se clona para cada lectura. La preparación de transacciones continúa consultando su cuenta actual por separado.
- Recetas: verificación en tandas de hasta tres registros; un registro que no se pueda comprobar rechaza la respuesta completa. La lista del paciente deja de volver a consultar automáticamente cada tres segundos; muestra la fecha y un botón Actualizar. El recorrido del médico conserva su actualización periódica.
- Las consultas de ficha y descargas tienen un plazo de 90 segundos, que incluye token Privy y lectura del cuerpo HTTP. Al vencer, se aborta y se permite volver a consultar; una respuesta tardía no devuelve contenido anterior. Este plazo no se aplica a las firmas ni reintenta mutaciones.

No se agrega caché global, CDN ni almacenamiento de contenido descifrado. Cada petición comprueba nuevamente los datos que autoriza mostrar.

## Comprobaciones

La lectura técnica contra Neon alojado y Stellar Testnet recuperó cuatro entradas, cinco versiones y nueve operaciones existentes, con escrituras apagadas y cero transacciones nuevas. Duración observada: **42,767 segundos**. Utilizó un adaptador local de sesión para medir el servicio: no acredita por sí sola la autenticación ni el tiempo completo del navegador publicado. La lectura técnica anterior había tardado aproximadamente 79 segundos; son observaciones en momentos diferentes, no un benchmark controlado ni una promesa de latencia.

Las regresiones cubren permisos retirados durante lectura, cambio de sesión/wallet, alteraciones, estado archivado, TTL, ledger regresivo, cambio de WASM al renovar, contexto separado por petición, cuenta de simulación inmutable, respuestas tardías y reintento exclusivamente de lectura. Las pruebas de recetas comprueban orden, concurrencia acotada y rechazo íntegro ante discrepancias.

Resultados de la versión integrada: **1.042 pruebas de aplicación y 269 privadas aprobadas; TypeScript aprobado**. La compilación, CI y publicación se registran con su commit en la evidencia de entrega; estas pruebas no acreditan una operación nueva.

## Preparación para grabar

- PDF actual: el usuario confirmó descarga y apertura correctas en navegador externo.
- PDF anterior: descarga y apertura manual todavía pendientes de confirmación. La prueba previa de lectura privada e integridad se conserva por separado.
- Mostrar modo de sólo lectura, cuenta correcta, fechas, versiones, recibos y permisos observados. No presentar la autorización vencida del médico como vigente.
- No repetir las ocho operaciones ni la nota firmada. La grabación revisa evidencia existente.
- El cierre de los cuatro entregables del SOW 2 y la aceptación formal del revisor siguen siendo estados distintos de esta revisión de semana 2.
