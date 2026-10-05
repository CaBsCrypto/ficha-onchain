# SOW 2 · Objetivo de la semana 1

## Objetivo

Construir y comprobar la base técnica de la historia clínica privada de TrustLeaf: almacenamiento cifrado, permisos controlados por el paciente y trazabilidad verificable en Stellar Testnet.

El paciente debe poder decidir qué médico puede leer o agregar información. Los antecedentes y archivos permanecen privados fuera de blockchain; Stellar registra las autorizaciones y los comprobantes que permiten detectar cambios en los registros.

## Entregables de la semana

1. **Contrato clínico probado y desplegado en Testnet.** Registrar autorizaciones, revocaciones y nuevas versiones sin publicar contenido médico. Reutilizar el registro de médicos existente y conservar los contratos del SOW 1. El nuevo contrato no tendrá una función de actualización de código.
2. **Permisos de lectura y escritura independientes.** Sólo el paciente concede o retira acceso a su historia. Cada aporte o corrección médica exige autorización médica y permiso del paciente vigentes. Nadie sobrescribe silenciosamente los registros de otro autor.
3. **Almacenamiento privado y cifrado comprobable.** Guardar registros y archivos cifrados en Neon. Admitir PDF, PNG y JPEG de hasta 3 MB por archivo original, con las claves fuera de la base de datos. Verificar el contenido antes de entregarlo a una persona autorizada.
4. **Pruebas y evidencia de funcionamiento.** Documentar resultados por commit, arquitectura, riesgos y límites, junto con el identificador del contrato, el hash del WASM y los recibos de las operaciones reales de Testnet.

## Demostración técnica mínima

**Paciente autoriza → médico agrega un registro sintético → paciente lo consulta y verifica su integridad → paciente revoca → nuevo acceso del médico rechazado.**

Este recorrido puede demostrarse mediante pruebas y herramientas técnicas. Las pantallas completas del paciente y del médico corresponden a las semanas siguientes.

## Criterios de cierre

- Se rechazan accesos y aportes sin permiso, firmas de otra identidad y correcciones de registros ajenos.
- Retirar un permiso bloquea posteriores accesos mediante la aplicación y las nuevas escrituras correspondientes.
- Una corrección conserva la versión anterior; un doble envío no crea versiones duplicadas.
- Un archivo alterado no pasa la verificación. Un fallo de almacenamiento o Stellar produce un error recuperable, nunca una confirmación falsa.
- Las pruebas, el build y CI están aprobados para el commit entregado. Los resultados simulados se distinguen de los recibos reales.
- El almacenamiento está configurado y comprobado; una simulación local no se presenta como infraestructura entregada.

## Límites

Stellar Testnet y datos sintéticos únicamente. No incluye atención clínica real, Mainnet, Meet, verificación pública por QR ni alojamiento permanente del worker.

La plataforma gestiona el descifrado para usuarios autorizados. Revocar acceso no elimina copias ya descargadas. La integridad demuestra correspondencia con una versión registrada, no la veracidad del contenido médico. Las wallets y ciertos metadatos de las operaciones en cadena son públicos.

## Estado y siguiente paso

**Estado al 5 de octubre de 2026:** contrato clínico desplegado; demostración técnica con seis recibos reales y almacenamiento cifrado persistente en Neon dev comprobados. Pruebas y build aprobados localmente; CI y revisión pendientes. Ver [registro de validación](VALIDACION-2026-10-05.md).

El siguiente paso es fijar el commit y acreditar CI de la PR. La integración con pantallas y Privy corresponde a semanas siguientes.

Ver el [diseño técnico y la matriz de pruebas](SEMANA-1-DISENO.md).
