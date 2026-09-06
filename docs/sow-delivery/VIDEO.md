# Grabación de hoy — TrustLeaf

Objetivo: video de 80–90 segundos, tono claro, audiencia producto/tecnología. Guion basado en evidencia local; no presenta aceptación ni despliegue nuevo. Duración sujeta a ensayo en voz alta.

## Plan de diez horas desde el inicio de la ventana

| Ventana | Acción | Responsable propuesto | Salida |
| --- | --- | --- | --- |
| H0–H2 | Validación local, revisar results.json, resolver Git/PR | Técnico | Logs y SHA final |
| H2–H3 | Cotejar matriz con SOW original y acordar brechas | Dueño + aceptante | Checklist de aceptación |
| H3–H4 | Preparar storyboard y fixtures aislados | QA | Pantallas rotuladas y plan de captura |
| H4–H5 | Ensayar voz y grabar pantalla | Creador | Tomas originales |
| H5–H7 | Montar, subtitular, redactar información privada | Editor | Video candidato |
| H7–H8 | Revisar cada claim frente a evidencia | Técnico + QA | Checklist firmado |
| H8–H9 | Exportar MP4 1080p, calcular SHA256 y guardar manifiesto | Editor | Archivo final + hash |
| H9–H10 | Aceptación del dueño; decidir publicación | Dueño / aceptante | Enlace y estado por D |

## Ejecución segura de capturas

1. Ejecutar desde la raíz: node scripts/audit-sow.mjs --verify --contracts --build. Mostrar solamente los resúmenes de tests, sin terminales con variables o cuentas.
2. Abrir CREATOR_VIEW.html localmente para la narración. Las pantallas del producto deben provenir de un entorno aislado y preparado con fixtures. No abrir producción ni previews, porque comparten base productiva.
3. Si no hay entorno UI aislado preparado, grabar el informe, logs y un storyboard rotulado “recorrido previsto / datos sintéticos”. No simular visualmente un login exitoso ni presentar este sustituto como evidencia D2.
4. Fixtures propuestos: Paciente Demo A (patient-a@example.invalid), Profesional Demo B (doctor-b@example.invalid), documento “Documento sintético A”, contenido “Ejemplo sin información clínica”. No introducir RUT, wallets, recetas o personas reales. No generar nuevas transacciones para el video bajo este alcance.
5. No abrir el documento histórico D3 en la grabación: contiene identidades. Mostrar solo el conteo 5/6 y la etiqueta “referencias históricas, no revalidadas”.

## Guion y tomas

### HOOK · 0–5s

¿Cómo compruebas que una receta conserva su origen cuando pasa de una pantalla a otra?

### CONTEXT · 5–15s

TrustLeaf explora esa pregunta con una interfaz para médicos y pacientes. La propuesta conecta la ficha, los documentos y las recetas con registros verificables en Stellar. Hoy te mostramos exactamente qué hemos podido validar.

### EXPANSION · 15–30s

Una demostración necesita más que pantallas. También necesita pruebas que puedas repetir y una relación clara entre cada paso y su evidencia. Por eso empezamos revisando el código y separando los resultados locales de las referencias históricas de Testnet.

### DISCOVERY · 30–45s

Encontramos una suite de documentos que no compilaba. Corregimos sus tests y ahora pasan cuarenta y cuatro pruebas Rust, incluyendo los cuatro contratos y tres escenarios de integración local. También pasan ciento doce pruebas de la aplicación.

### EXPLANATION · 45–65s

Piensa en un hash como una huella que ayuda a comparar un contenido con su referencia. Eso no demuestra por sí solo que el contenido sea correcto. En pantalla mostramos los resultados reproducibles y el recorrido previsto usando ejemplos sintéticos, identificados como demostración.

### INSIGHT · 65–80s

La documentación conserva cinco referencias de transacciones de Testnet. Esta revisión no las volvió a consultar. Todavía falta completar la evidencia del sexto paso y registrar la aceptación del recorrido.

### ENDING · 80–90s

El siguiente paso es cerrar esas brechas con evidencia. ¿Qué prueba te gustaría ver antes de aceptar una herramienta como esta?


| Tiempo | Captura |
| --- | --- |
| 0–15s | Título TrustLeaf y storyboard doctor/paciente rotulado |
| 15–30s | Matriz D1/D2/D3 con estado parcial |
| 30–45s | Logs: 44 Rust, 112 Vitest; commit base + cambios locales si aún no hay SHA final |
| 45–65s | Diagrama sencillo contenido → hash → referencia; no afirmar que prueba veracidad médica |
| 65–80s | Lista de brechas: hash #6, recorrido autenticado, aceptación |
| 80–90s | Cierre y enlace al paquete de evidencia cuando esté aprobado |

## Hooks alternativos

- Una pantalla puede verse terminada. ¿Qué evidencia la respalda?
- ¿Qué significa realmente decir que un prototipo está validado?
- Hoy abrimos las pruebas detrás de TrustLeaf.
- Un hash deja una referencia. La confianza necesita más evidencia.
- Antes del video final, revisamos lo que sí podemos demostrar.

## Checklist de exportación

- [ ] Datos completamente sintéticos; no cuentas, correos o wallets históricas.
- [ ] Cada toma indica local, storyboard o referencia histórica según corresponda.
- [ ] Conteos coinciden con results.json de la corrida final.
- [ ] No se afirma mainnet, producción validada, cumplimiento legal o SOW cerrado.
- [ ] Subtítulos ES revisados; audio inteligible; texto legible en teléfono.
- [ ] Nombre sugerido: trustleaf-demo-2026-09-05.mp4; exportación H.264 1080p.
- [ ] Registrar SHA256 con Get-FileHash -Algorithm SHA256 -LiteralPath <ruta-del-video>.
- [ ] Manifiesto: fecha UTC, SHA del código, modo de cada toma, archivo, hash de video, revisor, decisión y enlace final.
- [ ] Aprobación explícita antes de publicar. Sin video exportado, D3 permanece abierto.

Ideas adicionales: explicar los límites de un hash; mostrar cómo se detectó el test excluido; recorrer la matriz de aceptación de un prototipo.
