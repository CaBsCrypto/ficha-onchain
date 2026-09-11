# DoctorRegistry — nueva generación Testnet

Estado al 7 de septiembre de 2026: **desplegado; administrador consultado en Testnet y confirmado**. La app todavía utiliza sus identificadores anteriores. El alta, la concesión de permiso y la revocación de una cuenta interna de prueba están comprobadas en red. La emisión contra este nuevo registro sigue pendiente. No se ha realizado una auditoría independiente.

## Identidad y evidencia

| Dato | Valor |
|---|---|
| Red | Stellar Testnet; únicamente XLM de prueba |
| Contrato | `CBIBRPVCPIT2IZP35JRMB44URLXGFBYXBHR46HRZKUHJL4AEOLGVEAEK` |
| Creador y administrador inicial | `GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO` |
| WASM SHA-256 | `e5219533028cb9b4e6bc9734babb1a60b296300a9e68b955ee232465755248fb` |
| Transacción de despliegue | `bba4e233953a61ec8fc3b8f7e1a503ce84f5e0404c177a6aa42e7186a7a4dfb8` |
| Custodia | Stellar CLI, almacén seguro de Windows; respaldo independiente pendiente |

[Contrato en Stellar Expert](https://stellar.expert/explorer/testnet/contract/CBIBRPVCPIT2IZP35JRMB44URLXGFBYXBHR46HRZKUHJL4AEOLGVEAEK) · [Transacción de despliegue](https://stellar.expert/explorer/testnet/tx/bba4e233953a61ec8fc3b8f7e1a503ce84f5e0404c177a6aa42e7186a7a4dfb8)

La evidencia procede de Stellar CLI y la consulta RPC, no de una inspección del explorador. Manifiesto público: `docs/evidence/testnet-generation-2026-09-07/doctor-registry-preparation.json`. Fuente: `contracts/doctor-registry/src/lib.rs`. Los cambios locales aún no tienen un commit de entrega; el hash del WASM identifica el binario desplegado.

## Qué certifica y qué no

TrustLeaf verifica la identidad y licencia profesional fuera de la cadena. Su administrador firma el registro de la cuenta del médico. El contrato acredita esa autorización de TrustLeaf; no consulta automáticamente un registro profesional ni convierte un usuario de prueba en un médico real.

El registro guarda públicamente cuenta, nombre, identificador de licencia y autorización. No contiene una imagen ni un NFT del médico. Una credencial visual puede consultar estos datos y mostrar el contrato, la cuenta y el estado vigente; su imagen no sustituye esa comprobación. No introducir datos de pacientes en estos campos.

## Funciones y autorización

| Función | Quién puede ejecutarla | Efecto |
|---|---|---|
| `__constructor(admin)` | Despliegue | Asigna el administrador de forma atómica |
| `init(admin)` | Compatibilidad histórica | Rechaza la reinicialización de la instancia ya construida |
| `register_doctor(wallet, full_name, license_id)` | Administrador con autorización Soroban | Registra o actualiza al médico; también vuelve a autorizar uno revocado |
| `revoke_doctor(wallet)` | Administrador | Desautoriza, conserva el registro y la lista de permisos |
| `grant_permission(wallet, permission)` | Administrador | Concede un permiso a un médico registrado y actualmente autorizado |
| `revoke_permission(wallet, permission)` | Administrador | Retira un permiso; repetir la retirada no añade efectos |
| `transfer_admin(new_admin)` | Administrador actual | Transfiere inmediatamente el control |
| `get_admin`, `get_doctor`, `is_authorized` | Consulta pública | Devuelven configuración y estado |
| `has_permission` | Consulta pública | Devuelve falso para cuentas desconocidas o médicos revocados |
| `get_permissions` | Consulta pública | Devuelve la lista almacenada, incluso después de revocar al médico |

## Controles y límites de seguridad

- El administrador queda fijado dentro del despliegue, sin una segunda transacción de inicialización abierta.
- Las operaciones administrativas exigen la autorización de la cuenta almacenada. El relayer que paga comisiones no adquiere ese rol.
- La revocación invalida las consultas efectivas de permisos. La lista histórica no debe interpretarse como autorización vigente.
- Registrar nuevamente al médico reactiva sus permisos conservados: es el comportamiento actual y debe aparecer en el panel administrativo.
- La transferencia administrativa es de un paso; no hay aceptación del destinatario ni recuperación incorporada. Verificar la cuenta receptora antes de transferir.
- No hay actualización de WASM, pausa global, paginación, ni mantenimiento explícito de TTL en este contrato. La operación debe contemplar vigencia/restauración de almacenamiento y límites de recursos.
- Los permisos son símbolos extensibles; su significado debe acordarse con los contratos consumidores. Prescription consulta autorización general, no exige actualmente un permiso especializado.
- Las pruebas automatizadas son evidencia funcional, no certificación de seguridad ni cumplimiento sanitario. OpenZeppelin MCP se consultó como referencia; este registro no es un contrato generado ni auditado por OpenZeppelin.

## Validación realizada

| Comprobación | Resultado |
|---|---|
| Unitarias de DoctorRegistry | 14 aprobadas |
| Unitarias de Prescription con constructor nuevo del Registry | 20 aprobadas |
| Integración local Registry → Prescription | 3 aprobadas |
| Compilación `stellar contract build`, objetivo `wasm32v1-none` | Correcta; WASM optimizado de 6513 bytes |
| Despliegue en Testnet | CLI confirmó éxito de instalación y despliegue |
| `get_admin` con `--send no` | Coincide con la nueva cuenta |
| Registro, permiso y revocación de cuenta interna de prueba | Tres transacciones SUCCESS confirmadas por RPC y estado posterior consultado |
| Emisión por médico mediante relayer contra la nueva instancia | Pendiente |
| Aprobación desde panel de TrustLeaf → registro on-chain | Pendiente de integración |

Comandos reproducibles desde la raíz del proyecto:

```powershell
cargo test --offline --locked --manifest-path contracts/Cargo.toml -p doctor-registry --lib
cargo test --offline --locked --manifest-path contracts/Cargo.toml -p prescription-soulbound --lib
cargo test --offline --locked --manifest-path contracts/Cargo.toml -p trustleaf-e2e --test e2e
stellar contract build --manifest-path contracts/Cargo.toml --package doctor-registry --locked
stellar contract invoke --id CBIBRPVCPIT2IZP35JRMB44URLXGFBYXBHR46HRZKUHJL4AEOLGVEAEK --source-account GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO --network testnet --send no -- get_admin
```

Las suites históricas de auditoría no forman parte de esta ejecución; no se atribuyen sus resultados a esta versión.

## Siguiente despliegue: Prescription

1. Compilar y registrar el hash del WASM definitivo. Conservar los cambios locales anteriores y su procedencia.
2. Pasar esta nueva dirección como `doctor_registry` y la nueva cuenta como `admin`.
3. Resolver `dispensary_registry`: el constructor exige una dirección y la dispensación consulta su autorización. No usar la cuenta administradora como sustituto de un contrato de farmacias. Si se necesita dispensación completa, desplegar y validar esa dependencia; los cuatro contratos del SOW por sí solos no la proporcionan.
4. Registrar una identidad explícitamente de prueba con la firma administrativa; comprobar alta, permiso, revocación y estado efectivo.
5. Emitir con autorización del médico y relayer separado; comprobar destinatario, integridad, reintentos, activación y revocación. Guardar hashes y resultados por cada transacción.
6. Integrar la aprobación administrativa con confirmación on-chain y la cuenta del médico autenticado. Cambiar configuración únicamente cuando ambas piezas estén verificadas; conservar los IDs históricos para consultas.
7. Documentar los datos realmente públicos de Prescription: medicamento, dosis, cantidades y wallets además del hash. El diseño actual no permite afirmar «solo hashes» ni usar información clínica real como prueba.

La aceptación del flujo completo requiere evidencia del panel hasta la consulta verificable del paciente. El despliegue del Registry, por sí solo, no completa esa aceptación.

## Evidencia de uso real en Testnet

Se ejecutaron tres transacciones firmadas por la nueva cuenta administradora. No se utilizó información de un profesional real.

| Operación | Transacción | Ledger confirmado | Consulta posterior |
|---|---|---|---|
| Alta de médico de prueba | [Registro](https://stellar.expert/explorer/testnet/tx/b4b39cb5e9e0afb8cb042091eef92d101a1042bd005b07bb3a70ae8266f71de1) | 4546507 | `get_doctor.authorized=true` |
| Conceder permiso | [Permiso](https://stellar.expert/explorer/testnet/tx/2dba4001a1c9bd50c296b252c74887b555a2c7cc5cf0f31da3657d0ac9e75549) | 4546514 | `has_permission(CANNABIS)=true` |
| Revocar médico | [Revocación](https://stellar.expert/explorer/testnet/tx/d48dc56775514e545f328b43d72dc9ccb15ee43c108a8d539445cf7370ab1ff5) | 4546520 | `authorized=false`, `has_permission=false`; lista histórica `[CANNABIS]` |

Los tres recibos `getTransaction` reportaron `SUCCESS`. Se conservaron íntegros, junto con las observaciones de las consultas, en [doctor-registry-usage.json](../../evidence/testnet-generation-2026-09-07/doctor-registry-usage.json). Las consultas no se presentan como nuevas transacciones: se ejecutaron con `--send no`. El médico quedó **revocado** al terminar; deberá autorizarse nuevamente para una futura prueba de emisión.

Esta evidencia valida el recorrido indicado, no todas las funciones ni la seguridad completa del contrato. No se transfirió el administrador y no se emitieron recetas.

## Tres altas adicionales para la entrega SOW

Se registraron y verificaron tres identidades de prueba adicionales, todas autorizadas al consultar. Ver [entrega de tres médicos en Testnet](SOW_TRES_MEDICOS_TESTNET.md), con transacciones, ledgers y recibos. La cuenta usada anteriormente para revocación sigue revocada.
