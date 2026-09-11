# TrustLeaf — Changelog de semana 1

**Versión entregada: DoctorRegistryPrivate y PrescriptionPrivate v2.** Stellar Testnet, cuentas de prueba y datos sintéticos. Corte técnico: **7 de septiembre de 2026**. Actualización documental: **8 de septiembre de 2026**.

La validación técnica está documentada y el video ya está grabado, según confirmación del responsable. El paquete queda preparado para entrega y revisión; faltan el enlace del video, la publicación de la página de entrega y la aceptación formal.

## 8 de septiembre — Preparación del entregable final

### Documentación y presentación

- Actualizada la lámina principal alrededor de dos contratos, cuatro transacciones confirmadas y el resultado demostrado. Cada contrato tiene acceso a su explorador y al código incluido en el paquete.
- Aclarada la distribución del recorrido: **una transacción en el registro y tres en recetas**. La consulta interna al registro durante la emisión no agrega una quinta transacción.
- Incorporados listados consultables de las **11 pruebas contractuales** y las **137 pruebas de aplicación**, con búsqueda y explicación de su procedencia.
- Preparada una guía del presentador con el orden de explicación, frases de apoyo y respuestas a preguntas sobre contratos, consentimiento, firmas, relay y privacidad.
- Consolidada la página de entrega lista para importar en Notion y actualizado este changelog. El material anterior del 5–6 de septiembre queda como antecedente fuera del paquete vigente.
- **Video grabado**, confirmado por el responsable el 8 de septiembre. Su enlace todavía no está incorporado.
- Actualizado el manifiesto del paquete y preparado el archivo `TrustLeaf-Semana-1-Entrega-2026-09-08.zip`. Se conserva el ZIP anterior del día 7.

Esta actualización no ejecuta nuevas transacciones ni modifica fuentes contractuales, binarios o recibos. Las cifras técnicas mantienen el corte del 7 de septiembre; no representan una nueva corrida de pruebas.

## 7 de septiembre — Dos contratos privados y flujo verificado

### Registro de médicos: DoctorRegistryPrivate

- Autorización del médico protegida por la firma administrativa.
- Vigencia, renovación y revocación de la autorización; la pausa no impide revocar.
- Transferencia administrativa mediante propuesta y aceptación de la nueva cuenta.
- Compromiso público que vincula el expediente cifrado fuera de cadena. La revisión de identidad y acreditación profesional ocurre fuera del contrato; los expedientes de la demo son sintéticos.

**ID:** `CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2`

**WASM SHA-256:** `b31de89cfd704aa917afd2b9056b97a38242d91f2452846a208962f7de358e02`

