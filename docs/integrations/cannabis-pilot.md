# Onboarding desde Cannabis y receta soulbound

La paciente se registra y se atiende en TrustLeaf Cannabis. Termina el alta con una cuenta TrustLeaf disponible y entra mediante **Abrir mi cuenta TrustLeaf**. Puede ver sus recetas aunque todavía tenga pendiente abrir la ficha. La apertura de la ficha nativa mantiene la confirmación explícita de su titular.

Durante la consulta, el médico autorizado prepara el PDF en Cannabis y firma la emisión en TrustLeaf. Cannabis conserva el PDF inmutable y el nonce privado. La ficha conserva la referencia autorizada y la evidencia de Stellar Testnet. La credencial vincula a la paciente como titular y al médico como emisor. [API privada v1](clinical-links-v1.openapi.yaml)

## Preparar el entorno aislado

1. Usar una app Privy de prueba compartida, distinta del App ID principal. Configurar clientes web con orígenes exactos para ambos previews. En FichaOnChain, fijar ese App ID en `PRIVY_APP_ID`, `NEXT_PUBLIC_PRIVY_APP_ID` y `TRUSTLEAF_CLINICAL_LINKS_TEST_PRIVY_APP_ID`, su cliente en `NEXT_PUBLIC_PRIVY_CLIENT_ID` y la clave pública SPKI en `TRUSTLEAF_CLINICAL_LINKS_PRIVY_VERIFICATION_KEY`. La continuidad de sesión entre dominios se comprueba aparte. [Sesiones y dominios de Privy](https://docs.privy.io/recipes/react/cookies)
2. Aislar Neon y Supabase para el piloto. En FichaOnChain, configurar `TRUSTLEAF_ENV=preview`, `TRUSTLEAF_DATABASE_URL` y el hostname exacto en `TRUSTLEAF_DB_HOST` y `TRUSTLEAF_CLINICAL_LINKS_DB_HOST`. Activar `TRUSTLEAF_CLINICAL_LINKS_PILOT_ENABLED=true`, incluir los DID de P1 y P2 en `TRUSTLEAF_CLINICAL_LINKS_PATIENT_IDS` y ejecutar `node scripts/migrate.mjs --step=clinical-links-pilot`. Cannabis aplica su migración de onboarding en la base sintética.
3. Registrar el origen HTTPS de Cannabis en `TRUSTLEAF_CLINICAL_LINKS_PARTNER_ORIGIN` y su cliente en `TRUSTLEAF_CLINICAL_LINKS_PARTNER_PRIVY_CLIENT_ID`. Aprovisionar una credencial de vida corta con `node scripts/provision-clinical-links-partner.mjs` y `TRUSTLEAF_CLINICAL_LINKS_PARTNER_CREDENTIAL`. Cannabis recibe la credencial como `TRUSTLEAF_FICHA_LINK_SERVICE_TOKEN` por un canal seguro. En Vercel, autorizar `trustleaf` Preview → `trustleaf-demo` Preview en Trusted Sources y configurar el origen HTTPS exacto de FichaOnChain en Cannabis. [Trusted Sources](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources)
4. Preparar al médico y las wallets sintéticas, el contrato `PrescriptionPrivate` fijado por FichaOnChain y una consulta de prueba con asistencia e inicio confirmados. La operación de emisión usa un mapa explícito de la consulta de Cannabis a esa consulta FichaOnChain en `TRUSTLEAF_PARTNER_RX_CONSULTATIONS`. El operador prepara la atestación de reserva autorizada, el relayer de Testnet y el patrocinio del flujo firmado. Activar `TRUSTLEAF_PARTNER_RX_ENABLED=true` en el entorno aislado. Para el paso de apertura de ficha, habilitar el permiso acotado de creación de la ficha para la wallet sintética y `TRUSTLEAF_CLINICAL_WEB_ENABLED=true`.

La base de FichaOnChain requiere el esquema de agenda y recetas privadas. Ejecutar también `node scripts/migrate.mjs --step=clinical-resilience-v1` en el destino aislado para crear el registro de patrocinio. Usar `TRUSTLEAF_PRIVATE_WRITES_ENABLED=false`, `TRUSTLEAF_SPONSORSHIP_ENABLED=true` y habilitar `/api/v1/me/partner-prescriptions` en `TRUSTLEAF_SPONSORSHIP_PATHS`. Configurar los límites existentes de patrocinio y la dirección del relayer en `TRUSTLEAF_PARTNER_RX_RELAYER_ADDRESS`, con `RELAYER_SECRET` como secreto de servidor.

Para un segundo socio ficticio usar `TRUSTLEAF_CLINICAL_LINKS_PARTNER_ID`, `TRUSTLEAF_CLINICAL_LINKS_PARTNER_NAME`, su propio origen, cliente Privy y credencial. El socio obtiene una referencia distinta para la misma paciente. El perfil principal puede consultar sus propios vínculos y retirar el permiso de cada integración.

## Recorrido de aceptación

1. P1 entra en Cannabis con la sesión de paciente, acepta mostrar las recetas en TrustLeaf y abre **Mi cuenta**. Verificar que el alta repetida conserva la cuenta y su vínculo. P2 usa otra cuenta y sirve como control. En una cuenta histórica, conservar el mismo perfil interno mediante una reasociación verificada del DID, con historial y roles revisados.
2. Con la consulta sintética iniciada, P1 confirma su permiso de emisión y el médico firma. Verificar una sola credencial no transferible en Testnet, suficiente para comprobar el compromiso exacto del documento. Comparar el PDF original con uno alterado. Los participantes del ensayo usan wallets sintéticas porque el contrato publica las direcciones de titular y emisor.
3. Abrir **Mis recetas** como P1 sin ficha todavía. P2 recibe un rechazo en ambos portales. P1 confirma la apertura de su ficha y comprueba que la misma receta queda referenciada. Revisar el salto entre portales en escritorio y móvil.
4. Reenviar los mismos eventos, probar una revisión tardía y comparar revocación clínica con retiro de acceso de la integración. Un RPC caído mantiene la evidencia como pendiente o no disponible. El registro de aceptación incluye las revisiones de ambos repositorios, los entornos y el resultado de cada caso.

## Mapeo para interoperabilidad

| Dato interno | Proyección HL7 FHIR R4 |
| --- | --- |
| Identificador interno de paciente | `Patient.identifier`, con un sistema de identificadores de TrustLeaf. El DID resuelve la sesión y la referencia por socio queda en su dominio. |
| Referencia de receta con versión y custodio | `DocumentReference`, con sujeto, autor y acceso autorizado al documento. |
| Emisor, procedencia y revisión | `Provenance` y, donde corresponda, `Organization` o `PractitionerRole`. |
| Alta, lectura, emisión y retiro de permisos | `AuditEvent`, con actor, acción e instante, sin el contenido clínico. |

El compromiso es `SHA256(UTF8("TrustLeaf/ClinicalLink/PDF/v1\0") || nonce32 || SHA256(pdfBytes))`. El PDF y su nonce permanecen en Cannabis. El próximo paso de interoperabilidad es validar ejemplos de los recursos contra una versión fijada de Core CL y representar una orden estructurada mediante `MedicationRequest` cuando el emisor proporcione esos campos. [Estándares de MINSAL](https://interoperabilidad.minsal.cl/docs/especificacion-de-la-arquitectura/estandares-perfiles.html) · [Core CL](https://hl7chile.cl/fhir/ig/clcore/)
