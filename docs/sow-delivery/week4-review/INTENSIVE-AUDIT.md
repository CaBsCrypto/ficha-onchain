# D4 — Inventario único de auditoría intensiva

> Nota de copia pública · 22-10-2026: Copia pública de continuidad: las cuentas identificables se sustituyeron por actores anónimos donde correspondía; no se alteraron recibos ni hashes.

Fecha: 23 septiembre 2026. Versión observada: main `6e8dfb4`; revisión local `1c694ba`, árbol idéntico. Auditoría sin correcciones de producto ni operaciones clínicas. Worker detenido.

P1: preparación/credibilidad o evidencia necesaria para entrega; P2: confusión funcional; P3: detalle menor. P1 de presentación no implica vulnerabilidad ni fallo contractual. Un pendiente no equivale a aprobación o bug.

## Inventario

| ID | Pantalla/paso y reproducción | Esperado | Observado / evidencia | Prioridad | Estado | Recomendación |
| --- | --- | --- | --- | --- | --- | --- |
| IA-01 | Landing ES/EN/PT: hero, solución y cómo funciona | Distinguir producto demostrado y visión futura | Presenta historial completo en cadena, passkeys biométricos y acceso por escaneo a médicos/farmacias como capacidades presentes; roadmap sitúa ficha clínica en fase futura. DOM main y traducciones | P1 presentación | Discrepancia reproducida; sin corregir | Alinear relato con recetas privadas, Privy y Testnet antes de usar landing como demostración de D4; no construir esas funciones |
| IA-02 | Footer, abrir destinos de Verificar/Empresa/Legal | Cada enlace conduce a contenido identificable | Verificar, Nosotros, Contacto, Trabaja con nosotros, Términos y Seguridad apuntan a #. DOM main y footerHrefFor | P2 | Enlaces sin destino específico, reproducido | Decidir retirar/desactivar o enlazar contenido real; no confundir con rutas retiradas, que ya no se enlazan |
| IA-03 | Acceso médico tras salir | Describir autorización técnica de la demo | «Tu registro profesional se valida» y «trazabilidad legal» exceden lo acreditado por el SOW Testnet; leído en main | P2 presentación | Observación de narrativa | Usar terminología de autorización revisada/registro verificable, sin atribuir certificación profesional o legal |
| IA-04 | Médico actor-medico: Disponibilidad | Horario guardado para el día de grabación | Sólo lunes 03–04/09–13 y viernes 21:15–22:15. No hay jueves 24 septiembre. Observado sin editar | P1 preparación | Configuración pendiente, no bug | Guardar horario adecuado cuando se prepare la grabación; no iniciar consulta anticipadamente |
| IA-05 | Lista: carga exitosa y siguiente lectura 503 | Diferenciar último estado conocido de verificación actual | Alert visible, tarjeta Activa y cabecera Estados verificados permanecen. Reproducción aislada con hook real y proveedor controlado; acciones médicas reciben unavailable | P2 | Comportamiento reproducido, riesgo de confusión; no acceso indebido demostrado | Valorar indicación de estado anterior/última lectura; no simular fallo en main |
| IA-06 | Consulta finalizada #5 | Lectura inequívoca del estado actual | «Consulta iniciada» en antecedentes y «Consulta finalizada» debajo; ambos correctos pero potencialmente confusos | P3 | Mejora menor | Distinguir hito histórico y estado actual; no cambiar semántica |
| IA-07 | Doctor: consultas y recetas | Fechas y enlaces fácilmente distinguibles | Fecha ISO en consultas; enlaces de emisión/activación con mismo texto, distinguibles por contexto | P3 | Mejora menor | Etiquetas específicas y fecha legible en ciclo posterior si no bloquea explicación |
| IA-08 | Detalle #5 después de emisión y recarga | Recibos recuperables por actor | Médico conserva reserva/emisión/activación. Paciente main conserva consentimiento 79f8d5ee8ba1ff4b922bcfcfde3c64b8f72534a483e2b1ec61bbecbe60345ddf tras recargar/reabrir; coincide con authorize_prescriber/SUCCESS auditado. SQL restringe operations a actor_user_id | P2 cobertura | Aprobado observado; pendiente cerrado | Mantener recibos por actor, sin ampliar permisos |
| IA-09 | Documento, teclado completo | Foco utilizable y retorno al cierre | Enter/Escape/Shift+Tab comprobados; vuelta del último enlace en IAB pasa por BODY/contenedor. jsdom sustituye showModal, no demuestra foco nativo | P2 cobertura | Pendiente contraste en navegador compatible | No declarar bug ni auditoría de accesibilidad completa sin reproducción nativa |
| IA-10 | Video original #12 | Demostrar activación y lectura activa | Auditoría original: cinco recibos, sin activate; #12 revocada. TIMESTAMPS coincide con rx12-chain-audit | P1 evidencia | Brecha conocida de grabación | Complemento independiente con nueva receta; conservar #12 |
| IA-11 | Video para compartir | Sin códigos ni cuentas ajenas | Intervalos sensibles documentados en revisión original; edición definitiva pendiente | P1 evidencia | Pendiente saneamiento | Revisar corte final, ocultar códigos y cuentas ajenas y recalcular tiempos |
| IA-12 | Disponibilidad de operaciones al grabar | Worker único, relayer y colas comprobados | Worker detenido ordenadamente; comprobación anterior no garantiza disponibilidad mañana | P1 preparación | Pendiente en momento de grabar | Revalidar antes de firmar; no reiniciar durante auditoría |

