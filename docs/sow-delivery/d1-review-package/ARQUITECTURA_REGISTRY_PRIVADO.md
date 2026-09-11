# Propuesta: DoctorRegistry con expediente privado

Estado: diseño para discusión; no implementado ni desplegado. Sustituye la idea de publicar nombre/licencia. Los contratos y pruebas anteriores permanecen como evidencia histórica con identidades de prueba.

## Decisión propuesta

TrustLeaf mantiene un expediente estándar privado y acredita en cadena que una cuenta está autorizada hasta una fecha. Esto protege el contenido del expediente, pero no oculta que la cuenta participa ni sus transacciones. ZK se evaluará para demostrar una credencial sin revelar su identidad; no proporciona automáticamente anonimato al flujo de recetas.

## Distribución de datos

| Capa | Contenido | Protección propuesta |
|---|---|---|
| Neon/Postgres | Expediente estructurado: identidad, licencia, especialidad verificada, fuente, fecha de revisión, responsable, decisiones e historial | Campos sensibles cifrados por la aplicación; autorización por expediente |
| Almacenamiento de objetos privado | Documentos y comprobantes | Objetos cifrados, sin enlaces públicos; descarga autenticada o enlaces de duración limitada |
| Servicio de gestión de claves | Claves de cifrado y sus versiones | Separadas de base de datos y archivos; rotación y recuperación probadas |
| DoctorRegistry | Cuenta, estado, vencimiento, versión de autorización | Información pública mínima; firma administrativa y reglas de transición |
| Auditoría privada | Quién accedió/revisó/cambió y cuándo | Acceso restringido, integridad y retención definidas; sin copiar documentos a logs |

No publicar nombre, RUT, número de licencia, especialidad, documentos, URLs privadas ni motivos detallados de rechazo, tampoco en argumentos de transacciones o eventos. No usar un hash simple de RUT/licencia como anonimización: permite probar valores candidatos. Una referencia de expediente, si se necesita, será opaca y aleatoria; por defecto el vínculo vive en la base privada.

## Funciones propuestas del contrato

| Función | Autoridad y comportamiento |
|---|---|
| `__constructor(admin)` | Administración inicial atómica |
| `authorize_doctor(wallet, valid_until)` | Administrador; alta tras revisión privada y prueba de control de wallet; rechaza duplicados activos y fechas inválidas |
| `renew_authorization(wallet, valid_until)` | Administrador; renueva autorización vigente; no reactiva revocados implícitamente |
| `revoke_doctor(wallet)` | Administrador; desactiva inmediatamente; motivo queda privado |
| `reauthorize_doctor(wallet, valid_until)` | Administrador; decisión explícita después de nueva revisión, incrementa versión |
| `is_authorized(wallet)` | Consulta; considera existencia, revocación, vencimiento y pausa |
| `get_authorization(wallet)` | Consulta pública de los campos mínimos; sin expediente |
| `propose_admin(new_admin)` / `accept_admin()` | Transferencia en dos pasos; actual propone, destinatario acepta |
| `pause()` / `unpause()` | Administrador; impide nuevas autorizaciones y hace fallar la habilitación para nueva emisión; revocación sigue disponible |

Los permisos especializados quedan fuera del registro mínimo mientras no exista un requisito concreto. Si se incorporan, tipos cerrados y explícitos, sin especialidades ni texto clínico público. Diseñar TTL/restauración para que datos ausentes o vencidos no autoricen; conservar la auditoría privada y evitar reinicializaciones administrativas.

## Flujo operativo

1. Médico autenticado entrega expediente privado y demuestra control de su cuenta mediante un desafío firmado, con vencimiento y uso único.
2. Revisor autorizado de TrustLeaf valida fuentes y registra evidencia. Estándar de revisión obligatorio, independiente de preferencias del perfil.
3. Una cola transaccional prepara el alta on-chain con un identificador de operación idempotente. La base distingue revisión aprobada, envío pendiente, confirmado y error.
4. La autoridad administrativa firma; el relayer puede pagar sin adquirir facultades de aprobación. La nueva cuenta de despliegue no debe ser el firmante rutinario del backend en producción.
5. Se confirma el recibo y se consulta el estado antes de mostrar al médico como habilitado para emitir.
6. Prescription comprueba autorización vigente y firma del médico. Una revocación detiene nueva emisión; no borra ni revoca automáticamente recetas históricas, cuyo ciclo se define aparte.

