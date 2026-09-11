# Privacidad sanitaria chilena: marco para TrustLeaf

Consulta de fuentes oficiales: **2026-09-07, 02:39 UTC**, reloj de sesión verificado. Síntesis documental para decisiones de producto; no es dictamen jurídico, certificación de cumplimiento ni autorización para tratar datos clínicos reales. No se modificó código ni se ejecutaron pruebas o transacciones para este documento.

## Régimen aplicable hoy

La Ley 19.628 considera sensibles los datos de salud. Sus artículos 4 y 10 regulan autorización legal/consentimiento y excepciones sanitarias; no todo tratamiento requiere idéntica base. Exige finalidad, secreto y diligencia, reconoce derechos de información y rectificación y contempla eliminación cuando falta fundamento, con excepciones. El artículo 8 exige mandato escrito para tratamiento por encargo. Debe identificarse quién decide cada tratamiento y bajo qué condiciones actúan proveedores; tener un contrato tecnológico no resuelve automáticamente estas obligaciones. [Ley 19.628, arts. 2, 4, 6–12 y 15](https://www.bcn.cl/leychile/navegar?idNorma=141599).

La Ley 20.584 protege la reserva de la ficha y restringe el acceso de terceros ajenos a la atención, incluso personal del mismo prestador. Permite accesos determinados por la ley y para continuidad del cuidado. **Estar inscrito en un registro de médicos no acredita relación asistencial con cualquier paciente.** Para producto, distinguir identidad profesional, participación en atención, finalidad y permiso concreto; un booleano de interfaz no demuestra por sí solo la autorización correspondiente. [Ley 20.584, arts. 12–13](https://www.bcn.cl/leychile/navegar?idNorma=1039348&idParte=9252036).

El Decreto 41/2012 es el **reglamento sobre fichas clínicas**, no una certificación automática de formato FHIR ni una especificación general de recetas. Regula elaboración, contenido, custodia, protección y eliminación. Su artículo 11 fija conservación mínima de **15 años desde el último ingreso de información**; el artículo 12 establece condiciones de eliminación y constancia. No significa que todo log técnico, telemetría o borrador deba guardarse 15 años: clasificar cada registro y su fundamento. Tampoco justifica publicar permanentemente datos identificables en blockchain. [Decreto 41/2012, arts. 1–2 y 11–12](https://www.bcn.cl/leychile/navegar?idNorma=1046753).

## Reforma próxima: 1 de diciembre de 2026

La entrada en vigor de las modificaciones sustantivas de la Ley 21.719 está fijada para **1 de diciembre de 2026**; hoy no deben presentarse todas como obligaciones ya vigentes. Hay disposiciones transitorias preparatorias. [Artículo primero transitorio](https://www.bcn.cl/leychile/navegar?i=1209272) y [confirmación oficial BCN](https://www.bcn.cl/balance-legislativo/detalle/ficha_LEY_21719_2024-12-13).

La reforma desarrolla obligaciones del responsable y encargado, seguridad proporcional al riesgo —incluyendo cifrado y seudonimización cuando corresponda— y reglas específicas de transferencias internacionales. El nuevo artículo 14 sexies exige reporte sin dilaciones indebidas bajo sus supuestos y comunicación a titulares en categorías determinadas; **no establece un plazo general de 72 horas**. Identificar países, proveedores, roles y garantías del flujo será parte de la preparación; no se verificaron contratos ni ubicaciones efectivas de TrustLeaf. [Ley 21.719, nuevos arts. 14 quinquies–sexies, 15 bis y 27–28](https://www.bcn.cl/leychile/navegar?i=1209272).

## Ciberseguridad: régimen distinto

La Ley 21.663 incluye prestación institucional de salud y determinadas actividades digitales entre servicios esenciales. La aplicabilidad concreta a TrustLeaf y la calificación de operador de importancia vital no se deducen solo de que sea una aplicación sanitaria. El artículo 9 contempla alerta temprana de hasta **3 horas**, actualización de hasta **72 horas** y, para el supuesto especial de operador vital con servicio esencial afectado, **24 horas**; además prevé informe final. Los plazos dependen del sujeto, incidente y reglas aplicables: no usar «toda brecha se notifica en 72 horas» como política universal. No se revisaron aquí designaciones ni instrucciones particulares de ANCI. [Ley 21.663, arts. 4, 9 y 27](https://www.bcn.cl/leychile/navegar?i=1202434).

## Traducción al proyecto y límites

Estas son implicaciones de diseño, no conclusiones jurídicas sobre un despliegue:

- Definir por flujo al prestador/responsable y a TrustLeaf/proveedores como encargados o responsables según decisiones reales; documentar finalidad, accesos, contratos, ubicación y transferencias.
- Separar ficha clínica de logs y borradores; diseñar conservación, recuperación, corrección y eliminación según cada categoría.
- No confundir hash con anonimización, cifrado con base legal, ni pruebas de contrato con cumplimiento sanitario. Ver [mapa técnico](MEDICAL_DATA_FLOW.md) para distinguir propiedades implementadas de afirmaciones comerciales.
- No se identificó en estas fuentes una exigencia de pruebas de conocimiento cero (ZK). Serían una opción técnica a evaluar, no sustituyen autorización asistencial, consentimiento aplicable, contratos o minimización.

No se verificaron exhaustivamente reglamentos técnicos posteriores, resoluciones de interoperabilidad/certificación, instrucciones ANCI ni decisiones de la futura autoridad de datos. Antes de operar con pacientes reales, el responsable debe contrastar este mapa con asesoría jurídica sanitaria y sus contratos/configuración efectivos. La entrega SOW 1 con datos sintéticos no acredita ese paso.
