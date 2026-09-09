# Semana 2 · Autorización del médico desde el portal

Estado al **9 de septiembre de 2026**: autorización real confirmada desde el
panel local del administrador, con expediente sintético cifrado y recibo de
Stellar Testnet. Falta comprobar la pantalla del médico con su propia sesión.
Este bloque no acredita todavía el recorrido completo del SOW semana 2.

## Entorno e identidades

- Aplicación Privy: **ficha-onchain**, `cmrix722m03d30clewd1fuffq`.
- Administrador: `cabscryptocontacto@gmail.com`, acceso por Privy y lista
  `ADMIN_EMAILS`. Su wallet de acceso no sustituye al firmante del contrato.
- Médico sintético: `dgtlmoney8@gmail.com`, perfil **10**, creado desde
  `/admin/doctors` como «Médico de prueba TrustLeaf».
- Registro: `DoctorRegistryPrivate`,
  `CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2`.
- Autoridad contractual:
  `GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO`, conservada en el
  almacén seguro local con alias `trustleaf-testnet-admin-20260907`.
- Base: Neon dev `ep-lingering-water-ahzh89z5`; únicamente datos sintéticos.
  El worker rechaza otras ramas. No se habilitó preview ni sitio principal.

## Configuración y operación

Completar en `.env.local` las variables descritas en `.env.example`: ambos IDs de
Privy, secreto de esa aplicación, `ADMIN_EMAILS`, `DATABASE_URL`, registro privado,
clave pública y alias administrativo, `STELLAR_CONFIG_DIR`, `TRUSTLEAF_DATA_KEY`
y `RELAYER_SECRET`. Activar `TRUSTLEAF_PRIVATE_PORTAL_ENABLED=true` únicamente en
este entorno local validado. Reiniciar el servidor cuando cambie su entorno.
La clave de cifrado existente debe conservarse para recuperar los expedientes.

El administrador abre `/admin/doctors`, selecciona al médico y revisa el
expediente sintético y su wallet. Marca la confirmación explícita y solicita la
autorización, renovación o revocación. El servidor decide los argumentos a partir
de identidades verificadas; el navegador no puede elegir contrato, wallet o XDR.
La solicitud permanece **pendiente** mientras el worker está apagado.

Desde la raíz del repositorio, una pasada del worker procesa o reconcilia una
solicitud. Estos comandos **escriben en Neon dev y pueden transmitir a Testnet**:

```powershell
node --env-file=.env.local scripts/worker-doctor-authorizations.mjs --once
```

Una primera pasada puede dejar la transacción enviada; ejecutar otra consulta
del mismo intento permite confirmar su recibo. Para procesamiento continuo:

```powershell
node --env-file=.env.local scripts/worker-doctor-authorizations.mjs --watch
```

`--watch` revisa la cola cada tres segundos. Se detiene con `Ctrl+C`. Mantener
un único proceso operativo por autoridad, sin otras sesiones o ensayos que
transmitan con esa cuenta. El bloqueo local y el bloqueo de base de datos
serializan el trabajo; `busy` indica que otra ejecución tiene la autoridad.
La cola conserva su estado cuando el proceso se detiene.

El worker verifica identidad, registro, versión y expediente, firma mediante el
almacén seguro y aplica el pago de comisiones del relayer. Guarda el sobre firmado
y su hash **antes** de transmitir. Ante interrupciones o respuestas inciertas,
reconcilia ese mismo hash; no se deben limpiar manualmente sobres, hashes ni
solicitudes para forzar una repetición. Una solicitud fallida no se presenta como
aprobada. Resolver su causa y consultar el estado antes de crear otra.

## Evidencia observada

1. El administrador creó el perfil sintético desde la interfaz y solicitó la
   autorización con el worker apagado. La página mostró **pendiente**.
2. La solicitud persistente fue `835deb56-195d-4d06-9750-6b8f51ae7009`.
3. Una ejecución `--once` transmitió; otra ejecución separada confirmó el mismo
   intento. El panel mostró **Autorizado** a partir del recibo confirmado.
4. El registro confirmó vigencia hasta **2026-10-09T07:17:00Z**. La interfaz
   presenta esa fecha en la zona horaria del navegador.

Recibo de `authorize_doctor`:
[transacción confirmada en Stellar Testnet](https://stellar.expert/explorer/testnet/tx/73d76a60169f36962e986c8d52ba9b433166193b447d62d2d1ca24b1cf7510de).

Respaldo de esta ejecución: [solicitud con worker apagado](../evidence/week2-admin-authorization-2026-09-09/worker-off.json),
[recibo y verificaciones de integridad](../evidence/week2-admin-authorization-2026-09-09/authorization-receipt.json)
y [resultados con hashes de las fuentes](../evidence/week2-admin-authorization-2026-09-09/validation.json).
Tras confirmar el recibo se dejó el worker local en modo `--watch` para procesar
las siguientes solicitudes explícitas del panel.

La comprobación del portal `/doctor` bajo la sesión propia de
`dgtlmoney8@gmail.com` queda **pendiente de completar el ingreso en Privy**.
El código consulta el registro privado, muestra estados pendiente, vencido,
revocado o pausado y bloquea el acceso si no puede verificar la autorización.
La emisión antigua permanece deshabilitada aunque el médico esté autorizado.

## Comprobaciones de este bloque

| Comprobación | Resultado |
|---|---|
| Pruebas de aplicación | **247 aprobadas**, 28 archivos |
| Pruebas de workers | **26 aprobadas**: 17 de autorización y 9 de reservas |
| Contrato `doctor-registry-private` | **4 pruebas aprobadas** |
| TypeScript | Sin errores; comprobado también durante el build |
| Build de la aplicación | Aprobado; requirió acceso a la red para las fuentes |
| Panel administrativo y autorización Testnet | Confirmados mediante el recorrido anterior |
| Portal del médico con su propia sesión | Pendiente de completar el ingreso |

Las pruebas cubren autorización por rol, cambios de wallet, vigencia, selección
del método contractual, duplicados, sobres persistidos, recuperación de intentos,
fallos de RPC y bloqueo del firmante. Las pruebas automatizadas de renovación y
revocación no equivalen a nuevos recibos publicados de esas acciones. Estos
resultados pertenecen a este bloque; no reutilizan los totales de semana 1.

Para repetir las comprobaciones sin transmitir transacciones:

```powershell
npm test
node --test scripts/worker-doctor-authorizations.test.mjs scripts/worker-prescription-bookings.test.mjs
cargo test --manifest-path contracts/Cargo.toml --locked -p doctor-registry-private --lib
npx tsc --noEmit
npm run build
```

## Pendiente para cerrar semana 2

Completar la verificación del médico y conectar reserva, asistencia, consentimiento
separado, emisión, activación, lectura privada y revocación desde los portales.
Después corresponde validar un preview con base aislada y dos consultas
sintéticas: una receta activa y otra revocada. Faltan el despliegue de la
aplicación de prueba, el video de ambos recorridos y la revisión formal.

Este documento es un registro operativo del bloque local. Los módulos históricos
que aún aparecen en la configuración no forman parte de esta validación ni
acreditan una migración completa de los portales.
