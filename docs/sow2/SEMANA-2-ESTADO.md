# SOW 2 · Semana 2 · Estado de la entrega

Referencia de esta revisión: `codex/sow2-sprint-2`, commit `12cf461`, 8 de octubre de 2026. Esta es una fotografía del desarrollo; todavía no acredita un recorrido autenticado ni una versión lista para grabar. No se ha publicado en main.

## Alcance

Completar el historial privado del paciente: crear o abrir su historial, agregar antecedentes y archivos, consultar versiones, corregir sus propios aportes y gestionar permisos. El recorrido médico de semana 3 y la entrega final de semana 4 permanecen separados.

- Identidad estable de Privy y wallet comprobada en el servidor; el correo no identifica el historial. Un cambio de wallet no reasigna datos automáticamente.
- Contenido y metadatos clínicos cifrados en Neon, con claves web propias y versionadas fuera de la base. No se reutilizan las claves sintéticas DPAPI de semana 1.
- PDF, PNG y JPEG de hasta **3.000.000 bytes originales** por archivo; sin compresión automática. La validación también se hace en servidor.
- Versiones anteriores conservadas. El paciente sólo puede corregir información que él aportó; no puede editar notas de otro autor.
- Lectura y agregado independientes por médico. Conceder permisos requiere autorización médica vigente; se permite retirar los permisos existentes aunque el médico ya no esté autorizado.
- Firmas del paciente mediante Privy y comisiones patrocinadas por el relayer. Un intento incierto conserva su sobre; no se sustituye por otra firma.

Stellar Testnet registra propietarios, permisos y comprobantes de integridad. Los archivos y antecedentes permanecen cifrados fuera de blockchain. TrustLeaf los descifra para usuarios autorizados: esto no promete cifrado de extremo a extremo ni elimina copias previamente descargadas al revocar acceso.

## Frentes y evidencia

Los commits de esta tabla corresponden a la rama integrada del sprint. «Integrado» describe código incorporado, no aprobación manual ni aceptación del revisor.

| Frente | Responsable | Estado al commit de referencia | Evidencia |
| --- | --- | --- | --- |
| 1 · Identidad y acceso | Agente identidad | Integrado; QA final pendiente | `5b0482e`: identidad y wallet vinculadas |
| 2 · Cifrado y claves | Agente identidad | Integrado; configuración y recuperación reales pendientes | `5b0482e`: claves web dedicadas y versionadas |
| 3 · Persistencia | Agente persistencia | Integrado; migración y recorrido de desarrollo pendientes | `8682d47`: índices privados e intentos inmutables |
| 4 · Stellar y firmas | Agente Stellar | Integrado; prueba real con Privy pendiente | `a5790b1`: 35 pruebas aisladas del adaptador aprobadas |
| 5 · APIs del historial | Coordinador y revisión delegada | Integrado; revisión y QA integrado en curso | `916617b`: lectura, preparación y recuperación |
| 6 · Antecedentes y archivos | Agente interfaz | Interfaz en desarrollo; sin commit integrado en esta referencia | Contrato de API definido en [SPRINT-2.md](SPRINT-2.md) |
| 7 · Cronología y correcciones | Agente interfaz | Interfaz en desarrollo; revisión pendiente | Versiones y correcciones disponibles en la API |
| 8 · Permisos del paciente | Agente permisos | Componente integrado; recorrido autenticado pendiente | `12cf461`: 21 pruebas aisladas de estado y presentación aprobadas |
| 9 · Seguridad e integración | Coordinador y agente QA | En curso; sin cifras finales acreditadas | Pruebas nuevas bajo `src/__tests__/clinical-*.test.ts` |
| 10 · QA visual y entrega | Agente entrega y coordinador | Documentación preparada; revisión visual pendiente | Este estado y [guía de validación](GUIA-VALIDACION-SEMANA-2.md) |

Los 35 y 21 casos son pruebas aisladas de contribuciones concretas, no una suma del QA final ni observaciones reales de Privy o Stellar. Los conteos de semana 1 no aprueban el código nuevo.

## Configuración de desarrollo

Sólo el servidor recibe claves y credenciales. No incluirlas en capturas, archivos de evidencia, respuestas de API ni variables `NEXT_PUBLIC_*`.

| Variable | Función |
| --- | --- |
| `TRUSTLEAF_CLINICAL_WEB_ENABLED` | Habilitación explícita del módulo |
| `CLINICAL_HISTORY_PRIVATE_CONTRACT_ID` | Contrato clínico existente; debe coincidir con el configurado en el código |
| `TRUSTLEAF_CLINICAL_KEYRING` | Secreto del servidor: mapa de identificadores de versión a claves de cifrado de 32 bytes en hexadecimal |
| `TRUSTLEAF_CLINICAL_ACTIVE_KEY_ID` | Identificador de la clave activa; conservar claves anteriores necesarias para lectura y recuperación |
| `TRUSTLEAF_CLINICAL_MIGRATION` | Autorización técnica explícita de los pasos de migración clínica en dev |
| `TRUSTLEAF_PRIVATE_WRITES_ENABLED` | Control existente de preparación y transmisión; mantener apagado hasta la prueba real acordada |

También se conservan las comprobaciones existentes de Privy, Testnet, contratos, autoridad, relayer y base. La conexión usada por la aplicación y `TRUSTLEAF_DB_HOST` deben corresponder al mismo entorno aislado.

La fuente del esquema es `scripts/migrate.mjs`. Los pasos `clinical-history-v1` y después `clinical-web-v1` sólo aceptan la rama Neon dev `ep-lingering-water-ahzh89z5`; no migran main ni un preview. El script utiliza **`DATABASE_URL`**, aunque la aplicación pueda priorizar `TRUSTLEAF_DATABASE_URL`. Ambas deben apuntar a la base dev comprobada. Esta documentación no acredita haber ejecutado las migraciones.

## Comportamiento de API y pendientes de cierre

Las rutas `/api/private-clinical-*` autentican al usuario y responden con `no-store`. La lectura de documentos verifica identidad e integridad. Consultar una operación no la transmite; el reintento exige confirmación expresa y reutiliza el sobre persistido. Los errores no permiten mostrar resultados como confirmados.

Antes de declarar la semana 2 lista para revisión final faltan:

- Integrar formularios y cronología, y registrar el commit resultante.
- Completar la revisión de permisos, concurrencia, respuestas tardías y recuperación, incluido el tratamiento de recibos históricos fuera de la ventana del RPC.
- Ejecutar suites integradas, TypeScript, build y CI sobre ese commit, con resultados nuevos.
- Configurar y comprobar el entorno local aislado; realizar el recorrido autenticado con datos sintéticos y auditar sus recibos.
- Revisar escritorio, 360/390/430 px, teclado, foco y texto al 200 %.
- Obtener autorización específica antes de configurar el preview y registrar allí los resultados observados.

La grabación de semana 1 conserva su base `2d13e07`, informes, guion y recibos. La semana 2 no cambia esa ejecución. Magic links/QR externos, compresión automática, contratos nuevos y alojamiento permanente del worker siguen fuera del sprint. La grabación y la aceptación del revisor son pasos posteriores a la validación.
