# Custodia privada de recetas: propuesta de diseño

Estado: **propuesta no implementada ni desplegada**. Base: [MEDICAL_DATA_FLOW.md](MEDICAL_DATA_FLOW.md), inspección estática del 6 de septiembre de 2026. Los borradores locales posteriores no prueban cambios en producción. Este documento no es certificación, revisión legal ni selección de proveedor.

## Qué existe y qué debe cambiar

El flujo de recetas recibe datos legibles, construye un Bundle FHIR para calcular su hash y publica medicamento y dosis además del hash. Guarda parte del contenido legible en `prescriptions_log`; no está demostrada la custodia recuperable del Bundle completo cifrado. El cifrado de ficha/documentos es un flujo distinto y permite texto sin cifrar cuando falta la clave. No se ha comprobado la configuración efectiva del proveedor ni de producción.

La propuesta es custodiar el documento completo fuera de la cadena, cifrado, y recuperar su contenido únicamente mediante una autorización comprobada en servidor. Una futura versión del contrato debe eliminar los campos clínicos públicos; la propuesta no oculta ni elimina datos ya publicados. Hashes, wallets y metadatos también pueden permitir correlación: el compromiso público y su formato requieren una decisión de privacidad antes de implementarse.

| Área | Actual, según el mapa | Recomendado | Evidencia de aceptación | Responsable propuesto |
| --- | --- | --- | --- | --- |
| Documento de receta | Bundle usado para hash; custodia cifrada completa no demostrada | Persistir documento canónico cifrado y versión del formato; referencia opaca entre documento y emisión | Recuperación autorizada reproduce documento y verifica integridad, sin exponer contenido en logs | Backend y responsable clínico |
| Campos públicos | Medicamento, dosis, wallets y metadatos públicos | Minimizar publicación; excluir texto clínico e identificadores directos del futuro contrato | Inspección de argumentos, estado y eventos con un caso sintético; aprobación del conjunto público | Contratos y responsable de privacidad |
| Cifrado de aplicación | Receta/log no cubiertos; otros flujos tienen fallback legible | Cifrado autenticado del contenido y columnas sensibles; rechazar escrituras si falta configuración | Pruebas de fallo cerrado, alteración de ciphertext y cobertura de todas las copias | Backend y seguridad |
| Claves | Clave compartida configurable en otros flujos; despliegue sin verificar | Claves de datos separadas de claves de firma y de credenciales DB; envolver claves de datos con clave administrada fuera de DB | Inventario sin secretos, permisos mínimos del servicio y prueba de que una copia DB sola no permite descifrar | Infraestructura y seguridad |
| Rotación y recuperación | No acreditadas por este mapa | Versionar claves; rotar clave envolvente y recifrar cuando corresponda; procedimiento de revocación por incidente | Ensayo sintético de rotación, lectura de versiones anteriores y recuperación controlada | Infraestructura |
| Acceso al documento | Controles distintos por ruta; login no demuestra rol ni relación asistencial | Identidad verificada + rol vigente + relación asistencial autorizada + finalidad/consentimiento aplicable; denegar por defecto | Matriz de pruebas: paciente propio, profesional tratante, profesional ajeno, rol revocado y relación expirada | Backend y responsable clínico/privacidad |
| Auditoría privada | Espejo clínico best-effort; no equivale a registro de acceso | Registrar actor, recurso opaco, acción, decisión, motivo y fecha en almacén privado protegido; excluir contenido clínico y secretos | Trazabilidad de lectura/escritura/rechazo; acceso restringido y detección de alteraciones | Seguridad y operaciones |
| Retención y borrado | Política y cobertura no verificadas | Definir plazos por categoría, obligación y finalidad; abarcar DB, logs, exportaciones y copias | Política aprobada y ensayo de expiración/borrado sobre datos sintéticos, con excepciones documentadas | Responsable de datos y asesoría legal |
| Backups | Configuración/restauración no verificadas | Copias cifradas, acceso separado, retención coherente y restauración con recuperación controlada de claves | Ensayo de restauración sintética; objetivos de recuperación acordados y evidencia de acceso | Infraestructura y responsable de datos |
| Proveedor y operación | No verificados | Elegir proveedor, región, controles de acceso, gestión de claves, respaldos y condiciones de tratamiento | Decisión documentada y configuración revisada; responsables e incidentes definidos | Responsable del proyecto, infraestructura y privacidad |

Los responsables anteriores son funciones propuestas: faltan nombres y aceptación de propiedad. No se presupone que el proveedor tenga estas capacidades habilitadas. El cifrado en disco del proveedor no sustituye la autorización de aplicación ni separa por sí mismo las claves del contenido.

## Secuencia propuesta para una lectura privada

1. Verificar identidad de quien solicita el documento.
2. Comprobar rol, relación con ese paciente y autorización vigente para esa acción; un email o un booleano recibido en el body no bastan.
3. Resolver una referencia opaca desde almacenamiento privado y solicitar la clave únicamente al servicio autorizado.
4. Descifrar y verificar integridad en el servicio autorizado, devolver el mínimo necesario y registrar el acceso sin contenido clínico.

Esto es cifrado de aplicación con servidor autorizado a descifrar, **no cifrado extremo a extremo**. Revocar acceso impide lecturas futuras mediante el servicio; no recupera copias descargadas anteriormente. El acceso excepcional, si se necesita, requiere política, autorización y auditoría específicas antes de incorporarse.

## Mínimo para grabar SOW semana 1

- Usar exclusivamente identidades, wallets y contenido sintéticos, incluidos medicamento y dosis.
- Explicar qué campos publica el contrato actual y distinguir simulación, pruebas SDK y transacciones verificadas.
- Mostrar evidencia de los dos contratos y sus controles funcionales sin presentar custodia privada, consentimiento firmado ni seguridad clínica como entregados.
- Mantener la demostración sin consultas a registros reales. Una grabación del portal requiere ensayo independiente del recorrido que efectivamente se vaya a mostrar.

Este diseño no amplía por sí solo el compromiso de semana 1. Antes de usar datos reales, deben aceptarse y verificarse los controles de custodia, acceso, claves, publicación mínima y operación anteriores. La aprobación contractual de SOW 1 y la autorización para operación clínica son decisiones distintas.

## Decisiones pendientes

Confirmar responsable de datos, política de acceso/consentimiento, formato del compromiso público, proveedor y región, gestión de claves, retención y objetivos de recuperación. Después se podrá estimar e implementar el diseño en un trabajo separado con pruebas de aceptación. No se han realizado cambios de código, configuración, infraestructura o datos como parte de este documento.
