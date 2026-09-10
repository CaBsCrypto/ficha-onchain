# TrustLeaf · Semana 2 · Validación local parcial de portales

**Fecha:** 9 de septiembre de 2026. **Entorno:** aplicación local, Neon dev y Stellar Testnet, exclusivamente con cuentas y datos sintéticos.

El recorrido local de médico y paciente quedó completado: **una receta activa (ID 3) y otra revocada (ID 4)**, correspondientes a dos consultas distintas, ambas finalizadas; el paciente consultó sus estados y abrió los dos documentos desde su propia sesión. También se demostró la retirada del consentimiento y el rechazo HTTP sin sesión. Este paquete no acredita un despliegue preview ni el cierre completo del SOW.

## Alcance y versión

Se utilizaron `DoctorRegistryPrivate` (`CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2`) y `PrescriptionPrivate v2` (`CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE`). El médico ya tenía una autorización confirmada, documentada en el [bloque administrativo de semana 2](../week2-admin-authorization-2026-09-09/authorization-receipt.json).

Las acciones de navegador hasta completar el recorrido médico se ejecutaron con la versión **`7c2ff26`** (`feat: connect doctor and patient portals to private Stellar flow`). **`df812d8`** (`fix: clarify pending private operation receipts`) es un ajuste posterior de mensajes y fue la versión utilizada para la lectura final del paciente; no se atribuyen a ese ajuste las transacciones ya realizadas.

Las firmas de paciente y médico se realizaron mediante Privy desde sus propias wallets Stellar. La autoridad contractual acreditó las reservas y el relayer patrocinó las comisiones. El recorrido utilizó identidades distintas para administración, médico y paciente.

## Evidencia independiente de recibos

Los archivos siguientes separan las lecturas de Neon dev/RPC, las observaciones de navegador y la validación automatizada. No contienen documentos clínicos, ciphertext, sobres XDR, firmas sin procesar, encabezados de autenticación, correos personales ni claves.

| Archivo | Evidencia |
|---|---|
| [week2-booking-receipts.json](week2-booking-receipts.json) | Dos `attest_booking` con recibos `SUCCESS`, firma de la autoridad, patrocinio y argumentos coincidentes con las consultas 76 y 77. |
| [week2-consent-receipts.json](week2-consent-receipts.json) | Cuatro recibos `SUCCESS`: autorización, retirada y nueva autorización de la consulta 76; autorización de la consulta 77. Firma del paciente y comisión del relayer verificadas. |
| [week2-prescription-receipts.json](week2-prescription-receipts.json) | Cinco recibos `SUCCESS`: dos emisiones, dos activaciones y una revocación. Firma del médico, patrocinio, compromiso, emisor, destinatario, identificador, schema y vencimiento verificados. |
| [week2-unauthenticated-access.json](week2-unauthenticated-access.json) | Tres peticiones HTTP locales sin sesión: listado y ambos documentos rechazados con `401`, únicamente error de autenticación y sin contenido clínico. |
| [browser-observations.json](browser-observations.json) | Observación del agente principal: sesión del paciente, estados activo/revocado y apertura autorizada de ambos documentos con HTTP `200`, sin adjuntar contenido clínico. |
| [validation-results.json](validation-results.json) | Resultados locales por versión, pruebas contractuales y de servicios, TypeScript, build y tres ejecuciones de GitHub Actions verificadas. |

Los **11 recibos de las consultas** son transacciones. Los totales de pruebas automatizadas se detallan por separado a continuación.

En el corte final de datos de las **08:57:32.389 UTC**, seguido de lectura de cadena hasta las **08:57:36.423 UTC**, la receta 3 figuraba `Active` y la receta 4 `Revoked`; ambas reservas estaban consumidas y ambas consultas finalizadas. No había operaciones pendientes de esas consultas o sus cuentas firmantes, ni fuentes con pendientes duplicadas. Las lecturas históricas y de estado actual están identificadas por fechas y ledgers dentro de cada archivo.

## Observaciones del navegador

El agente principal encargado de operar y observar la interfaz registró:

