# Alcance de la demostración y firma clínica pendiente

Nota para presentación, SOW y preguntas de revisión. Actualizada el 7 de septiembre de 2026.

## Respuesta breve para compartir

> La demostración de TrustLeaf utiliza identidades y expedientes sintéticos. Las transacciones verificadas de DoctorRegistry son reales en Stellar Testnet y acreditan funcionamiento técnico, no habilitación profesional de personas reales. La nueva versión privada de Prescription está compilada y probada localmente; aún no se ha desplegado ni conectado al panel. La firma electrónica avanzada de recetas no está integrada. Su eventual simulación debe mostrarse como tal, sin atribuirle validez clínica. Antes del uso real se deberán integrar y validar el mecanismo de suscripción aplicable, la entrega del documento y el flujo de dispensación correspondiente.

## Qué está hecho y qué no

| Componente | Estado comprobado |
|---|---|
| Médico registrado en DoctorRegistry | Tres identidades sintéticas autorizadas en la nueva instancia privada de Testnet |
| Expediente privado vinculado a blockchain | Tres expedientes cifrados en Neon de desarrollo; compromiso recalculado y comparado con el contrato |
| Firma de transacciones del Registry | Firma criptográfica real de la cuenta administradora de Testnet |
| Nueva receta privada | Contrato compilado y probado localmente; sin despliegue ni emisión en red de esta versión |
| Firma clínica avanzada | No integrada; investigación de opciones documentada |
| Simulador de firma clínica de la nueva emisión | No implementado ni validado en esta etapa |
| Integración SNRE y folio oficial | No implementados ni habilitados para TrustLeaf |
| ZK | No implementado |

## Límite de la fase de pruebas

Podemos continuar el desarrollo técnico con fixtures y, cuando se implemente, un adaptador de firma de prueba. Este deberá devolver un estado inequívoco de simulación, utilizar solo datos sintéticos y no producir mensajes de firma avanzada verificada, receta clínicamente válida ni integración SNRE exitosa.

La simulación no puede habilitar emisión clínica real ni estar disponible como fallback silencioso cuando falle un proveedor de firma. Las pruebas deben distinguir por separado firma de prueba, autorización Soroban, envío de transacción, confirmación en Testnet y validez de la suscripción clínica.

## Condiciones anteriores al uso real

La integración de firma no es un detalle cosmético para añadir después de lanzar. Antes de emitir recetas reales hay que verificar la habilitación del prescriptor, seleccionar e integrar la vía de suscripción aplicable, validar el documento firmado y su entrega, resolver acceso por farmacia y dispensación, y comprobar los requisitos del tipo de receta. No se fija aquí una aceptación contractual ni se modifica el SOW.

La acreditación del proveedor de firma no convierte por sí sola a TrustLeaf en un sistema integrado con SNRE. La firma Stellar tampoco sustituye automáticamente la firma o identificación exigida para la receta. Las alternativas se investigaron a partir del [DS 466 vigente, artículo 38](https://www.bcn.cl/leychile/navegar?i=13613) y el [registro oficial de prestadores acreditados](https://www.entidadacreditadora.gob.cl/entidades/); el mecanismo final requiere validación de integración y del caso de uso.

## Evidencia y antecedentes

- [Resultados de DoctorRegistry privado](REGISTRY_PRIVADO_RESULTADOS.md).
- [Estado de la receta privada](PRESCRIPTION_PRIVACIDAD.md).
- [Opciones de firma clínica e integración](FIRMA_RECETA_CHILE_OPCIONES.md).
- [Investigación de prescripción en Chile](PRESCRIPCION_CHILE_INVESTIGACION.md).

Esta nota corrige la formulación verbal de que «todo es simulado» o que ya existe una firma clínica de prueba integrada. Hay transacciones reales de Testnet; el adaptador clínico aún está pendiente.
