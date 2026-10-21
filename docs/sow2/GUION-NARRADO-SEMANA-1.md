# TrustLeaf · Guía para narrar la semana 1 del SOW 2

**Versión:** 8 de octubre de 2026 · Español · Duración orientativa: 3–4 minutos.

Úsala como apoyo, sin memorizarla. Ensaya una vez y luego explica cada bloque con tus palabras. Mantén exactos los actores, los resultados y la diferencia entre los archivos privados y los comprobantes públicos.

Este video revisa una ejecución técnica ya completada en Stellar Testnet, con datos sintéticos. La página presenta evidencia guardada; no consulta en vivo ni vuelve a firmar las operaciones. Los tiempos siguientes organizan la narración: no son el mapa de tiempos del video definitivo.

## 1. Apertura y objetivo · 0:00–0:35

**En pantalla:** inicio del [informe local](http://127.0.0.1:3014/) y bloque [Qué entregamos](http://127.0.0.1:3014/#contratos).

**Qué puedes decir:**

> Hola, soy Cristian Brown, de TrustLeaf. En esta primera semana del SOW 2 preparamos y validamos la base técnica de una historia clínica privada.
>
> El paciente decide qué médico puede leer o agregar información. Los documentos permanecen cifrados y Stellar permite comprobar los permisos y los cambios.
>
> Hoy voy a mostrar una ejecución ya completada en Testnet, con datos sintéticos. Esta página reúne sus resultados y recibos.

**Transición:** “Veamos quién hace cada paso”.

## 2. Recorrido: paciente, médico y revocación · 0:35–1:50

**En pantalla:** [El recorrido comprobado](http://127.0.0.1:3014/#ejecucion). Señala los seis pasos en orden. Puedes abrir un recibo y volver a la página; no necesitas leer su hash.

**Qué puedes decir:**

> Primero, el paciente crea su historial. Después concede al médico permiso para leer y para agregar información. Son permisos independientes: leer no permite agregar, y agregar no permite leer.
>
> En esta ejecución, el médico agrega un PDF, lo corrige conservando la versión anterior y agrega una imagen. Para hacerlo, necesita estar autorizado en el registro médico y tener el permiso del paciente.
>
> Finalmente, el paciente retira los permisos. Comprobamos que el siguiente acceso del médico es rechazado. Esto no borra copias que alguien ya haya descargado.
>
> Cada uno de estos seis pasos tiene un recibo confirmado en Stellar Expert. Las firmas se hicieron con identidades sintéticas y herramientas técnicas; no estamos mostrando todavía el portal clínico ni el acceso con Privy.

**Transición:** “Ahora, ¿dónde quedan los archivos?”.

## 3. Archivos privados y comprobantes públicos · 1:50–2:35

**En pantalla:** [Dónde quedan los archivos](http://127.0.0.1:3014/#archivos).

**Qué puedes decir:**

> Los PDF y las imágenes se guardan cifrados en Neon, en la base de desarrollo. Las claves permanecen fuera de esa base. El límite actual es de tres megabytes por archivo original.
>
> Stellar guarda los permisos, las versiones y los comprobantes para detectar alteraciones; no guarda el contenido médico. Las direcciones de las wallets y ciertos metadatos sí son públicos.
>
> TrustLeaf comprueba el acceso y la integridad antes de entregar el contenido. La plataforma puede descifrarlo para un usuario autorizado: no estamos prometiendo cifrado de extremo a extremo.

**Transición:** “Estos son los resultados documentados de la prueba”.

## 4. Resultados, tres contratos y siguiente paso · 2:35–3:50

**En pantalla:** [Qué comprobamos](http://127.0.0.1:3014/#resultados), las [tres tarjetas de contratos](http://127.0.0.1:3014/#tres-contratos) y los límites al final. Deja “Ver evidencia técnica” cerrado, salvo que quieras consultar un detalle.

**Qué puedes decir:**

> Tenemos seis recibos clínicos confirmados y tres versiones cifradas recuperadas. Comprobamos que las versiones anteriores se conservan, que un contenido cifrado alterado es rechazado y que el médico pierde acceso después de revocar. También pasaron catorce pruebas aisladas del contrato clínico. Las pruebas no son transacciones.
>
> Con esta entrega, el flujo de TrustLeaf cuenta con tres contratos. El registro médico comprueba qué médicos están autorizados. El contrato de recetas conserva las recetas y sus estados. Ambos vienen del SOW 1.
>
> El nuevo contrato de historia clínica registra los permisos, las versiones y los comprobantes de integridad. Utiliza el registro médico existente. Vincular las recetas con la ficha y llevar este flujo al portal corresponden a las semanas siguientes.
>
> Esta es la base técnica validada con datos sintéticos. La restauración real de estado archivado sigue pendiente. El informe conserva la evidencia y los límites para que el revisor pueda comprobarlos.

**Cierre opcional:** “El siguiente paso es convertir esta base en el recorrido del paciente dentro de la aplicación”.

## Tarjeta de apoyo: si prefieres hablar con tus palabras

- **Objetivo:** historia privada y permisos controlados por el paciente.
- **Recorrido:** paciente crea y concede → médico agrega y corrige → paciente revoca.
- **Archivos:** cifrados en Neon; claves fuera de la base; límite actual de 3 MB.
- **Stellar:** permisos, versiones y comprobantes; el contenido médico queda fuera.
- **Resultados:** 6 recibos clínicos, 3 versiones recuperadas y 14 pruebas aisladas.
- **Cierre:** 2 contratos existentes + 1 clínico nuevo; las pantallas clínicas vienen después.

## Tres alternativas de apertura

- “En esta semana nos enfocamos en una base concreta: que el paciente decida quién puede acceder a su historial y que los cambios puedan comprobarse”.
- “Voy a mostrar los resultados de la primera semana del SOW 2: permisos del paciente, documentos cifrados y una ejecución verificable en Testnet”.
- “TrustLeaf ya tenía el flujo de recetas. En esta entrega añadimos la base de una historia clínica privada, empezando por sus permisos y comprobantes”.

## Si surge una pregunta

**¿Esto ya funciona desde el portal?** La ejecución de esta semana usa scripts y firmas sintéticas. Las pantallas clínicas y su integración con Privy vienen después.

**¿Blockchain guarda o cifra los exámenes?** No. Neon guarda los archivos cifrados; Stellar registra permisos y comprobantes. Detectar una alteración no demuestra que el contenido médico sea verdadero.

**¿Podemos ejecutar otra prueba durante el video?** Esta grabación revisa la prueba existente. La autorización del médico utilizado venció después de esa ejecución; una nueva ejecución necesita preparación y autorización vigente.

**¿Ya está cerrada toda la entrega?** Hay evidencia técnica para revisar. El video, la revisión de la PR y la aceptación se registran por separado; la restauración real de estado archivado sigue pendiente.

## Para grabar con naturalidad

Habla como si se lo explicaras a una persona que no conoce Stellar. Haz una pausa breve al cambiar de bloque. No leas IDs, hashes ni comandos; usa los enlaces para mostrar que la evidencia se puede verificar. Si te equivocas, repite la frase y continúa: se puede cortar en la edición.

Oculta notificaciones y usa sólo el visor y los enlaces públicos. Deja las claves, los journals y las terminales con secretos fuera de la grabación. No necesitas volver a ejecutar operaciones.

Puedes cambiar las palabras, pero conserva estas precisiones: la prueba ya ocurrió; los actores son sintéticos; la información médica no se publica en Stellar; revocar bloquea accesos posteriores; las pruebas aisladas no son transacciones ni una certificación de seguridad.

## Referencias

- [Informe de entrega](INFORME-SEMANA-1.md).
- [Recorrido técnico y preparación](GRABACION-SEMANA-1.md).
- [Evidencia de la ejecución presentada](../evidence/sow2-week1-runs/ed9cf324-b9f1-400c-aae8-3323a66407ad/report.md).
- [Comprobación de preparación del 7 de octubre](../evidence/sow2-week1-pre-recording-2026-10-07/README.md).
