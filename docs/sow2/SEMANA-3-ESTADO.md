> **Estado vigente — 6 de noviembre:** semana3 abierta; C4 anterior cancelado sin firma/hash y reserva liberada; cinco antecedentes/seis versiones. Continuación16 preparada e inactiva; aprobación propia pendiente, máximo40 XLM y topes15/15/6. Ver docs/sow2/CIERRE-SEMANA-3-ACTUAL.md del clon operativo y cierre-semana3-2026-11-06/PROPUESTA-CONTINUACION-16.md de D. Los cortes anteriores son históricos.

## Corte 2026-11-09T21:36:44.525Z: implementación validada localmente; ensayo real parcial

Build 9Korj6MbIuM14GNaYK8N-; fuentes SHA-256 [identificador en evidencia local]; base f24908c3bddf07e46773c1e2db096303ba4e3e21 con árbol modificado. Pasaron2.158 pruebas de aplicación,865privadas,25contratos,TypeScript/build;4PostgreSQL opt-in omitidas. WASM optimizado idéntico al desplegado;126trazas sin runtime privado. Matriz de31casos y guía/QA específicos guardados.

Restauración/renovación/PDF confirmados, seis antecedentes/siete versiones. Médico v7 vigente y grant6 true/true, RX#3 vencida. Pendientes descarga íntegra por P1, C5 y C6, seis/ocho y denegación posterior. Aprobación financiera19 ya existe y vence 2026-11-09T23:32:43.000Z; no reiniciarla. Máximo40XLM y seis protegidos, margen conservador corrección13,7633337 antes de recotizar. El servidor de revisión se inicia con gasto apagado. No hubo transacciones nuevas durante la implementación.

Referencias actuales: [matriz](MATRIZ-ACEPTACION-SEMANA-3.md), [QA](QA-SEMANA-3.md), [guía](GUIA-VALIDACION-SEMANA-3.md). Evidencia local reproducible: ../evidence/sow2-week3-2026-11-09/validation-manifest.json. Los cortes que siguen son históricos y no describen la activación actual ni autorizan gasto adicional.


# Semana 3: aportes médicos y recetas privadas

<!-- trustleaf-current-nov2 -->
## Estado vigente: 2 de noviembre

Referencia única: [cierre actual de semana 3](CIERRE-SEMANA-3-ACTUAL.md). C4/PDF, C5/corrección y C6/retiro siguen pendientes; cinco antecedentes/seis versiones disponibles, médico v6 vigente y grant6 con ambos permisos. Total verificado 10,7511074 XLM dentro de 40; seis protegidos para retiro.

La continuación [identificador en evidencia local] recibió aprobación propia el 2 de noviembre a las 15:01:12 de Chile; ventana única hasta las **19:01:12 de Chile**. Sólo PDF, corrección y retiro por vía web, con preparación y confirmación humanas en Privy; escrituras generales apagadas. Sin otra restauración, renovación ni fondeo. Los cortes fechados siguientes son históricos; no habilitan operaciones. Los criterios de aceptación y QA siguen vigentes. Semana 3 abierta; semana 4 diferida por prioridad del usuario.
<!-- /trustleaf-current-nov2 -->


<!-- trustleaf-history-nov1-preparation -->
## Histórico: preparación del 1 de noviembre, posteriormente superada

Las restauraciones14+10 y la renovación v6 están confirmadas; total cobrado10,7385472XLM. Complemento10 hashf2b9de2c5eb746d7fccf0a4733f4e7ebe3c8321120ddef56f9136cfc6aeae257 ledger5490085, cargo0,0434915. Mantenimiento acumulado1,3762544 dentrode2; presupuesto40 y retiro6 conservados. La ventana13 expiró31octubre19:32:01Chile; no se reabre por continuar el chat.

Diagnóstico real Nov1:3elementosC2archivados(head/v1/Operation); restantes14+10vivos. Médico v6 vigente hasta7nov15:32:01Chile ygrant6true/true; RX3vencida. C2/C3yaNOT_FOUNDenRPC, recuperadosSDKMeta4 realesdeDataLakeoficial ypasanguardascanónicasoriginales93618202contraSQL/signatures/metareturndigest. NoHorizon-sustituto ni comisióncero.

Raw14inertopreparado: MF1413b3924698e59695625092ee96fc6511de054451cc82e920c00f61de4d290e, SDKfile7f5c3aa5fa9b254405b920815b1f2d02a3df1e04e6c99d520fb1dc1a65f8d04f; ownapproval14AUSENTE. Propone nueva4hdesdeunaaprobaciónfutura, sinrenovar, M3exactorequest5aea0ca6-80ff-40d0-a34a-2e98a7363bb9/cap0,6237456 dentroremanente2, yC4/C5/C6mismosdatos/IDs/topes15/15/6. 726privadas+2044appPASS,4PostgreSQLopt-inomitidas;TypeScriptybuildfinalAPROBADOS(build7NARJRMJWVn1dJOjLCC77),portal3016operativocongastoapagado. Portaldeshabilitadoparagasto. NoquotesM3,nuevasfirmas/envíosofondeo.

Propuesta revisable D/cierre-semana3-2026-11-01/PROPUESTA-REVISABLE-14.md; datosCONTINUACION-14-PROPUESTA.json. Semana3abierta hastapruebasreales PDF/corrección/retiro/denegación y6/8. Bloquessiguientesconservanhistoria.
<!-- /trustleaf-history-nov1-preparation -->

<!-- trustleaf-readproof-addon-status -->
## Histórico: bloqueo tras renovación, resuelto posteriormente

La restauración14 y renovaciónv6 siguen confirmadas y auditadas. El doctor pudo ingresar con vigencia7d, pero clinicalSnapshot no entrega historial: exige get_entry en todas las cabezas (history.ts271) y get_operation de cada append (history.ts306). Las14claves cubrían versiones, pero omitían4heads+5pruebasOperation archivadas; la pruebaOperation de creación de la misma ficha también está archivada y es opcional para el recibo del paciente. Las lecturasPASS previas prueban versiones/acceso/registro/RX, NOel snapshotcompleto. No omitir ni debilitar esos controles.

