# RPC clínico de Testnet

El módulo clínico permite elegir explícitamente un proveedor mediante la variable **de servidor** `TRUSTLEAF_CLINICAL_RPC_PROVIDER`:

| Valor | Destino fijo |
| --- | --- |
| Ausente o `sdf` | `https://soroban-testnet.stellar.org` |
| `gateway` | `https://soroban-rpc.testnet.stellar.gateway.fm` |

Ambos figuran en la [lista de proveedores de Stellar](https://developers.stellar.org/docs/data/apis/rpc/providers). Un valor vacío, desconocido o una URL se rechaza. No hay cambio automático de proveedor ni reenvío automático de operaciones.

La elección se aplica al adaptador web de historia, permisos y operaciones y al lector privado de archivos. Conserva las comprobaciones de Testnet, contrato, WASM, autoridad, archivo, identidad, permisos e integridad. Un error no convierte datos anteriores en verificados. La selección no habilita escrituras, financia cuentas, restaura estado ni reemplaza las firmas de Privy.

Para la revisión local, iniciar desde una compilación validada:

```powershell
$env:TRUSTLEAF_CLINICAL_RPC_PROVIDER = 'gateway'
$env:TRUSTLEAF_PRIVATE_WRITES_ENABLED = 'false'
npm run start -- --hostname 127.0.0.1 --port 3016
```

El valor se evalúa en servidor al crear cada adaptador. Reiniciar el proceso al cambiar su configuración. Mantener `NEXT_PUBLIC_SOROBAN_RPC_URL` en su valor histórico SDF: esta opción no cambia los portales anteriores, workers, herramientas de semana 1 ni sus validaciones. No se han configurado secretos o variables de Vercel.

El auditor independiente de recibos conserva SDF por defecto. Para comprobar una operación durante una interrupción de SDF, inyectar explícitamente un `rpc.Server` de Gateway al crear ese auditor y registrar el proveedor utilizado. No ejecutar otra vez el ensayo de ocho operaciones para comprobar disponibilidad.

Antes de una firma nueva: verificar la lectura real, la configuración dev y las colas del paciente y del relayer. Tras firmar, auditar el mismo intento y recibo; ante incertidumbre, conservar su sobre y consultar, sin producir otra firma. Retirar la opción de Gateway o elegir `sdf` no cancela ni borra intentos existentes.
