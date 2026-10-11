# SOW 2 · Semana 2 · Guía de validación

Esta guía prepara comprobaciones; los resultados están en [QA-SEMANA-2.md](QA-SEMANA-2.md). Las pantallas ya están integradas en `codex/sow2-sprint-2`. Registrar el commit realmente validado; esta guía no es luz verde para grabar.

## 1. Entorno preparado

- Aplicación: [127.0.0.1:3016/patient?tab=historial](http://127.0.0.1:3016/patient?tab=historial), con escrituras apagadas.
- Revisión visual: [127.0.0.1:3017](http://127.0.0.1:3017/). Usa componentes reales con respuestas simuladas, sin firmas ni conexión a Neon. No acredita persistencia ni transacciones.
- Neon dev, esquema clínico aplicado, clave web nueva y recuperación local comprobada. No trasladar claves de semana 1 ni considerar portable el respaldo DPAPI local.

Conservar semana 1, usar puerto propio y comprobar Privy, Testnet, contratos, autoridad y conexión efectiva. Si faltan claves o configuración, el módulo debe rechazar el acceso, sin fallback.

No repetir migraciones salvo cambio o ausencia del esquema. Sólo en ese caso, con `TRUSTLEAF_CLINICAL_MIGRATION=true` y `DATABASE_URL` dev comprobada:

```powershell
node scripts/migrate.mjs --step=clinical-history-v1
node scripts/migrate.mjs --step=clinical-web-v1
```

El segundo paso depende del primero. El guard sólo admite `ep-lingering-water-ahzh89z5`; otra base detiene la preparación. El script lee `DATABASE_URL`, no la conexión alternativa de la aplicación. No ejecutar la migración general ni editar main para validar.

## 2. Pruebas por commit

```powershell
npm test
npm run test:private
cargo test --locked --manifest-path contracts/Cargo.toml
npx tsc --noEmit
npm run build
```

Cubrir acceso cruzado, cambio de sesión, claves ausentes, formatos y límites, archivos alterados, correcciones ajenas, revocación durante lectura, doble clic, cancelación, respuesta incierta y recuperación tras recargar. Simular fallos localmente, nunca contra main. Con escrituras apagadas no se preparan ni transmiten operaciones.

La comprobación SQL requiere `TRUSTLEAF_CLINICAL_DB_TEST=true` y `node scripts/validate-clinical-web-schema.mjs --rollback`. Sólo usa fixtures nuevos dentro de transacciones revertidas; no aplica esquema ni llama a Stellar. Exigir reporte saneado y cero filas restantes. Un timeout o una desconexión no aprueban exclusividad ni limpieza.

Con `--rollback --concurrency`, el mismo validador comprueba el bloqueo entre dos conexiones reales y la continuación después de liberar el bloqueo. Ambas revierten sus fixtures. Este ensayo no confirma filas y no acredita conflicto después de COMMIT. Los informes existentes ya registran 62 controles SQL y 5 escenarios concurrentes; no repetirlos salvo cambios relevantes.

Conservar commit, comando, fecha y resultado. Los mocks no acreditan firmas reales de Privy ni Stellar. No reutilizar cifras de semana 1 para aprobar esta versión.

### Ensayo del recorrido mediante script

```powershell
node scripts/validate-clinical-web-flows.mjs --isolated
```

El script reúne las suites clínicas pertinentes, un escenario encadenado con estado compartido y las pruebas del contrato clínico en un host local. El recorrido conecta crear/confirmar historia, agregar, leer, corregir conservando versiones y conceder/retirar permisos. Usa módulos de aplicación, cifrado, sobres y firmas Ed25519 locales; SQL, Privy y RPC emplean adaptadores controlados.

No carga la configuración real `.env.local` ni usa credenciales de aplicación heredadas en sus procesos hijos. Vitest se ejecuta con `envDir: false`. No llama a Neon real ni genera transacciones de Testnet. Guarda un reporte saneado en `.trustleaf-local/sow2-validation/`, con commit, SHA de los archivos ejecutados, cifras y límites. Exige las 14 suites solicitadas, el escenario encadenado y las pruebas privadas y contractuales; rechaza fuentes modificadas sin commit o cualquier grupo fallido.

Este ensayo comprueba la integración aislada entre módulos. La sesión auténtica, persistencia después de reiniciar la base, recibos nuevos y presentación en navegador se acreditan por separado. `validate-clinical-testnet.mjs --readback` corresponde a la ejecución técnica de semana 1 y no reemplaza el recorrido web de semana 2.

Para el ensayo **real por API y Privy**, usar [ENSAYO-API-TESTNET-SEMANA-2.md](ENSAYO-API-TESTNET-SEMANA-2.md). Incluye acompañante local de autenticación, inspección sin nuevas transacciones, ocho pasos sintéticos y recuperación del mismo intento. La preparación del script no acredita su ejecución ni habilita escrituras.

## 3. Recorrido autenticado sintético

Primero ingresar y comprobar lectura con escrituras apagadas. Antes de las operaciones reales, comprobar configuración aislada, claves, saldo y ausencia de intentos inciertos. Habilitar escrituras sólo para la prueba acordada. Una wallet sin saldo requiere preparación explícita; no se financia automáticamente. El usuario introduce los códigos únicamente en Privy.

Elegir un único entorno de escritura para la misma wallet, contrato y red. La historia de cadena no se duplica al cambiar Neon: sin su índice local y contenido cifrado, otra base no permite continuarla. Usar una identidad sintética independiente o una transferencia coherente expresamente autorizada; no recrear ni adoptar la historia automáticamente.

| Paso | Resultado esperado | Evidencia |
| --- | --- | --- |
| Entrar como paciente | DID y wallet correctos; sin datos de otra sesión | Observación autenticada y commit |
| Crear historial | Firma expresa; confirmación del contrato existente | Recibo de `create_history` |
| Agregar antecedente | Contenido privado; confirmado sólo tras verificación | `append_version` y lectura |
| Agregar PDF, PNG y JPEG | Archivos legibles de hasta 3.000.000 bytes | Recibos; rechazos de límites en pruebas locales |
| Consultar y descargar | Versión, autor e integridad comprobados | Lectura real y comparación del archivo sintético |
| Corregir aporte propio | Versión nueva conserva la anterior; no edita otro autor | Recibo y lectura de ambas versiones |
| Cambiar lectura/agregado | Independientes; preparar no cambia el permiso confirmado | `set_permissions` y lectura posterior |
| Retirar permisos | Retiro completo permitido aunque la autorización médica expiró | Recibo y estado; acceso médico real se registra al existir su recorrido |
| Recargar y cambiar cuenta | Mismo historial/intento; desaparecen datos anteriores | Observación autenticada |

El contenido, descargas y presentación se manejan fuera de blockchain. Crear historial, agregar versión y cambiar permisos sí generan operaciones de Stellar. Auditar actor, contrato, método, argumentos y recibo; un enlace o aviso verde no bastan.

Cancelar antes de firmar deja un intento cancelado. Si ya hay sobre firmado, consultar y reconciliar el mismo intento; no reemplazarlo. Reintentar requiere confirmación y retransmite el mismo sobre. Los comprobantes históricos se verifican contra el sobre persistido y la operación registrada en el contrato; un hash aislado no acredita éxito.

Si el historial está archivado por TTL, detener las escrituras y conservar los intentos para inspección/restauración explícita. Si RPC devuelve NOT_FOUND fuera de su retención, el intento sigue incierto y bloquea nuevas operaciones de esa wallet. No volver a firmarlo ni declararlo fallido por ausencia del recibo; contrastar el sobre y el comprobante contractual mediante un procedimiento revisado.

## 4. Presentación

Revisar escritorio, anchos efectivos **360/390/430 px**, teclado, foco visible y texto al 200 %. Comprobar títulos largos, versiones, formularios, carga, errores y revisión previa. Abrir/cerrar durante carga debe descartar respuestas tardías.

En el visor simulado, los enlaces de navegación y recibos están identificados como fixtures. La fecha “comprobado” pertenece a la respuesta simulada; no equivale a consulta real de Stellar. Registrar esas observaciones separadamente.

Ocultar códigos, tokens, claves, conexiones y cuentas ajenas. Sólo datos sintéticos. Mantener separados automatización, visualización simulada, lectura autenticada y transacciones reales.

## 5. Preview y grabación

La configuración del preview requiere **autorización específica** para base aislada, claves web nuevas y control de escritura. Las autorizaciones de previews anteriores no cubren este sprint. El guard de migración actual sólo permite Neon dev; otro entorno requiere procedimiento revisado, sin eludir el guard.

Formato de registro: **ID · commit · entorno · fecha · tipo · esperado · observado · evidencia · estado**.

Lista para grabar exige recorrido autenticado, recibos, persistencia, presentación y ausencia de operaciones inciertas. Mantener la PR principal en borrador hasta completar los pendientes correspondientes. La aceptación del revisor va aparte.

Narración sugerida para semana 2: explicar primero el control del paciente y la separación entre archivos privados y comprobantes en Testnet; mostrar un aporte, su descarga y corrección; después lectura/agregado independientes y su retiro; cerrar con recarga, recibos y límites. Mostrar cada firma y confirmación real, distinguiendo las acciones sin transacción. No narrar el visor simulado como recorrido ejecutado.

Semana 1 se conserva: [recorrido de grabación](GRABACION-SEMANA-1.md), [guion](GUION-NARRADO-SEMANA-1.md). No volver a firmar sus operaciones para preparar esta revisión.