Conjunto complementario recomendado10keys SHA2e7514f5ac0d2606dd58e9d0356379284ca6531aae44c658f605bcffa35f2895, todas de la misma ficha. CotizaciónunsignedNOejecutada: revisión automática rechazó el footprint adicional porque sólo14estaban aprobadas; no reintentar por otra vía. CLI complementaria y preflight completos, 662pruebas privadas PASS (32suplemento/13preflight) y revisión independientePASS; propuesta exacta8201d9e218ca35391c692749d4e19caea652ce04aa0be7c90276e259a8f5e308 pendiente de aprobación propia para cotizar y restaurar10 con tope0,6672371XLM (residual2−1,3327629). Todavía no se acredita que la cotización quepa. Se mantienen40global, hold2, seis de retiro y ventana originalhasta19:32:01Chile; sin otra renovación, fondeo o reinicio. NingúnC4/C5/C6 preparado o firmado.

Estadoactual: sesiónmédica abierta, PDF/corrección/retiro aúnpendientes. Próxima acción humana: autorización complementaria concreta para cotizar y restaurar10 dentro del residual; ejecutor/revisión/pruebas ya listos; luego firmas clínicas enPrivy. Evidencia D/cierre-semana3-2026-10-31/EJECUCION-13-ESTADO.json. Los PASSyplanes siguientes son cortes anteriores con alcance explícito.
<!-- /trustleaf-readproof-addon-status -->

<!-- trustleaf-execution13-live -->
## Ejecución aprobada del31 deoctubre — restauración confirmada

Aprobación propia13 SHA [identificador en evidencia local] anclada una sola vez2026-10-31T18:32:01Z (15:32:01Chile). Ventana hasta22:32:01Z (19:32:01Chile); renovación7d hasta2026-11-07T18:32:01Z. No reiniciar por interrupciones o recargas.

Restauración exacta14 CONFIRMADA: [identificador en evidencia local], ledger5489600, cargo1,3327629XLM, auditoría independientePASS con14/14vivos. No repetir mantenimiento. C2/C3 siguen9,3618202XLM; totalcobrado10,6945831. Se cuentan2íntegros por mantenimiento:28,6381798futuros, incluidos6protegidos para retiro; renovación/PDF/correcciónmáximo22,6381798. Máximoconjunto40 sin fondeo/aumento.

Portal3016 buildgj18HA0yDl3ow2tkk_3Pl con escriturasgeneralesfalse y patrocinio limitado a aprobación13. Renovación v5→v6 confirmada: [identificador en evidencia local] ledger5489712, cargo0,0004726XLM. Registro vigente y acceso médico rev6 comprobados; RX3 sigue vencida. Totalcobrado10,6950557; quedan22,6377072 paraPDF/corrección protegiendo6retiro y2mantenimiento. PendienteOTP médico médico de prueba; C4/C5/C6 noejecutados. Ensayosemana3 aúnabierto. Evidencia D/cierre-semana3-2026-10-31/EJECUCION-13-ESTADO.json. Bloques de preparación siguientes se conservan como corte previo.
<!-- /trustleaf-execution13-live -->

<!-- trustleaf-current-rehearsal -->
## Histórico: corte del 31 de octubre — restauración y cierre dentro de 40 XLM

El usuario solicitó preparar la restauración exacta de 14 elementos e incorporarla al mismo máximo de 40 XLM, sin aumentarlo. La propuesta schema13 está preparada y probada; sigue sin aprobación propia ni activación. Manifest SHA-256: [identificador en evidencia local].

Presupuesto: 9,3618202 XLM históricos C2/C3 + 2 XLM conservados para mantenimiento + hasta 28,6381798 XLM futuros para renovación/PDF/corrección/retiro. Esos futuros incluyen 6 XLM protegidos para retirar permisos. Mantenimiento se cuenta siempre por sus 2 XLM máximos, incluso si el cargo real resulta menor; no se suma dos veces. Topes individuales renovación/PDF/corrección/retiro: 1/15/15/6, sujetos al total conjunto. Sin fondeo ni aumento automático.

La cotización diagnóstica de los 14 elementos es 1,5313695 XLM. El nuevo ejecutor sólo permite ese conjunto y una única operación con journal canónico estable; no firma/envía desde --prepare. Preserva sobre/hash ante incertidumbre y no vuelve a firmar ni reenviar. Se confirmó que la entrada/v1 de C2 siguen vigentes y que las entradas/operaciones futuras están ausentes. La corrección verifica por defecto sólo la receta #3 vinculada; permite buscar otras referencias explícitamente y conserva los fallos cerrados, sin restaurar la #4.

La propuesta mantiene los identificadores pendientes y fija también renovación/dossier, para no ocultar cargos fallidos al cambiar propuestas. Ventana de cuatro horas y autorización médica de siete días desde una única aprobación futura. C2 y la concesión de permisos C3 no se repiten. Retirar antes de renovar o completar aportes sigue permitido y cierra nuevas publicaciones.

Validación: 617 pruebas privadas y 2.043 de aplicación aprobadas; cuatro opt-in PostgreSQL omitidas en esta ejecución general, con aprobación 4/4 del núcleo compartido registrada antes y sin cambios en las tablas ni en la lógica de reservas SQL. Revisión independiente del ejecutor y rutas privadas aprobada. TypeScript y compilación final aprobados, build gj18HA0yDl3ow2tkk_3Pl; portal local3016 operativo con gasto apagado; no se crearon aprobación13, journal, firmas o envíos.

Fuentes: D/cierre-semana3-2026-10-31/PROPUESTA-REVISABLE-13.md y PROPUESTA-RESTAURACION-Y-CIERRE-13.json; logs private-schema13-final.log, vitest-schema13-completo.log, build-schema13-final.log. La regresión NFT está cubierta: no busca ni empaqueta archivos privados de ejecución; compilación49s y TypeScript44s. Semana3 sigue abierta hasta restauración/renovación y PDF/corrección/retiro confirmados, descarga íntegra, versiones/receta histórica y rechazo médico posterior con vigencia activa. Semana4 conserva QA completo, guía/video, versión entregada y aceptación. Los cortes siguientes son históricos.
<!-- /trustleaf-current-rehearsal -->


## Continuación del 25 de octubre: estabilidad y costos

