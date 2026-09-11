# TrustLeaf — Cierre técnico de semana uno

**Resultado: requisitos técnicos D1 verificados para DoctorRegistryPrivate y PrescriptionPrivate v2.** Corte: 7 de septiembre de 2026. Paquete listo para entrega y revisión del responsable; no registra aceptación contractual firmada.

**Preparación del entregable actualizada el 8 de septiembre:** video grabado, según confirmación del responsable; enlace pendiente. Consultar el [changelog de semana 1](CHANGELOG-SEMANA-1.md) y la [página preparada para importar a Notion](NOTION-ENTREGA-SEMANA-1.md). Esta actualización es documental y mantiene el corte técnico del 7 de septiembre. El archivo de distribución actualizado es `TrustLeaf-Semana-1-Entrega-2026-09-08.zip`.

## Qué se entrega

Dos contratos desplegados en Stellar Testnet, sus binarios, snapshot de fuentes y manifiesto SHA-256; once pruebas contractuales aprobadas; cuatro recibos del flujo confirmados por lectura RPC del corte; seis envolturas fee-bump con pagador esperado; 137 pruebas de aplicación aprobadas y TypeScript sin errores. Las láminas, preguntas, guía del presentador, changelog y página para Notion acompañan la evidencia.

## Matriz de cierre

| Requisito D1 | Evidencia de esta versión | Resultado |
|---|---|---|
| Registro y consulta de autorización médica | lifecycle_and_expiry; aprobación Testnet; consultas en el flujo | Cumple |
| Revocación y vencimiento médico | lifecycle_and_expiry y pause_does_not_prevent_revocation | Cumple, prueba local |
| Transferencia administrativa | admin_transfer_requires_acceptance; rechazo sin firma y aceptación de nueva cuenta | Cumple, prueba local |
| Emisión y asignación inicial al paciente | authorized_private_issuance_lifecycle_and_duplicates; recibo mint SUCCESS | Cumple |
| Revocación y consulta de receta | authorized_private_issuance_lifecycle_and_duplicates; signatures_expiry_and_blocking | Cumple, prueba local |
| Registered → Active → Revoked | authorized_private_issuance_lifecycle_and_duplicates verifica el ciclo | Cumple, prueba local |
| Emisión no autorizada | firmas específicas; médico revocado/no autorizado; consentimiento y reserva; simulaciones guardadas | Cumple |
| Prevención de duplicados | índices de emisión y documento; prueba local y simulación RPC | Cumple |
| Ambos contratos desplegados | lectura RPC de hashes y recompilación local coincidentes | Cumple |
| Relay configurado | seis envolturas fee-bump con fuente de comisiones esperada; recibos guardados SUCCESS | Cumple para SDK/Testnet |

Patient transfer significa asignación inicial al emitir, según la decisión del responsable; no retransferencia. El alcance exige suite completa de ciclo de vida y despliegue, no que cada caso negativo se envíe como transacción ni que todo el ciclo se repita en el portal.

## Seguridad del registro de médicos

El contrato verifica autorización administrativa, no títulos profesionales. No permite autoalta: authorize_doctor requiere la firma del administrador. Las escrituras administrativas sin firma se rechazan. La autorización tiene vencimiento y revocación; la pausa impide considerar médicos autorizados y no impide revocarlos. Cambiar administrador exige propuesta y aceptación de la nueva cuenta. Las cuatro pruebas de Registry del log adjunto comprobaron esas propiedades.

La acreditación profesional y la verificación de identidad ocurren fuera del contrato, bajo responsabilidad de TrustLeaf. commitment vincula el expediente cifrado; no demuestra por sí mismo que un título sea auténtico. La demo usa expedientes sintéticos. No se declara que sus participantes sean profesionales acreditados reales.

## Correspondencia de artefactos

- DoctorRegistryPrivate: CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2
- SHA-256: b31de89cfd704aa917afd2b9056b97a38242d91f2452846a208962f7de358e02
- PrescriptionPrivate v2: CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE
- SHA-256: 4703d26f7ed6321c4c5f1bcb20ac9392c43c79fae3e0f16adbc7ac70e738155c

Los dos builds locales y la lectura RPC del 7 de septiembre coinciden. Consultar evidence/closure-live-verification.json y los logs de compilación. El snapshot identifica la fuente entregada; su captura local no acredita la publicación del código en Git. El resto de miembros del workspace se incluye para reproducir el entorno; no se declara aceptado ni desplegado por este paquete.

## Reproducción

Desde source/contracts, con Rust, Stellar CLI y dependencias disponibles:

    cargo test --locked -p doctor-registry-private -p prescription-private
    stellar contract build --locked --package doctor-registry-private
    stellar contract build --locked --package prescription-private

Comparar hashes resultantes con los binarios de wasm/ y la lectura RPC. La suite de aplicación requiere el checkout original de ficha-onchain; su código completo no está incluido en este snapshot contractual.

## Límites y aceptación

- Esta es validación técnica del alcance D1, no auditoría integral de seguridad ni habilitación clínica de producción.
- El ciclo de vida y la transferencia administrativa se justifican con pruebas locales de la misma fuente, no con recibos nuevos de activación/revocación.
- Los controles privados de lectura fueron comprobados en servicios/CLI; el portal corresponde a la etapa siguiente.
- Las wallets y relaciones son públicas; el servidor autorizado descifra el contenido fuera de cadena.
- La suite app incluye un caso deliberado del cifrado legacy sin clave que emite una advertencia de texto claro. No se usa ese resultado para certificar seguridad de producción; el flujo privado de esta entrega tiene evidencia separada de ciphertext.
- La aceptación contractual queda a cargo del responsable. Este paquete no firma ni registra esa aceptación en su nombre.

Los documentos históricos de aceptación que mencionan otros contratos no deben usarse como matriz de estos dos contratos privados. Este paquete contiene la matriz y evidencia correspondientes a la versión nueva.
