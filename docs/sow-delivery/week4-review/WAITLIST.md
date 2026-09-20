# Semana 4 — Operación del registro de interés

## Alcance

El formulario de landing y su modal usan el mismo componente. El registro guarda correo normalizado y fecha, con rol opcional si lo envía un cliente compatible. No crea cuentas, autoriza médicos, envía correos ni genera transacciones Stellar.

La lista puede contener **correos reales**, aunque la demostración clínica use datos sintéticos. Se almacena en la tabla `waitlist` de Neon, separada de las tablas y documentos clínicos; no se publica en cadena. Sólo una identidad Privy de la lista `ADMIN_EMAILS` puede leer `GET /api/waitlist`. No se acepta el token administrativo histórico. Las respuestas no se almacenan en caché y los errores no incluyen correos ni detalles de conexión.

## Entornos y habilitación

- Main: base dedicada `ep-jolly-haze`, entorno `test`.
- Preview: base aislada `ep-sweet-term`, entorno `preview`.
- Local: base de desarrollo `ep-lingering-water`; nunca usar la base main para servir desarrollo local.
- `TRUSTLEAF_WAITLIST_ENABLED=true` habilita los envíos de interés **independientemente** de las escrituras contractuales. Valor ausente o distinto de `true`: HTTP 503, sin registro.
- Mantener `TRUSTLEAF_PRIVATE_WRITES_ENABLED=false` en los previews.
- Antes de habilitar: verificar conexión, host autorizado, `waitlist(email UNIQUE, role, created_at)` y `api_rate_limits`. El handler no ejecuta DDL ni migra automáticamente.

Comprobación de lectura del 19 de septiembre de 2026 (Chile): ambas bases tienen las tablas e índices esperados; ambas listas contienen cero registros, sin correos no normalizados. No se copió ni modificó ningún registro. No se requiere migración.

## Límites y recuperación

- Cuerpo JSON: máximo 1.024 bytes reales, incluso sin Content-Length.
- Correo: string de hasta 254 caracteres, normalizado con trim y minúsculas.
- Inserción idempotente por índice único. Un duplicado devuelve la misma confirmación que un registro nuevo.
- Máximo global de 30 envíos válidos por minuto por base, mediante incremento atómico de `api_rate_limits`. Bucket reservado: `org_id=0`, `env=waitlist`, `bucket=public`.
- No se almacenan IP ni se confía en cabeceras de IP para este límite. Es un límite básico compartido, no un servicio antispam: un abuso puede agotar temporalmente la cuota de todos los visitantes.
- HTTP 429 incluye Retry-After de 60 segundos. Un fallo de base o del límite falla cerrado con 503.
- La interfaz conserva el correo ante un fallo y permite reintentar. No promete haber guardado con un mero HTTP 200 sin `success: true`.

El aviso desplegable explica almacenamiento, finalidad, acceso restringido y separación de la información clínica. No hay un contador público estimado ni una lista pública de correos. Antes de una campaña de captación amplia se debe definir un canal de contacto de privacidad y una política de conservación; este cierre no declara cumplimiento legal certificado.

## Pendientes de publicación

## Validación local realizada

19 de septiembre de 2026, build local servido con la base dev `ep-lingering-water` y habilitación sólo en ese proceso:

- Sección: envío de un correo sintético `example.test` en mayúsculas; confirmación real tras persistir.
- Modal: repetición en minúsculas; misma confirmación. Consulta independiente: exactamente una fila para ese correo.
- GET público: HTTP 401, sin contenido del listado.
- Navegador móvil: EN/ES/PT; error de correo inválido; error recuperable cuando el servicio está deshabilitado.
- Pruebas automatizadas: 592 casos de aplicación, 45 privados, 11 contractuales; TypeScript y build aprobados sobre los cambios de trabajo. Incluyen duplicado, límites, cuerpo grande, fallo de base, doble clic, reintento y autorización del listado. No sustituyen las pruebas autenticadas del preview.

## Pendientes de publicación

- Validación de escritura únicamente en preview aislado, con correos sintéticos bajo `example.test`.
- Verificar duplicado, lectura pública rechazada y control administrativo.
- CI/Vercel y revisión del preview antes de habilitar main.
- Registrar commit desplegado y resultado de comprobación pública en el checklist final.
