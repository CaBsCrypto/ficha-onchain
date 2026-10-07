# TrustLeaf · SOW 2 · Informe de semana 1

**Estado:** Comprobado. **Ejecución:** `ed9cf324-b9f1-400c-aae8-3323a66407ad`.

Informe generado: 07-10-2026, 2:17:00 a. m. (Chile); 2026-10-07T05:17:00.411Z. Es evidencia guardada; no una consulta en vivo.

Commit de referencia de la evidencia: `2565f972401e145740c24211ce09a329e3050c52`.

## Contratos y comprobaciones

| Contrato | Función | Estado | Identificador |
|---|---|---|---|
| DoctorRegistryPrivate | Conserva la autorización médica utilizada por la ficha y las recetas. | Comprobado | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2) |
| PrescriptionPrivate | Conserva el contrato de recetas del SOW 1. No se emiten ni modifican recetas en esta ejecución. | Comprobado | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE) |
| ClinicalHistoryPrivate | Registra historias, permisos independientes, versiones y comprobantes de integridad. | Comprobado | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U) |

Auditoría registrada: 07-10-2026, 1:40:39 a. m. (Chile); 2026-10-07T04:40:39.890Z. Sólo el contrato clínico recibe operaciones nuevas.

Receta existente #2: **Registrada, vencida**. Vigencia consultada: no. Comprobar el registro no declara que esté vigente.

### Despliegue existente

Contrato clínico: `CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U`. WASM: `29e5510efc758f66bebc44c156fe13fb288a2ef339159467dd787bf4231e1ce0`.

