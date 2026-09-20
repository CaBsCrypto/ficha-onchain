# Control de ejecución · 20 septiembre 2026

## Puntos de recuperación

- Main de referencia: `675a5a6`. No se fusionó ninguna PR ni se modificó la configuración de main durante esta ejecución.
- QA #127: `915fc02`, correcciones y evidencia. CI/Vercel aprobados para ese commit.
- Accesos #125: `9a915e4`, CI/Vercel aprobados.
- Waitlist #126: `aea906b`, incorpora el último ajuste de #125 mediante merge, sin reescribir historial. Pendiente resultado remoto del nuevo commit al preparar este registro.
- Respaldo local: `.trustleaf-local/backups/sow-20260920-010211`, 25 archivos con manifiesto SHA-256. Tras cambiar de ramas se restauraron los 25 archivos byte por byte; se revirtió únicamente la normalización CRLF de Git.
- Stash adicional conservado: `sow-controlled-execution-20260920-preserve-local-evidence`. Los archivos ya están restaurados: **no aplicar otra vez** sin revisar el estado.

## Entornos y límites

| Entorno | Uso | Condición |
|---|---|---|
| Main / ep-jolly-haze | Sólo lectura durante diagnóstico | Historial y configuración preservados |
| Previews #125/#126 / ep-sweet-term | Validación aislada autorizada | Escrituras clínicas apagadas; waitlist tiene habilitación independiente |
| Preview #127 | Revisión de agenda y avisos | Configuración sensible pendiente de autorización específica |
| Local / ep-lingering-water | Desarrollo y pruebas aisladas | No servir desarrollo contra main |

No se incluyen secretos en este registro. No se han generado recetas ni firmas nuevas.

## Verificaciones realizadas

| Versión | Evidencia nueva | Resultado |
|---|---|---|
| #127 / 915fc02 | Resultados registrados en VALIDATION.md | 567 aplicación, 45 privadas, 11 contractuales, TypeScript/build aprobados |
| #125 / 9a915e4 | 5 suites de rutas, idioma, acceso, recuperación y navegación | 37 pruebas aprobadas |
| #125 / 9a915e4 | Navegador: paciente → PT → enlace discreto médico | Ruta de médico con lang=pt y textos portugueses; sin selector conjunto de roles ni enlace admin |
| #126 / aea906b | Aplicación completa tras integrar #125 | 592 pruebas, 54 archivos aprobados |
| #126 / aea906b | TypeScript y build local | Aprobados |

No se repitieron contratos privados por un merge que sólo cambió navegación pública. Se repetirán todas las suites sobre la candidata integrada final después de las fusiones secuenciales.

## Revisión manual agrupada pendiente

1. Autorizar configuración aislada de #127; entrar con médico y paciente cuando el preview esté preparado.
2. Comprobar agenda y avisos con datos existentes; recibo de consentimiento recuperable después de recargar. No emitir para validar diseño.
3. Comprobar ingreso, recarga, salida y cambio de cuenta en #125 con los tres roles; revisar móvil y teclado.
4. Comprobar waitlist en #126 con correo sintético: una fila tras repetir envío, respuesta pública sin listado y listado sólo para administrador.
5. Tras aprobación, fusionar #127 → actualizar y validar #125 → actualizar y validar #126. Detener la secuencia ante cualquier regresión. No fusionar sólo porque CI esté verde.

Cada despliegue exige commit verificado y comprobación del tramo afectado en main. Una regresión se revierte por PR; nunca borrando datos ni restaurando historiales. Las incidencias siguen centralizadas en REVIEW.md, sin un segundo inventario paralelo.

El video conserva sus cinco recibos reales. La activación necesita un tramo complementario identificado como otra ejecución, después del QA y con intervención del usuario para firmas. No se ha realizado ese tramo ni editado el original.
