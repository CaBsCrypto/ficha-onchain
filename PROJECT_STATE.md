# TrustLeaf — Estado del proyecto

> Fuente de verdad del **estado** (no del código). Qué está hecho, qué falta,
> qué se decidió y por qué. Se actualiza al cerrar cada pieza de trabajo.
> Última actualización: 2026-07-17

---

## 🎯 Objetivo actual: Instawards SOW (sprint de 30 días)

Flujo de receta verificable de punta a punta en Stellar Testnet, con hashes
comprobables en Stellar Expert. El SOW tiene 3 entregables.

| Entregable | Estado | Detalle |
| --- | --- | --- |
| **D1 — Contratos testeados y desplegados** | ✅ **Cerrado** | 33 tests pasando, validación de médico on-chain, ambos contratos desplegados. Mergeado en `main` (PR #4). |
| **D2 — Interfaz doctor + paciente** | 🟡 **~85%** | Doctor emite (real). Paciente ve recetas reales + botón activar. **Falta: verificar logueado en el navegador.** En PR #5. |
| **D3 — Integración E2E + demo grabado** | ⬜ **~15%** | Hay hashes reales (timestamp map empezado). Falta: correr la secuencia completa por la UI, grabar, mapear cada paso a su hash. |

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

## 📌 Trabajo en curso

- **PR #5** `feat/patient-rx-flow` — flujo del paciente (lectura on-chain + activar).
  Verificado por código y cadena; **falta la prueba visual logueado**.
- Rama actual de trabajo: `feat/patient-rx-flow`.

## ⬜ Pendiente (priorizado)

1. **Verificar D2 en el navegador** — entrar como paciente, ver las 3 recetas, activar la Registrada.
2. **Grabar el demo D3** + completar el timestamp map.
3. **Deuda de seguridad** — 10 rutas todavía confían en `?email=` sin auth (la ficha ya se cerró). Ver `src/lib/auth/privy-auth.ts`.
4. Actualizar los "facts" de `AGENTS.md` (dicen "minting blocked", ya es falso).

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
