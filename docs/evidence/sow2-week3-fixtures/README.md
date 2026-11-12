# Adjunto sintético para el ensayo médico

Estado: preparado localmente; todavía no subido, firmado ni registrado por este ensayo.

[aporte-medico-sintetico-v1.pdf](aporte-medico-sintetico-v1.pdf) reutiliza sin modificaciones los bytes de `syntheticClinicalPdf(1)` del generador existente `scripts/lib/clinical-fixtures.mjs`. Es un PDF A4 de una página y 964 bytes. Contiene sólo datos inventados y el aviso visible **NOT FOR CLINICAL USE**; no representa una persona real ni acredita atención médica.

Objetivo: demostrar subida médica, autoría, persistencia cifrada, descarga autorizada idéntica y comprobación de integridad, conservando los registros existentes. El nombre del archivo no determina su autor: la cuenta verificada que firme el aporte queda registrada como autora.

SHA-256 de los bytes originales:

`ff33beb1f5c938fc0b3d264b2b21ab02e3bb3e0e4447a1dacdeb30172bf1c93c`

El hash anterior identifica el archivo local; **no es un hash de transacción ni el compromiso cegado del contrato**. Tras el aporte autorizado, comparar la descarga autenticada con estos bytes. Registrar por separado el recibo real y la verificación del compromiso mediante la aplicación.

Validación local: una página A4, sin JavaScript ni cifrado propios del PDF; render completo inspeccionado y legible. Esto no afirma un análisis antimalware general. La copia renderizada de revisión queda en `.trustleaf-local/qa/week3-fixture/`, fuera del paquete público y de Git.

Ver [guion del ensayo](../../sow2/ENSAYO-MEDICO-SEMANA-3-4.md) y [manifiesto](manifest.json). El ensayo, la grabación y la aceptación siguen pendientes.
