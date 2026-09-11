# Notion — reorganización aplicada

7 de septiembre de 2026. El usuario autorizó posteriormente crear el registro público de cuentas y reorganizar Notion. Esa autorización sustituye, para estas páginas, la restricción inicial de mantener toda la entrega solo local.

## Entrada vigente

[TrustLeaf — Inicio y estado vigente](https://app.notion.com/p/TrustLeaf-Inicio-y-estado-vigente-3d47e0b6388480878f55e8dbda5ac3b7)

Creada dentro de la página de proyecto ficha-onchain. Contiene estado resumido, navegación esencial, alcance Semana 1/D1, plan separado de cuatro contratos, responsables funcionales y referencias históricas. No amplía el SOW firmado ni declara aceptación.

## Registro público de cuentas

[TrustLeaf — Cuentas y despliegues Testnet](https://app.notion.com/p/TrustLeaf-Cuentas-y-despliegues-Testnet-3d47e0b6388480ae862dc4959af62ad9)

Creado bajo el SOW anterior y enlazado desde la nueva portada. Incluye la cuenta nueva, confirmación de fondeo, cinco cuentas internas, funciones e IDs históricos de contratos. No contiene claves privadas ni frases de recuperación. No atribuye contratos anteriores a la cuenta nueva ni confunde creador, administrador y relayer.

## Cambios en páginas existentes

- En la página ficha-onchain, la introducción ahora señala la portada vigente. La antigua decía: «Ficha clínica del paciente (EHR). Hoy usa cara de TrustLeaf: rebrand pendiente. Next.js + Privy + Neon.». Se conserva aquí para trazabilidad. El resto de las secciones anteriores permanecen en su sitio, señaladas como contexto previo.
- En SOW — Instawards (Fase 1), el callout de cierre activo fue reemplazado por una indicación de referencia histórica y D1 pendiente. Se conservaron sus enlaces a las páginas previas.
- La celda D1 que decía «En curso · Semana 1 · técnico OK post #95/#96» ahora dice «Pendiente de aceptación · resultados históricos post #95/#96; correcciones y versión final pendientes».
- No se borraron páginas, no se cambió la visibilidad o el uso compartido y no se marcaron entregables como aceptados. El archivo es una clasificación de lectura mediante enlaces, no un traslado a la papelera.

## Verificación

Se recargaron las páginas de cuentas y SOW y se comprobó la persistencia del texto. Se volvió a abrir la nueva portada y se comprobaron el título, la sección D1, el plan de cuatro contratos, el enlace de cuentas y el archivo. No se ejecutaron auditorías ni despliegues de contratos durante esta reorganización.

La revisión automática rechazó marcar la pestaña como entrega porque la reorganización aún no estaba terminada en ese momento. No se reintentó esa marca. Las operaciones de edición y lectura permitidas se completaron y su contenido quedó guardado.

## Cuenta nueva: estado posterior al plan inicial

La cuenta técnica se creó y fondeó después de redactar el plan inicial: consultar [manifiesto público](TESTNET_ADMIN_ACCOUNT.json). Tiene 10.000 XLM de prueba al momento de verificación y su clave se guardó mediante Stellar CLI en el almacén seguro de Windows. El relayer anterior no fue cambiado. No está importada en Freighter y no se creó un respaldo independiente de recuperación.

No se han desplegado los cuatro contratos nuevos ni asignado a esta cuenta permisos sobre contratos anteriores. Las afirmaciones de «sin cuentas nuevas» o «Notion no modificado» en documentos anteriores describen el momento de esos documentos, no el estado posterior registrado aquí.
