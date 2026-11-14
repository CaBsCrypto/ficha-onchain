# Grabación · Tres navegadores, tres cuentas

> Nota de copia pública · 22-10-2026: Copia pública de continuidad: las cuentas identificables se sustituyeron por actores anónimos donde correspondía; no se alteraron recibos ni hashes.

Aplicación en los tres navegadores: https://trustleaf-demo.vercel.app

| Navegador o perfil independiente | Rol | Cuenta |
|---|---|---|
| A | Administrador | actor-admin@example.test |
| B | Médico nuevo | actor-medico-nuevo@example.test |
| C | Paciente | actor-paciente@example.test |

Tú haces todos los clics. El médico completa y envía su propio perfil; el administrador revisa y aprueba. No hay que crearle manualmente una wallet ni enviar una invitación. actor-medico-nuevo queda sin registrar hasta la grabación.

```mermaid
flowchart TD
  M1["1 · B MÉDICO: ingresar, completar perfil y enviar postulación"]
  A1["2 · A ADMIN: revisar expediente y aprobar"]
  W1["Sistema: pendiente → autorización confirmada en Stellar"]
  M2["3 · B MÉDICO: comprobar autorización; agregar bloque y guardar disponibilidad"]
  P1["4 · C PACIENTE: reservar dos consultas y confirmar asistencia"]
  M3["5 · B MÉDICO: iniciar ambas consultas"]
  W2["Sistema: pendiente → ambas reservas acreditadas"]
  P2["6 · C PACIENTE: revisar alcance y vencimiento; autorizar una emisión por consulta"]
  M4["7 · B MÉDICO: redactar, revisar y emitir ambas recetas"]
  R["Esperar recibos: Registrada · pendiente de activación"]
  M5["8 · B MÉDICO: activar cada receta por separado; esperar confirmación"]
  P3["9 · C PACIENTE: abrir una receta activa y su documento"]
  M6["10 · B MÉDICO: revocar la segunda receta; finalizar ambas consultas"]
  P4["11 · C PACIENTE: mostrar una activa y otra revocada; abrir documento histórico"]
  M1 --> A1 --> W1 --> M2 --> P1 --> M3 --> W2 --> P2 --> M4 --> R --> M5 --> P3 --> M6 --> P4
```

## Recordatorio al lado de la grabación

**Orden de ventanas: B → A → B → C → B → C → B → C → B → C.**

- Tres perfiles independientes, no sólo tres pestañas. Comprobar el correo del actor antes de actuar.
- Pausar para introducir códigos de Privy. No mostrar códigos ni secretos.
- Al configurar agenda: **Agregar bloque → Guardar disponibilidad**. Usar día y hora de Chile; reservar dos horas futuras próximas que permitan confirmar asistencia.
- **Asistencia no es consentimiento.** El consentimiento se concede después de acreditar la reserva.
- Una acción pendiente todavía no está confirmada. Esperar el recibo; no repetir la firma por una demora.
- Tras acreditar, hay **30 minutos para emitir**. Tener listas las sesiones antes de iniciar consultas.
- **Emitir no activa.** Mostrar el estado registrado antes de activar.
- Revocar conserva el historial. La segunda receta se activa primero y luego se revoca.
- Los IDs se conocen al emitir; no asumir números. No reutilizar las consultas consumidas de las recetas #7 y #8.
- El worker procesa automáticamente las solicitudes administrativas y de reserva; tú no debes usar terminal.

## Estado de preparación

El ensayo en main confirmó emisión, activación, revocación y lectura de ambos participantes. La auditoría independiente comprobó sus 12 recibos. La corrección PR #118 está desplegada.

**Todavía no se declara validación final completa:** faltan las solicitudes directas autenticadas de administrador/usuario ajeno a documentos y del paciente a una acción médica. La prueba sin sesión y el listado vacío del administrador no sustituyen esos controles. No registrar al médico nuevo para resolver estas comprobaciones; usar las cuentas del ensayo.

Después de grabar: auditar los recibos nuevos, incorporar el video y cerrar la PR documental #119. Sólo Stellar Testnet y datos sintéticos.
