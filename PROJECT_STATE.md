# TrustLeaf — Estado del proyecto

> Fuente de verdad del **estado** (no del código). Qué está hecho, qué falta,
> qué se decidió y por qué. Se actualiza al cerrar cada pieza de trabajo.
> Última actualización: 2026-07-21

---

## 🎯 Objetivo actual: Instawards SOW (sprint de 30 días)

Flujo de receta verificable de punta a punta en Stellar Testnet, con hashes
comprobables en Stellar Expert. El SOW tiene 3 entregables.

| Entregable | Estado | Detalle |
| --- | --- | --- |
| **D1 — Contratos testeados y desplegados** | ✅ **Cerrado** | Contratos desplegados; `cargo test` (3 crates) en CI + suite `vitest` (18 tests). |
| **D2 — Interfaz doctor + paciente** | ✅ **Cerrado** | Flujo verificado **logueado en el navegador** con 3 actores Privy reales. Médico emite receta real (`rx-17` on-chain); paciente la ve desde Soroban y **activa** (QR). Se resolvieron los bugs de login Google que bloqueaban el portal médico. |
| **D3 — Integración E2E + demo grabado** | 🟡 **~65%** | Integración **cerrada**: los 5 pasos on-chain con tx reales verificables → ver [`docs/D3_EVIDENCE.md`](docs/D3_EVIDENCE.md). **Falta: grabar el video** siguiendo [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md). |

---

## 🔗 Contratos en vivo (Stellar Testnet)

| Contrato | ID | Admin |
| --- | --- | --- |
| DoctorRegistry | `CC246CYKOEAZVKWEJGOXTKW436LYYLR2EHKFD2WFGABXGSFX2UEX2X2O` | relayer (clave que tenemos) |
| PrescriptionSoulbound | `CA3I4NLBELODRXUUBVZDBVAU47W65KPZ6UFWEXCEEDUDQYZQ4E5YLXYL` | relayer; valida contra el registry |

- Médico demo `GAAG2XS7…` está **registrado y autorizado** on-chain.
- Paciente demo `GD7WGS7M…` tiene 3 recetas: id 1 (Activa), id 2 (Revocada), id 3 (Registrada).
- Los IDs viven en `src/lib/stellar/config.ts` y `.env.local`. Un redeploy = actualizar ambos + Vercel.

### Timestamp map (evidencia D3, en construcción)

| Paso | tx hash |
| --- | --- |
| Deploy registry | `9dd160da…` |
| init (admin) | `a7d30d0c…` |
| register_doctor | `e1e6fa13…` |
| Mint receta 1 | `79be93fa…` |
| activate → is_valid true | `324f1619…` |
| revoke → is_valid false | `0407f3fa…` |

---

## 📌 Sprint 1 de pulido (2026-07-21) — mergeado a `main`

Sobre el núcleo del SOW, ya cerrado, se hizo una pasada de pulido:

- **Licencias on-chain** (#37): firmaban con el email en vez de la wallet → resuelto (resuelve la G-address). Validado on-chain + concurrencia.
- **Recetas en el historial global** (#38): espejo `prescriptions_log` → aparecen en `/admin/historial`.
- **Antecedentes on-chain** (#40): se ancla el hash en ClinicalRecord (cerró la última brecha off-chain del núcleo).
- **Tests** (#39): vitest instalado + 18 tests en verde.
- **Recetas reales en el portal médico** (#41): la pestaña lista lo que el médico realmente emitió (desde el espejo).

## ⬜ Pendiente (priorizado)

1. **Grabar el demo D3** — seguir [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md); la evidencia de una corrida real está en [`docs/D3_EVIDENCE.md`](docs/D3_EVIDENCE.md).
2. **Deploy prod on-chain** — cargar en Vercel los secrets de firma (`DEMO_DOCTOR_SECRET`, `DEMO_PATIENT_SECRET`, `RELAYER_SECRET`) y correr `node scripts/migrate.mjs` contra el branch prod (tablas nuevas: `prescriptions_log`, columnas de antecedentes). Sin eso, el deploy degrada a simulado.
3. **CI: sumar `npm test`** al workflow (requiere token con scope `workflow`).
4. **Fase 2** — firma **por-cuenta real** (passkey por usuario, hoy es una wallet demo compartida en servidor); periféricos (farmacia, dental, óptica, cuidador); diario de dolor drill-down (PR #36, en pausa).
5. Actualizar los "facts" de `AGENTS.md` (el "minting blocked" ya es falso: `rx-17` minteó on-chain).

---

## 🧠 Decisiones tomadas (para no re-litigar)

- **SDK `@stellar/stellar-sdk` pineado a v14.** v13 no parsea protocol 27; v16 rompe passkey-kit.
- **El registry se redesplegó con el relayer como admin** porque la clave del admin original se perdió.
- **Los contratos no compilan local** (WDAC, os error 4551). Se construyen en CI y se optimizan con `stellar contract optimize` (quita reference-types que la VM rechaza).
- **`contracts/Cargo.lock` se commitea** — son binarios que van a la cadena, el build tiene que ser reproducible.
- **Auth = Privy, no el sistema de sesiones propio** (que nunca se conectó). Identidad server-side vía `requireUser()`.
- **App de Privy correcta = `ficha-onchain` (`cmrix722m…`)**, no "SalesAgent" (otro proyecto del owner).
- **CI gratis (GitHub Actions) es el gate de merge, no Vercel.** Vercel plan Hobby se quedaba sin cuota y bloqueaba merges. Actions hace tsc + build sin límite.
- **Sin worktrees** — se trabaja una feature a la vez, en git normal. Los worktrees eran ~9 GB para resolver un problema (sesiones paralelas) que no tenemos.

---

## 🛠️ Comandos que importan

```
npx tsc --noEmit            # 0 errores en src/ antes de commitear
npm run build               # el gate real (limpiar .next si da error de archivo generado)
node scripts/migrate.mjs    # aplicar esquema a la rama Neon de dev
```

- Base local: rama **dev** de Neon (`ep-lingering-water-ahzh89z5`), nunca la de producción.
- Deploy de contrato: bajar el WASM del artefacto de CI → `stellar contract deploy`.
