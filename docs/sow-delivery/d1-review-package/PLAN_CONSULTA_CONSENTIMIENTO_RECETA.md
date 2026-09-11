# Plan: consulta autorizada y emisión privada de receta

Acuerdo del 7 de septiembre de 2026: el paciente autoriza previamente a un médico para una atención; durante esa consulta el médico habilitado puede emitir una receta para ese paciente. No se activa ZK en esta fase.

## Recorrido y permisos

1. **Paciente registrado y cuenta vinculada.** Verificar autenticación y control de cuenta. La base relaciona paciente, médico y orden/consulta. Una wallet sola no demuestra identidad civil ni registro en TrustLeaf.
2. **Autorización explícita.** El paciente aprueba una emisión para ese médico y atención, con vencimiento. Guardar el vínculo privado y enviar una autorización Soroban del paciente. Reservar un identificador aleatorio estable, sin RUT ni ID secuencial de consulta público.
3. **Consulta.** La aplicación verifica participantes y estado de la atención. El contrato no puede comprobar que hubo una consulta clínica. La interfaz v2 exige una atestación de reserva firmada por la autoridad de TrustLeaf, que verifica ese vínculo privado; no basta una comprobación en la UI.
4. **Documento.** Médico prepara y revisa la receta completa. En pruebas solo datos sintéticos y firma de prueba claramente identificada cuando exista el adaptador. Antes de uso clínico, integrar y validar la suscripción exigida.
5. **Emisión.** El contrato exige firma del médico, habilitación vigente en Registry y autorización no vencida del paciente para la misma emisión, además de atestación de reserva vigente para los mismos participantes. Consume ambas autorizaciones atómicamente y fija el destinatario. El relayer paga sin facultad para sustituir esas firmas.
6. **Entrega.** Confirmar recibo, leer receta y comparar compromiso con documento privado. El paciente puede consultar y descargar el documento mediante acceso autorizado; la app no debe afirmar emisión confirmada antes de ese paso.

## Semántica del consentimiento

Una autorización permite una receta, que podrá agrupar los medicamentos de ese documento. No permite recetas futuras indefinidas. Una nueva receta requiere una nueva autorización; un reintento técnico conserva el identificador y el compromiso originales.

El paciente puede retirar la autorización antes de la emisión. Retirarla después no elimina una receta ya emitida. Si emisión y retirada compiten, manda el orden confirmado en la red: la interfaz debe mostrar ese resultado, sin prometer cancelación retrospectiva.

Esta autorización habilita la emisión; no es consentimiento general para acceder a toda la ficha, ni aceptación anticipada de un medicamento concreto, ni prueba de consentimiento clínico informado. Las reglas para representantes o menores quedan pendientes de diseño antes de admitirlos.

## Distribución de datos

| Privado, en aplicación | Público, en cadena |
|---|---|
| Identidades, orden, agenda, evidencia de consulta y consentimiento | Cuentas que autorizan/emiten/reciben |
| Documento clínico y firma aplicable | Identificador aleatorio de emisión |
| Historial de accesos y vínculos internos | Vencimiento de autorización y receta |
| Secreto del compromiso, claves de cifrado | Compromiso, versión y estado de receta |

Los argumentos de autorización son públicos aunque no se emita un evento. La relación paciente/médico sigue siendo observable. Este diseño no garantiza anonimato.

## Matriz de validación

| Caso | Resultado exigido | Estado |
|---|---|---|
| Médico habilitado firma; paciente autorizó misma emisión | Emitir solo al destinatario autorizado | Probado localmente |
| Firma solo de admin, relayer o paciente para sustituir al médico | Rechazar | Probado localmente |
| Firma del médico con destinatario alterado | Rechazar | Probado localmente |
| Médico desconocido o revocado | Rechazar nueva emisión | Probado localmente |
| Consentimiento ausente, retirado, vencido o para otro médico/paciente | Rechazar | Probado localmente |
| Autorizar/retirar sin firma del paciente | Rechazar | Probado localmente |
| Reutilizar autorización o emisión | Rechazar duplicado | Probado localmente |
| Consulta ajena, cancelada o no habilitada en app | Rechazar en backend | Pendiente |
| Documento cifrado recuperado coincide con receta emitida | Confirmar integridad y acceso correcto | Helper probado; falta recorrido completo |
| Médico/paciente/relayer en Testnet | Recibos y lecturas consistentes | Pendiente en esta versión de Prescription |

## Entregas en orden

**A. Contrato y pruebas locales.** Implementadas las funciones `authorize_prescriber` y `revoke_consent`, la comprobación y consumo de autorización, y siete escenarios Rust aprobados. La interfaz v2 incorpora atestación obligatoria de reserva, revocación y consumo atómico. Compilación correcta. Esto no incluye firma clínica avanzada.

**B. Aplicación y persistencia.** Añadir al esquema central la relación entre consulta, autorización y emisión; estados pendiente/enviado/confirmado/error, control de concurrencia y recuperación de resultados inciertos. Integrar firmas del paciente y médico, cifrado obligatorio y claves fuera de la base. Cancelar una consulta debe iniciar retirada de autorización y conciliar la red; la actualización de base por sí sola no revoca on-chain.

**C. Validación Testnet.** Desplegar la versión final, ejecutar consentimiento → emisión mediante relayer → consulta del documento → comprobación, y los casos negativos sin atribuir resultados locales a la red. Las pruebas serán sintéticas. Guardar versión, hash del WASM, recibos, lecturas y matriz de resultados.

**D. Entrega usable.** Mostrar al paciente el documento completo y su estado, con mecanismo de presentación y validación por farmacia. La dispensación parcial, firma clínica real y conexión SNRE se validan aparte antes del uso correspondiente. No se declara completado el SOW por esta planificación.

## Referencias de estado

- [Privacidad de Prescription](PRESCRIPTION_PRIVACIDAD.md).
- [Alcance de demo y firma clínica pendiente](ALCANCE_DEMO_Y_FIRMA_CLINICA.md).
- [Opciones de firma clínica](FIRMA_RECETA_CHILE_OPCIONES.md).

La nueva Prescription permanece **sin desplegar** y la app **sin migrar**. El Registry privado sí tiene evidencia de tres registros reales en Testnet.

Actualización de implementación v2: [arquitectura de atestación de reservas](ARQUITECTURA_ATESTACION_RESERVA.md). Las siete pruebas y la compilación son locales; las piezas de aplicación y red mantienen su propio estado de entrega.
