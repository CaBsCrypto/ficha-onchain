# SOW 2 · Plan de aportes, recetas y adjuntos

Estado: planificación para semanas 2 y 3; no implementado por este documento. La semana 1 conserva su contrato y demostración técnica.

## Aportes del paciente y del médico

- El paciente crea su historial una vez y puede incorporar antecedentes y archivos previos. Etiquetar estos elementos como aportados por el paciente; la subida no verifica al profesional que creó el examen original.
- Cada médico necesita autorización vigente en TrustLeaf y el permiso de agregar de ese paciente. El permiso de lectura es independiente. Sólo el autor puede corregir su aporte mediante una nueva versión.
- Integrar firmas con Privy y vincular la identidad interna con la wallet comprobada. Cambios de cuenta deben cancelar cargas y borrar datos anteriores. El flujo técnico actual no acredita esta integración.

## Recetas existentes

- Consultar las recetas mediante su flujo autorizado actual y relacionarlas privadamente con el historial del mismo paciente; conservar IDs, estados y recibos originales.
- No volver a emitir, copiar contratos ni convertir todas las recetas en nuevas entradas con transacción. Definir la relación de contexto durante la integración de semana 3, conservando permisos de receta y ficha como controles distintos.
- Compartir la ficha no concede automáticamente derechos sobre cualquier documento de receta. Resolver lectura según los permisos propios de cada recurso.
- Clínica y recetas pueden coexistir, pero firmas/transmisiones de una misma wallet deben conservar la exclusividad y recuperación de los journals existentes.

## Estrategia inicial de archivos

- Límite exacto después de una eventual optimización y antes de cifrar: 3.000.000 bytes. El sobre cifrado es mayor; no confundir ambos límites.
- Aceptar archivos que ya cumplen el límite sin alterarlos. Para imágenes mayores, ofrecer optimización explícita y vista previa; conservar proporciones, orientación y posibilidad de cancelar. No recortar, borrar páginas ni sustituir silenciosamente el original.
- Registrar que el archivo es una copia optimizada: el comprobante en Stellar corresponde a esos bytes guardados, no al archivo original del dispositivo.
- Para PDF mayores, comenzar con rechazo explicativo y opción de subir una copia reducida. No prometer compresión automática universal ni rasterizar documentos: puede perder texto, firmas o legibilidad. Evaluar esa función por separado con muestras sintéticas antes de comprometerla.
- Validar formato real, tamaño y límites de procesamiento en servidor. Una extensión válida no acredita seguridad; no ejecutar archivos ni afirmar que están libres de malware.
- La confirmación debe mostrar nombre, tamaño y vista previa legible antes de solicitar la firma. Si no puede mantenerse legibilidad dentro del límite, rechazar y explicar; no comprimir hasta volver ilegible el documento.

## Validación previa a implementación

Definir con muestras sintéticas los parámetros de optimización de imágenes y límites de resolución/memoria. Probar fotos de exámenes, texto pequeño, tablas, rotación y formatos admitidos en móvil y escritorio. Verificar límites justo por debajo, en y por encima de 3.000.000 bytes, archivos corruptos, doble envío, cancelación y cambio de cuenta. Las pruebas de cifrado deben usar los bytes definitivos y detectar alteraciones.

La grabación de semana 1 usa únicamente los registros existentes. Esta planificación no crea recetas, archivos ni permisos nuevos.

## Idea para revisar después del cierre

El enlace temporal y QR para compartir una selección privada de sólo lectura con un médico que aún no utiliza TrustLeaf quedan fuera de este SOW. Retomarlos al terminar los cuatro entregables, según el [recordatorio de cierre y próximo ciclo](CIERRE-Y-PROXIMO-CICLO.md).
