# TrustLeaf — plan de cuatro contratos en Testnet

7 de septiembre de 2026. Estado: planificación solicitada; sin cambios de contratos, cuentas nuevas, pruebas o despliegues ejecutados en este bloque.

## Objetivo y alcance

Preparar una nueva generación coherente de DoctorRegistry, PrescriptionSoulbound, DocumentSoulbound y ClinicalRecord con una cuenta de despliegue común bajo control de TrustLeaf. Prioridad: DoctorRegistry y el recorrido aprobación → autorización on-chain → emisión para paciente → presentación verificable.

La preferencia del usuario es recrear las cuatro instancias para ordenar su procedencia. No se ha demostrado que una reescritura completa sea necesaria. Se evaluará qué código puede conservarse y qué debe adaptarse antes de producir nuevos artefactos. La observación del usuario de dos creadores se registra como reportada, no como verificación nueva del explorador.

DispensaryRegistry y DispenseRecord quedan fuera de esta nueva generación de cuatro, salvo decisión posterior. Sus posibles dependencias deben identificarse antes de fijar interfaces. Este plan amplía la planificación a cuatro contratos; no altera retroactivamente el alcance contractual D1, que sigue siendo de dos.

## Cuenta común y responsabilidades

La cuenta que despliega, la que administra permisos, el médico que autoriza una emisión, el paciente propietario y el relayer que paga son responsabilidades diferentes. Un origen de despliegue común no demuestra ni concede todas ellas.

Propuesta: una cuenta nueva de despliegue de TrustLeaf para Testnet, con su custodia y recuperación definidas por el responsable antes de crearla. No se han generado claves ni se solicita compartir secretos en el chat. Registrar separadamente en el manifiesto la cuenta de despliegue, administrador inicial, propietario cuando aplique y pagador de comisiones. Si se usa fee-bump, no confundir el pagador externo con el creador efectivo; la representación del explorador queda por comprobar.

ClinicalRecord está diseñado como una instancia por paciente. Una cuenta común puede ser el origen de despliegue de las instancias sin convertir a TrustLeaf en propietario de todas las fichas. El paquete inicial contendría una ficha de paciente sintético, no un registro global compartido por todos.

## Orden de trabajo y resultados revisables

| Etapa | Trabajo previsto | Resultado para avanzar |
| --- | --- | --- |
| 1. Fijar base | Separar fuente publicada, borradores locales y contratos históricos; mantener intactos los cambios existentes. | Inventario de versiones e IDs anteriores; alcance y responsables definidos. |
| 2. DoctorRegistry primero | Precisar el vínculo entre profesional revisado por TrustLeaf y su cuenta; conservar el alta pendiente hasta confirmar la autorización on-chain. Distinguir aprobación administrativa local de registro contractual. | Especificación de registro, consulta, revocación y transferencia administrativa con criterios de aceptación. |
| 3. Receta | Definir la instancia de Registry que consulta, la cuenta del emisor, asignación inicial al paciente, intransferibilidad, consulta, ciclo y duplicados. | Interfaz y criterios compatibles con el recorrido de la aplicación. |
| 4. Documentos y ficha | Definir emisores y titulares de documentos, su revocación y referencias; en ficha, propietario paciente, acceso de escritura e historial. | Matriz de responsabilidades por contrato y dependencias explícitas. |
| 5. Componentes OpenZeppelin | Evaluar componentes disponibles y versiones compatibles, documentando qué se reutiliza y qué lógica específica conserva TrustLeaf. | Selección justificada; sin atribuir validación automática al generador. |
| 6. Implementación y validación habilitadas | Completar la versión candidata y obtener pruebas vinculadas a esa misma fuente y artefactos. Los trabajos de corrección anteriormente bloqueados no se reanudan desde este plan ni por cambiar de herramienta. | Evidencia aceptada de la versión candidata antes de preparar el despliegue. |
| 7. Preparar despliegue | Identificar dependencias, orden de inicialización, cuenta común y parámetros de cada contrato. | Plan exacto de despliegue, hashes y responsables; sin secretos. |
| 8. Desplegar y verificar | Cuando proceda y esté habilitado: desplegar en Testnet, registrar transacciones, IDs, código y parámetros iniciales. | Manifiesto contrastado con la red; no basta un enlace de explorador. |
| 9. Integrar y demostrar | Configurar referencias nuevas en aplicación; completar alta, firma del médico y relay; mostrar la receta verificada desde el registro real. | Recorrido completo con transacciones reales y datos exclusivamente sintéticos. |

