# QA del video SOW 3

Revisión: 20 de septiembre de 2026. Fuente local: `SOW 3 - TrustLEaf.mp4`, duración 539,82 s, 1920 × 1080, 60 fps. Original conservado; sin envío a servicios externos.

## Cobertura y límites

Se extrajeron 540 capturas a un segundo. Se revisaron visualmente 204 seleccionadas por muestreo y cambios de imagen, agrupadas en 21 mosaicos, además de capturas de detalle. Esto cubre toda la secuencia temporal, **no cada fotograma**. Los cambios pequeños o muy breves pueden escapar a la selección. Las capturas y el audio quedan locales porque contienen códigos de acceso y datos de cuentas.

Se generó y leyó una transcripción local con tiempos (Whisper base, español, CPU). La transcripción automática contiene errores y no sustituye una escucha literal de cada frase. No se usó para atribuir causas técnicas. Los tiempos siguientes corresponden al original, no a una futura edición.

| Tramo | Contenido revisado | Resultado |
|---|---|---|
| 00:00–00:59 | Acceso y preparación de identidad | Código visible; espera de wallet con consulta manual |
| 01:00–01:59 | Postulación y revisión administrativa | Relato de firmas por precisar; selector de cuentas visible |
| 02:00–02:59 | Recibo administrativo y agenda | Autorización visible; comienzo de rango inválido |
| 03:00–03:59 | Corrección de agenda y acceso paciente | Aviso de rango persiste tras editar; segundo acceso |
| 04:00–04:59 | Reserva y asistencia | Asistencia separada del permiso |
| 05:00–05:59 | Inicio, acreditación y consentimiento | Estados pendientes y recibo de reserva visibles |
| 06:00–06:59 | Consentimiento y emisión | Recibo de consentimiento; firma de emisión |
| 07:00–07:59 | Registro, lectura y preparación de revocación | Registrada; no se observa activación |
| 08:00–08:59,82 | Revocación y lectura histórica | Revocada; documento permanece legible |

## Inventario único

Prioridad P0: seguridad/integridad; P1: bloqueo o brecha del entregable; P2: confusión funcional; P3: detalle visual.

| ID | Tiempo / actor | Pasos | Esperado | Observado | Evidencia | Prioridad / clasificación | Estado |
|---|---|---|---|---|---|---|---|
| QA-01 | 00:37–00:41; 03:39–03:43, acceso | Ingresar con Privy | Códigos fuera de publicación | Código visible en primer acceso; revisar y ocultar ambos intervalos completos | Capturas locales | P0 / observación de exposición en video | Pendiente de ocultar antes de compartir; no se reproduce el código aquí |
| QA-02 | 02:59–03:14, médico | Agregar rango inválido y corregir término | Error del borrador deja de describir valores anteriores | Error permanece hasta agregar otra vez | Video + prueba de componente que falla antes del cambio | P2 / bug reproducido | Corregido localmente; pendiente preview |
| QA-03 | 06:55–07:05 y 08:14, médico | Emitir/revocar desde consulta | Un aviso por operación | Consulta y tarjeta repiten el mismo aviso | Video + pruebas de render que detectan dos instancias | P2 / bug reproducido | Corregido localmente por ID; conserva operaciones distintas |
| QA-04 | 07:04–08:19, médico | Emitir y revocar | Para el guion acordado: activar antes de revocar | No hubo activación; revocación desde Registered | Cinco recibos auditados, sin operación activate | P1 / brecha del recorrido | Confirmado; no es fallo contractual demostrado |
| QA-05 | 08:20, médico | Terminar recorrido | Finalizar consulta | Consulta 7 sigue sin finalizar | Auditoría DB de lectura | P2 / brecha del recorrido | No se modificó el historial |
| QA-06 | 01:08–01:20; 08:04–08:24, narración | Explicar firmas y revocación | Firmas del propietario, relayer paga; lectura histórica persiste | ASR sugiere atribución de firma al relayer y pérdida de acceso tras revocar | Transcripción automática + lectura histórica visible | P2 / mejora de narrativa | Confirmar frase literal al editar; corregir explicación |
| QA-07 | 00:45–00:58, médico | Esperar wallet y consultar | Requisito y recuperación comprensibles | Consulta manual tras espera | Video | P2 / pendiente de comprobación | No atribuir caída ni crear otra wallet |
| QA-08 | 07:04–08:39, ambos | Ver estados/documento | Contenido y estados legibles | Zoom/cámara y encuadre dificultan algunas zonas | Mosaicos locales | P3 / mejora de grabación | No demostrado como fallo responsive |
| QA-09 | 01:27, acceso | Elegir cuenta | Sólo identidad de demo visible | Selector revela cuentas ajenas al recorrido | Capturas locales | P2 / observación | Ocultar selector en versión pública |
| QA-10 | Tras emitir, paciente | Recuperar consentimiento | Recibo propio localizable | API conserva operaciones del actor; su presentación requiere comprobación real tras recarga | Inspección de código | P2 / pendiente de comprobación | No ampliar permisos para mostrar operaciones de otro actor |