Preparación final verificada: build hvCXxF045Xf8LosvFvKPG, servidor local3016/sesión73124/PID11848, publicaciones y patrocinio deshabilitados y sin alcance financiero activo. 1.854 pruebas de aplicación aprobadas (110archivos), tres omitidas; 476 privadas aprobadas; TypeScript y compilación aprobados. Recuperación schema9 [identificador en evidencia local] lista para revisar, SIN aprobación propia ni activación. Se verificaron firma efímera en navegador integrado, PDF cifrado y recuperación/descarga idéntica de964bytes. C4original expiró sin firma/envío/cargo y liberó reserva; C5/C6 siguen sin ejecutar, permisosactualestrue/true revisión6. Próxima ejecución requiere aprobación expresa de la sustitución del PDF y usuario presente para las confirmaciones finales de Privy. El agente prepara y audita; no elude el rechazo automático del clic final mediante claves o API. Máximo40XLM, incluidos9,3618202anteriores, topes15/15/6, reserva6 y cierre21:06:45Chile del25octubre intactos; no hay renovación/fondeo/extensión.

Corte posterior del 25 de octubre: el PDF C4 [identificador en evidencia local] se preparó cifrado, pero la revisión automática rechazó el clic final de firma/envío por no reconocer autorización concreta suficiente para PDF/destinatarios/cotización. No se eludió el rechazo. La solicitud venció a las 17:47:06 Chile; la consulta del mismo intento la cerró cancelled/signature_request_expired, signed_xdr y transaction_hash nulos y reserva liberada. Auditoría independiente: cero firmas financieras, envíos y cargos nuevos, historial 5/6 y grant6 true/true. Se creó explícitamente una copia privada del borrador y se descargó: 964 bytes, SHA-256 [identificador en evidencia local], igual al original.

Recuperación schema9 INERTE, sin aprobación propia ni activación: manifiesto [identificador en evidencia local], sólo nuevo PDF request [identificador en evidencia local] y nonce; C5/C6 y nota C2/receta #3 intactos. Mantiene cierre fijo del 25 de octubre 21:06:45 Chile, máximo conjunto 40 XLM incluidos los 9,3618202 ya cobrados, topes 15/15/6 y reserva6. No hay otra renovación, fondeo ni extensión. Guardas exigen prueba del PDF vencido sin efectos y reserva liberada; otras reservas hermanas pagadas/inciertas bloquean sustituciones que oculten gasto.

Se corrigió la revisión preparada: cotización desde la reserva canónica, vencimiento min(preparedAt+90,maxTime) sin renovarlo al consultar; documento/bytes/SHA, autor, paciente, Testnet y máximo ofrecido derivan del sobre cifrado verificado. Sin revisión/cotización verificadas o vencidas, no se llama a Privy. 1.854 pruebas de aplicación aprobadas, tres opt-in PostgreSQL omitidas en esa ejecución, 476 privadas aprobadas, TypeScript sin errores y revisiones cruzadas sin bloqueantes. Compilación final en curso. Próximo ensayo: revisar en borrador, preparar sólo con el usuario presente y que el usuario confirme en Privy; el agente concilia cada recibo antes de seguir. Semanas 3 y 4 permanecen abiertas; ambos permisos siguen activos.

Aprobación de continuación recibida y registrada una sola vez el 25 de octubre a las 17:06:45 Chile: enmienda schema 8 [identificador en evidencia local] y aprobación [identificador en evidencia local]. Cierre fijo 21:06:45 Chile; máximo conjunto 40 XLM de Testnet, incluidos 9,3618202 C2/C3, topes pendientes 15/15/6 y reserva de retiro 6 intactos. No hay otra renovación ni fondeo. Brave no completó la inicialización del iframe de firma de Privy; no se consumió ningún slot. En el navegador integrado se recuperó la misma sesión médico de prueba, se verificó una firma efímera sin transacción y se guardó el PDF original de 964 bytes como borrador privado. Todavía no se prepararon, firmaron ni enviaron C4/C5/C6. Se corrigió compatibilidad de los metadatos de borrador con el ensayo sin omitir HMAC, autoría, revisión ni contenido cifrado: 1.791 Vitest aprobadas, tres PostgreSQL opt-in omitidas en esta ejecución, 218 focales incluidas, TypeScript 0 errores y revisión independiente sin bloqueantes. Compilación de esta corrección en curso; el servidor se detuvo temporalmente para sustituir el build. Evidencias: CONTINUACION-MISMO-PRESUPUESTO-APROBACION.json y PRUEBA-FLUJO-NAVEGADOR-INTEGRADO.json en la carpeta de presupuesto de D. Semanas 3/4 siguen abiertas.

Continuación preparada y compilada: build 5PiUBuSXZiaT-KcaBMPjC, servidor local 3016/sesión 4059, con escrituras generales y patrocinio false y sin alcance de ensayo activo. 471 pruebas privadas, 207 relacionadas de aplicación y TypeScript aprobados; revisión independiente sin bloqueantes. Simulaciones de sólo lectura refrescadas a las 17:03:29 Chile del 25 de octubre, ledger 5387004, conservaron ofertas 0,4150886/0,4128611/0,4056750 XLM y permisos true/true revisión 6. La enmienda de sólo plazo schema 8 sigue INERTE y sin aprobación propia. No se ejecutaron PDF, corrección ni retiro ni se aumentó el presupuesto.

Preparación posterior del 25 de octubre (16:49 Chile): se releyeron C2/C3 con sobres y cargos canónicos, cinco antecedentes/seis versiones, médico v5 vigente hasta las 21:52:02 y grant revisión 6 true/true; C4/C5/C6 siguen sin filas. Las simulaciones diagnósticas unsigned del ledger 5386833 ofrecieron 0,4150886/0,4128611/0,4056750 XLM para PDF/corrección/retiro (1,2336247 futuro); requieren compromiso cifrado y nueva cotización exacta al preparar. Máximo conjunto intacto 40 XLM, incluidos 9,3618202 cobrados, con 6 reservados para el retiro. No se activó ni aprobó la propuesta de 150 XLM.

Se preparó la enmienda de sólo plazo schema 8, manifiesto [identificador en evidencia local]: hasta cuatro horas desde una única aprobación nueva, sin pasar del 25 de octubre a las 21:30 Chile, manteniendo médico/identificadores/contenidos/15-15-6 y máximo 40. No hay aprobación propia ni activación; la ventana anterior de las 13:18 sigue vencida. El cargador rechaza preview/copia y repetición de C1/C2/C3; la guarda agregada no se reinicia por nueva ventana o día UTC. El patrocinio propuesto sólo de proceso limitará a 30,6381798 XLM futuros, incluida reserva 6, mientras las escrituras generales permanecen false. 471 pruebas privadas, 207 relacionadas de aplicación y TypeScript aprobados; la revisión independiente no encontró bloqueantes. Detalle revisable en la carpeta D, presupuesto-medico-2026-10-25/RESUMEN-PRESUPUESTO.md y CONTINUACION-MISMO-PRESUPUESTO-PROPUESTA.json. No hubo firmas, envíos, fondeo, renovación ni solicitudes clínicas nuevas.

