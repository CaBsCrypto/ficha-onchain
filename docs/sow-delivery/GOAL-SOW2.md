# Objetivo de la sesión — Cerrar SOW semana 2 en TrustLeaf

> Nota de copia pública · 22-10-2026: Copia pública de continuidad: las cuentas identificables se sustituyeron por actores anónimos donde correspondía; no se alteraron recibos ni hashes.

Dejar funcionando y validar en https://trustleaf-demo.vercel.app los recorridos completos de administrador, médico y paciente, con transacciones reales en Stellar Testnet, para preparar la grabación y la entrega de semana 2.

## Punto de partida

Hay implementación y evidencia previa en preview. No considerar acreditado el dominio principal hasta comprobar la versión desplegada, los accesos y el recorrido completo. Verificar el estado actual del repositorio y del despliegue antes de continuar; no asumir que una PR abierta ya está fusionada.

## Alcance y reglas

- Utilizar únicamente DoctorRegistryPrivate y PrescriptionPrivate v2, sin modificar los contratos salvo necesidad demostrada y acordada.
- Usar datos sintéticos, Stellar Testnet y una wallet Stellar persistente por persona.
- Privy autentica y permite la firma del propietario; TrustLeaf paga las comisiones mediante el relayer.
- La clave de la autoridad administrativa permanece en el almacén seguro del equipo. Un único worker procesa solicitudes del entorno habilitado.
- Conservar perfiles, asociaciones, documentos e historial. No crear otra wallet como respuesta a un error de servicio.
- Incorporar cambios mediante PR y comprobar CI y despliegue. No reactivar módulos ni contratos antiguos.
- El usuario opera las tres cuentas en tres sesiones de navegador independientes, tanto en el ensayo como en la grabación. Codex guía los pasos y verifica estados, errores y recibos; no opera las sesiones salvo petición expresa.
- Introducir códigos exclusivamente en Privy. Tres pestañas de un mismo perfil no garantizan sesiones independientes: usar navegadores o perfiles separados.
- Habilitar nuevas escrituras únicamente en main. Deshabilitar los previews y retirar o proteger deployments antiguos que conserven escrituras habilitadas antes de activar main.

## 1. Recuperar y verificar accesos

- [ ] Comprobar configuración de main, base sintética exclusiva, migraciones, Privy, contratos y red.
- [ ] Corregir los errores de acceso: distinguir sesión vencida, permisos insuficientes y servicio no disponible.
- [ ] Validar ingreso, recarga, cierre y cambio de cuenta con cada actor, conservando su identidad y wallet.
- [ ] Confirmar que seleccionar otro portal no concede permisos y que no quedan respuestas de la sesión anterior.

| Actor | Cuenta | Revisión |
|---|---|---|
| Administrador | actor-admin@example.test | Acceso al panel y gestión de altas, sin acceso clínico general. |
| Médico | actor-medico@example.test | Identidad y wallet verificadas; autorización real antes de operar. |
| Paciente | actor-paciente@example.test | Acceso a agenda y documentos propios, sin controles médicos. |

## 2. Validar el alta médica

- [ ] Usar postulación autónoma para el ensayo y la grabación: el médico ingresa, completa su propio perfil sintético y lo envía.
- [ ] Validar envío, revisión administrativa, solicitud de cambios y reenvío.
- [ ] Comprobar que enviar el perfil no genera transacciones ni autoriza por sí solo.
- [ ] Mantener fuera de este cierre el envío de invitaciones por correo. No ampliar el alcance para incorporarlo.
- [ ] Mostrar aprobación pendiente con el worker detenido y autorización confirmada únicamente tras el recibo de authorize_doctor.
- [ ] Validar duplicados, vencimiento, rechazo, reapertura y cambios de identidad o wallet.
- [ ] Preservar el acceso de médicos previamente aprobados sin aprobar automáticamente solicitudes nuevas.

## 3. Ensayar el recorrido completo en main

Crear dos consultas nuevas sólo cuando los accesos estén resueltos. Respetar la ventana contractual de 30 minutos; no reutilizar reservas vencidas o consumidas.

