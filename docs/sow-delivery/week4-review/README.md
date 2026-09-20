# Semana 4 — Cierre del SOW

Estado: **implementación y QA previos a publicación**. No declara grabado ni aceptado el entregable final.

## Cambios y accesos

- PR #125: accesos independientes y portugués público. CI/Vercel aprobados para `75adcd1`; revisión autenticada del preview pendiente.
- Waitlist: implementación separada; [operación, privacidad y QA](WAITLIST.md).
- Destinos previstos: `/login/patient`, `/login/doctor`, `/login/admin`. Los enlaces antiguos se redirigen; administración no aparece en navegación pública. La ruta nunca concede permisos.
- EN/ES/PT-BR en landing, waitlist y accesos. Portales internos conservan español.

## Puertas de salida

- [x] Pruebas locales de aplicación, privadas y contratos; TypeScript y build.
- [x] Base y esquema comprobados en dev, preview y main, sin migración ni copia de registros.
- [x] Registro de interés real y duplicado comprobados exclusivamente en dev con datos sintéticos.
- [ ] Configuración aislada y comprobación autenticada del preview de ambas PR.
- [ ] Merge con CI/Vercel aprobados y commit canónico registrado.
- [ ] Médico y paciente: acceso, cambio de cuenta y lectura de documentos existentes en main.
- [ ] Administrador: acceso privado y rechazo desde otras identidades.
- [ ] Persistencia de recibos de autorización, reserva, consentimiento, emisión, activación y revocación.
- [ ] Worker único con bloqueo exclusivo, colas resueltas y relayer disponibles justo antes de grabar.
- [ ] Grabación nueva, auditoría de recibos y mapa sobre la edición final.
- [ ] README/changelog/página final con enlaces comprobados y manifiesto saneado.

## Guía del recorrido final

Aplicación canónica: https://trustleaf-demo.vercel.app. Tres perfiles de navegador independientes; el usuario introduce los códigos de Privy fuera del video.

1. Médico nuevo previsto: `digitalmoneychile8@gmail.com`. Entra por `/login/doctor`, completa datos sintéticos y envía su postulación. No se crea un alta manual previa ni se borran antecedentes.
2. Administrador: revisa el expediente, aprueba y espera confirmación del worker. Abrir el recibo de autorización.
3. Médico: comprueba autorización y guarda disponibilidad cercana en America/Santiago.
4. Paciente: reserva **una** consulta y confirma asistencia; todavía no concede consentimiento.
5. Médico: inicia la consulta; esperar acreditación de reserva y abrir su recibo.
6. Paciente: autoriza una emisión y abre el recibo de consentimiento.
7. Médico: revisa destinatario y contenido sintético, emite una receta y espera `Registered`; abrir recibo.
8. Médico: activa la receta y abre recibo. Paciente: consulta el estado activo y abre el documento.
9. Médico: revoca la misma receta, espera confirmación y abre recibo. Paciente: muestra estado revocado e historial.

Se esperan seis transacciones: autorización, acreditación, consentimiento, emisión, activación y revocación. Cualquier operación adicional real se registra. Reserva UI, asistencia, postulación y lectura no tienen una transacción independiente. Emitir dentro de los 30 minutos de vigencia de la reserva acreditada; si vence, registrar otra consulta sin ocultar el cambio.

## Paquete del revisor

Video, fecha, versión grabada, ID de receta, hashes y tiempos: **pendientes de la ejecución**. No reutilizar recibos de ensayos como si correspondieran al video.

| Tiempo final | Actor | Acción | Contrato / método | ID | Hash / Stellar Expert | Resultado |
| --- | --- | --- | --- | --- | --- | --- |
| Pendiente | Administración / worker | Autorizar | DoctorRegistryPrivate / authorize_doctor | Pendiente | Pendiente | Pendiente |
| Pendiente | Worker | Acreditar reserva | PrescriptionPrivate v2 / attest_booking | Pendiente | Pendiente | Pendiente |
| Pendiente | Paciente | Consentimiento | PrescriptionPrivate v2 / authorize_prescriber | Pendiente | Pendiente | Pendiente |
| Pendiente | Médico | Emitir | PrescriptionPrivate v2 / mint_prescription | Pendiente | Pendiente | Pendiente |
| Pendiente | Médico | Activar | PrescriptionPrivate v2 / activate | Pendiente | Pendiente | Pendiente |
| Pendiente | Médico | Revocar | PrescriptionPrivate v2 / revoke | Pendiente | Pendiente | Pendiente |

Auditar éxito, contratos, participantes, comisiones del relayer, destinatario, compromiso, reserva consumida y estado final revocado. Exigir cero duplicados e intentos sin resolver. Generar manifiesto de integridad sólo con los archivos finales, sin secretos ni documentos privados.

Los antecedentes de [Semana 2](../week2-review/README.md) y [Semana 3](../week3-review/README.md) se conservan. Arquitectura de referencia: [dos contratos y servicios privados](../ARCHITECTURE_PLAN.md); operación: [guía de ensayo](../week3-review/RUNBOOK.md). Revisar sus datos operativos contra la versión fijada antes de cerrar.

Stellar Testnet y contenido clínico sintético. El único worker depende del equipo local encendido; una caída deja operaciones pendientes, nunca éxito simulado. PDF, landing de verificación y traducción de portales internos quedan fuera de este cierre. El QR abre un recibo de emisión, no certifica el PDF ni consulta el estado vigente. La aceptación formal corresponde al revisor.