Verificación final local (25-10-2026, 16:12:58 Chile): build SIvFeAe2KYCKeJmT_UWZz y TypeScript aprobados; 108 archivos/1.783 pruebas Vitest aprobadas, tres casos PostgreSQL opt-in omitidos en esa ejecución y aprobados por separado; 463 pruebas Node privadas y tres pruebas PostgreSQL reales aprobadas. En la sesión médica existente se guardó un borrador sintético, se recargó el portal y se recuperaron el título y el texto íntegros sin volver a seleccionar la ficha. El borrador se conserva, sin preparar publicación, firma ni envío. El historial cargó cinco antecedentes/seis versiones y la receta #3; se corrigió el timeout mediante índice lineal y hasta tres lectores independientes por solicitud, manteniendo controles de integridad y permisos. No se tomó una medición de latencia ni se acredita aún carga clínica integral de diez confirmaciones concurrentes.

Las simulaciones diagnósticas sin firma del 25-10 a las 15:45:26 Chile ofrecían aproximadamente 0,4150886/0,4128611/0,4056750 XLM para PDF/corrección/retiro. Son formas sintéticas, no los intentos guardados ni cargos o cotizaciones vinculantes. Muestran la variación de Testnet; cada operación real necesita una simulación exacta nueva antes de firmar. No reabren el plazo vencido ni habilitan gasto. Evidencia y capturas: presupuesto-medico-2026-10-25/RESILIENCIA-IMPLEMENTACION-Y-VALIDACION.json, resiliencia-borrador-guardado.png y resiliencia-borrador-recuperado.png en la carpeta de continuidad D.

Se implementó el primer bloque del plan aprobado: borradores privados cifrados y recuperables, revisión optimista y publicación única por revisión, presupuesto persistente por patrocinador/paciente/día, límites por aporte y sus versiones, cotizaciones de 90 segundos y reserva de retiro para patrocinador y paciente. La reserva, el intento y el vínculo del borrador se confirman juntos; no se hace RPC bajo los bloqueos presupuestarios. SUCCESS/FAILED cuentan el cargo canónico; UNKNOWN conserva la reserva y el mismo sobre/hash.

La migración aditiva clinical-resilience-v1 se aplicó exclusivamente al Neon dev permitido: clinical_private_drafts, sponsorship_daily_buckets y sponsorship_reservations, con índice y trigger de contexto inmutable. No reescribió historias ni operaciones existentes. Tres pruebas PostgreSQL reales pasaron: diez solicitudes concurrentes sólo admitieron tres que cabían en el límite; UNKNOWN/conciliación sintética sin doble cargo; protección de borradores y rollback. Los recibos de esas pruebas son sintéticos y no constituyen evidencia Stellar.

El médico puede recuperar borradores sin seleccionar primero la ficha. El modo de recuperación conserva sólo contenido propio y no consulta recetas ni autoriza acceso a pacientes. Los intentos cancelados sin firma ni hash permiten una copia explícita del borrador para otra revisión; los enviados, confirmados o inciertos conservan el vínculo original. No se prepara otra publicación automáticamente.

La administración dispone de GET /api/admin/sponsorship-status y tarjeta en /admin/doctors, con agregados sin identificadores y cobertura explícita new_reservations_only. Los 9,3618202 XLM anteriores del ensayo no se incorporan a ese libro nuevo ni se presentan como cero gasto histórico.

Los caminos de patrocinio no integrados quedan denegados antes de firmas/envíos/fondeo; lecturas y recibos siguen disponibles. La configuración del nuevo patrocinio está deshabilitada. No se activaron límites de producción ni se aprobaron 150 XLM.

El prototipo episode/v1 es un laboratorio aislado: una nota y sus adjuntos exactos en un manifiesto cifrado por paciente/autor/revisión de consentimiento, un compromiso por versión final y autorización de receta independiente. Para nota+PDF nuevos reduce la estructura de dos anclajes/seis entradas a un anclaje/tres entradas; no es una medición de comisiones ni está conectado a publicación. El contrato y los lectores actuales se conservan.

La ventana del ensayo anterior terminó el 25 de octubre a las 13:18 de Chile. C2/C3 permanecen confirmadas; PDF, corrección y retiro siguen pendientes y los permisos siguen activos en cadena. No hubo nuevos envíos Stellar, fondeo ni renovación. Semanas 3 y 4 no están cerradas.

Configuración futura: TRUSTLEAF_SPONSORSHIP_ENABLED, SPONSOR_DAILY_LIMIT_STROOPS, PATIENT_DAILY_LIMIT_STROOPS, MAX_FEE_STROOPS, ENTRY_LIMIT_STROOPS, EMERGENCY_RESERVE_STROOPS y PATHS, cada nombre con prefijo TRUSTLEAF_SPONSORSHIP_. Cantidades enteras en stroops. Sólo /api/private-clinical-operations está integrada. El límite ENTRY cubre una entrada y sus correcciones en V1; una atención agrupada requiere activar y validar el formato futuro. No utilizar cotizaciones de Testnet como precios Mainnet.

Antes de producción siguen pendientes: medir tarifas y latencias en la red elegida, fijar presupuestos y reserva de retiro con sus cotizaciones, política de conservación/restauración/rotación de claves, pruebas de carga del recorrido clínico completo y mantenimiento TTL aprobado. No se migran contratos ni consentimientos automáticamente. Conservar las claves antiguas mientras existan sobres que las requieren y probar recuperación con fixtures antes de rotar.



## Corte histórico previo al plan de estabilidad: diagnóstico causal

