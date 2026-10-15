# SOW 2 · Semana 2 · Grabación local

Recorrido de revisión de ejecuciones ya realizadas con datos sintéticos. No repetir las ocho operaciones del 11 de octubre ni presentar una consulta de recibos como una firma nueva en vivo. Código comprobado: `f98f0e7`; build `w84CZMnfdwQQlIQaThwRX`. La PR #143 continúa en borrador y no está publicada en main.

## Antes de grabar

- Abrir [el historial local](http://127.0.0.1:3016/patient?tab=historial). Comprobar que termina la carga y muestra fecha de consulta reciente; un informe guardado no prueba disponibilidad actual.
- Mantener escrituras apagadas. No mostrar códigos Privy, secretos, conexiones ni cuentas ajenas. Ocultar el correo del encabezado al editar el video.
- El médico de prueba tiene su autorización vencida y ambos permisos retirados. Mostrar ese estado como tal; conceder permisos otra vez exigiría preparación y operaciones adicionales, fuera de esta grabación de lectura.
- Comprobar el [informe y límites actuales](../evidence/sow2-week2-gateway-2026-10-15/INFORME.md). Los registros de semana 1 y sus recibos se conservan por separado.

## Recorrido sugerido

| Pantalla | Qué mostrar | Qué explicar |
| --- | --- | --- |
| Mi historial privado | Cronología, autor y fecha | El paciente reúne sus antecedentes; se distingue quién aportó cada registro. |
| PDF y versiones | PDF v2 y apertura de la versión anterior; archivo sintético legible | Una corrección conserva la versión anterior. PDF e imágenes admiten hasta 3.000.000 bytes originales. |
| Imagen y antecedente | Imagen existente y nota de prueba | Contenido y metadatos clínicos están cifrados en Neon; Stellar guarda permisos y comprobantes, no el archivo médico. TrustLeaf puede descifrar para usuarios autorizados. |
| Nota del 15 de octubre | «Prueba de firma desde la aplicación» y su recibo | El paciente confirmó esta nota mediante el botón de Privy; el relayer patrocinó la comisión. Es una operación adicional, separada del ensayo original de ocho pasos. |
| Permisos para médicos | Lectura y agregado separados, ambos sin conceder | El paciente elige cada permiso. Para concederlo, el médico necesita autorización vigente. Retirarlo bloquea accesos posteriores por TrustLeaf, sin borrar copias descargadas. |
| Recarga y recibos | Esperar la consulta completa; abrir el recibo nuevo | Confirmar requiere comprobar firma, contrato, resultado e integridad. Un estado pendiente no se presenta como confirmado. |

Recibo de la nota adicional: [Stellar Expert](https://stellar.expert/explorer/testnet/tx/b991c3e6cc4bbfc077656e9543ca612fb80f04ec16f25dfe86ff3fa7a8471c6f), ledger `5216962`, comisión `0,0828838 XLM de Testnet`.

La consulta puede tardar: conservar la indicación de carga y esperar su resultado. No atribuir una mejora de rendimiento a este trabajo. La revisión al 200 % fue confirmada por el usuario; el cambio de cuenta y el retorno se observaron en la interfaz.

Esta grabación acredita la revisión local de semana 2. Preview aislado, publicación, grabación terminada y aceptación del revisor se registran aparte. No declara terminado el SOW 2 completo ni incorpora el portal médico de semana 3.
