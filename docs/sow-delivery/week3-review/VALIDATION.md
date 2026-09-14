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
