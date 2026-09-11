# SOW Semana 1 — fuente aportada por el responsable

Registro documental: 2026-09-07 UTC. Fuente: texto del usuario reproducido en esta conversación y reiterado por coordinación. Documento enlazado por el usuario: [SOW oficial](https://docs.google.com/document/d/1XML0J7ujjBHb9gaNzfEtNjxV7qqzMnMoIZ_EbgMyocs/edit?tab=t.0). Esta transcripción no sustituye el contrato firmado ni prueba aceptación del entregable. No se realizó una nueva lectura del documento remoto en este bloque.

## Texto aportado

> Deliverable 1
> Contracts Tested and Deployed
> Build:
> DoctorRegistry: registration, authorization check, revocation, admin transfer
> PrescriptionSoulbound: issuance, patient transfer, revocation, status query
> Test suite covering the complete Soulbound lifecycle: Registered → Active → Revoked
> Access control tests for unauthorized issuance and duplicate prevention
> Both contracts deployed to Stellar Testnet with verifiable Contract IDs
>
> Why this matters
> In healthcare, a logic error is not a UX problem. It is a safety problem. Before TrustLeaf handles any real prescription, both contracts need to prove they behave correctly: that only authorized doctors can issue, that every state change is tracked, and that edge cases do not open gaps. The test suite and Testnet deployment are how we get that proof.
>
> Week 1
> Complete DoctorRegistry and PrescriptionSoulbound contracts
> Write and run the full test suite
> Deploy both contracts to Stellar Testnet
> Configure relay infrastructure
> Expected Output: Both contracts live on Stellar Testnet, test suite passing, Contract IDs verifiable on Stellar Expert.

## Interpretaciones que requieren cuidado

- La red escrita es Stellar Testnet, no Mainnet.
- Solo dos contratos corresponden a este hito; ClinicalRecord y DocumentSoulbound no se incorporan por aparecer en CI.
- Decisión explícita posterior del usuario: patient transfer significa entrega inicial a la cuenta del paciente al emitir, NO retransferencia. El paciente no mueve la receta. Revocar cambia el estado y conserva el historial. La expresión médico ejecuta no concede por sí sola permisos de farmacia/dispensación. El historial no implica contenido clínico público.
- La frase sobre seguridad exige considerar rutas públicas que afectan el ciclo aunque no figuren como funcionalidad separada. Pruebas nominales verdes no cierran por sí solas hallazgos confirmados.
- La arquitectura de privacidad para datos reales y el cumplimiento jurídico requieren trabajo propio; no se presume que este hito los certifique. Pueden documentarse sin ejecutar demostraciones con datos reales.
