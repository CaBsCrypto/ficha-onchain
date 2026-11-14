# Corte de preparación D3

> Nota de copia pública · 22-10-2026: Copia pública de continuidad: las cuentas identificables se sustituyeron por actores anónimos donde correspondía; no se alteraron recibos ni hashes.

Código comprobado: `50c2ec597eb75c8260201dd75f9dfe04e8eddc1a` (main, PR #120). Estos resultados corresponden a una ejecución nueva durante la preparación D3, no al video.

| Comprobación | Resultado |
|---|---|
| Aplicación | 536 pruebas aprobadas, 46 archivos |
| Servicios privados y workers | 45 aprobadas |
| Contratos | 11 aprobadas: 4 registro y 7 recetas |
| TypeScript | Sin errores |
| Build local | Aprobado; el primer intento no pudo descargar Google Fonts y el reintento con red completó el build |
| Estado GitHub del despliegue Vercel | success para el commit indicado |
| Dominio principal /login?role=admin | HTTP 200; no prueba autenticación ni base |
| Worker unificado local | Iniciado el 14 de septiembre; un proceso observado y un bloqueo de autoridad confirmado en Neon a las 04:32:58 UTC |
| Base y configuración local del worker | Configuración validada: entorno test, host aislado de main, IDs actuales y autoridad coincidente; no implica nueva auditoría de variables de Vercel |
| Colas de main | 2 solicitudes administrativas confirmadas, 3 reservas consumidas y 12 operaciones privadas confirmadas; sin estados pendientes en esas tablas al corte del 14 de septiembre |
| Controles autenticados de acceso indebido | Aprobados para los casos definidos: administrador y usuario ajeno rechazados en #7/#8; preparación de revocación de #7 desde paciente rechazada con HTTP 403 |
| Acceso administrativo en navegador | Sesión existente ingresó a /admin/doctors; actor-medico-nuevo y actor-medico visibles como autorizados. Esto no prueba denegación de documentos |
| Ensayo nuevo y grabación D3 | Pendientes |

Las pruebas automatizadas utilizan dependencias controladas; no acreditan una caída real de Privy/RPC ni reemplazan el ensayo en navegador. La inspección de código respalda la emisión a destinatario fijo y ausencia de transferencia, pero falta comprobar la interfaz desplegada en el corte D3.

El worker usa el archivo local ignorado por Git destinado a main; no se cambió .env.local ni se copiaron registros del preview. El bloqueo anterior pertenecía a un proceso inexistente y fue recuperado por el mecanismo del runner. Su continuidad depende de mantener el equipo y proceso activos. Aún faltan los accesos actuales de médico y paciente y los controles autenticados de denegación; no iniciar consultas hasta cerrar esas comprobaciones.

## Seguimiento del 14 de septiembre

- En navegador administrativo se comprobó nuevamente autorización vigente de actor-medico y el enlace a la renovación `bc313815b2d725f8bbaa39cd771768e7692d51df10b1844fcdfea13b02466f0a`. No se renovó ni revocó al médico.
- A las 04:55:12 UTC, el proceso del worker seguía vivo pero su bloqueo en base ya no aparecía. No se considera prueba de salud que el proceso esté encendido.
- El runner depende de un advisory lock de sesión. Neon no soporta esos bloqueos mediante su pool de transacciones: https://neon.com/docs/connect/connection-pooling.
- Se reinició únicamente el worker con conexión directa al mismo endpoint de main (sin el sufijo `-pooler`). La configuración de Vercel y .env.local permanecieron intactas. A las 04:56:47 UTC había un bloqueo de autoridad; falta seguimiento sostenido y prueba con trabajo real.
- El acceso privado exige Bearer enviado por el cliente. Navegar directamente a la URL del documento no reproduce una petición autenticada del administrador. La prueba de denegación sigue pendiente; no se reemplaza por un listado vacío ni por un 401 sin sesión.

## Control autenticado en main — 14 de septiembre, 05:10–05:11 UTC

La PR #121 fue fusionada y Vercel confirmó el despliegue de `c7bc6e7f1fe76c952055d0f9d7a19b70dc48a2dd`. El control temporal de lectura se abrió en `https://trustleaf-demo.vercel.app/admin/doctors?access-check=1`, con la sesión administrativa existente y autenticación Privy. Se utilizaron las rutas privadas existentes; no se extrajeron tokens ni se firmaron operaciones.

| Actor | Receta | Identificador interno de recurso existente | Resultado observado en navegador |
|---|---|---|---|
| Administrador | #7 | `ce47f381-dbd5-4ca6-bdd3-297f28043049` | HTTP 404 · Recurso no accesible para esta sesión |
| Administrador | #8 | `21ea3b4d-a6aa-434e-b268-bec18433c544` | HTTP 404 · Recurso no accesible para esta sesión |

La existencia de ambos recursos se contrastó previamente mediante lectura de la base de main. Por ello, estos 404 autenticados respaldan la denegación al administrador; no son peticiones anónimas ni IDs inexistentes. El control descarta el cuerpo de respuesta sin mostrarlo ni guardarlo. No se modificaron las recetas.

El código del control tiene seis pruebas nuevas; el total de aplicación fue de 542 pruebas aprobadas en 47 archivos. TypeScript y CI del head `ad13afc729769de87ff2887f74669b14679ca28e` pasaron antes del merge. Los resultados contractuales anteriores conservan su versión original y no se presentan como una nueva ejecución.

El worker mantuvo un bloqueo de autoridad a las 05:11:08 UTC. Esto acredita exclusión en ese momento, no disponibilidad permanente ni una prueba nueva de procesamiento.

Pendiente al corte de las 05:11 UTC: lectura legítima actual de médico y paciente, denegación a usuario ajeno, rechazo de una acción médica solicitada por paciente y ensayo nuevo D3. El control de administrador anteriormente pendiente queda cerrado; el bloque completo de permisos continúa pendiente.

## Confirmación del usuario — lectura legítima

El 14 de septiembre el usuario confirmó desde sus dos perfiles independientes que médico y paciente abren los documentos #7 y #8. También confirmó que #8 muestra el estado revocado. Es una observación reportada por el usuario, no una inspección directa del agente ni una nueva auditoría contractual. No se atribuye un código HTTP a estas aperturas.

La lectura histórica de #8 es coherente con el alcance: revocar conserva el documento y el acceso de sus participantes. Quedan pendientes el usuario ajeno, la acción médica solicitada desde paciente y el ensayo nuevo D3.

## Usuario ajeno autenticado — 14 de septiembre, 05:20–05:21 UTC

Se observó la sesión Privy de `actor-alterno@example.test` en el control temporal del dominio principal. Esta cuenta no es el emisor ni el destinatario de las dos recetas del ensayo. Mediante los mismos identificadores existentes y las rutas privadas originales se comprobaron ambos resultados en el navegador interno:

| Recurso | Resultado |
|---|---|
| Documento #7 | HTTP 404 · Recurso no accesible para esta sesión |
| Documento #8 | HTTP 404 · Recurso no accesible para esta sesión |

No se mostró ni guardó contenido documental, no se extrajeron tokens y no se transmitieron operaciones contractuales. Las peticiones estaban autenticadas; no se consideran pruebas de acceso anónimo. El control de usuario ajeno queda cerrado para ambos documentos. La acción médica solicitada por paciente continúa pendiente, así como el nuevo ensayo y la grabación D3.

## Acción médica solicitada por paciente — 14 de septiembre, 05:35 UTC

Versión desplegada en main: `717de1e4a549f82ff44e697baaa120b53f67bbc5`, merge de la PR #122. CI y Vercel aprobados. En la rama validada pasaron 553 pruebas de aplicación, 45 privadas, TypeScript y build local. Se añadieron pruebas de rechazo al paciente para preparar mint, activate y revoke, con rollback y sin preparar/transmitir en cadena.

Desde el navegador interno, con `actor-paciente@example.test` autenticado, el botón temporal solicitó `POST /api/private-operations` con acción `revoke`, identificador interno de #7 y confirmación explícita. El servidor respondió **HTTP 403 · Acción médica rechazada por permisos**; el control exige el código de error `forbidden`. La petición salió del propio dominio mediante el cliente autenticado habitual. No se solicitó firma, ni se llamó a confirmación o transmisión.

La lectura de base y Stellar antes (05:30:35 UTC, ledger 4668049) y después (05:35:17 UTC, ledger 4668105) comprobó:

- #7 permanece `Active`; destinatario, emisor y compromiso coinciden con la base.
- 12 operaciones privadas y cero sin finalizar en ambos cortes.
- Huella de registros de operaciones idéntica antes/después: `38bb3da2549a887e1bb3bae2173fbfb4d3522d0ae2631af7041886101fbd75db`.
- Huella del registro seleccionado de #7 idéntica antes/después: `3f7d259311a2e716b76e1faf04a4876246a09d102f900b299a65df5a0b95a7e4`.
- Dos solicitudes administrativas confirmadas y tres reservas consumidas; ninguna pendiente en esas colas.

Los controles de permisos definidos quedan aprobados. Esto no cierra el ensayo nuevo D3 ni la grabación. El control temporal se retirará antes de fijar la versión para grabar.

Después del rechazo, una lectura autenticada de #7 desde la misma sesión del paciente respondió HTTP 200. El contenido se descartó sin mostrarse ni guardarse. Esto complementa la lectura de #7/#8 reportada previamente por el usuario; no se repitió una lectura de #8 en este último paso.

## Inicio del ensayo D3 — 14 de septiembre, 05:49–05:51 UTC

Tras la autorización del usuario para operar el flujo desde el navegador, se reservaron dos consultas nuevas para el médico actor-medico (ID de médico 2) y el paciente habitual autenticado:

| Consulta (no ID de receta) | Horario America/Santiago | Observación en navegador |
|---|---|---|
| #5 | 14 de septiembre, 03:00 | Reserva creada; asistencia confirmada |
| #6 | 14 de septiembre, 03:20 | Reserva creada; asistencia confirmada |

En ambas seguían pendientes el inicio del médico y la acreditación de reserva; se mostraba **Sin permiso de emisión** y el botón de autorizar estaba deshabilitado. La asistencia no concedió consentimiento. No se reutilizaron las consultas históricas ni se modificaron #7/#8.

El bloque semanal guardado por el usuario ofrecía citas de 20 minutos (03:00, 03:20, 03:40). En el selector dos médicos compartían nombre y especialidad sintéticos; se contrastaron sus IDs con la base y se eligió el ID 2, sin adivinar por etiqueta. La diferenciación de nombres queda como ajuste del material de demostración antes de grabar.

## Inicio médico y recuperación del worker — 14 de septiembre, 05:54–05:57 UTC

Se verificó la sesión del médico actor-medico y su autorización vigente. Se pausó únicamente el proceso identificado del runner de main; a las 05:54:33 UTC se confirmó ausencia de bloqueo de autoridad. Desde el portal se iniciaron las consultas #5 y #6. Ambas mostraron **Esperando acreditación** y ausencia de permiso de emisión, sin éxito simulado. La base contenía una solicitud por consulta, estado `prepared` y `attestation_hash=null`.

Se reanudó el mismo runner con conexión directa a la base de main. A las 05:55:50 UTC había un único bloqueo de autoridad. Ambas solicitudes pasaron a `confirmed`; la consulta #6 mostró **Reserva acreditada** y el enlace a su recibo. Los dos recibos se contrastaron directamente con Stellar RPC:

| Consulta | Método | Hash confirmado | Ledger | Vencimiento America/Santiago |
|---|---|---|---|---|
| #5 | attest_booking | `f94f2cd5348179a6af720dbec0cff21aa81ad8000acd10da8e560054fdc448a9` | 4668353 | 03:24:40 |
| #6 | attest_booking | `e6e34be403090638f0a4d9a08dc50975ac00a6fe224ab03ca014a2de0c2d3f54` | 4668357 | 03:25:03 |

Ambos retornaron `SUCCESS` en el contrato vigente `CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE`. Es una pausa/reanudación real observada; no acredita por sí sola recuperación de una respuesta perdida durante transmisión. La emisión seguía bloqueada en la interfaz por falta de consentimiento. Pendientes: consentimientos, retirada y bloqueo, emisiones, activaciones, revocación y auditoría final de este ensayo.

## Consentimientos y retirada — 14 de septiembre, 06:00–06:02 UTC

Con la sesión del paciente habitual, se revisaron y confirmaron en la interfaz dos permisos separados, cada uno limitado a su consulta, médico y una sola emisión. La interfaz mostró operación confirmada y permiso vigente antes de continuar.

| Consulta | Acción | Recibo mostrado en la interfaz |
|---|---|---|
| #5 | authorize_prescriber | `79f8d5ee8ba1ff4b922bcfcfde3c64b8f72534a483e2b1ec61bbecbe60345ddf` |
| #6 | authorize_prescriber | `83114ebfbd8a70b86df9ea6e2feafcbf4c320887c50e89853c3ca22f635ece13` |
| #6 | revoke_consent | `7e25388ef0a4305d1efd1389cfb563e4b07a056767c2a3b14ace05978a142cae` |

Tras la retirada confirmada, #6 mostró **Sin permiso de emisión** y ofreció autorizar nuevamente. Se dejó el permiso retirado para comprobar el bloqueo desde el médico, antes de volver a concederlo. #5 mantiene el permiso vigente hasta 03:24:40 America/Santiago. La auditoría independiente de estos tres recibos queda pendiente; no se confunde esta observación de UI con esa auditoría.

## Emisión, activación y revocación — 14 de septiembre, 06:05–06:26 UTC

El médico abrió #6 con el consentimiento retirado: campos y revisión de emisión deshabilitados. Esto acredita bloqueo visual; no se presentó una petición de emisión al servidor durante ese intervalo.

El paciente volvió a conceder el permiso de #6. Ambas recetas se emitieron dentro de la vigencia de sus reservas y se activaron mediante confirmaciones separadas. #10 permanece activa; #11 fue revocada. Ambas consultas quedaron finalizadas. El médico abrió el documento histórico sintético de #11 después de revocar.

| Consulta | Receta | Acción | Hash |
|---|---|---|---|
| #5 | #10 | mint_prescription | `eb83cd678fa04601b7a1821809c86d8c4aa047444ce7eb49923d35330ade4ff7` |
| #5 | #10 | activate | `2c3e23a2b1d0e958b33a7e577c2f487f6c49ac18ee10b88673e68d5cd1b57eff` |
| #6 | — | authorize_prescriber (nuevo permiso) | `23f0b1bdf33c387d01895d2880a5f94b368b823db8b043dff641da691f9dad1b` |
| #6 | #11 | mint_prescription | `83ccf421dbbeb3be089218135834d823837e284ae80534f292b8b6636bbb3752` |
| #6 | #11 | activate | `8ef29f26da79a7da5f7ec1336fb38b2dbbe82e24ae2764b45cfbe7e72215e8f9` |
| #6 | #11 | revoke | `c59c458533e4ed2b7cd929601125ca75516d0bd1702e452bb4b38532ad02de41` |

La activación de #10 se recuperó después de recargar, sin volver a firmar; la interfaz mostró Activa y el mismo recibo confirmado. RPC verificó SUCCESS para su activación (ledger 4668556) y para emisión, activación y revocación de #11 (ledgers 4668691, 4668698 y 4668708). La interfaz mostró las reservas y permisos utilizados.

Pendientes al corte: lectura de #10/#11 desde paciente, auditoría integral de los once recibos del ensayo, consistencia final de base y cadena, ausencia de intentos sin resolver y retirada del control temporal antes de la grabación. No se declara todavía D3 completo.

## Lectura del paciente y auditoría independiente — 14 de septiembre, 06:28–06:29 UTC

Con la sesión autenticada del paciente, la bandeja mostró #10 Activa y #11 Revocada. Se abrieron ambos documentos sintéticos correctamente; no había controles de activación ni revocación en la vista del paciente.

La auditoría de lectura del ensayo aprobó los **11 recibos**: dos acreditaciones, cuatro acciones de consentimiento (incluidas retirada y nueva concesión), dos emisiones, dos activaciones y una revocación. Verificó éxito, contratos, métodos y argumentos exactos, firmas de cada propietario y del relayer, pagador, hash del sobre persistido, asociaciones Privy, destinatarios y compromisos recalculados sin exportar documentos. No hubo una nueva autorización administrativa en este ensayo.

La lectura directa de almacenamiento en ledger 4668740 confirmó #10 Active y #11 Revoked, reservas Consumed y permisos ausentes tras consumo. Ambas consultas están finalizadas y hay una sola emisión por consulta. Evidencia: `../../evidence/week3-main-2026-09-14/rehearsal-chain-audit.json`.

El control agregado de colas de main devolvió 21 operaciones privadas confirmed, 5 reservas consumed y 2 solicitudes administrativas confirmed; ninguna operación pendiente al corte. Estas cantidades incluyen historial previo y no equivalen al número de transacciones del ensayo D3.

Este bloque de recorrido y auditoría queda aprobado. Aún faltan la retirada del control temporal, fijar y validar la versión para grabar, video nuevo y mapa de tiempos. No se declara D3 entregado.
