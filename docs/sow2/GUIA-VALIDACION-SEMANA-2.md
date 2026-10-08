# SOW 2 · Semana 2 · Guía de validación

Esta guía prepara comprobaciones; no es un informe de resultados. Referencia inicial: `12cf461`, con integración de pantallas y QA final pendientes. Registrar el commit realmente validado al ejecutar el recorrido. No usar esta guía como luz verde para grabar.

## 1. Preparar local primero

1. Usar la rama del sprint y un checkout propio; conservar la versión y evidencia de semana 1. Elegir un puerto libre distinto de sus visores locales.
2. Comprobar Testnet, los contratos existentes, Privy y la conexión Neon dev. La aplicación debe usar la misma base que el esquema; no copiar una conexión de producción.
3. Preparar las claves clínicas web nuevas en secretos del servidor, con identificador activo y recuperación prevista. No trasladar las claves DPAPI de las ejecuciones sintéticas.
4. Habilitar el módulo mediante `TRUSTLEAF_CLINICAL_WEB_ENABLED`; mantener `TRUSTLEAF_PRIVATE_WRITES_ENABLED=false` inicialmente. Claves o configuración ausentes deben rechazar el acceso, nunca activar un fallback.
5. Revisar con el coordinador el estado del esquema. Sólo si falta un paso, ejecutar la migración dev correspondiente, con `TRUSTLEAF_CLINICAL_MIGRATION=true` y `DATABASE_URL` dev comprobada:

```powershell
node scripts/migrate.mjs --step=clinical-history-v1
node scripts/migrate.mjs --step=clinical-web-v1
```

El segundo paso depende del primero. El guard sólo admite `ep-lingering-water-ahzh89z5`; una base diferente debe detener la preparación. El script lee `DATABASE_URL`, no la variable alternativa de conexión de la aplicación. No ejecutar migraciones generales ni editar datos de main para estas pruebas.

## 2. Pruebas aisladas por commit

Ejecutar las pruebas afectadas durante el desarrollo y, sobre la entrega integrada, registrar resultados nuevos de:

```powershell
npm test
npm run test:private
cargo test --locked --manifest-path contracts/Cargo.toml
npx tsc --noEmit
npm run build
```

Cubrir acceso cruzado, cambio de sesión, claves ausentes, formatos y límites de archivo, contenido alterado, correcciones ajenas, revocación durante lectura, doble clic, firma cancelada, respuesta incierta y recuperación tras recargar. Simular los fallos localmente; no inducirlos en main. Verificar con escrituras apagadas que no se preparan ni transmiten operaciones nuevas. Una lectura de estado o reconciliación local no equivale a una transmisión.

Conservar commit, comando, fecha y resultado. Los mocks no acreditan una firma real de Privy ni una transacción de Stellar. No reutilizar cifras de semana 1 para declarar aprobada esta versión.

## 3. Recorrido autenticado con datos sintéticos

Comenzar cuando las pantallas estén integradas y el coordinador haya comprobado la configuración aislada, claves, saldo y ausencia de intentos inciertos. Habilitar escrituras únicamente para la prueba real acordada. Los códigos de acceso se introducen sólo en Privy, por el usuario; no se registran en el informe.

| Paso | Resultado que debe comprobarse | Evidencia prevista |
| --- | --- | --- |
| Entrar como paciente | Historial vinculado al DID y wallet comprobados; sin datos de otra sesión | Observación autenticada y versión |
| Crear historial | Firma explícita y confirmación del contrato existente | Recibo de `create_history` |
| Agregar antecedente propio | Contenido privado; espera de firma y estado confirmado sólo tras verificación | Recibo de `append_version` y lectura posterior |
| Agregar PDF, PNG y JPEG | Archivos legibles de hasta 3.000.000 bytes; exceso o formato inválido rechazados sin firmar | Recibos de archivos aceptados; prueba local de rechazos |
| Consultar y descargar | Versión, autor y comprobante correctos; acceso autenticado e integridad antes de entregar contenido | Lectura real y comparación del archivo sintético |
| Corregir aporte propio | Versión nueva conserva la anterior; no habilita edición de otro autor | Recibo y lectura de ambas versiones |
| Cambiar lectura/agregado | Dos permisos independientes; preparar no cambia el permiso confirmado | Recibos de `set_permissions` y lectura posterior |
| Retirar permisos | Permisos consultados reflejan el retiro; retirada completa permitida si la autorización médica expiró | Recibo y estado; rechazo médico real se registra cuando exista su recorrido |
| Recargar y cambiar cuenta | Persistencia del mismo historial e intento; datos anteriores desaparecen | Observación autenticada |

Los archivos, descargas y presentación se manejan fuera de blockchain. Crear historial, agregar una versión y cambiar permisos sí generan operaciones de Stellar. Cada operación nueva debe auditarse por actor, contrato, método, argumentos y recibo; no basta con ver un enlace o un aviso verde.

Cancelar antes de firmar debe dejar un intento cancelado. Un sobre ya firmado no se reemplaza: si la respuesta es incierta, consultar y reconciliar ese intento. El reintento requiere confirmación expresa y transmite el mismo sobre, sin nueva firma. Un recibo perdido por retención del RPC debe tratarse según la política revisada de evidencia persistida, sin declarar éxito a partir de un hash aislado.

## 4. Presentación y privacidad

Revisar escritorio y anchos efectivos de **360, 390 y 430 px**, teclado, Tab/Shift+Tab, foco visible y texto al 200 %. Comprobar títulos largos, versiones, formularios, mensajes, confirmación y reintento. Abrir/cerrar documentos durante carga y comprobar que respuestas tardías no vuelven a mostrar otro archivo.

En capturas y video, ocultar códigos, tokens, claves, conexiones y cuentas ajenas. No publicar archivos reales de salud. Mantener separados resultados automatizados, observaciones autenticadas y transacciones reales.

## 5. Preview y criterio para grabar

La configuración del preview requiere **autorización específica** para su base aislada, claves clínicas nuevas y controles de escritura. Las autorizaciones anteriores de otros previews no cubren este sprint. El guard de migración actual sólo permite Neon dev: preparar el esquema del preview requiere un procedimiento revisado, sin eludir esa comprobación.

Registrar cada resultado con:

**ID · commit · entorno · fecha · tipo de evidencia · esperado · observado · recibo/captura · estado.**

La entrega podrá declararse lista para grabar después de comprobar el recorrido autenticado, recibos, persistencia, presentación y ausencia de operaciones inciertas; registrar por separado cualquier pendiente y la aceptación del revisor. Narrar el recorrido aprobado, sin atribuir al sprint funciones médicas de semana 3 ni mejoras futuras.

La evidencia de semana 1 permanece intacta: [recorrido de grabación](GRABACION-SEMANA-1.md) y [guion narrado](GUION-NARRADO-SEMANA-1.md). No volver a firmar sus operaciones para preparar esta revisión.