El orden entre documentos, recetas y ficha depende de sus interfaces finales; DoctorRegistry se resuelve primero. No se asume una capacidad de actualización o de cambiar referencias que todavía no haya sido acreditada.

## Criterios por contrato

| Contrato | Evidencia de aceptación que debe entregar el trabajo técnico habilitado |
| --- | --- |
| DoctorRegistry | Administración bajo control de TrustLeaf; alta de cuenta vinculada a profesional revisado; consulta consistente; revocación; transferencia administrativa; decisiones de autorización conformes a requisitos y trazables a la versión final. |
| PrescriptionSoulbound | Consulta al Registry previsto; emisión atribuida a la cuenta autorizada del médico, no al firmante demo por sustitución; paciente correcto; Registered → Active → Revoked; historial conservado; intransferibilidad y prevención de duplicados; pago del relayer distinguido de autorización. |
| DocumentSoulbound | Tipos de documento acordados; emisor y titular definidos; consulta, revocación e integridad de referencias; comportamiento de intransferibilidad acreditado si se conserva ese requisito. |
| ClinicalRecord | Propietario paciente explícito; separación entre pacientes; permisos de escritura e historial según requisitos; vínculos documentales y consultas de la instancia correcta. |

Resolver los hallazgos anteriores sigue pendiente. Ni un creador común, ni cambiar de ID, ni compilar componentes OpenZeppelin equivale a resolución o aprobación clínica.

## Certificados e imagen

Diseñar dos presentaciones diferenciadas: credencial de médico autorizado por TrustLeaf y constancia de receta del paciente. La credencial visual no sustituye la verificación profesional; la constancia debe distinguir estado de la receta y resultado de la consulta técnica.

Primera entrega visual propuesta: vistas de TrustLeaf alimentadas por lecturas del registro y receta de Testnet, con su referencia y resultado de verificación. No es necesario asumir almacenamiento de una imagen dentro del contrato para mostrar esas vistas.

La representación dentro de una wallet es otro requisito: antes de elegir un estándar o metadata se debe definir la wallet objetivo y comprobar su compatibilidad. No publicar imágenes con datos clínicos como metadata pública. La privacidad del contenido se tratará en el diseño y aceptación específicos; no se presume resuelta por una URI o hash.

## Alcance real del MCP instalado

OpenZeppelinStellarContracts quedó añadido, habilitado y configurado con transporte HTTP en la URL proporcionada por el usuario. Las herramientas expuestas incluyen generadores de cuenta, token fungible, NFT, governor, stablecoin y vault. Devuelven código; no son una auditoría del proyecto ni un comprobador del despliegue.

El generador NFT expone configuración de metadata URI y controles opcionales. No expone una opción de soulbound en el esquema consultado: no se asumirá intransferibilidad por generar un NFT. Tampoco hay un generador específico para el registro médico o la ficha clínica. No se han invocado generadores ni enviado código del proyecto al MCP en esta planificación.

## Historial, transición y entrega

Conservar los IDs y evidencias anteriores como generación histórica. No sobrescribir referencias de recetas antiguas ni representarlas como emitidas por los contratos nuevos. Resolver consultas por red, contrato e identificador de registro; definir el cambio de referencias de emisión solo después de la aceptación de la generación nueva.

Entregables finales previstos: cuatro fuentes identificadas, pruebas asociadas, manifiesto de artefactos y despliegue, registro de administración/propiedad, configuración integrada, matriz de aceptación y demostración verificable con datos sintéticos. El certificado ficticio anterior permanece como referencia visual, no como evidencia de este nuevo recorrido.

## Estado real al cerrar esta planificación

- Completado: instalación y consulta de configuración del MCP; inventario de sus capacidades; este plan local.
- Sin ejecutar: creación de cuenta, generación o modificación de contratos, pruebas, publicación, migración y despliegue.
- Pendiente: tratamiento del bloqueo previo de plataforma para corrección/validación. La instalación del MCP no cambia ese estado.
- Consulta de explorador: rechazada anteriormente; la información sobre despliegues utilizada aquí es documental. No se ejecutan alternativas para eludir ese rechazo.

Referencias locales: [matriz D1](MATRIZ_D1.md), [estado de correcciones](../PERMISSIONS_FIX_STATUS.md), [límites de diseño](../DESIGN_CONTRACT_BOUNDARIES.md), [configuración de contratos](../../../src/lib/stellar/config.ts).