## Matriz de cobertura

| Área | Evidencia actual | Límite |
| --- | --- | --- |
| Landing y accesos | ES/EN/PT cambian; menú móvil abre/cierra; acceso Privy directo observado; salida médica lleva a /login/doctor | Nuevo ingreso paciente/administrador requiere OTP del usuario |
| Waitlist | Modal abre, Escape cierra y devuelve foco; etiquetas/privacidad traducidas. Tests envío/error/doble clic/límites/listado aprobados | Sin nuevos registros; persistencia real y 401 reutilizan evidencia de #126 |
| Médico | Disponibilidad y perfil cargan sin edición; detalle finalizado conserva recibos; recetas y teclado revisados | No se guardó agenda ni perfil; no se ejercitaron estados nuevos en cadena |
| Paciente móvil | Nueva sesión main: inicio, consulta #5, reserva y cuenta a 390 px; recibo consentimiento persiste tras recarga. Formulario diferencia Perfil #2/#3, descarta horarios del médico anterior, cierra sin enviar; width 390 / scrollWidth 375 | Matriz previa 360/430/1280 y 200% del usuario se reutiliza, no se presenta como repetida hoy |
| Administración | Paciente main rechazado por /admin/waitlist sin mostrar listado; Cambiar de cuenta lleva a /login/admin. Pruebas de controles de acceso/listado aprobadas | Nueva sesión main de administrador pendiente de OTP del usuario |
| Operaciones/seguridad | Evidencia reciente: 131 casos aplicación y 22 privados; nueva selección: 88 casos en 11 archivos | Simulados, no nueva validación de firmas reales |
| Sesión | access-gates-component cubre logout/cambio con respuestas en vuelo y wallet antigua; wallet-bootstrap rechaza identidad cambiada | No provoca expiración artificial en main |
| Presentación | Lectura visual móvil/escritorio del médico y DOM público en idiomas; IA-01 a IA-07 | No promesa de cero defectos ni revisión de cada combinación posible |

## Pruebas nuevas de esta pasada

88 casos aprobados: agenda-component, private-agenda, consultation-notices, access-gates-component, waitlist-form, waitlist-route, admin-waitlist, public-language, login-routes, prescription-list, doctor-onboarding-recovery.

98 casos adicionales aprobados: doctor-access, private-doctor-profile, admin-private-routes, same-origin. Total nuevo de esta pasada: **186 casos en 15 archivos**, más una prueba diagnóstica de observación. No sumar las ejecuciones anteriores como si fueran casos nuevos de esta pasada.

Una prueba de observación aislada adicional reproduce IA-05. Se guarda fuera del producto en `.trustleaf-local/d4-audit-observations.test.ts` con configuración propia. Que pase significa que el comportamiento descrito se reprodujo, no que sea la experiencia deseada. API de slots sólo devuelve horas disponibles; no se registra como bug la hipótesis descartada de lista llena de horarios ocupados.

Sin nuevos build/TypeScript: sólo documentos y prueba diagnóstica local; se reutiliza la versión integrada probada. Ninguna corrección de producto aplicada durante esta auditoría.

## Presentación y decisión

No se ha reproducido un nuevo bloqueo de permisos, integridad o transacción. Sí hay asuntos que impiden afirmar que el paquete esté terminado: IA-04/10/11/12 y revisiones autenticadas pendientes. IA-01 merece resolver la narrativa antes de presentar la landing como alcance actual. IA-02/03/05 afectan claridad; IA-06/07 son menores.

El original A (#12, cinco transacciones) y el complemento B (cuatro previstas con médico ya autorizado) permanecen separados. Reserva de interfaz, asistencia, lectura y finalización no son transacciones independientes. Mostrar cada confirmación antes del explorador; no inferir éxito por hash o por QR. Pausar para cambios de cuenta y códigos. Completar emisión dentro de 30 minutos de acreditación. Registrar recibos reales y tiempos de la edición final.

#130, PDF, landing de verificación, traducción de portales y refactorización general permanecen fuera. Este inventario no autoriza correcciones ni declara D4 entregado.

## Coherencia documental

Los cinco hashes de TIMESTAMPS.md figuran en rx12-chain-audit.json, todos SUCCESS: authorize_doctor, attest_booking, authorize_prescriber, mint_prescription y revoke. Los tiempos son del original y siguen provisionales hasta editar. Los informes fechados del 20 septiembre conservan cifras/pendientes históricos; el resumen vigente es week4-review/README.md. No copiar esos pendientes históricos al paquete como estado actual.

La lista del paciente contiene consultas antiguas Agendada/En curso, incluida la del video original. No se alteraron: son estado persistido, no prueba de operaciones inciertas. Para la presentación, identificar la consulta nueva por fecha e ID; no borrar historiales para limpiar pantalla.

## Actualización: inscripción autorizada y administración main

23 septiembre, 01:46 Chile: el usuario autorizó expresamente registrar un correo de su organización mediante el formulario público. Se observó Guardando y luego confirmación sin cuenta ni correo automático. El panel administrativo autorizado pasó de 1 a 2 registros y mostró exactamente una fila del correo solicitado, con fecha y rol no indicado. No se copiaron direcciones reales a este informe. Esto cierra la observación pendiente del acceso administrativo main; la inscripción fue una excepción explícitamente autorizada a la auditoría de sólo lectura, sin escrituras clínicas ni transacciones Stellar.