> **Corte histórico previo al plan de estabilidad:** diagnóstico causal confirmado, sin ampliación financiera autorizada. La implementación y verificación vigentes se describen al inicio. El alquiler Soroban explica por reconstrucción 99,99362% de los recursos: protocolo 29, estado medio 4.059.937.606 B sobre objetivo 4.000.000.000, alquiler 2.032.895 stroops/KiB. C4 unsigned diagnóstico 26,3676379 recursos+0,4 local=26,7676379 ofrecidos; no cargo ni doble comisión local. Tres entradas 264/504/392 B (1160 total), PDF fuera de cadena. TTL nuevo 120.960 ledgers (~7 días): touch(17.280,518.400) es condicional y no extiende esas entradas nuevas a 30 días. No hay parámetros completos por minuto para atribuir cada salto histórico. Siguen 40 XLM/C2+C3 auditadas 2/5, cobro 9,3618202 (linaje 9,4379618); 150 no autorizado. PDF/C5/C6 sin firma, ambos permisos rev 6 activos y plazos 13:18/21:52:02 intactos, sin nuevas acciones financieras/código/activación o retiro autónomo. Diagnóstico causal (archivo local), reconstrucción técnica (archivo local).

### Corte anterior de activación 7 — antes del nuevo ingreso médico

La redistribución fue aprobada una sola vez el **25 de octubre a las 10:16:34 Chile (2026-10-25T13:16:34Z)**. Manifiesto schema 7 **[identificador en evidencia local]** y aprobación propia **[identificador en evidencia local]**. Build final **A5jHDtmuBYg5yKsg1LWqB**, servidor **31436** activo desde **13:40:38Z (10:40:38 Chile)**, tres pins del proceso y escrituras generales false, sin cambios de entorno. **96 archivos/1619 Vitest, 460 Node, TypeScript/build PASS**, revisión cruzada sin hallazgos y preflight 7 completo PASS a las 13:40:29Z; tres rutas privadas sin sesión 401/no-store. No hubo cambios SDK/app posteriores a pruebas/build. Los 149 tests UI focales están incluidos en la suite completa, sin sumarlos aparte.

El máximo conjunto **C2–C6 permanece 40 XLM**, incluidos **9,3618202 XLM** cobrados por C2/C3; restan **30,6381798 XLM**, con **6 XLM reservados para retiro**. PDF/corrección tienen topes individuales 15/15, sujetos a disponibilidad conjunta de 24,6381798 antes del retiro y de otras reservas. La guarda al preparar/firmar/enviar suma cargos canónicos, ofertas de otros intentos, candidato y reserva sin duplicar el candidato/retiro. Firmados UNKNOWN reservan su oferta completa; prueba de recibo no verificable bloquea. Los máximos individuales no son sumables como gasto independiente ni el nominal 52 autoriza 52. Cuatro recibos anteriores suman 0,0761416: techo del linaje **40,0761416 XLM**. Mismos IDs/nonces/contenidos/actores/contratos/pagador; ejecución hasta **hoy 13:18 Chile**, C1 v5 hasta **21:52:02 Chile**, sin repetir renovación, nota o permisos confirmados.

**C2s SUCCESS**, hash **[identificador en evidencia local]**, ledger 5381518: ofrecido 7,4964051/cobrado **6,4151056 XLM**. Se revalidó bajo su manifiesto 32 original sin repetir. El paciente verificado en Mi cuenta leyó nota médica v1, autor y receta histórica #3 Vencida intacta. **C3 SUCCESS**, hash **[identificador en evidencia local]**, ledger 5381977: ofrecido 3,7890734/cobrado **2,9467146 XLM**, grant **lectura=true/agregado=true, revisión 6**. Seis recibos del linaje cobraron **9,4379618 XLM**; historia auditada **cinco antecedentes/seis versiones**, C1 v5 intacto y tres UUID futuros libres.

**C4 todavía sin fila/firma/envío.** Su quote unsigned observada el 25 de octubre a las **13:34:59Z** ofreció **14,0402941 XLM**, dentro de 15. Exposición 29,4021143 = pagado 9,3618202 + candidato 14,0402941 + reserva 6; no es cargo ni garantiza la siguiente preparación. La quote anterior del PDF 10,7433575 superaba el antiguo tope 10. C5 se cotizó prospectivamente 9,0316234 antes de C4 y no evita ese orden; C6 unsigned anterior 3,9464547 tampoco es garantía. No se crea otra solicitud para repetir una operación confirmada.

IAB paciente cerró sesión y el médico existente **médico de prueba** espera el OTP privado de Privy; todavía no se acredita ingreso nuevo, comprobación local de firma de esta sesión ni lectura médica tras C3. La comprobación Ed25519 IAB anterior y dos fallos previos de proxy Brave conservan su corte histórico, sin atribuir causa exclusiva al navegador. No se crea wallet, ficha o receta ni se solicita una renovación nueva.

La mejora UI del mensaje genérico observado en C3 está incluida en el build activo: lista cerrada por código y textos fijos para fee_exceeded, budget_exceeded y budget_unavailable; sin datos del proveedor. budget_unavailable 503 conserva el mismo intento y bloquea otra firma; no agrega reintentos automáticos ni cambia el clasificador Privy. Pruebas de UI/cliente 149 incluidas en el total; comprobación manual del nuevo mensaje todavía pendiente. Los rechazos antiguos de nota/C3 ocurrieron antes de INSERT/firma/envío y no acreditan cancelación humana.

Faltan lectura médica con ambos permisos, C4 PDF con recibo/descarga idéntica/SHA, C5 propia v1/v2, persistencia nominal 6 antecedentes/8 versiones, C6 retiro y rechazo médico posterior, cierre de escritura, QA manual, video, revisión y aceptación formal. Semanas 3/4 siguen abiertas. Fuentes actuales del paquete: REDISTRIBUCION-VALIDACION-Y-ACTIVACION.json, REDISTRIBUCION-PREFLIGHT-AUTORIZADO.json y REDISTRIBUCION-C4-COTIZACION-PREFLIGHT.json.

## Corte previo a la aprobación de sustitución — 25 de octubre de 2026

**Semana 3 abierta. C2 vencida sin firma, envío ni cargo; sustitución única propuesta y pendiente de autorización humana nueva. C6 no se preparó ni ejecutó.** La renovación C1 no se repite y todavía no existe nota, PDF ni corrección médica nuevos confirmados.

La auditoría independiente de C2 terminó a las **07:30:34 de Chile** (2026-10-25T10:30:34.752Z, ledger 5380129): cancelled/signature_request_expired, sobre sin firma conservado, signed_xdr y transaction_hash nulos. El intento creado a las 07:22:02 venció a las 07:27:14. Su **cotización realmente persistida fue4,2361592 XLM de Testnet**, dentro del tope de 5 XLM; no es un cobro. La cotización diagnóstica anterior3,441638 XLM era distinta y tampoco fue cobrada. No se atribuye cancelación humana a una excepción genérica del SDK Privy.

