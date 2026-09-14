# TrustLeaf · Semana 3 · Integración y demo verificable

Estado: preparación. Semana 2 entregada según confirmación del responsable; aceptación formal no acreditada aquí. Esta página no declara ejecutada la corrida de semana 3.

Aplicación: https://trustleaf-demo.vercel.app — Stellar Testnet, datos sintéticos.

## Resultado requerido

Un video nuevo permite seguir autorización médica → emisión en cadena → recepción por el paciente, y comprobar activación y revocación con sus recibos en Stellar Expert. El paciente recibe la receta directamente asociada a su dirección: no se representa una transferencia posterior.

Se mantienen DoctorRegistryPrivate (`CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2`) y PrescriptionPrivate v2 (`CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE`). Corresponden al registro y receta soulbound descritos en el SOW; no son nuevos despliegues. La revisión del código muestra destinatario guardado por emisión y ninguna función de transferencia. Falta contrastar esa interfaz con el contrato desplegado en el corte D3; no se promete compatibilidad con galerías externas de NFT.

## Material de preparación

- [Guía de ensayo y grabación](RUNBOOK.md)
- [Mapa de tiempos por completar](TIMESTAMPS.md)
- [Comprobaciones del nuevo corte](VALIDATION.md)

## Evidencia final

Video: pendiente. Fecha y versión grabadas: pendientes. Recibos D3: pendientes. IDs de recetas: se obtienen al emitir, no se anticipan.

La página final incluirá el video editado, todos sus recibos, estados finales y manifiesto de integridad. Los recibos de semana 2 son antecedentes y no reemplazan la ejecución nueva. La aceptación corresponde al revisor.

El documento clínico permanece cifrado fuera de cadena; direcciones, identificadores, compromisos y estados son públicos. Sin Mainnet, pacientes reales ni uso clínico. El worker administrativo funciona en el equipo del responsable: apagado implica solicitudes pendientes, no confirmación. Su clave no se publica en Vercel.