1. Médico: comprobar autorización y configurar disponibilidad.
2. Paciente: reservar dos consultas y confirmar asistencia. La asistencia no concede consentimiento.
3. Médico: iniciar ambas consultas.
4. Worker: acreditar las reservas mediante attest_booking y confirmar sus recibos.
5. Paciente: revisar alcance, médico y vencimiento; autorizar una emisión por consulta. Retirar y volver a conceder uno de los permisos.
6. Médico: redactar y revisar dos recetas sintéticas, firmar la emisión y comprobar el estado Registered tras la confirmación.
7. Médico: activar ambas mediante acciones y firmas separadas; revocar una.
8. Paciente: abrir ambos documentos privados y comprobar una receta activa y otra revocada.
9. Médico: comprobar acceso al historial. Administrador y usuario ajeno: comprobar rechazo de acceso a documentos ajenos.

## 4. Verificar integridad y fallos

- [ ] Mostrar pendiente, confirmado o error recuperable según el resultado real; ningún éxito simulado.
- [ ] Bloquear emisión con consentimiento retirado o vencido, reserva cancelada o médico no autorizado.
- [ ] Verificar doble clic, respuesta incierta y reinicio del worker sin duplicar operaciones.
- [ ] Separar los resultados de pruebas automatizadas de lo observado en navegador.
- [ ] Ejecutar pruebas de aplicación, servicios privados, contratos, TypeScript y build de la versión final.
- [ ] Auditar recibos, contratos, métodos, firmantes, destinatarios, compromisos, pago de comisiones y reservas consumidas.
- [ ] Resolver operaciones pendientes y comprobar ausencia de duplicados antes de grabar.

## 5. Preparar la entrega y la grabación

- [ ] Fijar la versión validada en el dominio principal y registrar fecha y resultados nuevos.
- [ ] Conservar evidencia de main separada de preview, con enlaces a recibos reales y manifiesto de integridad.
- [ ] Actualizar README, checklist y página para revisores con alcance, URL, versión, resultados y límites.
- [ ] Después del ensayo, elegir y verificar una cuenta médica para la grabación. Si se utiliza actor-alterno@example.test, comprobar primero su estado existente en main; conservar su wallet e historial, sin borrar ni reiniciar registros para simular un alta nueva.
- [ ] Preparar consultas nuevas y una secuencia de grabación: postulación del médico → revisión → autorización → reserva → asistencia → inicio → consentimiento → emisión → activación → lectura → revocación e historial.
- [ ] Grabar después del ensayo satisfactorio, excluyendo códigos, secretos y pantallas sensibles; incorporar el enlace del video al entregable.
- [ ] Documentar la dependencia del worker local y mantener las escrituras habilitadas al terminar, con un único entorno operativo.

## Criterio de cierre

El objetivo se completa cuando médico y paciente realizan sus recorridos desde la interfaz del dominio principal, las acciones contractuales tienen recibos verificados, el paciente accede a una receta activa y otra revocada, y el paquete incluye versión, resultados, evidencia y video accesibles.

No declarar el SOW cerrado por tener código fusionado, pruebas automatizadas aprobadas o evidencia de preview. La aceptación formal corresponde a los revisores. La entrega acredita una demostración técnica en Testnet con datos sintéticos.

## Forma de avanzar

1. Auditar el estado actual y resolver configuración y accesos antes de iniciar consultas.
2. Guiar al usuario por bloques cortos, indicando cuenta, pantalla, acción y resultado esperado. Esperar su confirmación cuando deba ingresar o actuar.
3. Si aparece un fallo, registrar el resultado, corregirlo y repetir el paso afectado antes de continuar. No sustituir firmas del usuario por firmas administrativas.
4. Registrar cada comprobación como pendiente, aprobada o fallida, con su evidencia. No marcar casillas basándose únicamente en antecedentes de esta conversación.
5. Completar el ensayo, fijar la versión y preparar la grabación. Si el video requiere una acción del usuario, dejarla explícitamente pendiente; no declarar terminado el objetivo.
