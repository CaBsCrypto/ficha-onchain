# Semana 2 · Preparación del ensayo por API

Código comprobado: `a79bfb99dda73217108c16a2fbe1f976eef0d569`. Rama `codex/sow2-testnet-api-rehearsal`, basada en `0e66f9a` del sprint. Fecha: 8 de octubre de 2026.

| Comprobación | Categoría | Resultado | Evidencia |
| --- | --- | --- | --- |
| Recorrido de ocho pasos, versiones y permisos independientes | Pruebas aisladas | Aprobado | 31 casos de `clinical-web-rehearsal.test.mjs` |
| Recibos fee-bump, firmas, argumentos, resultado y prueba durable | Pruebas aisladas | Aprobado | 25 casos de `clinical-web-receipt-audit.test.mjs` |
| Origen local, nonce único, privacidad de tokens, cierre y expiración | Pruebas aisladas | Aprobado | 14 casos de `clinical-local-auth.test.mjs` |
| HTTP autenticado, límites, diagnóstico saneado y journal exclusivo | Pruebas aisladas | Aprobado | 7 casos de `clinical-web-transport.test.mjs` |
| Ayuda y consentimiento explícito antes de ejecución | Pruebas aisladas | Aprobado | 3 casos de `validate-clinical-web-testnet.test.mjs` |
| Suite completa de aplicación | Pruebas aisladas | **929/929**, 74 archivos | Vitest con configuración original y `envDir:false` |
| Suite completa de servicios privados | Pruebas aisladas | **243/243** | `npm run test:private` |
| TypeScript y build | Automatizado | Aprobados | `npx tsc --noEmit`; `npm run build` |
| Compilación del acompañante y respuesta HTTP local | Observación técnica local | Aprobado | Bundle en memoria y HTTP 200; no se ingresó a Privy |
| Ingreso auténtico, OTP y compatibilidad CSP con Privy | Pendiente real | No ejecutado | Próxima sesión del acompañante |
| Preflight efectivo de cuentas, médico, contratos y relayer | Pendiente real | No ejecutado en esta preparación | `--inspect` con identidad acordada |
| Ocho transacciones, lectura posterior y cero intentos inciertos | Pendiente real | No ejecutado | `--run` y otro proceso `--inspect` con mismo run-id |
| Navegación de producto, móvil y texto al 200 % | Pendiente manual | Este script no la acredita | Guía general de semana 2 |

Los 80 casos nuevos forman parte de las 243 pruebas privadas. No sumarlos otra vez. Las firmas de sus fixtures son Ed25519 locales; no se presentan como firmas reales de Privy. Los contratos no cambiaron: no se repitió su suite ni se atribuyeron nuevas operaciones a semana 1.

El recibo, contenido y permisos se comprueban antes de aprobar un paso. Una relectura fallida conserva el journal, pero muestra los pasos históricos no revalidados como pendientes. Antes de conceder permisos se contrasta el ID del médico con su wallet en el snapshot autenticado.

Esta preparación produjo **cero transacciones nuevas** y no habilitó escrituras, migró esquemas, modificó main ni trasladó secretos. El verificador usa exclusivamente loopback y requiere autorización específica para su ejecución sintética. La PR se mantiene separada y sin fusionar mientras se completa la revisión real.

Instrucciones: [ensayo API](../../sow2/ENSAYO-API-TESTNET-SEMANA-2.md). Los logs locales permanecen ignorados; `preparation.json` contiene únicamente cifras, límites y SHA-256 de fuentes públicas. El commit del script no certifica la versión del servidor que escucha en el puerto elegido.
