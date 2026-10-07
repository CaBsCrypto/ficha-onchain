# SOW 2 · Semana 1 · Informe para revisión

**Objetivo:** comprobar la base de una historia clínica privada: el paciente controla el acceso, los archivos permanecen cifrados y Stellar permite verificar autorizaciones y cambios.

**Resultado al 7 de octubre de 2026:** una ejecución nueva completó seis operaciones clínicas en Stellar Testnet, con tres versiones cifradas recuperadas desde Neon dev en otro proceso. Se comprobaron código, interfaz y configuración de los tres contratos. El médico pudo leer con permiso y su acceso posterior fue rechazado tras revocar. La primera prueba se conserva por separado.

**Estado de entrega:** evidencia técnica disponible para revisión y grabación; la semana no se declara completamente cerrada. La [PR #135](https://github.com/CaBsCrypto/ficha-onchain/pull/135) sigue en borrador y sin fusionar. La restauración real de estado archivado permanece pendiente.

Base de producto auditada: `db9bc2f3eebb5c827321636d1e2275b540aee7be`. **Commit de herramientas validado: `2565f972401e145740c24211ce09a329e3050c52`.** Las herramientas de ejecución y presentación no cambian el contrato ni implementan las pantallas de la semana 2. Main permanece intacto.

## Contrato y privacidad

Nuevo contrato **ClinicalHistoryPrivate**: [ver en Testnet](https://stellar.expert/explorer/testnet/contract/CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U).

Este único contrato nuevo organiza historias de múltiples pacientes; no se despliega uno por persona o archivo. Reutiliza DoctorRegistryPrivate para comprobar la autorización médica. PrescriptionPrivate conserva el flujo de recetas del SOW 1. Son tres contratos en este flujo; la vinculación de recetas con la nueva ficha todavía no está integrada.

| Contrato | Identificador y comprobación del 7 de octubre |
| --- | --- |
| DoctorRegistryPrivate | [Registro médico](https://stellar.expert/explorer/testnet/contract/CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2): código, interfaz, administrador y autorización médica. |
| PrescriptionPrivate | [Recetas](https://stellar.expert/explorer/testnet/contract/CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE): código, interfaz, registro y autoridades; lectura del registro existente #2. |
| ClinicalHistoryPrivate | [Ficha clínica](https://stellar.expert/explorer/testnet/contract/CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U): código, interfaz, registro médico y recorrido nuevo de seis operaciones. |

La receta #2 se observó **Registrada y vencida, sin vigencia**. Verificar su correspondencia no la presenta como activa. No se emitieron ni modificaron recetas, ni se desplegaron contratos nuevos para repetir la prueba.

El contrato clínico no tiene método de actualización. WASM SHA-256: `29e5510efc758f66bebc44c156fe13fb288a2ef339159467dd787bf4231e1ce0` (15.533 bytes).

| Componente | Responsabilidad |
| --- | --- |
| Stellar Testnet | Propietario, permisos independientes de leer/agregar, versiones, autor y comprobantes de integridad. Wallets y metadatos son públicos. |
| Neon dev | Antecedentes y PDF/PNG/JPEG cifrados, hasta 3.000.000 bytes originales por archivo. |
| Servicio privado | Comprueba identidad, autorización médica y permiso vigente antes de entregar contenido; verifica integridad. |
| Claves externas a Neon | Cifrado AES-GCM con claves por versión y protección local DPAPI. No es custodia de producción ni cifrado de extremo a extremo. |

Sólo el paciente concede o retira permisos. El médico necesita autorización vigente en el registro y el permiso correspondiente. Una corrección conserva versiones anteriores y sólo puede realizarla su autor. Revocar no elimina copias descargadas. Integridad no acredita veracidad clínica.

### Guía para explicar el paso 5

Los PDF e imágenes se guardan cifrados en la base PostgreSQL alojada en **Neon dev**, sin un enlace público de descarga. Las herramientas locales de TrustLeaf realizan el cifrado y comprueban identidad, permisos, autorización médica cuando corresponde e integridad antes de entregar contenido. El visor local sólo presenta los resultados guardados.

Se admiten **PDF, PNG y JPEG de hasta 3 MB (3.000.000 bytes) originales por archivo**, antes de cifrar; el sobre cifrado ocupa más espacio. La clave de servicio permanece fuera de Neon, protegida con DPAPI en esta demostración. La carga desde el portal y la compresión automática pertenecen a una etapa posterior.

Para el video: «La imagen se guarda cifrada en Neon. Stellar registra quién la agregó, sus permisos y el comprobante de integridad. El archivo sólo se entrega tras comprobar el acceso autorizado, y el límite es de 3 MB».

## Resultados

| Evidencia | Resultado | Naturaleza |
| --- | --- | --- |
| Pruebas locales de las herramientas nuevas | 634 aplicación, 151 privadas, 25 contratos; TypeScript y build aprobados | Automatizada; resultados del candidato nuevo, distintos del CI anterior |
| Contrato clínico | 14 aprobadas, incluidas en las 25 contractuales | Aislada; permisos, firmas, versiones, reintentos y rechazo ante archivo |
| Auditoría de tres contratos, 7 de octubre, 01:40:39 de Chile (04:40:39 UTC) | Tres códigos, interfaces y configuraciones comprobados; receta existente leída sin cambios | Lectura real de Testnet |
| Ejecución nueva, 01:42:49 de Chile (04:42:49 UTC) | Seis recibos `SUCCESS`, tres versiones cifradas y cero intentos pendientes | Neon dev y Testnet reales, datos sintéticos |
| Lectura posterior, 01:44:00 de Chile (04:44:00 UTC) | Firma, sobre y argumentos de los seis recibos auditados; versiones recuperadas; médico rechazado después de revocar | Proceso nuevo, Neon dev y Testnet reales |
| CI/Vercel de `e72024f` | Aplicación, TypeScript, build, contratos, build WASM, reproducción Windows y Vercel aprobados | [CI](https://github.com/CaBsCrypto/ficha-onchain/actions/runs/37573515671), [contratos/WASM](https://github.com/CaBsCrypto/ficha-onchain/actions/runs/37573515539), [Vercel](https://vercel.com/cabscryptocontacto-6028s-projects/trustleaf-demo/HkXTAtHAFrW91zkwZxKjKJxarUu3) |

Las 14 pruebas clínicas están incluidas en las 25 contractuales; no son una cifra adicional. Las seis operaciones del recorrido son distintas de las dos transacciones de despliegue. Leer o verificar datos no añade otra transacción.

Los primeros intentos de aplicación y build encontraron restricciones de ejecución de la herramienta (`EPERM`/`EACCES`); con acceso normal terminaron aprobados. Se registran como limitaciones del entorno, no como fallos reproducidos del producto. Las 151 privadas incluyen las pruebas de presentación y las nuevas herramientas; no se reutiliza la cifra anterior de 109.

La inspección cuenta entradas del ledger, no claves de cifrado. Una consulta posterior puede cambiar su resultado; el informe conserva la fecha observada. Los escenarios de fallos simulados no se presentan como incidentes reales de Privy o Stellar. El [CI anterior](https://github.com/CaBsCrypto/ficha-onchain/actions/runs/37354464405) acredita su propio commit, no los cambios posteriores.

## Ejecución nueva y recibos

### Quién firma y qué permiso necesita

La demostración nueva usa scripts e identidades sintéticas, sin alternar sesiones de navegador. Cada operación usa la clave del actor indicado. La integración futura solicitará la firma del usuario correspondiente mediante Privy; no está entregada para este flujo clínico.

| Momento | Actor que autoriza y firma | Condición | Resultado en Stellar |
| --- | --- | --- | --- |
| Crear historial | Paciente | Firma exacta del propietario; una historia por wallet | Identificador y propietario, sin archivos clínicos |
| Conceder lectura y agregado | Paciente | Ser propietario; revisión del permiso esperada | Permiso para ese médico, con dos indicadores independientes |
| Agregar PDF en esta ejecución | Médico | Autorización médica vigente y permiso de agregar vigente; firma del autor | Nueva entrada y comprobante de integridad; PDF cifrado en Neon |
| Corregir PDF | Mismo médico autor | Mantener autorización y permiso de agregar; versión esperada | Nueva versión; se conserva la anterior |
| Agregar imagen en esta ejecución | Médico | Mismas condiciones del agregado de PDF | Nueva entrada y comprobante; imagen cifrada en Neon |
| Revocar permisos | Paciente | Ser propietario; revisión esperada | Ambos permisos desactivados y revisión incrementada |
| Leer o descargar | Paciente o médico con lectura vigente | Identidad y acceso comprobados por el servicio; médico autorizado cuando corresponda | Consulta sin transacción; no crea un recibo nuevo |

El propietario también puede agregar y corregir sus propios aportes: firma como paciente, sin pedir permiso a un médico. Esta capacidad está cubierta en pruebas del contrato, pero los PDF e imagen de los seis recibos mostrados fueron aportados por el médico. No se atribuye autoría médica a un examen previo subido por el paciente.

Leer no permite agregar; agregar no permite leer. Un médico no puede corregir el aporte de otro autor. La revocación no cambia ni elimina versiones anteriores. Las recetas existentes conservan su contrato e historial: su vinculación privada con la ficha pertenece a la integración posterior, no a una migración ya realizada.

Datos sintéticos, ejecución nueva **`ed9cf324-b9f1-400c-aae8-3323a66407ad`**:

1. [Crear historial](https://stellar.expert/explorer/testnet/tx/a0c64f801870891cbec9e833d2c4ca540b4ee6367b5649af8a18f063b45b8cc5).
2. [Conceder lectura y agregado](https://stellar.expert/explorer/testnet/tx/1bc3b5f667e8412cd8e4c1f96ba1bf4d8e4c574741d168704e63e2b66463069d).
3. [Agregar PDF](https://stellar.expert/explorer/testnet/tx/d6c35935f93e7e23c2a9c4db19ef88d151104dbfb7dec2b36a8e78864a7e9d6a).
4. [Corregir PDF](https://stellar.expert/explorer/testnet/tx/fbfe2df2b8423fd1d56e3e5032d2f8090f0e001f6a44448d4ed522033cc6c1d6).
5. [Agregar imagen](https://stellar.expert/explorer/testnet/tx/3860d9dcce162575e50737920375a2def75515d75b24c8c02a8b63947ba0b191).
6. [Revocar permisos](https://stellar.expert/explorer/testnet/tx/43dd5fb356bb578e64d116d390bcb120d158cc536820da4ef8d63875cbda568b).

**Operación adicional:** [financiación de la cuenta sintética por Friendbot](https://stellar.expert/explorer/testnet/tx/7761539e4c1b0008460e93508e3b12cb32dddfff9f5e7d913bf9edccf17cec92), separada de las seis operaciones clínicas. Su [auditoría de financiación](../evidence/sow2-week1-runs/ed9cf324-b9f1-400c-aae8-3323a66407ad/funding-audit.json) comprobó `SUCCESS`, hash del sobre, destino y una operación `create_account`. Los dos recibos del despliegue clínico son anteriores y tampoco pertenecen a esta ejecución.

| Ejecución | Evidencia | Tratamiento |
| --- | --- | --- |
| Primera prueba: `f1a575bc-0146-47e1-a192-f259876f3b82` | [Ejecución original](../evidence/sow2-week1-2026-10-05/demonstration.json) y [lectura original](../evidence/sow2-week1-2026-10-05/readback.json) | Se conserva; no se vuelve a emitir ni se atribuye a la prueba nueva. |
| Nueva prueba: `ed9cf324-b9f1-400c-aae8-3323a66407ad` | [Ejecución](../evidence/sow2-week1-runs/ed9cf324-b9f1-400c-aae8-3323a66407ad/demonstration.json), [lectura posterior](../evidence/sow2-week1-runs/ed9cf324-b9f1-400c-aae8-3323a66407ad/readback.json) y [auditoría de contratos](../evidence/sow2-week1-runs/ed9cf324-b9f1-400c-aae8-3323a66407ad/contracts-audit.json) | Evidencia principal de esta entrega. |

[Manifiesto de despliegue existente](../evidence/sow2-week1-2026-10-05/deployment.json). La autorización del médico se observó vigente hasta el **7 de octubre a las 02:10:40 de Chile (05:10:40 UTC)**; la ejecución terminó antes. Una consulta posterior debe registrar si ya venció. No se considera autorización vigente por conservar un informe anterior.

## Cómo puede comprobarlo el revisor

1. Abrir la [página local con tres tarjetas](http://127.0.0.1:3014/). Es un informe estático de evidencia pública, sin secretos, botones de firma ni consulta en vivo.
2. Abrir el contrato y los seis recibos nuevos en Stellar Expert; contrastarlos con los manifiestos públicos y el [manifiesto de integridad del informe](../evidence/sow2-week1-runs/ed9cf324-b9f1-400c-aae8-3323a66407ad/integrity-manifest.json).
3. Revisar los resultados por commit y la [matriz de aceptación](MATRIZ-ACEPTACION-SEMANA-1.md), que distingue pruebas aisladas de evidencia real. Los enlaces anteriores acreditan `e72024f`; el HEAD de la PR, incluidas actualizaciones documentales posteriores, se comprueba en sus [checks](https://github.com/CaBsCrypto/ficha-onchain/pull/135/checks).
4. Seguir el [recorrido de grabación](GRABACION-SEMANA-1.md). El video revisará esta ejecución nueva ya realizada, sin fingir que las transacciones ocurren durante la consulta ni que el portal clínico está terminado.

En el equipo configurado:

```powershell
node scripts/build-clinical-report.mjs --run-id ed9cf324-b9f1-400c-aae8-3323a66407ad
node scripts/serve-clinical-report.mjs --run-id ed9cf324-b9f1-400c-aae8-3323a66407ad
```

El generador crea la página, el informe de la ejecución y su manifiesto a partir de archivos públicos. No consulta Neon ni Stellar. El servidor entrega sólo la página y escucha en `127.0.0.1`. Tras regenerarla, se reinicia el visor para mostrar el nuevo archivo. La auditoría en vivo requiere el entorno descrito en [operación](OPERACION-SEMANA-1.md); leer un informe anterior no demuestra disponibilidad actual.

## Pendientes y límites

| Punto | Estado y siguiente paso |
| --- | --- |
| Revisión de PR y video | Pendientes; CI/Vercel de `e72024f` aprobados. La PR sigue en borrador. Registrar los tiempos del video definitivo. |
| Restauración real de estado archivado | No acreditada. Las entradas siguen disponibles; ni la inspección ni las pruebas simuladas demuestran una restauración real. |
| Pantallas clínicas y firmas mediante Privy | Trabajo de las semanas siguientes. El recorrido actual utiliza scripts y firmas técnicas sintéticas. |
| Recetas existentes y archivos previos del paciente | Vinculación y presentación pendientes; ver [plan de aportes y adjuntos](PLAN-APORTES-Y-ADJUNTOS.md). La compresión automática todavía no está implementada. |
| Custodia de claves y operación permanente | Recuperación probada bajo la misma cuenta Windows; no en otro equipo. Alojamiento permanente no entregado. |
| Reanudación de operaciones inciertas | Intentos persistidos y rechazo de doble envío cubiertos en pruebas. Un intento `prepared` sin firma conservada obliga a detenerse y reconciliar manualmente; no se promete reanudación automática de cualquier estado. |

La plataforma puede descifrar para usuarios autorizados; no es cifrado de extremo a extremo. No se acredita certificación de seguridad, cumplimiento normativo ni veracidad clínica. Se utilizan exclusivamente Testnet y datos sintéticos.
