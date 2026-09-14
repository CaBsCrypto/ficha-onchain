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
| Worker unificado local | No se observó proceso worker-private-portal en la inspección |
| Base de main, configuración activa y colas | Pendiente de comprobación segura |
| Controles autenticados de acceso indebido | Pendientes |
| Acceso administrativo en navegador | Sesión existente ingresó a /admin/doctors; brownsonchain y dgtlmoney8 visibles como autorizados. Esto no prueba denegación de documentos |
| Ensayo nuevo y grabación D3 | Pendientes |

Las pruebas automatizadas utilizan dependencias controladas; no acreditan una caída real de Privy/RPC ni reemplazan el ensayo en navegador. La inspección de código respalda la emisión a destinatario fijo y ausencia de transferencia, pero falta comprobar la interfaz desplegada en el corte D3.