## Seguridad y límites

Autenticación obligatoria, permisos por función y expediente, acceso de pacientes limitado a lo necesario para su atención. Cifrado autenticado con claves fuera de los datos, sin escribir en claro si falta la clave. Separación real de pruebas y producción, respaldos cifrados y restauración ensayada. La custodia privada propuesta permite acceso controlado a TrustLeaf: no es cifrado de extremo a extremo ni protección frente a todo administrador autorizado.

El helper actual `src/lib/crypto/at-rest.ts` usa AES-GCM, pero permite escritura en claro si no hay clave. No satisface este requisito sin cambios. Tampoco está demostrado que el expediente de médicos actual use ese helper. No se afirman garantías de privacidad ya implementadas.

Prescription actualmente publica medicamento, dosis y wallets: reducir datos del Registry no resuelve la privacidad de las recetas. Debe revisarse antes de usar información clínica real.

## Alternativas y ZK

| Alternativa | Ventaja | Coste/límite |
|---|---|---|
| Expediente privado + autorización pública mínima | Menor complejidad, encaja con control médico y revocación | Cuenta y actividad siguen vinculables; confianza en revisión de TrustLeaf |
| Credencial firmada con divulgación selectiva | Compartir solo atributos necesarios con destinatarios autorizados | Depende del formato y protocolo; no equivale automáticamente a ZK ni anonimato |
| Prueba ZK de credencial vigente | Demuestra pertenencia/habilitación sin exponer expediente o identificador de credencial | Circuito, generación de prueba, verificador, revocación y revisión criptográfica adicionales |

Para ZK definir primero el enunciado: poseo una credencial de TrustLeaf, vigente, no revocada, y autorizo esta operación. Vincular la prueba al contrato/red, contenido de la operación y un mecanismo antirreutilización. Si la wallet pública o Prescription identifica al médico, la prueba no elimina esa correlación. El estándar debe definir qué conoce TrustLeaf, qué conoce el paciente y qué ve el público.

Stellar aporta primitivas BN254 y Poseidon; se necesita construir la lógica de pruebas y un contrato verificador. El SDK Rust actual del proyecto es 22: no asumir compatibilidad con primitivas posteriores sin evaluar versiones. No añadir un bypass ZK ni un cambio arbitrario de verificador bajo la etiqueta de extensibilidad.

## Validación antes de la nueva entrega

Pruebas locales de alta, duplicados, fechas, vencimiento, revocación, reautorización, firmas, transferencia administrativa y pausa. Pruebas de privacidad de API, almacenamiento, logs, argumentos y eventos. En Testnet, tres identidades sintéticas con recibos y lecturas, incluyendo ciclo de vencimiento/revocación y emisión por relayer. La privacidad no se acredita únicamente con transacciones exitosas. Añadir pruebas de almacenamiento sin clave, accesos cruzados y recuperación. Si se elige ZK, pruebas inválidas, reutilizadas, expiradas y credenciales revocadas deben rechazarse.

## Fuentes técnicas

- [Stellar: ZK proofs](https://developers.stellar.org/docs/build/apps/zk): primitivas disponibles y necesidad de lógica/verificadores adicionales.
- [Stellar: privacidad](https://developers.stellar.org/docs/build/apps/privacy): contexto de blockchain pública y herramientas de privacidad.
- [OWASP: almacenamiento criptográfico](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html): cifrado y separación de claves.

La arquitectura anterior es una propuesta propia para TrustLeaf, no una arquitectura certificada por estas fuentes ni una evaluación legal.