Los estados awaiting_signature → submitted → confirmed observados no constituyen por sí mismos un fallo. Las capturas de carga del documento tampoco acreditan cinco segundos de demora.

### QA-11 · Ingreso automático solicitado durante la revisión

20 septiembre, acceso por ruta: después de confirmar Privy se exigía otro clic en «Continuar con esta cuenta». El usuario solicita abrir directamente el portal elegido. Clasificación: P2, mejora de flujo reproducida en componente (fuera del video original).

Corrección en #125, commit `5476de4`: esperar `ready`, sesión autenticada e identidad; reemplazar la ruta una sola vez por cuenta/destino. Se mantienen los controles del portal, cambio de cuenta y error de cierre de sesión. No se conceden permisos desde login. Integrado en #126 como `0f0fe9f`.

Regresión: cuatro casos fallaron antes del cambio; después pasan. #125: 572 pruebas, TypeScript y build aprobados. #126 integrado: 595 pruebas aprobadas. Pendiente: validación autenticada del preview actualizado; las pruebas con Privy simulado no acreditan el OTP real.

## Auditoría independiente de #12

`rx12-chain-audit.json` registra cinco transacciones distintas, todas SUCCESS, verificadas contra Stellar Testnet y los registros persistidos: autorización, acreditación, consentimiento, emisión y revocación. Se comprobaron métodos, contratos, argumentos, firmas, pagador y coincidencia del hash guardado. El compromiso del documento se recalculó en memoria sin exportar contenido.

Estado al corte: #12 Revoked; reserva consumida; consentimiento ausente tras consumo; consulta no finalizada. No hay operación de activación para esta receta. Las 24 operaciones privadas del inventario estaban confirmadas; esto no acredita un worker activo ni reemplaza una revisión de todas las colas antes de grabar. No hubo escrituras ni nuevas firmas durante esta auditoría.

## Decisión sobre la grabación

Conservar el original como evidencia de cinco acciones. No rotularlo como seis transacciones ni intentar activar #12 revocada. Si se mantiene el requisito de demostrar activación, completar un tramo nuevo con otra receta y sus propios recibos, identificándolo como ejecución complementaria; no empalmarlo como si fuese #12. La selección de grabación final requiere cerrar QA y ocultar los accesos visibles.

## Pendientes de cierre

- Registrar ejecución final de aplicación, servicios privados, contratos, TypeScript y build.
- Validar las correcciones en preview; comprobar permisos, sesión y presentación de recibos con cuentas reales.
- CI/Vercel, publicación por PR y comprobación de lectura en main.
- Ocultar códigos/selector; completar el tramo de activación si continúa siendo criterio de entrega.
- Ajustar el mapa a los tiempos del video editado, preservando hashes por ejecución.

PDF, landing de verificación, traducción de portales y edición profesional están fuera de alcance. Este informe no afirma ausencia de bugs.
