# Prescripción electrónica en Chile: implicaciones para TrustLeaf

Investigación documental del 7 de septiembre de 2026. No acredita habilitación de TrustLeaf, integración SNRE ni aceptación por farmacias. La versión privada de Prescription permanece sin desplegar mientras se concreta el recorrido del documento.

## Conclusión para el producto

La receta completa debe existir y poder presentarse. Mantenerla fuera de una blockchain pública no significa ocultársela al paciente o al dispensador habilitado. TrustLeaf necesita producir un documento verificable y compartible; la huella de Stellar es una comprobación adicional de integridad, no el documento clínico ni su firma sanitaria.

## Qué establecen las fuentes

El artículo 101 del Código Sanitario considera reservado y sensible el contenido de la receta. Contempla entrega al paciente o tercero autorizado, libre elección de farmacia y posibilidad de exigir soporte gráfico. [Código Sanitario vigente, artículo 101](https://www.bcn.cl/leychile/navegar?idNorma=5595).

El artículo 38 del DS 466 exige identificación del profesional y paciente, contenido farmacológico completo, indicaciones, fecha y suscripción. Para recetas electrónicas simples o retenidas contempla firma electrónica avanzada o un sistema con validación del prescriptor habilitado e identificación mediante ClaveÚnica. Los productos de control especial requieren revisar su normativa específica. Una firma Stellar no demuestra por sí sola que se cumple esa vía de suscripción. [DS 466 vigente, artículos 38 y 39](https://www.bcn.cl/leychile/navegar?i=13613).

MINSAL informa que el paciente puede recibir su receta por correo y consultarla en Mis Recetas mediante ClaveÚnica. [Comunicación oficial del SNRE](https://www.minsal.cl/ministerio-de-salud-lanza-sistema-nacional-de-receta-electronica/).

La guía técnica SNRE describe un identificador de receta, introducido o leído como código de barras, para recuperar el documento. Distingue la receta agrupadora, las prescripciones por medicamento y los registros de dispensación. La versión consultada es **0.9.6, draft, generada en 2024**: orienta el modelo, pero no demuestra por sí sola cuáles son hoy los endpoints, credenciales o requisitos de incorporación vigentes. [Casos de uso oficiales](https://interoperabilidad.minsal.cl/fhir/ig/snre/0.9.6/casos.html).

Se encontró además una consulta pública de modificación reglamentaria de 2025. No se trata como normativa vigente ni como prueba de que TrustLeaf dispone de integración. La portada del sistema de receta electrónica devolvió HTTP 403 en la consulta; no se probó el flujo autenticado de pacientes o farmacias.

## Arquitectura propuesta para TrustLeaf

1. **Emitir el documento:** receta estructurada con todos los campos aplicables y una representación descargable/imprimible. Conservar la versión exacta suscrita y su evidencia de firma.
2. **Guardar en privado:** contenido cifrado, documentos en almacenamiento privado y permisos por receta. La consulta de una receta no concede acceso a la ficha completa ni al expediente de habilitación del médico.
3. **Presentar al paciente:** pantalla legible, descarga y opción de presentación en farmacia. No exigir que el paciente entienda wallets o hashes.
4. **Resolver el código:** código o QR de TrustLeaf identifica el documento a consultar. No contiene RUT, diagnóstico, medicamento, clave de cifrado ni el secreto del compromiso. Diseñar acceso profesional autorizado y entrega por el paciente, con trazabilidad y protección contra enumeración. No asumir que el mero conocimiento de un ID público autoriza a descargarlo.
5. **Verificar:** comprobar firma y habilitación aplicables, integridad del documento y estado actual. El vínculo entre documento estructurado, representación visible y versión firmada debe ser explícito: no comparar directamente un PDF arbitrario con el hash de un JSON diferente.
6. **Dispensar:** consultar y registrar la entrega y los saldos cuando corresponda. La integridad documental por sí sola no impide que se dispense dos veces. Definir una fuente autoritativa y conciliación antes de habilitar ese flujo.

El compromiso con secreto permite que el backend autorizado recalcule la huella. Para verificación independiente por una farmacia habría que entregarle, dentro del acceso autorizado, el documento canónico y material de apertura del compromiso, o un protocolo de prueba adecuado. Escanear un QR y recibir un mensaje del servidor no equivale por sí solo a verificar criptográficamente.

## Integración nacional y códigos

Un código emitido por TrustLeaf no se convierte automáticamente en folio SNRE, aunque tenga un formato similar. Si se integra con SNRE, guardar la correspondencia privada entre identificadores y la respuesta oficial. No presentar el hash de la transacción Stellar como código reconocido por farmacias.

Hay que confirmar con los canales oficiales los requisitos de incorporación, versión técnica vigente, ambiente de pruebas, validación profesional, mecanismo de suscripción e interoperabilidad. La documentación pública no prueba que exista una API de producción libremente utilizable por TrustLeaf.

## Qué validar antes de uso real

Primero una receta simple sintética: médico habilitado, suscripción aplicable, documento completo, entrega al paciente, recuperación por farmacia, verificación de firma/integridad y tratamiento de cancelación. Luego ampliar por tipo de receta; retenida, cheque y preparados magistrales requieren revisar sus reglas específicas. No aplicar por defecto el mismo vencimiento a todas las recetas.

La siguiente entrega técnica debe mostrar ese recorrido y sus resultados, diferenciando evidencia de Testnet de validez sanitaria. La implementación actual acredita piezas criptográficas; no es todavía un sistema chileno de prescripción habilitado.
