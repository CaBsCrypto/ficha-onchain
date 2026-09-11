# TrustLeaf · Propuesta de entrega D1

Fecha documental: 7 de septiembre de 2026. Estado: **pendiente de evidencia y cierre**.

Esta propuesta organiza exclusivamente D1. No constituye auditoría, validación nueva de contratos ni aprobación para uso clínico. No se han modificado contratos, ejecutado pruebas ni consultado despliegues. La auditoría anterior, rechazada por la plataforma y escalada a soporte, queda fuera de este trabajo.

## 1. Base disponible y límites

El contexto recibido reporta históricamente «36 Rust / 118 Vitest / 11 checks Testnet» y un fix de duplicados Rx. No se aportaron aquí logs, commit, fecha de ejecución, definición de los checks ni enlaces que permitan confirmar esos resultados. Se registran como antecedentes, no como evidencia nueva ni como aprobación vigente.

También se reportan hallazgos posteriores de autorización cuya corrección no está confirmada, y correspondencia binaria de DoctorRegistry pendiente. Ambos impiden afirmar cierre. No se conoce en esta tarea el texto contractual original de D1: esta matriz es una propuesta basada en el alcance recibido, para contrastar con ese texto antes de aceptar la entrega.

## 2. Matriz de requisitos y evidencia

Todos los criterios siguientes son criterios de aceptación propuestos. El responsable de aportar evidencia técnica debe designarse; esta tarea solo organiza la documentación.

| Ref. | Requisito D1 | Evidencia necesaria | Criterio de cierre | Estado actual |
|---|---|---|---|---|
| DR-01 | DoctorRegistry: registro de doctor | Especificación de campos y actor autorizado; reporte trazable de registro y consulta posterior; rechazo documentado de duplicado | Registro persistente y duplicados tratados según especificación | Pendiente; históricos agregados no prueban este requisito |
| DR-02 | DoctorRegistry: autorización | Matriz actor/operación; reporte de casos permitidos y denegados ligado a versión; resolución documentada de hallazgos reportados | Solo los actores previstos ejecutan operaciones restringidas; hallazgos de autorización resueltos con evidencia | Bloqueante: corrección no confirmada |
| DR-03 | DoctorRegistry: revocación | Actor autorizado, estado previo/posterior y efecto sobre nuevas emisiones documentados | Doctor revocado no conserva permisos de emisión; consulta refleja revocación | Pendiente |
| DR-04 | DoctorRegistry: transferencia de administración | Procedimiento especificado; evidencia de administración previa/posterior y permisos de ambos actores | Nuevo administrador adquiere los permisos previstos; anterior los pierde conforme a especificación | Pendiente |
| RX-01 | PrescriptionSoulbound: emisión inicial al paciente | Evidencia de emisor autorizado, destinatario paciente, identificador lógico y consulta resultante, usando datos sintéticos | Emisión queda asociada al paciente correcto y respeta autorización | Pendiente; autorización sin cierre confirmado |
| RX-02 | PrescriptionSoulbound: no transferible | Especificación de intransferibilidad y reporte de rechazo de transferencias posteriores a emisión por las rutas expuestas | La emisión inicial es posible; transferencias posteriores no cambian titularidad | Pendiente |
| RX-03 | PrescriptionSoulbound: revocación | Actor facultado, registro anterior/posterior y lectura de estado | Solo el actor previsto revoca; status refleja la revocación | Pendiente |
| RX-04 | PrescriptionSoulbound: status | Definición del resultado de consulta para receta existente, revocada e inexistente; evidencia asociada | Consulta inequívoca y consistente con el lifecycle acordado | Pendiente |
| LC-01 | Lifecycle: Registered / Active / Revoked | Tabla de estados por entidad, eventos de transición, actor y efectos; reportes vinculados | Semántica y transiciones aprobadas, sin confundir estados de doctor y receta | Pendiente de definición y evidencia |
| QA-01 | Pruebas de permisos | Reporte funcional del equipo autorizado, con versión, casos, resultado y trazabilidad a DR/RX | Cada operación restringida cuenta con casos permitidos/denegados y resultado satisfactorio | Bloqueante por hallazgos reportados sin resolución confirmada |
| QA-02 | Pruebas de duplicados | Definición de clave de unicidad; evidencia de rechazo y ausencia de sobrescritura en doctor y Rx | Duplicados no crean registros adicionales ni alteran registros previos indebidamente | Fix Rx reportado históricamente; falta evidencia vinculada a versión |
| TN-01 | DoctorRegistry en Stellar Testnet | ID real, enlace real al explorador, red, transacción de despliegue, fecha, commit y hash del artefacto; evidencia de correspondencia con código desplegado | ID verificable en Testnet y correspondencia artefacto/despliegue documentada | Bloqueante: ID no aportado y correspondencia binaria pendiente |
| TN-02 | PrescriptionSoulbound en Stellar Testnet | ID real, enlace real al explorador, red, transacción de despliegue, fecha, commit y hash del artefacto; configuración del Registry asociado | ID verificable en Testnet y asociación a la instancia correcta de Registry documentada | Pendiente; ID y evidencia no aportados |

