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
| Controles autenticados de acceso indebido | Pendientes |
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
