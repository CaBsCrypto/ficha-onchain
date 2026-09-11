# Reconciliación de entrega — SOW Semana 1

Actualización documental: 2026-09-07 UTC. Fuente: [texto aportado por usuario](SOW_WEEK_1_SOURCE.md). No se ejecutaron pruebas, cambios de autorización ni operaciones de red en este bloque documental.

## Estado de versiones

- Main publicado: último cierre documental comprobado en commit 22d546e, PR99, CI y Vercel aprobados. Esto es evidencia anterior a las correcciones locales.
- Testnet: los IDs del informe WEEK_1.md corresponden a los binarios anteriores. La evidencia readonly-code-hashes.json registra Rx bd9d0b97…343e y Registry cc832c81…c8.
- Checkout: rama local codex/week1-defensive-fixes, con cambios NO publicados. API mint modificada; agente reportó pruebas mock locales, pero faltan adaptación UI/clientes y verificación integral. También existen cambios locales de PrescriptionSoulbound: el turno responsable terminó bloqueado por plataforma; su estado debe considerarse parcial/no validado hasta revisión autorizada. No atribuir esas modificaciones al binario en Testnet.
- Las pruebas de reproducción históricas conservadas pueden pasar al demostrar un defecto. No son evidencia de mitigación. No se vuelven a ejecutar aquí.

## Matriz contractual

| Requisito exacto | Evidencia disponible | Pendiente / límite |
| --- | --- | --- |
| DoctorRegistry: registration, authorization check, revocation, admin transfer | 13 pruebas históricas del fuente local; disponibilidad y autorización del doctor demo en Testnet | Procedencia/equivalencia del Registry desplegado no establecida. Inicialización segura de nuevos despliegues requiere resolución. |
| PrescriptionSoulbound: issuance, patient transfer, revocation, status query | 20 pruebas históricas y lectura SDK; asignación al emitir | Patient transfer confirmado: asignación inicial, sin retransferencia; conservar historial tras revocación. Hallazgo de control de dispensación afecta estado/revocación. Corrección desplegada pendiente. |
| Registered → Active → Revoked | 3 E2E locales previos y transacciones sintéticas históricas | No confundir con recorrido real de navegador. Revalidar versión corregida antes de atribuirle esos resultados. |
| Unauthorized issuance / duplicate prevention | Pruebas previas de mint/duplicado y simulaciones Testnet | No demuestran autorización de todas las funciones públicas ni identidad HTTP del emisor. API local aún no integrada. |
| Both contracts deployed Stellar Testnet / verifiable IDs | IDs, hashes y enlaces Stellar Expert en WEEK_1.md | Dos contratos disponibles, pero fuente de Registry y futura corrección requieren trazabilidad propia. |
| Configure relay infrastructure | Cinco fee-bumps sintéticos históricos | No prueba configuración real del portal actual; no se hicieron nuevas tx. |

## Veredicto

**Hito funcional demostrado en versión anterior; cierre sin reservas pendiente de remediación y evidencia de la versión final.** No declarar listo para recetas reales. No ampliar este hito a producción clínica completa ni incorporar ZK por defecto.

## Plan de remediación y decisiones

1. Preservar fuente/evidencia de la versión desplegada y separar cambios locales; no sobrescribir los manifiestos históricos.
2. Completar corrección defensiva de autorización de dispensación, cantidades, vigencia y coherencia de estados cuando la plataforma permita la tarea. Validar rechazo y flujo válido; no reanudar explotación bloqueada.
3. Integrar API y callers: el borrador local exige modo explícito simulated o testnet-demo. Simulación no firma ni registra clínica; demo real exige rol, email verificado, signer y paciente sintético configurados. Ningún entorno fue configurado. No eliminar estos controles para hacer pasar una demo.
4. Decidir procedencia del Registry actual y aplicar la decisión confirmada de asignación inicial sin retransferencia. Reparar controles acotados antes de proponer reconstrucción completa; reemplazo/upgrade requiere ruta concreta y autorización separada.
5. Si cambia el WASM de recetas, los IDs actuales no prueban el fix. Preparar build, manifiesto y despliegue autorizado; la versión existente no muestra una función de upgrade. Prever nueva ID y configuración SDK/UI, preservando referencia histórica.
6. Separar privacidad: offchain cifrado con gestión de llaves y permisos por función/relación asistencial; minimizar datos públicos. Hash y ZK no sustituyen autorización. Ver MEDICAL_DATA_FLOW.md y CHILE_HEALTH_PRIVACY.md.
7. Entrega/grabación: mostrar versión exacta, tests de esa versión, IDs, tx sintéticas y límites. Para portal, ensayo sintético autenticado y verificación de DB/ID/modo antes de grabar. Aceptación formal todavía pendiente.

## Restricciones del bloque

No nuevos tests, auth changes, publicaciones, merges, despliegues, transacciones ni datos reales en este encargo documental. Bloqueo de plataforma de la corrección de contrato informado; no se intentó por otra vía. Herramientas OpenZeppelin no aparecen en las herramientas disponibles de esta sesión; configurar un endpoint global no prueba conexión, compatibilidad ni revisión del código.

## Decisión de producto confirmada

El paciente recibe la receta al emitir y conserva su historial; no la transfiere. Revocación conserva registro y cambia estado. No se deriva de esta decisión ninguna autorización nueva de farmacia. El contenido clínico debe permanecer privado: la presencia actual de medicamento/dosis públicos exige remediación; no afirmar que ya cumple esa condición.

## Siguiente bloque realizable y coordinación

Responsable de integración: esta tarea TrustLeaf. La tarea de corrección de contrato se detuvo por clasificación de plataforma. Los frentes posteriores son únicamente de diseño documental; sus entregables y criterios se centralizan en ARCHITECTURE_PLAN.md.

1. Documentación de aceptación: decisión soulbound resuelta; mantener trazabilidad de requisito → versión → prueba → evidencia.
2. Contrato: cambios locales parciales preservados, no validados ni desplegados; bloqueo de plataforma no se reintenta por otra vía. Autorización de dispensación y exposición de metadatos siguen sin cierre demostrado.
3. API: borrador local reportado por el agente, pendiente integración de modos explícitos en clientes y validación conjunta cuando se autorice ese bloque permitido. No publicar ni atribuir éxito a la versión desplegada.
4. Privacidad: especificar almacenamiento privado, llaves, acceso por relación asistencial y datos públicos mínimos antes de cualquier dato real. ZK no es requisito de semana 1.
5. Aceptación final: solo con evidencia de la misma versión corregida y desplegada; nuevas operaciones externas requieren autorización separada.

Estado preciso del borrador de contrato comunicado por su autor: interfaz de registro de farmacia con rechazo ante error, validaciones de cantidad/vigencia, eventos y consulta de validez modificados localmente, junto a fixture de tests. No compilado ni probado. Las expectativas de reproducciones previas no fueron adaptadas. Conservar como trabajo parcial, no listo para integrar.
