# Evidencia SOW — tres médicos registrados en Testnet

**Resultado:** tres altas reales ejecutadas sobre el nuevo DoctorRegistry y confirmadas mediante recibos RPC. Las consultas posteriores coinciden con la cuenta, nombre y licencia de prueba enviados y devuelven autorización activa para los tres registros.

[DoctorRegistry en Stellar Expert](https://stellar.expert/explorer/testnet/contract/CBIBRPVCPIT2IZP35JRMB44URLXGFBYXBHR46HRZKUHJL4AEOLGVEAEK)

| Registro | Evidencia pública | Ledger | Transacción | Estado al verificar |
|---|---|---|---|---|
| Médico de prueba 1 | [Ver transacción](https://stellar.expert/explorer/testnet/tx/981151c69cd4c9188bc6d4fbe64722b34c3142eb023409363da26d81feddac43) | 4546582 | SUCCESS | Autorizado |
| Médico de prueba 2 | [Ver transacción](https://stellar.expert/explorer/testnet/tx/1bda989bed95463efa845bad3458545c703cb75c5ab2679244a29e8ee1eefaeb) | 4546583 | SUCCESS | Autorizado |
| Médico de prueba 3 | [Ver transacción](https://stellar.expert/explorer/testnet/tx/fa9b2298f50399b21d3e0ce42e66d75e1007ee0bffa57aac4b4cbe65861506a2) | 4546584 | SUCCESS | Autorizado |

## Cómo revisarlo

1. Abrir cada transacción en Stellar Expert Testnet y comprobar su éxito, el contrato invocado y el evento de registro. La disponibilidad y presentación dependen de la indexación del explorador; estos enlaces no se inspeccionaron visualmente en esta sesión.
2. Comparar la cuenta del médico y el identificador de licencia con el manifiesto de evidencia.
3. Para autorización vigente, consultar get_doctor en el contrato: una transacción de alta permanece histórica aunque después se revoque al médico. Se registró la hora de cada lectura en el manifiesto.

[Recibos completos y consultas de los tres médicos](../../evidence/testnet-generation-2026-09-07/three-test-doctors.json).

## Alcance de la evidencia

Son identidades técnicas marcadas TEST, no profesionales reales ni licencias médicas verificadas. Las claves quedaron en el almacén seguro de Windows, fuera de esta entrega. Se registraron direcciones en el contrato; no se fondearon estas tres cuentas como cuentas de saldo Stellar. Esto no impide su registro en DoctorRegistry.

El caso de revocación anterior se conserva aparte, con su cuenta de prueba desautorizada. Los tres nuevos registros quedaron autorizados. La prueba demuestra uso administrativo del contrato en Testnet; no acredita todavía aprobación desde la app ni emisión de recetas por estos médicos.
