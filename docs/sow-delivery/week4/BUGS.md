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
| W-10 | 00:40, 03:40 | El modal de Privy ("Enter confirmation code") aparece en inglés aunque la app esté en español | P3 / límite del proveedor: `@privy-io/react-auth` 3.40 no expone `locale` ni traducciones en `appearance`. El video se grabó con el conmutador en EN, por lo que el resto de pantallas bilingües no era un fallo | Descartado como bug de producto; registrar en material de grabación |
| W-11 | pestañas 00:35–06:55 | Título de pestaña "Receta privada…" vigente también en `/login` y `/admin/doctors` | P3 / título por superficie | Corregido en esta PR (`PageTitle` + efectos en accesos, médico, paciente, administración); comprobar en preview |
| W-12 | 04:20 | Carga de "Mis consultas" con una línea de texto gris suelto, sin estructura | P3 / esqueleto o indicador consistente | Corregido en esta PR (esqueleto con dos bloques `animate-pulse` y prueba); comprobar en preview |
| W-13 | 07:50 | Insignia "Registrada · pendiente de activación" cortada en ancho reducido | P3 / ajuste de flujo del texto (envolver o acortar) | Corregido en esta PR (`max-w-full whitespace-normal` en la insignia de `Prescriptions.tsx`); comprobar en preview |

## Heredados del inventario del video sin cambio de producto

QA-06 (narración confunde firma del propietario con el relayer y sugiere pérdida de acceso tras revocar — corregir al editar), QA-07 (explicación de espera de wallet — guion), QA-08 (encuadre/zoom — grabación). QA-10 (recibo de consentimiento tras recarga) se comprueba en la revisión autenticada de preview.

## Exposición en la propia grabación (higiene de datos personales, no bug de plataforma)

W-01 y W-02 incumben a quien graba, no a TrustLeaf. Validación: al editar, pixelar los intervalos indicados y revisar fotograma a fotograma el corte final; en grabaciones futuras, ventana de invitado o perfil de navegador limpio (el selector de Google no debe mostrar cuentas personales). El material original queda sólo en disco local.

## Barrido automático en producción (Playwright headless, 20 septiembre)

44 combinaciones (14 rutas × {390, 1280}px × {es, en, pt} sobre `trustleaf-demo.vercel.app`), con captura de errores de consola, códigos HTTP y desbordamiento horizontal. Resultados:

| ID | Observado | Clasificación / acción | Estado |
|---|---|---|---|
| W-14 | El pie del landing enlaza `/verify` ("Verificar") y `/traction` ("Trabaja con nosotros"), que el middleware responde con 410 en producción (`module_outside_current_delivery`): el público vería una página muerta | P1 / el pie ya no resuelve a ninguna ruta retirada; prueba unitaria sobre la resolución de enlaces | Corregido en esta PR; confirmar en preview |
| W-15 | `POST /api/waitlist` responde 410 en producción | Informativo / la rama #126 ya blanquea la ruta en el middleware; quedará disponible al fusionar y activar `TRUSTLEAF_WAITLIST_ENABLED` | Bloqueado en el merge de #126 |
| — | Cero desbordes horizontales en las 44 capturas; cero errores propios de consola (sólo 410 conocidos); el `Reveal` del landing se revela completo al scrollear también con movimiento reducido | — | Sano |

Nota: el barrido inicial contra el preview de #126 apuntó a la pared de inicio de sesión de Vercel (protección de despliegues activada); los previews se validan con sesión de navegador humana, no con este barrido.


## Criterios

Ningún elemento de esta lista se declara cerrado sin: prueba automatizada cuando aplique, verificación en preview y, para W-01/W-02, revisión del corte final editado.
