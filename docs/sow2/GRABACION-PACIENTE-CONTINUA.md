# Semana 2: preparación continua del paciente

Esta modalidad permite preparar la grabación sin una ventana de activación de diez minutos. No prepara, firma ni transmite operaciones automáticamente.

## Dos sesiones separadas

- Cuenta A: paciente de prueba sin ficha, con wallet Privy comprobada y cuenta Stellar preparada. Crear la ficha, agregar un PDF sintético y agregar un antecedente escrito durante la toma.
- Cuenta B: historial de ejemplo existente. Mostrar archivos, versiones, recibos y permisos retirados, en consulta. No presentar este historial como continuación de la cuenta A.

La configuración privada de grabación identifica las cuentas concretas. Este documento no publica sus correos ni credenciales.

## Habilitación limitada

`TRUSTLEAF_CLINICAL_PATIENT_DEMO_ENABLED=true` activa sólo las wallets declaradas en `TRUSTLEAF_CLINICAL_PATIENT_DEMO_WALLETS`, con el relayer público fijado mediante `TRUSTLEAF_CLINICAL_PATIENT_DEMO_RELAYER`. Las tres variables son de servidor y deben estar completas.

La modalidad exige producción de Vercel con entorno interno `test`, red Stellar Testnet y la base aislada fijada por la política. Las escrituras privadas generales permanecen apagadas. Rechaza configuración temporal de creación o migración simultánea.

Permite únicamente crear una ficha y agregar o corregir aportes propios. No concede permisos médicos, no habilita recetas o administración y no permite corregir aportes de otro autor. Las otras cuentas pueden consultar sus propios datos conforme a los controles existentes.

Cada wallet dispone de un máximo de 20 operaciones persistidas, contando canceladas y fallidas, sin reinicio automático. Cada operación tiene un máximo patrocinado de 1 XLM de Testnet. El mismo UUID conserva su lugar y se puede consultar, firmar, cancelar o recuperar al alcanzar la cuota. La firma individual sigue venciendo a los 180 segundos; la disponibilidad de la demo no tiene ese vencimiento de diez minutos.

Los archivos PDF, PNG y JPEG conservan el límite de 3.000.000 bytes originales. La codificación y el cifrado ocupan espacio adicional. Contenido y metadatos clínicos se guardan cifrados fuera de Stellar; la red registra permisos y comprobantes, no los archivos.

## Comprobación antes de la toma

1. Verificar las dos identidades y sus wallets sin compartir códigos; ingresarlos sólo en Privy.
2. Confirmar que la cuenta A siga sin ficha y sin intentos pendientes; si existe un intento, recuperar ese mismo UUID antes de continuar.
3. Verificar código, red, lectura de contratos y claves, y comisión mediante simulación sin firma. No financiar ni restaurar estado automáticamente.
4. Confirmar capacidades: cuenta A puede crear y agregar; cuenta B permanece en consulta; permisos y escrituras generales siguen apagados.
5. Dejar preparado el PDF sintético y el texto. Comprobar por pruebas aisladas formatos, límites, propiedad, cuota, presupuesto y recuperación.
6. La primera creación y las cargas reales nuevas se realizan en cámara por el paciente. Su resultado no se presume a partir de CI o del despliegue.

## Video final, hasta tres minutos

| Tiempo | Cuenta y acción |
|---|---|
| 0:00–0:40 | A: iniciar la captura, crear y firmar la ficha, esperar el recibo. |
| 0:40–1:15 | A: seleccionar PDF, revisar y firmar su aporte. |
| 1:15–1:40 | A: agregar y firmar un antecedente escrito identificado como aportado por el paciente. |
| 1:40–2:15 | B: mostrar registros existentes, PDF con dos versiones y recibos. |
| 2:15–2:40 | B: mostrar lectura y agregado retirados. La autorización profesional y los permisos del paciente son controles separados. |
| 2:40–2:55 | Cerrar explicando almacenamiento cifrado, comprobantes en Stellar y datos sintéticos. |

El material bruto puede durar más; recortar esperas sin presentar un resultado pendiente como confirmado. Son tres operaciones nuevas propuestas en A; el resto son consultas de evidencia anterior. No repetir las operaciones de B.

La vista del médico y sus aportes pertenecen al recorrido de semana 3. Esta modalidad no renueva médicos ni acredita su aceptación del revisor, el cierre del SOW completo o una certificación de seguridad.