- Publicación del WASM: [1361b402c69359dca201433f7229577328a659b0463a5b5e62054f8d2134a5d0](https://stellar.expert/explorer/testnet/tx/1361b402c69359dca201433f7229577328a659b0463a5b5e62054f8d2134a5d0).
- Despliegue clínico: [57cbd24a1f3f1b7e44e1e37dd7377881dbc702f65939910bd63a340bbe3c3a90](https://stellar.expert/explorer/testnet/tx/57cbd24a1f3f1b7e44e1e37dd7377881dbc702f65939910bd63a340bbe3c3a90).

Registrado: 05-10-2026, 2:25:34 p. m. (Chile); 2026-10-05T17:25:34.447Z. Los recibos de despliegue son anteriores; no pertenecen a las seis operaciones nuevas.

## Recorrido de la ejecución nueva

| Paso | Firma | Permiso necesario | Estado | Recibo |
|---|---|---|---|---|
| Crear historial | Paciente | Firma del propietario | Comprobado | [a0c64f801870891cbec9e833d2c4ca540b4ee6367b5649af8a18f063b45b8cc5](https://stellar.expert/explorer/testnet/tx/a0c64f801870891cbec9e833d2c4ca540b4ee6367b5649af8a18f063b45b8cc5) |
| Conceder lectura y agregado | Paciente | Ser propietario del historial | Comprobado | [1bc3b5f667e8412cd8e4c1f96ba1bf4d8e4c574741d168704e63e2b66463069d](https://stellar.expert/explorer/testnet/tx/1bc3b5f667e8412cd8e4c1f96ba1bf4d8e4c574741d168704e63e2b66463069d) |
| Agregar PDF | Médico | Autorización médica y permiso de agregar | Comprobado | [d6c35935f93e7e23c2a9c4db19ef88d151104dbfb7dec2b36a8e78864a7e9d6a](https://stellar.expert/explorer/testnet/tx/d6c35935f93e7e23c2a9c4db19ef88d151104dbfb7dec2b36a8e78864a7e9d6a) |
| Corregir PDF | Mismo médico | Ser autor y conservar permiso de agregar | Comprobado | [fbfe2df2b8423fd1d56e3e5032d2f8090f0e001f6a44448d4ed522033cc6c1d6](https://stellar.expert/explorer/testnet/tx/fbfe2df2b8423fd1d56e3e5032d2f8090f0e001f6a44448d4ed522033cc6c1d6) |
| Agregar imagen | Médico | Autorización médica y permiso de agregar | Comprobado | [3860d9dcce162575e50737920375a2def75515d75b24c8c02a8b63947ba0b191](https://stellar.expert/explorer/testnet/tx/3860d9dcce162575e50737920375a2def75515d75b24c8c02a8b63947ba0b191) |
| Revocar permisos | Paciente | Ser propietario del historial | Comprobado | [43dd5fb356bb578e64d116d390bcb120d158cc536820da4ef8d63875cbda568b](https://stellar.expert/explorer/testnet/tx/43dd5fb356bb578e64d116d390bcb120d158cc536820da4ef8d63875cbda568b) |

Lectura posterior registrada: 07-10-2026, 1:44:00 a. m. (Chile); 2026-10-07T04:44:00.629Z.

- Lectura del paciente e integridad de versiones: **Comprobado**.
- Lectura médica antes de revocar: **Comprobado**.
- Lectura y agregado rechazados después de revocar: **Comprobado**.
- Contenido cifrado alterado rechazado: **Comprobado**.
- Lectura posterior desde otro proceso: **Comprobado**.
- Cero intentos clínicos pendientes: **Comprobado**.

### Paso 5 · Almacenamiento y tamaño de archivos

- **Dónde se guardan:** En la base PostgreSQL alojada en Neon, dentro de la rama dev aislada de esta prueba. El archivo queda cifrado, sin un enlace público de descarga.
- **Cómo se protegen:** Cifrado AES-256-GCM con una clave por versión. La clave de servicio permanece fuera de Neon, protegida localmente con DPAPI en esta demostración.
- **Quién puede leer:** El servicio técnico comprueba identidad, permiso de lectura vigente, autorización médica cuando corresponde e integridad antes de entregar el archivo. Retirar permisos bloquea nuevos accesos; no borra copias ya descargadas.
- **Formatos y tamaño:** PDF, PNG y JPEG: hasta 3 MB (3.000.000 bytes) por archivo original, antes de cifrar. El contenido cifrado ocupa más espacio. La carga desde el portal y la compresión automática quedan para una etapa posterior.

**Para narrar:** «La imagen se guarda cifrada en Neon. Stellar registra quién la agregó, sus permisos y el comprobante de integridad. El archivo sólo se entrega tras comprobar el acceso autorizado, y el límite es de 3 MB.»

Neon aloja la base; las herramientas locales de TrustLeaf realizan el cifrado y las comprobaciones de esta prueba. El informe sólo muestra evidencia guardada.

### Operación adicional de preparación

Financiación de la cuenta sintética por Stellar Testnet Friendbot: [7761539e4c1b0008460e93508e3b12cb32dddfff9f5e7d913bf9edccf17cec92](https://stellar.expert/explorer/testnet/tx/7761539e4c1b0008460e93508e3b12cb32dddfff9f5e7d913bf9edccf17cec92). Se registra aparte; no forma parte de las seis operaciones clínicas.

## Pruebas aisladas

| Conjunto | Pruebas aprobadas |
|---|---|
| Contrato clínico | 14 |
| Workspace contractual | 25 |
| Servicios privados | 151 |
| Aplicación | 634 |
| TypeScript | Comprobado |
| Build | Comprobado |

Registro de validación: 07-10-2026, 1:48:17 a. m. (Chile); 2026-10-07T04:48:17.536Z. Las pruebas simuladas se distinguen de transacciones reales.

## Privacidad y evidencia anterior

Stellar conserva identificadores técnicos, permisos, versiones y comprobantes. Neon conserva PDF e imágenes cifrados; las claves permanecen fuera de la base. Leer no crea una transacción.

TrustLeaf puede descifrar para usuarios autorizados. Retirar permisos bloquea accesos posteriores mediante la aplicación; no elimina copias descargadas ni garantiza la veracidad clínica.

Primera ejecución conservada: `f1a575bc-0146-47e1-a192-f259876f3b82`, 6 recibos clínicos. No se atribuyen a esta ejecución nueva.

## Pendientes y alcance

- Restauración real de estado archivado pendiente. Inspeccionar entradas disponibles no la demuestra.
- Revisión de PR, checks del commit final y video se acreditan por separado.
- Sin pantallas clínicas nuevas ni integración clínica Privy. Sólo identidades técnicas y datos sintéticos en Testnet.
- No representa auditoría externa, certificación de seguridad ni atención clínica real.

La financiación de cuentas y cualquier operación adicional real deben quedar registradas por separado del recorrido clínico.