| Elemento | Estado auditado |
|---|---|
| Confirmaciones nuevas de los cinco pasos | **0/5**; C2cancelada y los otros cuatro UUID todavía ausentes en la auditoría |
| Confirmaciones históricas conservadas | Cuatro recibos; **761416 stroops, 0,0761416 XLM** cobrados en total |
| Renovación C1 | SUCCESS, hash [identificador en evidencia local], ledger 5373242; médico v5 hasta **hoy a las 21:52:02 Chile** |
| Ficha y permiso | **Cuatro antecedentes/cinco versiones**, todas verificadas; lectura=false/agregado=true, revisión 5 |
| Retiro C6 | No preparado ni ejecutado; conserva el retiro anticipado autorizado desde revisión 5 o 6, máximo de 1 XLM, como alternativa |
| Ventana de ejecución ya aprobada | Desde las 07:18 hasta **hoy a las 13:18 Chile**; la aprobación de sustitución no ampliará esas fechas |

### Candidata schema 5 pendiente

Identificador [identificador en evidencia local]; SHA-256 **[identificador en evidencia local]**. Pina como base el manifiesto schema 4 **[identificador en evidencia local]** y su constancia **[identificador en evidencia local]**.

Propone un único UUID y nonce nuevos para **la misma nota sintética y receta histórica #3**, y cambia únicamente la entrada derivada a la que apuntará su corrección. Los otros cuatro intentos/nonces, cuentas, wallets, ficha, contratos, contenidos, PDF, permisos, pagador y topes **5/1/5/5/1 = 17 XLM** permanecen. Las dos notas vencidas se conservan sin reintento ni nuevo vencimiento. Se mantienen hasta nueve transacciones distintas enviadas y once solicitudes almacenadas en todo el linaje, incluidas las dos notas canceladas sin envío. El máximo efectivo acumulado, con todos los topes futuros completos, sería 17,0761416 XLM de Testnet.

Antes de preparar esa nueva nota, el médico deberá pulsar una **comprobación local de firma con Privy**, también incluida en la autorización nueva. Genera un reto aleatorio con dominio fijo, verifica la firma Ed25519 en memoria y no crea una solicitud clínica, envía una transacción ni cobra comisión. No concede permisos ni renueva al médico. El servidor sólo muestra el botón al médico del alcance schema 5 aprobado; debe verificarse antes de reservar cualquier aporte nuevo de ese alcance. No se realizó con las wallets reales.

**No existe constancia de aprobación ni activación de schema 5 en este corte.** Código congelado y revisión/pruebas aisladas disponibles; las suites completas y compilación finales se están validando y no se declaran terminadas aquí. El interruptor general de escrituras permanecefalse y no se cambian archivos de entorno. Ver [controles de aprobación](../clinical-rehearsal-authorization.md) y [continuación](CONTINUACION-ENSAYO-MEDICO.md).

El recorrido nominal pendiente sigue siendo nota, PDF idéntico, corrección propia v1/v2 y retiro confirmado con rechazo posterior del médico, dejando seis antecedentes/ocho versiones. Para semana 4 quedan QA integral, video, guía, revisión y aceptación formal. No hay cierre de semana 3 ni 4. Los apartados siguientes conservan cortes históricos.

## Corte histórico del entregable — 24 de octubre de 2026

**Ensayo parcialmente ejecutado. Semana 3 abierta; continuación pendiente de una nueva aprobación.** Se conservan las cuentas, wallets, ficha y contratos originales. El cierre técnico, el video, la revisión y la aceptación formal no están acreditados.

La auditoría de sólo lectura terminó el **24 de octubre a las 21:26:33 de Chile** (`2026-10-25T00:26:33Z`), ledger 5372881. Este es el corte del estado siguiente; el vencimiento médico se indica de forma absoluta y no se interpreta como una vigencia renovada.

| Elemento | Estado auditado |
|---|---|
| Historial original | Cuatro antecedentes y cinco versiones; sus cinco versiones canónicas fueron comprobadas |
| Médico de prueba | Registro v4, sin revocación, con vencimiento fijo el **24 de octubre a las 21:46:49 de Chile** |
| Permiso clínico | `canRead=false`, `canAppend=true`, revisión 5; el retiro final sigue pendiente |
| Operaciones del ensayo | Tres transacciones confirmadas: renovación, sólo lectura y sólo agregado |
| Nota médica TX4 | Solicitud vencida y cancelada con `signature_request_expired`; sin sobre firmado ni hash persistidos; no se agregó una nota |
| Colas competidoras | Cero intentos pendientes en las colas comprobadas |
| Recetas existentes | #3 vencida y #4 revocada; no se emitieron ni reactivaron recetas |

Los tres recibos anteriores se releerán cuando corresponda y **ya fueron nuevamente contrastados con RPC y sus sobres persistidos** en la auditoría indicada. Sus costos efectivos suman **756690 stroops, 0,0756690 XLM de Testnet**. No hay transacciones ni comisiones nuevas de la continuación.

| Acción confirmada el 23 de octubre | Recibo Testnet | Costo efectivo |
|---|---|---|
| Renovación v3→v4 | 3cf5cced…18e4bb (evidencia local) | 0,0004726 XLM |
| Sólo lectura, revisión 3→4 | 0e9798dd…31215 (evidencia local) | 0,0376536 XLM |
| Sólo agregado, revisión 4→5 | 43e1f8d2…0c9f0f (evidencia local) | 0,0375428 XLM |

El usuario confirmó la descarga y apertura del PDF previo desde la cuenta médica con sólo lectura. Después se comprobó el modo sólo agregado sin cronología ni archivos, con selector privado de recetas disponible. Esas observaciones no acreditan la nota nueva, su corrección ni el futuro PDF médico.

## Planes conservados y propuesta vigente para revisión

El plan v1 `[identificador en evidencia local]` terminó el **24 de octubre a las 03:46:49 de Chile**. La enmienda `[identificador en evidencia local]` **nunca se aprobó**, tampoco se activó y quedó vencida. Sus manifiestos y el intento cancelado se conservan como antecedentes; no se reutilizan sus aprobaciones para otro plazo o intento.

La candidata actual es schema 2, run `[identificador en evidencia local]`, SHA-256 `[identificador en evidencia local]`. Está **preparada, sin aprobación ni activación**. Propone seis transacciones futuras: renovar al mismo médico v4→v5; agregar la nota sintética con receta histórica #3; conceder ambos permisos; agregar el PDF; corregir la nota propia; retirar ambos permisos. Tope: **1 XLM de Testnet por paso y 6 XLM de Testnet futuros**. Las tres previas no se repiten: máximo nueve transacciones distintas enviadas en todo el linaje.

