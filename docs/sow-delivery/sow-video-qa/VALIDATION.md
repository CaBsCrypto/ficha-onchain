# Validación de correcciones

Base: main `675a5a6`. Rama: `codex/sow-video-qa`. Fecha: 20 de septiembre de 2026.

## Reproducción

- Agenda: el test nuevo falló antes del cambio al corregir 18:20–13:00 a 18:20–20:00. Después pasa y también acredita que editar el borrador no oculta un fallo HTTP 503 al guardar.
- Avisos: dos pruebas fallaron al encontrar dos instancias de la misma operación. Después de filtrar por ID, la tarjeta conserva el aviso y la consulta no lo duplica. Se mantiene visible una operación cuando la receta todavía no llegó, así como avisos de operaciones distintas.
- No se modificaron APIs, firmas, contratos, permisos, esquema ni registros clínicos.

## Resultados locales

| Comprobación | Resultado |
|---|---|
| Aplicación (`npm test`) | 567 aprobadas, 51 archivos |
| Servicios privados (`npm run test:private`) | 45 aprobadas |
| Contratos (`cargo test --manifest-path contracts/Cargo.toml`) | 11 aprobadas |
| TypeScript (`npx tsc --noEmit`) | Aprobado después de regenerar tipos de rutas con `next typegen` |
| Build (`npm run build`) | Aprobado con acceso a Google Fonts |

El primer typecheck encontró un tipo generado de `/login/[role]` de la rama anterior. El primer build no pudo descargar Google Fonts dentro del entorno restringido; se repite con red habilitada. No se cambió código para ocultar esos errores.

## Cobertura automatizada aprovechada

| Área | Suites existentes ejecutadas | Límite |
|---|---|---|
| Identidad y acceso | access-gates-component, private-access-recovery, private-operations-security, privy-wallet-binding | Proveedores controlados; no equivale a una sesión real nueva |
| Agenda | agenda-component, private-agenda, prescription-bookings | Base/servicios simulados |
| Firma y recuperación | private-signing-component, private-operation-recovery, workers privados | Fallos controlados; no se interrumpió el worker de main |
| Documentos | private-document-loading, prescription-document-view, prescription-verification | No acredita PDF ni un nuevo ensayo en navegador |
| Consentimiento y contratos | private-portal-state, contratos privados | Ejecución aislada; auditoría de #12 aporta prueba independiente en Testnet |

## Pendientes reales

- Preview: revisión autenticada, móvil, teclado, error de agenda corregido y avisos sin duplicar. Las escrituras clínicas deben permanecer apagadas.
- No se ha desplegado esta corrección ni repetido su comprobación en main.
- Las rutas nuevas, PT y waitlist corresponden a #125/#126, no a esta rama.
- Presentación y persistencia del recibo de consentimiento después de recargar requieren sesión real; la API sólo devuelve operaciones del propio actor.

No hay resultado de QA final del producto hasta cerrar esas verificaciones.
