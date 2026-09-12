# Actualización de main · 11 de septiembre de 2026

- Recorrido real de main: recetas #7 activa y #8 revocada; lectura de ambos documentos por médico y paciente.
- Auditoría independiente: 12 recibos, firmas y comisiones verificadas, compromisos recomputados, reservas consumidas y sin operaciones pendientes ni hashes duplicados en el corte.
- Rechazo sin sesión en ambos documentos (401). Acceso administrativo desde paciente rechazado en navegador.
- PR #118 fusionada: aclaración de avisos mientras se reconcilia una emisión enviada. 536 pruebas de aplicación, 45 privadas, 11 contractuales, TypeScript y build aprobados.
- Pendientes: solicitudes autenticadas sobre documentos ajenos y acciones de otro rol en main, comprobación final del despliegue, video y aceptación formal.

El corte anterior se conserva abajo como histórico; sus recibos no se atribuyen a main.

---
# TrustLeaf — Changelog de semana 2

**Corte:** 10 de septiembre de 2026<br>
**Entorno:** preview aislado, Stellar Testnet y datos sintéticos<br>
**Versión observada:** `dda4bf5cf9ee95cf21dc4e7d9248df162e755efe`

## Portales conectados

- Integrado el acceso de administrador, médico y paciente con Privy y una asociación persistente a una wallet Stellar por persona.
- Eliminadas del recorrido activo las sesiones simuladas, las wallets de demostración y las respuestas que podían presentar como exitosas operaciones fallidas.
- El relayer paga las comisiones; las acciones del paciente y del médico se firman con la wallet de su propietario.
- El portal activo utiliza únicamente `DoctorRegistryPrivate` y `PrescriptionPrivate v2` en Testnet.
- Ficha clínica, licencias, dispensación, MCP y demás módulos fuera del hito quedaron retirados de navegación y bloqueados en sus rutas históricas.

## Recorrido validado en el preview

- El administrador renovó la autorización del médico. La solicitud permaneció pendiente hasta confirmar el recibo de `DoctorRegistryPrivate`.
- El médico publicó disponibilidad y el paciente creó dos consultas sintéticas. La asistencia del paciente y el inicio por el médico quedaron como acciones separadas.
- El worker acreditó dos reservas. El paciente autorizó una emisión por consulta; en una de ellas también retiró y volvió a conceder el permiso.
- El médico emitió dos recetas para el destinatario resuelto por el servidor. Una quedó **activa** (`#5`) y otra **revocada** (`#6`), conservando el historial.
- Las dos consultas terminaron finalizadas. Una tercera consulta cancelada se conserva como evidencia del estado y liberó su horario.
- El corte final registra cero operaciones pendientes y cero duplicados para este recorrido.

## Integridad y privacidad

- Cada recibo se contrasta con contrato, método, argumentos, firmante propietario y pagador de comisión esperados.
- El documento cifrado se persiste antes de transmitir la emisión. El recibo se verifica contra destinatario y compromiso antes de confirmar el estado.
- El administrador no recibe acceso clínico general. Paciente y médico emisor conservan acceso autorizado al historial, incluso cuando la receta está revocada.
- La evidencia pública no contiene documentos clínicos, ciphertext, sobres XDR, firmas sin procesar, tokens, claves ni archivos de entorno.

## Validaciones automatizadas

- **11 pruebas contractuales** aprobadas: 4 de registro y 7 de recetas privadas.
- **423 pruebas de aplicación** aprobadas en 35 suites en el corte final de esta rama; excluye un archivo no versionado y ajeno de semana 1.
- **43 pruebas de servicios privados, identidad y workers** aprobadas.
- TypeScript y build aprobados; los workflows registrados de las PR #101 y #102 finalizaron correctamente.
- Los escenarios de rechazo, reintento, respuesta incierta, doble clic, cancelación concurrente y reinicio se distinguen entre evidencia de navegador y pruebas controladas. No se presentan simulaciones como fallos reales de proveedores.

## Entrega

- [Página para revisores](week2-review/TrustLeaf-Entrega-semana-2.html).
- [Guía de grabación](TrustLeaf-guia-video-semana-2.html).
- [Evidencia saneada del preview](../evidence/week2-preview-2026-09-10/README.md).
- [PR #101 — contratos y servicios](https://github.com/CaBsCrypto/ficha-onchain/pull/101).
- [PR #102 — portales y retirada del legado](https://github.com/CaBsCrypto/ficha-onchain/pull/102).

El preview es el entorno de entrega de este corte. El sitio principal y la aceptación formal corresponden a una etapa posterior. El video se incorporará cuando el responsable complete la grabación sobre la versión fijada.