## 3. Lifecycle para acordar

No se asume que los tres nombres sean estados implementados en ambos contratos. Propuesta documental: Registered indica alta registrada; Active indica habilitación vigente; Revoked indica revocación. Para cada entidad debe acordarse si Registered es un estado persistente o un evento, cómo se activa, quién revoca y si existe reactivación. La emisión inicial de una receta puede comenzar en Active si así lo define el contrato; no se agrega una transición al código desde este documento.

La revocación del doctor y la revocación de una receta son hechos distintos. Se debe documentar por separado qué ocurre con recetas emitidas antes de revocar al doctor. No se presume revocación automática de recetas previas.

## 4. Plan ordenado y criterios de cierre

1. **Fijar alcance y versión.** Contrastar esta matriz con D1 original, designar responsables y anotar commit/artefactos candidatos. Cierre: alcance y lifecycle acordados, sin requisitos ambiguos.
2. **Reunir evidencia existente.** Solicitar al equipo responsable reportes, logs y enlaces reales; mapear cada evidencia a las filas anteriores. Cierre: cada archivo tiene origen, fecha, versión, requisito y resultado; históricos sin respaldo siguen como reportados.
3. **Resolver pendientes fuera de esta tarea.** El equipo autorizado debe aportar la resolución de autorización y correspondencia binaria Registry. Cierre: evidencia revisable aceptada por el responsable de D1; no basta una afirmación verbal ni los totales históricos.
4. **Completar ficha Testnet.** Incorporar los dos IDs reales, sus enlaces y relación entre instancias. Cierre: ambas referencias verificables y coherentes con la versión candidata, con verificador y fecha registrados.
5. **Revisar y empaquetar D1.** Entregar matriz, índice de evidencia y ficha de despliegue. Cierre: todas las filas exigibles aceptadas por el responsable de recepción; cualquier faltante mantiene D1 abierto. El mockup es un anexo de diseño y no sustituye evidencia técnica.

No se ejecutarán verificaciones técnicas desde esta tarea. Los criterios describen evidencia que debe proporcionar y revisar el equipo autorizado.

## 5. Índice de evidencia a completar

Por cada pieza: ID de evidencia, requisito asociado, nombre/ruta o enlace real, autor/origen, fecha, commit, hash de artefacto cuando corresponda, red e ID de contrato cuando corresponda, resultado, limitaciones y responsable/fecha de revisión. No incluir secretos ni información clínica real.

| Pieza esperada | Contenido | Disponibilidad |
|---|---|---|
| Alcance aprobado | D1 original, decisiones de lifecycle y responsables | No aportado |
| Reportes de pruebas | Detalle detrás de 36 Rust / 118 Vitest / 11 checks Testnet, versión y cobertura real | Solo totales históricos reportados |
| Resolución de autorización | Hallazgos, resolución y evidencia de aceptación del equipo responsable | No confirmada |
| Evidencia de duplicados | Fix Rx reportado y resultados vinculados a versión; registro de doctor | No aportada |
| Fichas de despliegue | Ambos IDs Testnet, enlaces reales, hashes, versión y relación Registry/Rx | No aportadas |
| Correspondencia Registry | Trazabilidad código → artefacto → contrato desplegado | Pendiente reportado |

## 6. Week 1, D2 y D3

El relayer es un requisito de Week 1 y debe conservar su propia ficha de evidencia y aceptación; no se declara satisfecho aquí. Su inclusión contractual en D1 debe contrastarse con el alcance original. No se diluye en la UI de D2 ni en la demo E2E de D3. Esta entrega no implementa relayer, UI de producto ni demo E2E. El certificado adjunto es únicamente una propuesta visual documental.

## 7. Certificado: propuesta visual y lectura privada

El archivo visual usa exclusivamente personajes, fechas y referencias ficticios. Lleva la leyenda «DEMOSTRACIÓN — NO VÁLIDO PARA USO CLÍNICO». El estado de receta es **Active · simulado** y el estado de verificación técnica es **Pendiente · sin evidencia vinculada**. Uno no implica el otro. No se presentan IDs de contrato inventados, firmas, sellos de auditoría ni QR funcionales.

Propuesta de acceso, no implementación: lector solicita acceso → servicio privado autentica al lector → comprueba autorización para esa receta → entrega solo los campos necesarios → registra el acceso conforme a una política acordada. Sin autorización, muestra una denegación sin revelar datos clínicos. Una referencia o QR futuro solo abriría el punto de acceso; no otorgaría permisos por sí mismo. Las condiciones de autorización, expiración y revocación del acceso quedan por definir.

Como propuesta, el contenido clínico se conservaría en almacenamiento privado; cualquier referencia pública debe minimizarse y evaluarse antes de implementarse. Esta tarea no afirma que el sistema actual tenga esa arquitectura. La imagen no prueba seguridad ni convierte los datos médicos en públicos; tampoco demuestra que un contrato esté desplegado o que una receta sea clínicamente válida.
