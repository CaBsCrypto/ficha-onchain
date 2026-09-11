# Firma de recetas en TrustLeaf: opciones investigadas

Investigación documental del 7 de septiembre de 2026. No se contrataron servicios, contactaron proveedores ni enviaron documentos o datos de médicos.

## Recomendación inicial

Evaluar una integración de firma electrónica avanzada (FEA) de un prestador acreditado, donde el médico revise y autorice la firma del documento concreto. Mantener una interfaz de proveedor separada para evaluar la vía ClaveÚnica/SNRE cuando se confirme la habilitación de TrustLeaf. Es una recomendación de arquitectura, no certificación de cumplimiento sanitario.

## Base normativa y límites

Para receta simple o retenida, el texto vigente del artículo 38 del DS 466 contempla FEA del facultativo autorizado o un sistema de prescripción con validación del prescriptor habilitado e identificación mediante ClaveÚnica. Una validación interna de TrustLeaf o firma Soroban no demuestra por sí misma el cumplimiento de estas condiciones. Las recetas sometidas a controles especiales deben evaluarse por separado. [DS 466 vigente](https://www.bcn.cl/leychile/navegar?i=13613).

El portal de integración de ClaveÚnica presenta el servicio para instituciones del Estado. No se ha acreditado la elegibilidad de TrustLeaf ni obtenido credenciales oficiales. No construir un formulario que capture ClaveÚnica ni equiparar un login cualquiera con firma de una receta. [Integración institucional ClaveÚnica](https://www.claveunica.gob.cl/instituciones).

## Opciones comprobadas documentalmente

| Opción | Evidencia encontrada | Pendiente antes de elegir |
|---|---|---|
| ecert | Figura en el registro oficial; anuncia integración por API para documentos, identidad y firmas | Confirmar producto FEA remoto concreto, API, sandbox, enrolamiento médico, formato y precio |
| Certinet FAR | Figura en el registro oficial; documenta firma avanzada remota autorizada por el titular desde su aplicación y uso en plataformas adscritas | Confirmar integración disponible para TrustLeaf, experiencia del médico, sandbox y precio |
| ClaveÚnica/SNRE | Vía contemplada en la regulación, con sistema nacional y documentación de interoperabilidad | Confirmar acceso institucional, requisitos de incorporación y especificación vigente |

Fuentes: [registro oficial de prestadores acreditados](https://www.entidadacreditadora.gob.cl/entidades/), [integraciones ecert](https://www.ecertla.com/soluciones/integraciones/), [condiciones Certinet FAR](https://www.certinet.cl/far-start). Acreditación del proveedor no demuestra que cualquier producto de su catálogo sea FEA ni que toda receta resultante cumpla requisitos sanitarios.

## Flujo propuesto

1. Médico autenticado, identificado y habilitado; vincular esa identidad con su cuenta de emisión.
2. Generar receta completa, con versión cerrada y vista legible. El médico revisa y autoriza su firma mediante el proveedor escogido.
3. Recibir documento firmado y evidencia; comprobar que firmante, documento y operación corresponden a la receta esperada. Validar cadena de confianza, integridad, vigencia/revocación del certificado y evidencia temporal según el formato y política acordados.
4. Guardar documento firmado y comprobantes cifrados. Conservar el artefacto exacto: no regenerar un PDF diferente y atribuirle la firma anterior.
5. Incorporar la huella del artefacto firmado al paquete privado comprometido en cadena. Si el compromiso solo cubre JSON clínico, no afirmar que cubre automáticamente un PDF firmado diferente.
6. Médico autoriza la emisión Soroban; relayer paga. Son autorizaciones distintas. Un proveedor FEA no firma automáticamente transacciones Stellar.
7. Confirmar la transacción, conciliar ambos estados y entregar el documento al paciente con su mecanismo de consulta. Si falla blockchain después de la firma, mantener estado pendiente y reintentar sin falsificar éxito ni invalidar arbitrariamente la firma clínica.

## Criterios de selección y prueba

Solicitar especificación y sandbox del producto concreto; formato firmado verificable fuera del portal del proveedor; autorización explícita del médico; enrolamiento y recuperación; certificados y consulta de revocación; sello de tiempo/preservación cuando corresponda; API y callbacks autenticados; idempotencia; custodia, subprocesadores y retención de documentos sensibles; precio por firma/usuario y costes mínimos.

Probar documento alterado, firmante equivocado, firma fallida, certificado revocado/expirado con tratamiento temporal correcto, callback repetido y fallo de transacción posterior. Validar el documento con una herramienta independiente y luego el recorrido de presentación con farmacia. No hay todavía presupuesto verificado ni proveedor seleccionado.

## Qué no resuelve contratar FEA

No otorga automáticamente folios SNRE, acceso a sus APIs, habilitación profesional, interoperabilidad con toda farmacia ni control de doble dispensación. Esas piezas requieren validación aparte. No se necesita ZK para incorporar la firma del médico y la entrega privada del documento.
