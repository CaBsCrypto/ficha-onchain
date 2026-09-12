# Grabación de semana 2 · Pauta operativa

**Dominio:** https://trustleaf-demo.vercel.app · Stellar Testnet · Sólo datos sintéticos.
**Duración editada:** 6–8 minutos. Las esperas se pueden recortar conservando pendiente y confirmación. No iniciar la grabación final hasta cerrar los controles autenticados pendientes.

## Preparación

| Sesión independiente | Cuenta | Pantalla inicial |
|---|---|---|
| Administrador | cabscryptocontacto@gmail.com | /admin/doctors |
| Médico nuevo | brownsonchain@gmail.com | /login?role=doctor |
| Paciente | brownsstudiocontact@gmail.com | /patient |

Brownsonchain no tenía usuario Privy, perfil médico ni postulación en main en la comprobación del 12 de septiembre de 2026 UTC. No se creó su cuenta. Su dirección Stellar sólo existirá después del ingreso: comprobar entonces que no tiene autorización previa antes de continuar.

Crwom01 queda fuera de esta grabación: su wallet ya tiene autorización contractual. No se borró su historial.

Usar tres navegadores o perfiles distintos; tres pestañas del mismo perfil comparten sesión. Mantener una pestaña por actor. Este agente sólo tiene control del navegador interno; abrir los otros dos perfiles manualmente. Pausar antes de OTP y no mostrar códigos ni correos completos en el video final.

El worker local debe seguir conectado a main. No iniciar otro worker ni suspender el equipo. Comprobar cero operaciones pendientes antes de comenzar. Las recetas #7 y #8 y sus reservas se conservan como ensayo anterior.

## Datos listos para copiar

- Nombre: Profesional sintético SOW-2.
- Especialidad: Medicina general · Demo.
- Registro de prueba: DEMO-REG-VIDEO-02.
- RUT sintético: DEMO-NO-VALIDO.
- Receta A: Producto ficticio DEMO-VIDEO-A. Indicación: «Validación técnica; no administrar». Instrucciones: «Documento sintético de demostración, sin uso clínico».
- Receta B: Producto ficticio DEMO-VIDEO-B. Misma indicación. Instrucciones: «Documento sintético para demostrar revocación, sin uso clínico».

No enviar estos datos ni crear la postulación antes de grabar. El médico debe completar su propio perfil; no se enviará invitación por correo.

## Secuencia y explicación

| Tiempo editado | Actor y acción | Qué explicar |
|---|---|---|
| 0:00–0:25 | Mostrar dominio y Testnet | «Esta demostración muestra cómo un médico emite una receta y un paciente la consulta desde TrustLeaf. Todos los datos son de prueba». |
| 0:25–1:15 | Médico ingresa, completa y envía perfil | «Privy crea su wallet Stellar. La postulación todavía no concede autorización». Pausar durante OTP. |
| 1:15–2:00 | Admin revisa y aprueba | «El administrador revisa el expediente; la autorización queda pendiente hasta confirmar el recibo en Stellar». |
| 2:00–2:40 | Médico comprueba autorización y guarda agenda | «El portal comprueba la autorización. Estos bloques determinan las horas que el paciente puede reservar». Pulsar Agregar bloque y después Guardar disponibilidad. |
| 2:40–3:20 | Paciente reserva dos horas y confirma asistencia | «Confirmar asistencia no autoriza una receta». |
| 3:20–3:50 | Médico inicia ambas; esperar acreditación | «Las reservas se acreditan y quedan vinculadas al médico y al paciente». |
| 3:50–4:30 | Paciente autoriza una emisión por consulta | «Reviso médico, alcance y vencimiento antes de confirmar. Cada permiso sirve para una emisión». |
| 4:30–5:30 | Médico redacta, revisa y emite ambas | «El destinatario corresponde a la consulta. El documento se guarda cifrado; el recibo confirma el registro». Mostrar Registrada antes de activar. |
| 5:30–6:00 | Médico activa ambas con confirmaciones separadas | «Registrar y activar son acciones distintas». |
| 6:00–6:30 | Paciente abre el documento activo | «El paciente consulta el estado y accede a su documento privado». |
| 6:30–7:10 | Médico revoca B y finaliza consultas | «Revocar conserva el historial». |
| 7:10–8:00 | Paciente muestra activa y revocada; abre histórico | «Cada actor firma con su wallet; TrustLeaf paga las comisiones. Los recibos permiten verificar las acciones en Stellar Testnet». |

Configurar el día actual de America/Santiago y dos slots futuros de 15 minutos, ambos dentro de los siguientes 30 minutos al confirmar asistencia. Si el alta tarda, ajustar horarios antes de reservar. La vigencia contractual de 30 minutos comienza con la acreditación: completar ambas emisiones dentro de ese plazo.

No anticipar IDs de recetas. Si vence una reserva, preparar otra consulta y conservar la evidencia; no reusar la consumida o vencida. No volver a firmar un intento enviado por una espera: consultar su mismo recibo.

## Puerta de salida

- Pendiente: pruebas directas autenticadas de administrador/usuario ajeno contra documentos y paciente contra acción médica en main. Listados vacíos y peticiones sin token no sustituyen estas pruebas.
- Confirmado: auditoría de 12 recibos del ensayo; #7 activa y #8 revocada; lectura de ambos participantes.
- Confirmado: PR #118 desplegada en main; 536 pruebas de aplicación, 45 privadas, 11 contractuales, TypeScript y build.
- Después del video: auditar nuevos recibos, registrar commit y fecha de la grabación, adjuntar enlace y finalizar PR #119. La aceptación corresponde a los revisores.
