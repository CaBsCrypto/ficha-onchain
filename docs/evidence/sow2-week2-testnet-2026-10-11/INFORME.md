# SOW 2 · Semana 2 · Ensayo real del paciente

Fecha: 11 de octubre de 2026. Ejecución `4fad0a02-3603-43ce-b2fd-8dc02e8d42ec`. Datos sintéticos, Neon dev y Stellar Testnet; semana 1 y main se conservan.

**Resultado de ejecución: aprobado.** Ocho transacciones distintas, con firma real de la wallet del paciente mediante Privy y patrocinio del relayer. Se comprobaron contrato, método, argumentos, firmas, resultado RPC y comprobante persistente, además de lectura por las APIs de la aplicación. Ver [execution.json](execution.json), terminado a las 19:46:31 UTC.

La recarga tras reiniciar el servidor mantuvo las tres entradas, cuatro versiones y ambos permisos retirados, consultados a las 20:28:18 UTC. La reauditoría completa desde otro proceso **también aprobó** los ocho recibos y la lectura del contenido con las escrituras apagadas, sin preparar, firmar ni transmitir operaciones. Ver [persistence.json](persistence.json). Las escrituras locales quedaron apagadas después del ensayo.

## Recorrido y recibos

| Paso | Actor | Resultado | Recibo Testnet |
| --- | --- | --- | --- |
| Crear historial | Paciente | Historial propio | [84f554f1](https://stellar.expert/explorer/testnet/tx/84f554f1184ce2fe8a24b51d3aa2da1e4ca89b7a3b7f0b1f017ba72c524a34e3) |
| Agregar PDF | Paciente | Primera versión | [c6c69d2c](https://stellar.expert/explorer/testnet/tx/c6c69d2cefc1146663c75e7afbf9a7ad487815bed445484b37ecb7990f1fda3e) |
| Agregar antecedente | Paciente | Procedencia y texto propios | [941689db](https://stellar.expert/explorer/testnet/tx/941689db4251ee8fb93fd89e5af168666f8beb2bf4f287bc53640c6bd57b13c5) |
| Agregar PNG | Paciente | Imagen privada | [681af1dd](https://stellar.expert/explorer/testnet/tx/681af1dd6bae821077a2e970999fdfb6855ee27557ff0ab33b355c1e58bd0b3c) |
| Corregir PDF | Mismo paciente | Versión 2; versión 1 conservada | [27b9eecb](https://stellar.expert/explorer/testnet/tx/27b9eecb007790854024deec8ea4446e100e16645d0c3db3f69fe578e8937bee) |
| Conceder lectura | Paciente → médico autorizado | Lectura sí, agregado no; revisión 1 | [d4072b76](https://stellar.expert/explorer/testnet/tx/d4072b76a0437ce6d5ef9c30d645af383070187be7828be1c907ac3bc02c742e) |
| Conceder agregado | Paciente → mismo médico | Lectura no, agregado sí; revisión 2 | [15029cbb](https://stellar.expert/explorer/testnet/tx/15029cbb32ef58833672593eca84c4a6e641f21e701f3f106a47064f2a64248e) |
| Revocar ambos | Paciente | Lectura no, agregado no; revisión 3 | [724623fa](https://stellar.expert/explorer/testnet/tx/724623fa8636acd371156891229d2768b0c62b3f7287fdb23b66ea61e2604a3b) |

El médico sólo recibe permisos: no inicia sesión ni firma aportes en este ensayo de semana 2. Quedaron **tres entradas y cuatro versiones**, sin sustituir silenciosamente el PDF anterior. Las cuatro lecturas de contenido coincidieron con los fixtures. Las consultas finales verificaron los permisos retirados y no encontraron intentos clínicos pendientes del paciente.

## Versión y pruebas

- Aplicación local: fuentes `6b9041fc478f4ef42d2949484fecc5219842616a`, build `o8AlhZfG1CiuqaeO3SmUJ`, arrancada en `127.0.0.1:3016`. El script declara `runningApplicationCommitVerified: false`: esta correspondencia se documenta por el build y arranque observados, no mediante certificación remota del servidor.
- Validador final: `2189c1d27c05b9378025a54fc6e6b711038f2d7c`. [PR #141](https://github.com/CaBsCrypto/ficha-onchain/pull/141) en borrador, dirigida al sprint; sin fusionar a main ni configurar secretos de preview.
- Aplicación: **938 pruebas / 74 archivos**, TypeScript y build aprobados en `6b9041f`.
- Servicios privados: **260 pruebas**, aprobadas en las fuentes de `2189c1d`, incluyendo diagnóstico saneado y recuperación de intentos. Estos casos son aislados; no son transacciones reales.
- CI: [typecheck y build](https://github.com/CaBsCrypto/ficha-onchain/actions/runs/38168333285/job/114555461210) y [Vercel](https://vercel.com/cabscryptocontacto-6028s-projects/trustleaf-demo/673YLnQZdLHPViYGgrkNKeMq475f) aprobados en `2189c1d`.
- Las 25 pruebas contractuales del 8 de octubre se conservan como evidencia histórica. No se ejecutaron otra vez ni se desplegaron contratos en este ensayo.

Contrato clínico: `CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U`; WASM `29e5510efc758f66bebc44c156fe13fb288a2ef339159467dd787bf4231e1ce0`. El preflight comprobó también el código, configuración y autorización del registro médico. No audita el contrato de recetas.

## Incidencia y recuperación

El primer proceso se detuvo después de seis recibos auditados. Se conservó su informe y journal; una reanudación volvió a detenerse antes de preparar otra operación. El diagnóstico inicial era genérico y no permite atribuir esos cortes a una sesión vencida.

Una inspección con diagnóstico saneado registró `clinical_rehearsal_response_uncertain`. Una medición autenticada independiente obtuvo HTTP 200, `no-store`, cuatro versiones, cero intentos pendientes y permiso de lectura vigente en **47.191 ms**; el script cortaba las lecturas a los 45 segundos. Se amplió únicamente la espera de historial/documentos a 120 segundos. Esto no mejora la velocidad del producto ni demuestra que todos los cortes históricos tuvieron la misma causa.

La misma ejecución se reanudó, volvió a auditar las seis confirmaciones y firmó sólo los dos pasos restantes. Sus ocho hashes son distintos y el PDF corregido conserva el mismo identificador de entrada. La comisión máxima ofrecida y los controles de firma no cambiaron en este ajuste de espera; el informe no calcula la comisión efectivamente cobrada.

## Pantalla, archivos y privacidad

Observado con la sesión real: filtros de antecedentes, archivos, aportes propios y vacío de aportes médicos; apertura de PDF anterior; corrección propia muestra versión 3 y cierra devolviendo el foco, sin preparar otra operación; Tab y Shift+Tab entre versiones y descarga.

- [360 px](historial-live-360.png), [390 px](historial-live-390.png): lectura y controles observados. La navegación inferior permite llegar a permisos y avisos.
- [Permiso de lectura a 360 px](permisos-lectura-360.png): captura **intermedia**, anterior a agregado y revocación; no representa los permisos finales.
- [Permisos finales a 390 px](permisos-finales-390.png): después de reiniciar y recargar, lectura y agregado aparecen **sin conceder**, con ambas casillas desmarcadas.
- Viewport 360/390/430 px: sin desbordamiento horizontal en DOM. El scrollbar reserva 15 px. La captura de 430 px apareció recortada por la herramienta: no acredita una revisión visual completa a ese ancho.
- Imagen descargada desde el portal y observada legible. La herramienta tardó en devolver la descarga; esa demora no se atribuye al producto.

Tamaños originales de fixtures: PDF v1 **964 bytes**, PDF v2 **974 bytes**, PNG **11.033 bytes**. El límite permanece en **3.000.000 bytes por archivo**. Estos archivos pequeños no acreditan rendimiento con archivos cercanos al límite; tamaño máximo y JPEG tienen pruebas aisladas.

Neon dev guarda contenido y metadatos cifrados; las claves web permanecen fuera de Neon y no se incorporan al informe. Stellar guarda propietarios, permisos y comprobantes, sin publicar el contenido clínico. La descarga compara bytes y el servidor verifica integridad; el validador no reconstruye el comprobante cegado sin su aleatoriedad privada.

## Pendientes y guía antes de grabar

1. Revisar legibilidad de PDF, texto al 200 %, presentación completa a 430 px y cambio de cuenta real. La firma del acompañante no acredita el recorrido completo del botón de firma del producto.
2. Elegir si el video documentará esta ejecución existente o una ejecución manual nueva; no recrear el historial ni repetir ocho operaciones con otro run-id para la misma wallet.

Ruta de revisión: `http://127.0.0.1:3016/patient?tab=historial`. Mostrar cronología → PDF v2/v1 → antecedente e imagen → permisos finales retirados → recibos. No pulsar preparar/firmar con las escrituras apagadas. Códigos sólo en Privy.

Preview aislado, acceso médico de semana 3, recuperación real por TTL, worker alojado y aceptación del revisor permanecen separados. Este informe acredita cobertura y resultados del ensayo; no ausencia total de errores ni cierre completo de SOW 2.

[Manifiesto de integridad](manifest.json): SHA-256 sobre texto UTF-8 con saltos LF y bytes exactos de las capturas. Los informes y capturas son evidencia de sus fechas de comprobación; no un estado vigente permanente.