Las condiciones, el retiro anticipado, el inicio mínimo y las ventanas fijas de seis y 24 horas desde una sola aprobación se describen en [Continuación del ensayo médico](CONTINUACION-ENSAYO-MEDICO.md). La vista previa técnica no autoriza una ejecución. La continuación aprobó 93 archivos/1.484 pruebas de aplicación, 352 pruebas privadas, TypeScript y la compilación RLXHkeRppJyRqrWXKyp-Y. Relectura del paciente el 24 de octubre a las 21:48:12 de Chile: mismos cuatro antecedentes/cinco versiones, permiso sólo agregado y confirmaciones bloqueadas. El médico vuelve a quedar bloqueado por el vencimiento del registro v4; no hubo otra renovación. La ejecución de los seis pasos sigue pendiente de nueva aprobación.

## Límites operativos actuales

`TRUSTLEAF_PRIVATE_WRITES_ENABLED=false` se mantiene. La autorización anterior no habilita otra renovación ni un reemplazo del intento vencido. El vencimiento de un plan no retira automáticamente un permiso clínico concedido; la revisión 5 sólo agregado permanece hasta un retiro confirmado. El vencimiento del registro médico y ese permiso clínico son controles distintos.

No se proponen contratos nuevos, migración, fondeo, otras wallets o fichas, ni emisión, activación o revocación de recetas. Las lecturas no restauran TTL. Cada recibo se distingue de sus pruebas aisladas, de la restauración anterior y de los comprobantes históricos de recetas.

## Antecedentes de implementación y preparación — 23 de octubre de 2026

Los apartados siguientes conservan el registro inicial de implementación, restauración y preparación, **anterior a la autorización y las tres confirmaciones del ensayo**. Los estados v3/revisión 3, los builds, los conteos de pruebas y las frases que indican «no ejecutado» describen ese corte histórico. El estado posterior auditado y la propuesta actual están arriba; estos antecedentes no los sustituyen.

Fecha: 23 de octubre de 2026. Implementación local en `codex/sow2-semana-3-aportes-medicos`; sin commit, publicación, despliegue ni aceptación de entrega. El HEAD recibido sigue siendo la base de migración, no un commit de este entregable.

### Comportamiento implementado

El paciente conserva su ficha y muestra un código opaco que puede compartir con el médico. El portal médico incorpora Fichas de pacientes. Elegir un código sólo selecciona una ficha: el servidor deriva el usuario y la wallet desde Privy y comprueba perfil médico activo, autorización vigente en el registro fijado y permisos actuales del paciente.

Lectura y agregado son independientes. Con sólo lectura, el médico puede consultar notas y documentos, sin preparar aportes. Con sólo agregado puede preparar un nuevo aporte; no recibe la cronología, notas, archivos ni metadatos de corrección. Con ambos puede consultar y añadir. Sólo el autor puede corregir su última versión; las anteriores permanecen cifradas y conservan sus comprobantes. La pantalla muestra fuente, cuenta del autor, fecha y versión.

Preparación, firma y reintento usan el mismo mecanismo persistido del paciente: identidad y permisos revalidados, versión y revisión esperadas, exclusión por wallet entre recetas y clínica, sobre firmado guardado antes del envío y recuperación del mismo hash. Un cambio de revisión o retiro de permiso bloquea nuevas firmas y reenvíos. La consulta de un recibo ya ejecutado sigue siendo histórica y no concede acceso actual al contenido. Las excepciones limitadas de demostración del paciente no habilitan aportes médicos, ni siquiera para intentos guardados antes de cambiar el modo.

### Recetas en contexto

Una nota puede vincular una receta confirmada existente. Su UUID queda dentro de la nota cifrada y cubierto por el compromiso clínico, sin columna ni contrato nuevos. La selección se limita al paciente de la ficha y al usuario/wallet que ya es paciente o emisor de la receta. Se conservan ID de receta y consulta, estado, vencimiento y hash existente. La preparación, firma y reintento comprueban el acceso de receta independientemente del permiso clínico.

El documento se abre por el flujo privado de recetas existente, que vuelve a comprobar su acceso. Un médico distinto del emisor no recibe la receta sólo por leer la ficha. Si un enlace ya no puede autorizarse, se conserva cifrado en su versión y la respuesta oculta su identificador; la interfaz deja el documento cerrado y evita una corrección accidental de ese vínculo no comprobado. Las nuevas versiones pueden revisar vínculos accesibles; las versiones anteriores no se sobrescriben.

Para relacionar un PDF o imagen con una receta se añade una nota contextual vinculada; el contenido del archivo no se altera ni se reemite una receta. La verificación de receta conserva el alcance del sistema existente: registro actual en el contrato y hash de emisión de la fila confirmada; no añade una auditoría independiente del sobre histórico. Ver `docs/clinical-prescription-links.md`.

### Límites operativos

No se cambiaron contratos, claves, esquema remoto, permisos ni vigencia médica. Las escrituras del entorno local permanecen apagadas. La cuenta médica de prueba está vencida y los permisos del paciente están retirados; el portal continúa bloqueándola. El ensayo positivo real exige una renovación y permisos explícitos, más firmas del propietario, con autorización específica antes de efectuar transacciones.

Las lecturas no restauran TTL automáticamente: clínica y recetas rechazan restauraciones pendientes o entradas archivadas. La restauración de la migración fue una operación separada previamente autorizada; no autoriza otras restauraciones.

### Verificación

Las pruebas aisladas ejecutan rutas, identidad, cifrado, firma y auditoría de sobres reales de la biblioteca sobre adaptadores locales, sin servicios externos. La integración recorre creación del paciente, archivos/versiones, permisos separados, lectura médica, nota y corrección del médico, aporte con sólo agregado, revisión del paciente, revocación, aislamiento y recuperación sin segunda firma. Sus hashes son simulados y no se usarán como evidencia Testnet.