[Ver contrato en Testnet](https://stellar.expert/explorer/testnet/contract/CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2) · [Ver código entregado](doctor-registry-private-codigo.html).

### Recetas privadas: PrescriptionPrivate v2

- Reserva acreditada por la autoridad de reservas y vinculada al médico, paciente y emisión.
- Consentimiento firmado por el paciente para ese médico y esa emisión, revocable, con vencimiento y de uso único.
- Emisión firmada por el médico autorizado; comprobación de su autorización contra DoctorRegistryPrivate, del destinatario y de la reserva y consentimiento coincidentes.
- Consumo de la reserva y del consentimiento al emitir, con prevención de duplicados.
- Asignación inicial de la receta al paciente en estado `Registered`. Las pruebas locales cubren el ciclo `Registered → Active → Revoked`; las cuatro transacciones principales no incluyen activación o revocación.
- Documento almacenado cifrado antes de emitir, compromiso coincidente con la cadena y recuperación privada autorizada comprobada mediante servicios/CLI.

**ID:** `CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE`

**WASM SHA-256:** `4703d26f7ed6321c4c5f1bcb20ac9392c43c79fae3e0f16adbc7ac70e738155c`

[Ver contrato en Testnet](https://stellar.expert/explorer/testnet/contract/CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE) · [Ver código entregado](prescription-private-codigo.html).

Los dos binarios recompilados coinciden con los hashes de Testnet guardados en [la verificación del corte](evidence/closure-live-verification.json). Los logs de compilación y los binarios están incluidos en el paquete.

### Cuatro transacciones confirmadas

| Actor | Contrato | Acción | Recibo |
| --- | --- | --- | --- |
| Administrador | DoctorRegistryPrivate | `authorize_doctor`: autoriza al médico | [Confirmada](https://stellar.expert/explorer/testnet/tx/114abb0d7daa9672b8bdacabdf95b925abdb152e20157dfbbe187145f4eb3650) |
| Autoridad de reservas | PrescriptionPrivate v2 | `attest_booking`: acredita la reserva | [Confirmada](https://stellar.expert/explorer/testnet/tx/1930f88b1b04515c21c8f84cc221b2f7417932f38a635345fb492392587cbb21) |
| Paciente | PrescriptionPrivate v2 | `authorize_prescriber`: consiente esa emisión | [Confirmada](https://stellar.expert/explorer/testnet/tx/b0289a388c5196e0458a19a0885641f525a38733bc0ddda438bf26771132cfb7) |
| Médico | PrescriptionPrivate v2 | `mint_prescription`: emite para el paciente | [Confirmada](https://stellar.expert/explorer/testnet/tx/0e7102c770d100ea6b5f9aa375992dbbc76534535f48822fb066afca2cd672c8) |

Los cuatro recibos registran `SUCCESS`, en los ledgers 4547691–4547694, según la consulta RPC guardada el 7 de septiembre a las 07:54:35 UTC. En la demostración, una misma cuenta cumple los roles de administrador y autoridad de reservas; médico y paciente usan sus propias cuentas de prueba. Las firmas se ejecutaron mediante herramientas de prueba, sin acreditar todavía el recorrido del portal con Privy.

### Pruebas y controles documentados

| Respaldo | Resultado del corte | Alcance |
| --- | --- | --- |
| Pruebas contractuales | **11 aprobadas: 4 de registro y 7 de recetas** | Firmas, ciclo de vida, vencimientos, revocación, consentimiento, reservas y duplicados. [Log con nombres](evidence/closure-contract-tests.txt). |
| Pruebas de aplicación | **137 aprobadas en 23 archivos** | Suite histórica de aplicación, con módulos anteriores y regresiones. [Reporte](evidence/app-tests.txt). |
| TypeScript | **Sin errores; salida 0** | Comprobación del corte del 7. [Resultado](evidence/typecheck.json). |
| Servicios/CLI y auditoría | **13 comprobaciones del recorrido y 12 controles de auditoría** | Identidades, reserva y emisión coincidentes, ciphertext, lectura del paciente y rechazo de identidad ajena. [Reporte](evidence/TrustLeaf-evidencia-validaciones.json). |
| Relay | **6 envolturas fee-bump adicionales, SUCCESS** | Pagador esperado verificado. Evidencia separada de los cuatro pasos del recorrido. [Recibos guardados](evidence/closure-live-verification.json). |

Las 137 pruebas no son 137 casos exclusivos de seguridad de estos dos contratos. El reporte histórico guarda los totales, sin nombres individuales. El [inventario consultable](evidence/test-case-inventory.json) se reconstruyó el 8 de septiembre desde las fuentes disponibles, excluyendo las 9 pruebas posteriores de firma Privy; no acredita una identidad exacta entre todos sus nombres y la corrida histórica. La suite también contiene módulos anteriores y pruebas que reproducen hallazgos conocidos, incluido el cifrado anterior sin clave que guarda texto claro. El flujo privado tiene evidencia separada de ciphertext y acceso restringido.

Los rechazos por simulación RPC, como reserva ausente o revocada y duplicados, están identificados como simulaciones en el reporte; no se presentan como transacciones publicadas. El ciclo completo de estados y la transferencia administrativa se respaldan con pruebas locales.

## Alcance de la entrega y siguiente hito

El contenido del expediente y de la receta permanece cifrado fuera de cadena; el servidor autorizado lo descifra. En cadena son públicos las direcciones, sus relaciones, compromisos, fechas y estados. El consentimiento autoriza una emisión concreta; no constituye firma del paciente sobre el contenido final de la receta.

Se entregan los dos contratos privados. Ficha clínica, licencias, dispensación, MCP y otros módulos anteriores quedan fuera de este cierre. Su existencia en fuentes o pruebas históricas no significa que se entreguen ni que hayan sido retirados ya de todos los flujos activos. Los datos históricos se preservan.

El siguiente hito es el recorrido de los portales con login y firma integrada mediante Privy, exclusivamente Stellar, con comisiones pagadas por el relayer. La evidencia de semana 1 corresponde a servicios/CLI; no acredita un recorrido autenticado completo en navegador.

La fuente entregada se identifica por [source-manifest.json](source-manifest.json) y [MANIFEST-SHA256.json](MANIFEST-SHA256.json). La captura local no prueba un merge del código nuevo. Las PR #95 y #96 y sus cifras corresponden a antecedentes; no deben usarse para atribuir este código a `main`. Tampoco se acredita aquí un CI remoto o build actuales.

## Material y cierre

- [Alcance y revisión técnica](LEER-PRIMERO.md).
- [Lámina principal](TrustLeaf-transacciones-de-prueba.html), [preguntas frecuentes](TrustLeaf-preguntas.html) y [guía del presentador](TrustLeaf-guia-presentador.html).
- [Página lista para importar a Notion](NOTION-ENTREGA-SEMANA-1.md).

**Validación técnica de semana 1 documentada; paquete y video preparados para entrega y revisión.** Enlace del video y publicación de la página pendientes. La aceptación formal corresponde al responsable; este documento no registra una aceptación en su nombre ni acredita aptitud clínica de producción.