- Reserva, confirmación de asistencia e inicio de dos consultas. La asistencia se mantuvo separada del consentimiento.
- Modal de consentimiento con médico, paciente, consulta, alcance de una emisión y vencimiento. La retirada mostró «Sin permiso» y la nueva autorización «Permiso vigente».
- Emisión de ambas recetas con firma del médico y estado inicial `Registered`; activación posterior mediante otra confirmación.
- Activación y revocación de la receta 4, y activación de la receta 3.
- Apertura del documento sintético B por el médico antes y después de revocarlo, y del documento A activo, con HTTP `200` y contenido esperado. El contenido no se adjunta a este paquete.
- Filtro de activas mostrando sólo la receta 3 y filtro de revocadas mostrando sólo la receta 4; finalización de ambas consultas.
- Lectura final del paciente, registrada a las **09:01:53 UTC** sobre `df812d8`: misma asociación persistida de wallet, receta 3 activa y receta 4 revocada, apertura de ambos documentos con HTTP `200` y contenido sintético correspondiente. No se mostraron controles de activación o revocación al paciente. Las emisiones ocurrieron durante la vigencia de las reservas; la lectura posterior conserva acceso al historial autorizado.

Estas observaciones se distinguen de la auditoría independiente de DB/RPC: los recibos verifican las wallets firmantes y los efectos contractuales; por sí solos no prueban el uso de una pantalla o de un SDK concreto. La auditoría no descifró documentos ni recalculó compromisos desde su contenido.

## Pruebas locales y CI verificados

Resultados locales del **9 de septiembre de 2026**:

| Comprobación | Resultado | Versión y fecha |
|---|---|---|
| Aplicación | **414 pruebas aprobadas en 34 suites** | Código exacto `df812d8`, 9 de septiembre |
| TypeScript | **Aprobado**, salida 0 | `df812d8` |
| Build de la aplicación | **Aprobado**, salida 0 | `df812d8` |
| Contratos privados | **11 pruebas aprobadas**: 4 de registro y 7 de recetas; 0 fallos | Fuentes `5b3c9cb`, nueva ejecución de **09:10:32 a 09:10:44 UTC** |
| Servicios privados, identidad y workers | **43 pruebas aprobadas**, 0 fallos | Fuentes `5b3c9cb`, nueva ejecución de **09:10:32 a 09:10:33 UTC** |

Las pruebas aisladas no ejecutaron transacciones ni desplegaron aplicaciones. La comprobación local de la aplicación utilizó Node 24 y dependencias previamente instaladas; el CI utilizó Node 22 y ejecutó su propia instalación. [validation-results.json](validation-results.json) conserva las versiones completas, la procedencia saneada y los nombres de las 11 pruebas contractuales.

También se consultaron directamente los metadatos y resúmenes de GitHub Actions. Las tres ejecuciones terminaron en **`success`**:

| Ejecución | Versión del PR | Comprobaciones aprobadas |
|---|---|---|
| [PR 101 · Contratos · run 34332973332](https://github.com/CaBsCrypto/ficha-onchain/actions/runs/34332973332) | `5b3c9cb` | 11 pruebas contractuales y compilación WASM |
| [PR 101 · Aplicación · run 34332973321](https://github.com/CaBsCrypto/ficha-onchain/actions/runs/34332973321) | `5b3c9cb` | Instalación, TypeScript, pruebas de aplicación, 43 pruebas privadas y build |
| [PR 102 · Aplicación · run 34332997629](https://github.com/CaBsCrypto/ficha-onchain/actions/runs/34332997629) | `58d0df0` | Instalación, TypeScript, pruebas de aplicación, 43 pruebas privadas y build |

`58d0df0` añadió documentación sobre `df812d8`; se verificó que esa diferencia no cambia el código de la aplicación. Los conteos locales de 414/34 se atribuyen al código exacto probado localmente; para el CI se documentan las etapas y conteos confirmados en sus registros. **El CI aprobado y el build WASM no acreditan un recorrido sobre el preview desplegado**, que permanece pendiente.

## Pendientes para el entregable

- Evidencia del rechazo de una identidad autenticada ajena y demás validaciones finales de integridad y recuperación.
- Validaciones de navegador aún no acreditadas para cancelación concurrente y otros fallos de Privy/RPC o reinicio; este recorrido exitoso no sustituye esas comprobaciones.
- Validación del preview aislado, enlace de aplicación desplegada, video de ambos recorridos y aceptación formal del responsable.

La validación local no habilita uso clínico real. La revocación conserva el historial y no se presenta como eliminación de la receta o de su documento.

## Integridad del paquete

[manifest.json](manifest.json) registra tamaño y SHA-256 del README y de los seis archivos JSON. No incluye su propio hash. Los identificadores y wallets incluidos son datos públicos de prueba; no se copiaron archivos de entorno ni material de firma.