Verificación de esta implementación: TypeScript aprobado; 86 archivos y 1.292 pruebas de aplicación aprobados; 269 pruebas privadas aprobadas; compilación de producción aprobada. Permanece la advertencia opcional de Privy sobre Farcaster, ya existente en la migración. No se afirma demo Testnet ni aceptación contractual a partir de pruebas locales. La relectura autenticada de la compilación estable se comprobó en el navegador: ficha original, cuatro antecedentes/cinco versiones y código compartible visibles. El fallo observado durante las recargas de desarrollo no se reprodujo en esta relectura. El recorrido positivo del médico sigue pendiente de autorización y renovación.

### Recetas existentes recuperadas y lectura real

El usuario autorizó por separado una única restauración de cuatro entradas de recetas: WASM, instancia y los dos registros existentes de esta pareja de prueba. Confirmada en Stellar Testnet, ledger 5355603, hash `[identificador en evidencia local]`. El límite aprobado fue 99,38 XLM de Testnet; la tarifa del sobre fue 77,4904097 y el costo efectivo 67,3830537 XLM de Testnet. La relectura independiente encontró las cuatro entradas vigentes en ledger 5355606, con TTL mínimo 5476562. No se emitieron recetas ni se cambiaron permisos, vigencia médica o contenido clínico.

El selector autenticado del paciente recuperó las recetas #4/consulta 77 y #3/consulta 76. El portal privado comprobó sus estados en Stellar; #4 está revocada y #3 vencida. Se abrieron los dos documentos sintéticos históricos con acceso existente: #4 Revocada y #3 Vencida, conservando sus recibos de emisión originales. Seleccionar una referencia en un borrador temporal no guardó una nota ni creó un vínculo persistido. Los estados históricos de estas recetas no se presentan como recetas actualmente utilizables.

Evidencia local de la restauración y del navegador en `validacion-2026-10-23/` del directorio de continuidad: `semana3-recetas-restauracion.json`, `semana3-recetas-verificadas.png` y `semana3-receta-documento-historico.png`. Esta evidencia de mantenimiento y lectura no acredita nuevos aportes médicos ni cierra el entregable.
La comprobación real detectó que el selector y la referencia clínica daban prioridad visual a vencimiento sobre revocación/bloqueo. Ambos usan ahora `prescriptionLabel`, el mismo helper del portal de recetas: Revoked+expired muestra Revocada; Blocked+expired muestra Bloqueada; Active+expired muestra Vencida. Tres casos de regresión cubren selector y nota vinculada. El verificador del servidor conservaba correctamente ambos campos; no se alteró ningún estado de receta.

Antes del ensayo positivo se requiere un control local de alcance para pareja, ficha, acciones, duración, cantidad de intentos y presupuesto; las excepciones actuales del paciente no lo cubren. La ruta administrativa fija 30 días y el worker `--once` no selecciona una petición concreta. No habilitar el flag global como sustituto de ese control ni prometer renovación de 24 horas mediante esa ruta sin prepararla. Preflight de sólo lectura: perfil médico activo, autorización de registro v3 vencida sin revocación; permisos clínicos read/append retirados, revisión 3; colas comprobadas sin intentos pendientes.
Relectura final de la compilación `cSUHgMOqT1kBQbn1XT0ZT`: sesión del paciente conservada, cuatro antecedentes/cinco versiones comprobados; selector muestra #4 Revocada y #3 Vencida con el helper corregido. Selección por teclado comprobada y borrador descartado. La ficha queda abierta sin operación pendiente. Suites finales: 86 archivos/1.292 pruebas de aplicación; TypeScript y compilación final aprobados. Las 269 pruebas privadas previamente aprobadas no se repitieron por esta corrección de presentación. Las tres rutas de historia/recetas/contexto médico mantienen 401/no-store sin sesión.
### Preparación inicial del plan v1 — antes de la autorización del 23 de octubre

Se implementó y probó el permiso local por pareja, ficha, ocho UUID fijos, contenido, pagador, acciones, fecha y presupuesto. El manifiesto protegido es `[identificador en evidencia local]`, SHA-256 `[identificador en evidencia local]`. No se activó en el entorno. La renovación canónica usa el revisor Privy existente, expediente cifrado y versión 3→4; el worker selecciona únicamente ese pedido y conserva el mismo sobre para reconciliación sin volver a firmar. El modo general sigue en 30 días; esta excepción exige aprobación exacta y fecha fija.

Propuesta: ocho transacciones como máximo, 1 XLM de Testnet por paso/8 XLM de Testnet totales, sólo del saldo existente. Ventana de operación hasta el 24-10-2026 a las 03:46:49 de Chile; renovación médica hasta el 24-10-2026 a las 21:46:49. La simulación sin firma de renovación estimó 0,4009439 XLM de Testnet y no requiere restauración. Saldo suficiente comprobado preservando reserva; no se reservó saldo ni se fondeó. Las comisiones clínicas futuras dependen de los permisos aún retirados y se comprobarán antes de firmar, sin exceder el cupo fijo.

Recorrido: renovación; sólo lectura; sólo agregado; nota médica sintética vinculada a la receta histórica #3; ambos permisos; PDF sintético; corrección de la nota propia; retiro de ambos permisos. La ficha terminaría con seis antecedentes/ocho versiones si se completa el recorrido nominal. El mismo último UUID puede retirar anticipadamente los permisos tras cualquiera de las revisiones 4/5/6, sin habilitar otros pasos. El vencimiento de la ventana no retira automáticamente un permiso concedido; se requiere completar ese retiro antes del plazo o informar el estado pendiente.

Preflight real sólo de lectura confirmó las identidades Privy y sus bindings guardados, perfil médico aprobado sin solicitud de onboarding pendiente, tres contratos/WASM, ficha y recetas históricas, revisión 3 sin permisos y colas sin intentos pendientes. La suite completa de la preparación aprobó 91 archivos/1.404 pruebas de aplicación y 306 pruebas privadas, además de TypeScript. No hay firmas, envíos, pedidos encolados, permisos nuevos, migración, publicación ni aceptación. Ver `ENSAYO-MEDICO-SEMANA-3-4.md` y `../clinical-rehearsal-authorization.md`.
Compilación final de esta preparación aprobada: `B5dU3UGnP3YJtTHZUxAeV`. Relectura autenticada del paciente: cuatro antecedentes/cinco versiones y permisos aún retirados; confirmaciones deshabilitadas. Las rutas clínicas conservan 401/no-store sin sesión y la administrativa 401. Verificación final: cero filas de los siete UUID clínicos y cero pedido administrativo del manifiesto en Neon; no se cambió la configuración de escrituras. El paquete permanece preparado a la espera de autorización específica.