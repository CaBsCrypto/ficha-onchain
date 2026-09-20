# Semana 4 — Inventario de bugs y ajustes

Fuente: minería de fotogramas de la grabación SOW3 (`SOW 3 - TrustLEaf.mp4`, 8:59, consulta 7 / receta 12, versión `50c2ec5`), inventario QA del video (`../sow-video-qa/REVIEW.md`) y barrido de código. Prioridades: P0 seguridad/exposición; P1 bloqueo o brecha del entregable; P2 confusión funcional; P3 detalle visual.

Los tiempos corresponden al video original; si se edita, conservará el mapeo propio. Los fotogramas extraídos para el análisis contienen código OTP y correos reales: residen sólo en el equipo local y **no se versionan**.

## Exposición en el video (bloquea compartir)

| ID | Tiempo | Observado | Clasificación / acción | Estado |
|---|---|---|---|---|
| W-01 | 00:37–00:43 y 03:38–03:44 | El cuadro de confirmación de Privy muestra el código OTP completo tecleándose en la primera entrada (ventana 00:37–00:43) | P0 / difuminar (pixelar) en edición ambas ventanas completas, no sólo el instante | Confirmado con fotogramas; cerrar al editar |
| W-02 | 01:27 | Google "Selecciona una cuenta" revela dos correos reales ajenos al recorrido (`cabscryptocontacto@…`, `cristom01@…`) | P1 / pixelar el intervalo; en grabaciones futuras usar navegador invitado o perfil limpio | Confirmado con fotograma (cierra QA-09 con evidencia) |
| W-03 | 00:38, 03:40 | Correos de las cuentas de demostración visibles en el cuadro de Privy | P3 / aceptable si las cuentas se declaran de demo en el material; si no, pixelar junto con W-01 | Decisión de material |

## Funcionales / de producto

| ID | Tiempo / origen | Observado | Clasificación / acción | Estado |
|---|---|---|---|---|
| W-04 | 04:00 | El selector de médico del paciente muestra opciones indistinguibles ("Médico de prueba TrustLeaf · Medicina general · Demo" repetido) | P2 / diferenciar etiquetas de los médicos demo (ya observado en ensayo D3 de semana 3) | Pendiente |
| W-05 | 06:55 | Dos avisos idénticos "Emisión de receta · Enviada" apilados en la consulta del médico | P2 / duplicado de avisos | Corregido en #127 (`95e2341`, en main); comprobar en preview |
| W-06 | 03:05 | Error "La hora de término debe ser posterior a la de inicio" persiste con valores ya válidos | P2 / error de agenda obsoleto | Corregido en #127; comprobar en preview |
| W-07 | 08:25–08:39 | "Finalizar consulta" disponible pero nunca accionado: consulta 7 quedó sin finalizar | P2 / cerrar la consulta en la grabación complementaria; no tocar el historial existente (criterio QA-05) | Pendiente (grabación) |
| W-08 | 07:20–08:19 | Receta revocada sin paso de activación ("Activar receta" visible junto a "Revocar receta") | P1 / brecha del guion: el tramo complementario debe mostrar activación antes de revocar (QA-04) | Pendiente (grabación) |
| W-09 | 08:45 | QR bajo el documento revocado rotulado sólo "Recibo de emisión" | P3 / copy: aclarar que certifica la emisión, no el estado vigente | Pendiente |

## Visuales / i18n

| ID | Tiempo / origen | Observado | Clasificación / acción | Estado |
|---|---|---|---|---|
| W-10 | 00:40, 03:40 | Pantallas `/login?role=…` en inglés ("Sign In", "Back to Home", "Enter confirmation code") con el conmutador EN/ES visible; el hero del landing aparece en inglés al volver (08:45) | P2 / auditar y coherencia idiomática de accesos y persistencia del idioma en rutas públicas; #125 aporta `/login/doctor` y ES/EN/PT — verificar allí | Pendiente verificación en preview |
| W-11 | pestañas 00:35–06:55 | Título de pestaña "Receta privada…" vigente también en `/login` y `/admin/doctors` | P3 / título de documento por ruta | Pendiente |
| W-12 | 04:20 | Carga de "Mis consultas" con una línea de texto gris suelto, sin estructura | P3 / esqueleto o indicador consistente | Pendiente |
| W-13 | 07:50 | Insignia "Registrada · pendiente de activación" cortada en ancho reducido | P3 / ajuste de flujo del texto (envolver o acortar) | Pendiente |

## Heredados del inventario del video sin cambio de producto

QA-06 (narración confunde firma del propietario con el relayer y sugiere pérdida de acceso tras revocar — corregir al editar), QA-07 (explicación de espera de wallet — guion), QA-08 (encuadre/zoom — grabación). QA-10 (recibo de consentimiento tras recarga) se comprueba en la revisión autenticada de preview.

## Criterios

Ningún elemento de esta lista se declara cerrado sin: prueba automatizada cuando aplique, verificación en preview y, para W-01/W-02, revisión del corte final editado.
