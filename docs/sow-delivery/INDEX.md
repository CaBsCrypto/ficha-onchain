# Entrega TrustLeaf — Semana 1

## Estado vigente

La entrega técnica de semana 1 está integrada en main mediante la [PR #95](https://github.com/CaBsCrypto/ficha-onchain/pull/95). La [PR #98](https://github.com/CaBsCrypto/ficha-onchain/pull/98) actualizó dos fechas de verificación. GitHub CI y Vercel aprobaron el commit de merge 3d0e923; el bloqueo de aprovisionamiento Neon ya no impide ese despliegue.

El alcance oficial exige DoctorRegistry, PrescriptionSoulbound, pruebas y relay en Testnet. La evidencia registra 36 pruebas Rust de semana 1, 118 de aplicación y 11 comprobaciones Testnet. La aceptación formal del responsable sigue pendiente. No se afirma una prueba completa del portal autenticado ni certificación para uso clínico en producción.

## Evidencia y reproducción

- [Informe vigente y matriz de criterios](WEEK_1.md): Contract IDs, hashes, transacciones, alcance y límites.
- [Despliegue Testnet](../evidence/week1-2026-09-06/deployment.json).
- [Verificación Testnet](../evidence/week1-2026-09-06/verification.json).
- [Validación local e inputs](../evidence/week1-2026-09-06/local-validation.json).
- [CI de aplicación](https://github.com/CaBsCrypto/ficha-onchain/actions/workflows/ci.yml) y [CI de contratos](https://github.com/CaBsCrypto/ficha-onchain/actions/workflows/contracts.yml).

Validación local: `node scripts/validate-week1-local.mjs`.
Consulta de red sin nuevas transacciones: `node scripts/verify-week1-testnet.mjs`. Este script puede actualizar las fechas del archivo de evidencia local. El flag `--run` transmite operaciones sintéticas y no hace falta para revisar la entrega existente.

## Material complementario

- [Changelog](CHANGELOG.md).
- [Contenido para Notion](NOTION.md).
- [Plan y guion de video](VIDEO.md).
- [Vista del creador](CREATOR_VIEW.html).
- [Borradores de redes ES/EN](SOCIAL.md).

Estos materiales no prueban publicación externa ni aceptación contractual. Video final, onboarding completo y contratos adicionales quedan fuera del cierre de semana 1.

## Archivo histórico

La [auditoría anterior](../SOW_AUDIT_2026-08-22.md) y los [resultados del 5 de septiembre](../evidence/sow-2026-09-05/results.json) se conservan como antecedentes. Sus bloqueos de fuente SOW, permisos Git y ausencia de CI remoto quedaron superados. Los recuentos 112 Vitest y 44 Rust corresponden a esa corrida anterior, con otro alcance y antes de corregir duplicados; no sustituyen la evidencia vigente.
