# Preparación de grabación D3 — 15 de septiembre de 2026

> Nota de copia pública · 22-10-2026: Copia pública de continuidad: las cuentas identificables se sustituyeron por actores anónimos donde correspondía; no se alteraron recibos ni hashes.

## Alcance fijado
Una consulta y una receta: autorización médica, acreditación de reserva, consentimiento, emisión, activación y revocación. Se prevén seis transacciones; cualquier operación adicional real se incluirá en la auditoría. Lectura del paciente antes y después de revocar. No segunda emisión.

## Documento
PR #123, commit 5ba14d555fdccb421e60de2c0b33d514eb7faf23: QR de emisión de 96 px junto a instrucciones, sin ficha técnica visible. El QR enlaza a Stellar Expert; no certifica la autenticidad del PDF ni consulta por sí mismo el estado vigente.

El usuario confirmó el 15 de septiembre que los PDF y el QR funcionan y que el QR abre la transacción en Stellar Expert, en respuesta al control de documentos completos, aviso de revocación y ausencia de recortes. Se registra como comprobación reportada por el usuario, no inspección directa de archivos por el agente.

Médico local autenticado: #3 activa y #4 revocada abiertas, enlaces de emisión coincidentes con sus tarjetas, Escape con retorno de foco y contenido anterior ausente durante carga al cambiar de receta. Paciente local y preview final pendientes.

## QA
563 pruebas de aplicación y TypeScript aprobados el 15 de septiembre. Build final aprobado; 45 pruebas privadas y 11 contractuales aprobadas. CI y Vercel del commit 5ba14d5 aprobados. La PR continúa en borrador hasta finalizar revisión autenticada.

## Próximo ciclo (propuesta, no compromiso)
Landing de verificación de recetas: estado vigente y vencimiento, sin contenido clínico público y Stellar Expert como detalle opcional. Pendiente definir alcance, privacidad y aceptación antes de comprometerla. No forma parte del cierre D3.

## Pendientes para fijar versión
Completar lectura del paciente y preview, fusionar #123, verificar main, retirar control temporal en PR separada conservando pruebas, registrar versión final. Validar worker y colas al inicio de la grabación. El correo nuevo se comprobará cuando el usuario lo facilite; no ejecutar su alta previamente.

D3 no está entregado: faltan grabación nueva, auditoría de sus recibos, mapa de tiempos y paquete final. Semana 2 se conserva intacta.

## Paciente local — 15 de septiembre
Sesión actor-paciente autenticada: #3 Activa y #4 Revocada abiertas con el documento correcto. Enlaces de emisión coinciden con las tarjetas y con los observados por el médico. Escape devuelve el foco al botón; al cambiar de receta se muestra carga sin contenido anterior y se deshabilita impresión hasta estar lista. No hay controles médicos en la bandeja del paciente. No se emitieron transacciones. Queda por validar el preview del commit final.

## Médico en preview — 15 de septiembre
Sesión actor-medico autenticada en el alias de #123: #5 Activa y #6 Revocada abiertas con el diseño compacto final. QR/enlace de #5 apunta a 4dd908c68526945a93bad6b798ba302f7470b0d6e804c06baa4254ac914c0e61 y el de #6 a 2a02237b59226ba2102bad766d80ff9396c0577ea5c6006fd6409fb90f4e0b0b. Carga sin contenido anterior; impresión deshabilitada durante carga y habilitada al completarse. Escape restaura foco. No se realizaron escrituras. Se dejó el acceso del paciente listo para completar la comprobación de ese rol.

Preview patient validation, 2026-09-15: authenticated patient opened #5 Active and #6 Revoked. Their issuance QR links matched 4dd908c68526945a93bad6b798ba302f7470b0d6e804c06baa4254ac914c0e61 and 2a02237b59226ba2102bad766d80ff9396c0577ea5c6006fd6409fb90f4e0b0b respectively. Loading disabled printing until authorized content appeared. Escape restored focus to the opening button for #5. No medical controls or new transactions. Preview writes disabled by configuration; no write-denial request was performed in this check.

Main validation 2026-09-15: #123 merged as d2fc7b289779bb069b04878bf9bf810c589b36af; GitHub CI and Vercel successful. Authenticated patient opened #10 Active and #11 Revoked, with issuance QR links eb83cd678fa04601b7a1821809c86d8c4aa047444ce7eb49923d35330ade4ff7 and 83ccf421dbbeb3be089218135834d823837e284ae80534f292b8b6636bbb3752. Escape and outside click closed the document and restored opening-button focus. Loading showed no previous document and disabled print. Main PDF confirmation and doctor read remain pending. Cleanup commit 28410b7 passed 563 application, 45 private and 11 contract tests, TypeScript and build. Worker authority lock count was 1 at 18:24:58 UTC.

2026-09-15: PR #124 merged as 675a5a61a443f411dd9aeb949b65bdcb5191da6e after CI/Vercel success for 28410b752a7aa66dbdcfd91071d1c8786c32856c. Only root-layout probe mounting and temporary UI were removed; probe helpers/tests remain. At 18:26:34 UTC main queues contained admin confirmed=2, bookings consumed=5, operations confirmed=21, with no other states. Production deployment of the cleanup still requires verification.

Main doctor browser validation 2026-09-15: actor-medico entered with confirmed authorization. Opened #10 Active and #11 Revoked with matching issuance QR links, correct separate content and historical warning. Printing remained disabled during loading; Escape returned focus to the opener. No prescriptions modified or transactions created. Main PDF user confirmation remains pending; cleanup deployment 675a5a6 was still in progress at this check.

2026-09-17 authenticated main patient: completed consultation #6 displays consumed booking receipt e6e34be403090638f0a4d9a08dc50975ac00a6fe224ab03ca014a2de0c2d3f54 and confirmed consent receipt 23f0b1bdf33c387d01895d2880a5f94b368b823db8b043dff641da691f9dad1b beside revoked prescription #11. Reload returns to consultation list; reopening #6 recovers identical receipts and states. Consent remains accessible after issuance/revocation. Stellar Expert directly showed SUCCESS and authorize_prescriber for the consent link. No new transactions or clinical modifications. No code correction required for this patient flow.

2026-09-17 authenticated admin browser check: actor-medico review shows confirmed renewal, with receipt bc313815b2d725f8bbaa39cd771768e7692d51df10b1844fcdfea13b02466f0a. Reload and reopening the review preserved the same receipt and authorization state. Stellar Expert displayed Successful and renew_authorization against DoctorRegistryPrivate. This is historical renewal evidence, not first authorization. No new administrative action, signature or transaction performed. First authorization of the new recording doctor remains reserved for recording.
