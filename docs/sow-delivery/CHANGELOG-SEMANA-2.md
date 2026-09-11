# TrustLeaf — Changelog de semana 2

**Corte:** 11 de septiembre de 2026<br>
**Entorno objetivo:** `main` de `trustleaf-demo` (después de promover PRs #101, #102 y #105)<br>
**Estado base funcional:** `dda4bf5cf9ee95cf21dc4e7d9248df162e755efe`

## Portales conectados

- Integrado el acceso de administrador, médico y paciente con Privy y una asociación persistente a una wallet Stellar por persona.
- Eliminadas del recorrido activo las sesiones simuladas, las wallets de demostración y las respuestas que podían marcar como exitosas operaciones fallidas.
- El relayer paga las comisiones; las acciones del paciente y del médico se firman con la wallet del propietario.
- El portal activo utiliza únicamente `DoctorRegistryPrivate` y `PrescriptionPrivate v2` en Testnet.
- Ficha clínica, licencias, dispensación, MCP y módulos fuera del hito quedaron retirados de navegación y bloqueados en sus rutas históricas.

## Recorrido acreditado (preview) a reutilizar en `main`

- El administrador renovó la autorización del médico. La solicitud permaneció pendiente hasta confirmar el recibo de `DoctorRegistryPrivate`.
- El médico publicó disponibilidad y el paciente creó dos consultas sintéticas. La asistencia del paciente y el inicio por el médico quedaron como acciones separadas.
- El worker acreditó dos reservas. El paciente autorizó una emisión por consulta; en una de ellas también retiró y volvió a conceder el permiso.
- El médico emitió dos recetas para el destinatario resuelto por el servidor. Una quedó **activa** (`#5`) y otra **revocada** (`#6`), conservando el historial.
- El corte final registra cero operaciones pendientes y cero duplicados para el recorrido.

## Integridad y privacidad

- Cada recibo se contrastó con contrato, método, argumentos, firmante propietario y pagador de comisión esperados.
- El documento cifrado se persistió antes de transmitir la emisión. El recibo se verificó contra destinatario y compromiso antes de confirmar estado.
- El administrador no tiene acceso clínico general. Paciente y médico emisor conservan acceso autorizado al historial, incluso cuando la receta está revocada.
- La evidencia pública no contiene documentos clínicos, ciphertext, sobres XDR, firmas sin procesar, tokens, claves ni archivos de entorno.

## Validaciones automatizadas (rama de soporte)

- **11 pruebas contractuales** aprobadas: 4 de registro y 7 de recetas privadas.
- **423 pruebas de aplicación** aprobadas en 35 suites en el corte final de esta rama; excluye un archivo no versionado y ajeno de semana 1.
- **43 pruebas de servicios privados, identidad y workers** aprobadas.
- TypeScript y build aprobados; los flujos de las PR #101 y #102 finalizaron correctamente en CI en su etapa de entrega.
- Los escenarios de rechazo, reintento, respuesta incierta, doble clic, cancelación concurrente y reinicio se distinguen entre evidencia de navegador y pruebas controladas. No se muestran como fallos reales de proveedores.

## Entrega y cierre en `main`

- [Página para revisores](week2-review/TrustLeaf-Entrega-semana-2.html).
- [Guía de grabación](TrustLeaf-guia-video-semana-2.html).
- [Paquete de evidencias del preview](../evidence/week2-preview-2026-09-10/README.md).
- [PR #101 — contratos y servicios](https://github.com/CaBsCrypto/ficha-onchain/pull/101).
- [PR #102 — portales y retirada del legado](https://github.com/CaBsCrypto/ficha-onchain/pull/102).
- [PR #105 — alta por invitación o postulación médica y ajustes finales](https://github.com/CaBsCrypto/ficha-onchain/pull/105).

La entrega final de semana 2 queda condicionada a validar el mismo flujo íntegro en `main` con `TRUSTLEAF_ENV=test`, base dedicada de pruebas y grabación del recorrido completo en `trustleaf-demo.vercel.app`.
