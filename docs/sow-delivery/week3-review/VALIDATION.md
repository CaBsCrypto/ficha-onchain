# Corte de preparación D3

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
| Controles autenticados de acceso indebido | Administrador y usuario ajeno: rechazo de #7 y #8 confirmado el 14 de septiembre; acción médica desde paciente pendiente |
| Acceso administrativo en navegador | Sesión existente ingresó a /admin/doctors; brownsonchain y dgtlmoney8 visibles como autorizados. Esto no prueba denegación de documentos |
| Ensayo nuevo y grabación D3 | Pendientes |

Las pruebas automatizadas utilizan dependencias controladas; no acreditan una caída real de Privy/RPC ni reemplazan el ensayo en navegador. La inspección de código respalda la emisión a destinatario fijo y ausencia de transferencia, pero falta comprobar la interfaz desplegada en el corte D3.

El worker usa el archivo local ignorado por Git destinado a main; no se cambió .env.local ni se copiaron registros del preview. El bloqueo anterior pertenecía a un proceso inexistente y fue recuperado por el mecanismo del runner. Su continuidad depende de mantener el equipo y proceso activos. Aún faltan los accesos actuales de médico y paciente y los controles autenticados de denegación; no iniciar consultas hasta cerrar esas comprobaciones.

## Seguimiento del 14 de septiembre

- En navegador administrativo se comprobó nuevamente autorización vigente de dgtlmoney8 y el enlace a la renovación `bc313815b2d725f8bbaa39cd771768e7692d51df10b1844fcdfea13b02466f0a`. No se renovó ni revocó al médico.
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

Se observó la sesión Privy de `crwom01@gmail.com` en el control temporal del dominio principal. Esta cuenta no es el emisor ni el destinatario de las dos recetas del ensayo. Mediante los mismos identificadores existentes y las rutas privadas originales se comprobaron ambos resultados en el navegador interno:

| Recurso | Resultado |
|---|---|
| Documento #7 | HTTP 404 · Recurso no accesible para esta sesión |
| Documento #8 | HTTP 404 · Recurso no accesible para esta sesión |

No se mostró ni guardó contenido documental, no se extrajeron tokens y no se transmitieron operaciones contractuales. Las peticiones estaban autenticadas; no se consideran pruebas de acceso anónimo. El control de usuario ajeno queda cerrado para ambos documentos. La acción médica solicitada por paciente continúa pendiente, así como el nuevo ensayo y la grabación D3.
