# Semana 2 · Operación y validación de los portales

Guía técnica al **9 de septiembre de 2026** para preparar el SOW «Interface:
Doctor and Patient». Describe la implementación y las verificaciones pendientes.
**No acredita todavía una demostración completa en navegador, un despliegue
validado ni el video final de semana 2.** Todos los entornos usan Stellar Testnet
y datos sintéticos.

## Alcance y configuración

Los portales conservan dos contratos de semana 1:

| Contrato | Función | ID y explorador |
| --- | --- | --- |
| DoctorRegistryPrivate | Autorización administrativa, vigencia, renovación y revocación del médico. | [CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2](https://stellar.expert/explorer/testnet/contract/CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2) |
| PrescriptionPrivate v2 | Reserva acreditada, consentimiento por emisión, registro, activación y revocación de recetas. | [CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE](https://stellar.expert/explorer/testnet/contract/CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE) |

La aplicación Privy es **ficha-onchain**, `cmrix722m03d30clewd1fuffq`. La
[plantilla pública de configuración](../../config/testnet-config.example.txt)
enumera los valores necesarios sin credenciales. No se carga automáticamente:
los secretos se completan únicamente en el entorno privado correspondiente.

Cada persona usa una asociación persistente entre su usuario Privy, una wallet
Stellar nativa y su dirección. Cambios o asociaciones ambiguas bloquean las
operaciones. Ethereum y Solana tienen la creación automática desactivada. El
usuario confirma cada acción dentro de TrustLeaf; su sesión autoriza la firma
con su propia wallet y el servidor verifica la firma. No se concede al
administrador un permiso permanente para firmar consentimientos o recetas.

El relayer paga las comisiones mediante sobres de pago de comisión. El
aprovisionamiento automático de una cuenta de Testnet es una operación distinta:
no sustituye la firma del usuario ni el pago del relayer.

| Entorno | Configuración | Base y worker |
| --- | --- | --- |
| Local | `TRUSTLEAF_ENV=local` | Neon dev `ep-lingering-water-ahzh89z5`, con el hostname pooled de la plantilla; servidor y worker locales. |
| Preview | `TRUSTLEAF_ENV=preview` | Rama Neon exclusiva para el preview, diferente de dev y de la base histórica de producción; worker local conectado a esa misma base. |
| Sitio principal de pruebas | `TRUSTLEAF_ENV=test` | Otra rama Neon dedicada a datos sintéticos; worker local conectado únicamente a esta base durante su validación. |

`TRUSTLEAF_DB_HOST` debe coincidir exactamente con el hostname de
`DATABASE_URL`. El servidor comprueba también el entorno de Vercel, los dos
contratos, la aplicación Privy y las autoridades configuradas. El hostname
histórico `ep-rapid-shadow-ahq94785` está excluido. Crear las ramas de preview y
pruebas con datos de prueba y comprobarlas antes de habilitar escrituras; un
preview no debe heredar la conexión de producción.

La clave de cifrado debe coincidir entre servidor y worker de un mismo entorno
y conservarse mientras existan sus documentos cifrados. La clave de la autoridad
administrativa permanece en el almacén seguro de este equipo. Solo el worker
local necesita su alias y `STELLAR_CONFIG_DIR`; no se exporta esa clave a Vercel.

## Arranque y pausa de escrituras

El valor inicial es **`TRUSTLEAF_PRIVATE_WRITES_ENABLED=false`**. Este control
pausa nuevas acciones de negocio y nuevos envíos a cadena. Las consultas y la
reconciliación de recibos ya enviados siguen disponibles; la preparación del
entorno, las migraciones y la asociación de identidad son tareas separadas.
Los módulos retirados permanecen bloqueados con cualquiera de los dos valores.
El antiguo `TRUSTLEAF_PRIVATE_PORTAL_ENABLED` no debe usarse para habilitar el
flujo ni para volver a contratos anteriores.

Desde la raíz del repositorio, instalar las dependencias de la versión que se
va a validar:

```powershell
npm ci
```

Completar la configuración privada y comprobar el destino **antes** de migrar.
Este comando valida la configuración del worker y muestra solo entorno y host;
no consulta la base ni envía transacciones:

```powershell
node --env-file=.env.local --input-type=module -e "import {workerConfiguration} from './scripts/lib/private-worker-runtime.mjs'; const c=workerConfiguration(process.env); console.log(c.environment, c.host)"
```

Aplicar el esquema en la base de pruebas seleccionada. Este comando **modifica
la base**, no transmite transacciones. El script de migración usa la conexión
recibida; la comprobación previa del destino es obligatoria en este procedimiento.

```powershell
node --env-file=.env.local scripts/migrate.mjs
```

Las migraciones conservan los datos históricos y añaden las asociaciones de
participantes, asistencia, inicio de consulta, historial de intentos y
operaciones persistentes. No convierten automáticamente las reservas antiguas
en reservas habilitadas para el nuevo flujo. El script y la ruta administrativa
mantienen definiciones equivalentes; esta última exige sesión Privy del
administrador, mismo origen y confirmación explícita.

Iniciar la aplicación local y abrir `/admin/doctors`, `/doctor` o `/patient`:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3002
```

Para comenzar la prueba autorizada, cambiar el control de escrituras a `true`
en el servidor y en el worker del mismo entorno y reiniciar ambos. En Vercel,
aplicar la configuración al despliegue correspondiente. Modificar un archivo
local no cambia las variables de un proceso que ya está ejecutándose.

El worker unificado procesa autorizaciones administrativas y reservas:

```powershell
node --env-file=.env.local scripts/worker-private-portal.mjs --watch
```

Para una sola pasada, usar `--once` en lugar de `--watch`. **Con escrituras
habilitadas, estos comandos modifican la base y pueden enviar transacciones a
Testnet.** Una pasada puede dejar un recibo pendiente; las siguientes consultan
el mismo intento. `Ctrl+C` detiene el procesamiento conservando la cola.

Para preview o sitio principal de pruebas, usar un archivo privado separado con
la conexión de ese entorno al ejecutar el worker, por ejemplo
`--env-file=.env.preview.local`. Ese archivo no configura automáticamente el
servidor desplegado: sus variables deben coincidir con las de Vercel.

Mantener **un solo worker por autoridad**, usando el mismo directorio del
almacén seguro. No ejecutar simultáneamente workers independientes de
autorizaciones, reservas o ensayos que firmen con esa cuenta. El bloqueo local
protege la autoridad entre bases y el bloqueo de base serializa cada entorno.
`busy` requiere comprobar qué proceso sigue operativo, no borrar su bloqueo.

Antes de cambiar de preview al sitio principal: pausar nuevas escrituras en el
entorno anterior, reconciliar sus intentos enviados, detener su worker y
arrancar el worker contra la base nueva. Si quedan transacciones de resultado
desconocido, resolverlas antes de liberar esa autoridad para otro entorno.

Ante un incidente, establecer el control de escrituras en `false` y reiniciar
los procesos afectados. Conservar la consulta de estado y los sobres firmados.
No reactivar las rutas históricas como alternativa.

## Recorrido de aceptación: dos consultas independientes

Usar tres sesiones distintas: administrador `cabscryptocontacto@gmail.com`,
médico `dgtlmoney8@gmail.com` y paciente `brownsstudiocontact@gmail.com`. Los
códigos de acceso se introducen exclusivamente en Privy. No entregar a los
revisores credenciales ni secretos; la revisión prevista es una demostración
guiada.

1. **Administrador.** Revisar el perfil sintético y la wallet del médico en
   `/admin/doctors`. Solicitar autorización o renovación según el estado real
   del registro. Con el worker apagado debe verse pendiente; encenderlo y
   esperar el recibo antes de considerar autorizado al médico. La wallet Privy
   identifica al aprobador; la autoridad del contrato firma desde el almacén
   seguro local.
2. **Médico.** Entrar en `/doctor` con su propia sesión y verificar la
   autorización. Configurar disponibilidad para las consultas sintéticas. Las
   escrituras se rechazan ante autorización vencida, revocada o no verificable.
3. **Paciente.** Entrar en `/patient` y reservar un horario disponible. La
   agenda usa `America/Santiago`; no acepta participantes ni wallets elegidos
   arbitrariamente por el navegador.
4. **Consulta.** El paciente confirma asistencia y el médico inicia la
   consulta. Son acciones independientes; pueden realizarse en cualquier orden.
   Solo cuando ambas identidades quedan verificadas se solicita la acreditación
   de la reserva. El worker debe confirmar su recibo. La ventana operativa de
   esa emisión es de 30 minutos desde la preparación de la reserva.
5. **Consentimiento separado.** Con la consulta iniciada y la reserva
   acreditada, el paciente revisa médico, alcance y vencimiento y confirma la
   autorización para **una emisión** con su firma Privy. Confirmar asistencia
   no concede este permiso. No reutilizar una reserva consumida para otra receta.
6. **Emisión.** El médico redacta el documento sintético, revisa el paciente y
   confirma. El documento se almacena cifrado antes de enviar la operación. La
   interfaz muestra pendiente hasta verificar el recibo, el compromiso y el
   destinatario; entonces muestra `Registered`, pendiente de activación.
7. **Activación y lectura.** El médico confirma otra acción y firma para
   activar la receta. El paciente abre el documento desde su portal y ve el
   estado `Active`. El emisor también puede recuperarlo con su sesión.
8. **Segunda consulta.** Crear otra reserva y repetir asistencia, inicio,
   acreditación, consentimiento, emisión y activación. Revocar esta segunda
   receta desde el portal del emisor y comprobar `Revoked` en ambos portales.
   La primera permanece activa y la segunda conserva su historial.

La interfaz presenta la activación al médico; el contrato también admite la
activación por el paciente. La vigencia se muestra separada del estado
contractual. Una respuesta tardía, error de Privy o fallo del RPC no equivale a
una confirmación.

## Cancelación, permisos y recuperación

| Situación | Resultado que debe verificarse |
| --- | --- |
| Retirar consentimiento antes de emitir | El paciente confirma la retirada con su propia firma; el permiso deja de habilitar una emisión. |
| Cancelar sin reserva acreditada ni intento enviado | La aplicación puede confirmar la cancelación sin afirmar que existió una revocación en cadena. |
| Cancelar una reserva con acreditación preparada o enviada | Se muestra cancelación pendiente; el worker reconcilia el intento y, cuando corresponde, confirma la revocación antes de cerrar la reserva. |
| Emisión que consume la reserva durante una cancelación | Se conserva el recibo y el estado emitido; la cancelación no borra una receta ni puede afirmar que la emisión no ocurrió. |
| Doble clic, recarga o reinicio | Se recupera la operación persistida y su hash; no se prepara otra emisión con la misma reserva. |
| Firma pendiente que vence antes de enviarse | El intento sin sobre firmado puede cerrarse como vencido y solicitar una nueva confirmación válida. |
| Sobre firmado con resultado desconocido | Se consulta el mismo hash; no se eliminan sobres, hashes ni historial para forzar otro intento. |
| Wallet cambiada, sesión ajena o RPC no verificable | Se bloquea la operación y se presenta un error recuperable, sin éxito simulado. |

El servidor prepara contrato, método y argumentos desde los registros
verificados. No ofrece una API genérica para firmar XDR o hashes proporcionados
por el cliente. Las operaciones pendientes protegen la secuencia de la wallet
y las reservas frente a concurrencia.

Los documentos clínicos permanecen cifrados fuera de cadena. En Testnet son
públicos los participantes por dirección, métodos, compromisos, identificadores,
vencimientos y estados de las transacciones. Cifrar el documento no oculta esos
metadatos. La lectura del documento exige ser paciente o médico emisor; el rol
administrador no concede acceso clínico general.

Ficha clínica, licencias, dispensación, MCP y otras rutas anteriores permanecen
fuera del flujo activo, incluidos accesos directos. Sus datos históricos se
preservan.

## Comprobaciones y evidencia nueva

Antes de publicar la versión candidata, ejecutar y guardar los resultados de
esa versión, con fecha y commit. Estos comandos de pruebas no constituyen por
sí mismos una validación en navegador ni recibos de transacciones reales:

```powershell
npm test
npm run test:private
npx tsc --noEmit --incremental false
npm run build
cargo test --manifest-path contracts/Cargo.toml --locked -p doctor-registry-private -p prescription-private --lib
```

La comprobación específica de equivalencia de migraciones es offline:

```powershell
npx vitest run src/__tests__/schema-parity.test.ts
```

Debe cubrir tablas y columnas, las restricciones e índices de operaciones
privadas, los snapshots de participantes, el historial firmado y la protección
de reservas. Esta comparación no demuestra que una base remota ya esté migrada;
registrar por separado la aplicación de las migraciones en cada entorno.

La aceptación del preview debe incluir identidades ajenas, médico sin permiso,
consentimiento rechazado o vencido, reserva cancelada, doble clic, cancelación
concurrente, caída de Privy/RPC y reinicio del worker. Verificar también que el
administrador no obtiene documentos clínicos ajenos y que el relay rechaza
contratos, métodos o argumentos fuera de la operación preparada.

Hay antecedentes del 9 de septiembre en
[Autorización del médico](WEEK_2_ADMIN_AUTHORIZATION.md) y
[Estado de la integración Privy](PRIVY_STELLAR_MIGRATION_STATUS.md). Acreditan el
bloque administrativo y las pruebas de firma que describen. **No acreditan esta
versión completa de portales**: sus cifras y hashes no deben presentarse como
resultados nuevos. Las instrucciones operativas de esta guía sustituyen las
del documento administrativo anterior, incluido su antiguo control de entorno
y su worker de una sola cola.

Para cerrar semana 2 todavía debe reunirse:

- URL del despliegue validado, identificada como Testnet y vinculada al commit
  revisado; primero preview y después el sitio principal con base de pruebas.
- Resultados nuevos de las pruebas, TypeScript, build y migraciones de esa
  versión; no reutilizar los totales de semana 1.
- Recibos de autorización, acreditación de ambas reservas, consentimiento,
  emisión, activación y revocación; evidencia de lectura privada y rechazo de
  acceso ajeno. No incluir documentos clínicos ni secretos en logs o capturas.
- Video nuevo de médico y paciente completando sus recorridos desde la
  interfaz, con una receta activa y otra revocada, sin terminal durante el uso.
- Página breve para revisores con alcance, enlace, versión, resultados y video.
  La aceptación formal queda pendiente de su revisión.

Las PR se separan en contratos y servicios, y después portales y retirada de
flujos anteriores. Mantener escrituras deshabilitadas en despliegues no
validados. Este hito sigue siendo una validación técnica con datos sintéticos;
no declara preparación para pacientes reales.
