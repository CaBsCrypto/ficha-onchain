# Inventario para continuar en otra PC

Corte: 22 de octubre de 2026, America/Santiago. Inventario de metadatos; no acredita pruebas nuevas, despliegues ni aceptación funcional.

Checkout principal inventariado: codex/clinical-recording-mode, HEAD 66c4deff76b8837628714f5890e41f4ad773c705.

La copia de preparación conserva referencias locales de consulta bajo refs/source/heads/ y cabezas consultadas de GitHub bajo refs/verified-github/heads/. Esos espacios de referencias son temporales de auditoría; no equivalen a publicar ni recuperar todas las ramas en la notebook.

## Cómo leer los conteos

Para cada rama se enumeraron sus commits y se excluyeron todos los commits alcanzables desde cualquiera de las 63 cabezas GitHub verificadas. No se usaron solamente el upstream ni el remoto homónimo. Los nombres de upstream proceden del inventario original; pueden apuntar a refs locales antiguas. La columna homónimo muestra la cabeza GitHub recién verificada, cuando existe.

Resultado: 94 ramas locales; 18 con commits no alcanzables desde las cabezas GitHub verificadas; 30 commits distintos en la unión. Los conteos por rama se superponen: no deben sumarse como commits distintos.

Un cero no acredita equivalencia funcional, integración de una PR ni conservación de archivos sin commit. Un conteo positivo describe identidad/alcanzabilidad de commits; no demuestra que sus cambios de contenido falten en GitHub después de squash o cherry-pick.

## Ramas locales

| Rama local | SHA local completo | Upstream inventariado | SHA GitHub homónimo verificado | Commits no alcanzables |
|---|---|---|---|---:|
| codex/clarify-sow-documentation | 0ba2923fe048e3160151b8f9425c19cc519f7ab3 | origin/codex/clarify-sow-documentation | 0ba2923fe048e3160151b8f9425c19cc519f7ab3 | 0 |
| codex/clinical-create-once-guard | 34d9b477d04b80249315a65b3081324edf5c1ae0 | origin/codex/clinical-create-once-guard | 34d9b477d04b80249315a65b3081324edf5c1ae0 | 0 |
| codex/clinical-create-window-errors | 39963aa0a0976da2d302d413eb42df7cab278d55 | origin/codex/clinical-create-window-errors | 39963aa0a0976da2d302d413eb42df7cab278d55 | 0 |
| codex/clinical-history-creation-receipt | 4e80120084e0e10b4d0d7e1e088eb0fa88bd8cc8 | origin/codex/clinical-history-creation-receipt | 4e80120084e0e10b4d0d7e1e088eb0fa88bd8cc8 | 0 |
| codex/clinical-readonly-draft-preview | e29ff04bc8f140d94e1a5d193728067ce74b2163 | origin/codex/clinical-readonly-draft-preview | e29ff04bc8f140d94e1a5d193728067ce74b2163 | 0 |
| codex/clinical-recording-mode | 66c4deff76b8837628714f5890e41f4ad773c705 | origin/codex/clinical-recording-mode | 66c4deff76b8837628714f5890e41f4ad773c705 | 0 |
| codex/doctor-demo-prefill | 3c8f7abc5cb9b50a84d3b18ce8a954047f3a7071 | origin/codex/doctor-demo-prefill | 3c8f7abc5cb9b50a84d3b18ce8a954047f3a7071 | 0 |
| codex/doctor-onboarding | 6e897139245b500e8af25bc461fd4ceaf6e348c3 | origin/codex/doctor-onboarding | 6e897139245b500e8af25bc461fd4ceaf6e348c3 | 0 |
| codex/hide-public-roadmap | f1c9a62d0840d4ad3f94ec6bd95331d1da31088b | origin/codex/hide-public-roadmap | f1c9a62d0840d4ad3f94ec6bd95331d1da31088b | 0 |
| codex/hosted-clinical-single-create | 9ce350260cc5c1455cfc7ce7542bff4cd44a8400 | origin/codex/hosted-clinical-single-create | 9ce350260cc5c1455cfc7ce7542bff4cd44a8400 | 0 |
| codex/hosted-testnet-worker | 23355baf6271628f72f799d132d65c4db5ff0c8d | origin/codex/hosted-testnet-worker | 23355baf6271628f72f799d132d65c4db5ff0c8d | 0 |
| codex/landing-lower-cleanup | e6f069115c7ca5915b9755dec11737813bf6e991 | origin/codex/landing-lower-cleanup | e6f069115c7ca5915b9755dec11737813bf6e991 | 0 |
| codex/patient-mobile-ui | 1c694ba6f0427a0ecd3a8b8e0c34d91da70ecdc3 | origin/codex/patient-mobile-ui | 1c694ba6f0427a0ecd3a8b8e0c34d91da70ecdc3 | 0 |
| codex/prescription-demo-fill | 6522cb516308d01e79d60bd2e283a0df41324f5d | origin/codex/prescription-demo-fill | 6522cb516308d01e79d60bd2e283a0df41324f5d | 0 |
| codex/prescription-document-design | 5ba14d555fdccb421e60de2c0b33d514eb7faf23 | origin/codex/prescription-document-design | 5ba14d555fdccb421e60de2c0b33d514eb7faf23 | 0 |
| codex/prescription-list-performance | 223123331e0d3e94a309f1920092ec0a7b851377 | origin/codex/prescription-list-performance | 223123331e0d3e94a309f1920092ec0a7b851377 | 0 |
| codex/prescription-read-performance | 14f3b8cd0ca15de7a60448b6913b784c7a0b4e41 | sin upstream | sin cabeza homónima | 1 |
| codex/prescription-refresh-state | 7b4f3997b66652c9b5b032f3cd24fc89a9cf6eec | origin/codex/prescription-refresh-state | 7b4f3997b66652c9b5b032f3cd24fc89a9cf6eec | 0 |
| codex/readme-private-delivery | 45c59d1f0a16c4dcebc64b8baa5dc0d55e11ff8a | origin/codex/readme-private-delivery | 45c59d1f0a16c4dcebc64b8baa5dc0d55e11ff8a | 0 |
| codex/refresh-week1-verification | 9688143b4cd1bef902564ca6d6b9e77b7a8170e8 | origin/codex/refresh-week1-verification | 9688143b4cd1bef902564ca6d6b9e77b7a8170e8 | 0 |
| codex/remove-access-probe | 28410b752a7aa66dbdcfd91071d1c8786c32856c | origin/codex/remove-access-probe | 28410b752a7aa66dbdcfd91071d1c8786c32856c | 0 |
| codex/sow-video-qa | 29700bb803a08af036a3290306f9b022c5ce38d6 | origin/codex/sow-video-qa | 29700bb803a08af036a3290306f9b022c5ce38d6 | 0 |
| codex/sow2-clinical-flow-check | d372249c8a8f09d494d83f0603ef6a142939e650 | sin upstream | sin cabeza homónima | 1 |
| codex/sow2-clinical-focus | 8a49b0865f051d3dfc0367564732a8d9f86da081 | sin upstream | sin cabeza homónima | 1 |
| codex/sow2-clinical-foundation | 2d13e0721c4623a132796cc73db174381101d8b9 | origin/codex/sow2-clinical-foundation | 2d13e0721c4623a132796cc73db174381101d8b9 | 0 |
| codex/sow2-clinical-ledger-read-fix | 449271a900b2b2f76a08bc9a1ce3f65fd19a65b4 | origin/codex/sow2-clinical-ledger-read-fix | 449271a900b2b2f76a08bc9a1ce3f65fd19a65b4 | 0 |
| codex/sow2-clinical-qa | 1882d27856634fc3270a05e0a83503cac2dde1ac | sin upstream | sin cabeza homónima | 1 |
| codex/sow2-clinical-review | 3c685da69f92f310c7a787363712f9f6dc5ff8c6 | sin upstream | sin cabeza homónima | 1 |
| codex/sow2-flow-validation | 056191a0e8894f59e683dfa7acd15d6fe29e07cd | origin/codex/sow2-flow-validation | 056191a0e8894f59e683dfa7acd15d6fe29e07cd | 0 |
| codex/sow2-hosted-clinical-read-recovery | 40f2b53296c237e3a5a5dcf4239a9ddcb62a3b89 | origin/codex/sow2-hosted-clinical-read-recovery | 40f2b53296c237e3a5a5dcf4239a9ddcb62a3b89 | 0 |
| codex/sow2-identity-keys | bef3913d3b1614add179820fdd632da11ddf1a30 | sin upstream | sin cabeza homónima | 2 |
| codex/sow2-patient-history | ff32a9f5d791af98aad7151731cb676692597629 | sin upstream | sin cabeza homónima | 3 |
| codex/sow2-patient-integration | e77dac14327b4ad66d80664e502f4b175e45d29c | sin upstream | e77dac14327b4ad66d80664e502f4b175e45d29c | 0 |
| codex/sow2-patient-permissions | 90653d87fa554167fb1d4e399d91b08d822527f1 | sin upstream | sin cabeza homónima | 3 |
| codex/sow2-sprint-2 | 0e66f9a57e89a32cd9feb2c2ad19717f265fdc1a | sin upstream | 0e66f9a57e89a32cd9feb2c2ad19717f265fdc1a | 0 |
| codex/sow2-stellar | c805c65eccee97caf0439fba84324fc4ef10930f | sin upstream | sin cabeza homónima | 2 |
| codex/sow2-storage | addc0b09790ee0845c84bbaa30f69a127ce97f4c | sin upstream | sin cabeza homónima | 2 |
| codex/sow2-testnet-api-rehearsal | 35fa217f8b84afb7a2e9cfa219a0a4d1101671b7 | origin/codex/sow2-testnet-api-rehearsal | 35fa217f8b84afb7a2e9cfa219a0a4d1101671b7 | 0 |
| codex/sow2-testnet-rehearsal-audit-tests | 2c10fe73ad6ab0fbc78db6bc6caaa063b32de85a | sin upstream | sin cabeza homónima | 1 |
| codex/sow2-testnet-rehearsal-auth | 6bc49e6076fca33ff03f17871545f44b2e4b0556 | sin upstream | sin cabeza homónima | 1 |
| codex/sow2-testnet-rehearsal-engine | 42eca33c233aa04762db0a90a0115dba169210ba | sin upstream | sin cabeza homónima | 1 |
| codex/sow2-testnet-rpc-provider | fd8359cfd10c9d134d0dd853f7080b3daf8daedf | origin/codex/sow2-testnet-rpc-provider | fd8359cfd10c9d134d0dd853f7080b3daf8daedf | 0 |
| codex/sow2-week2-delivery | 31c9eb167bf0af8487182471e957265a98724aff | sin upstream | sin cabeza homónima | 1 |
| codex/sow2-week2-readonly-release | 26cd930ae86faf53fc3b1509dee4bfbcd4217b3f | origin/codex/sow2-week2-readonly-release | 26cd930ae86faf53fc3b1509dee4bfbcd4217b3f | 0 |
| codex/sow2-week2-validation | cf763464e7748e8f4445b4e751d89231f82c91a0 | sin upstream | cf763464e7748e8f4445b4e751d89231f82c91a0 | 0 |
| codex/testnet-contract-generation | 22d546e852d3a2f6dd6d0731512c8c0f6d542cf9 | sin upstream | sin cabeza homónima | 0 |
| codex/validate-sow | 405e40e5211a464ffa94bd352b06075d67386abc | origin/codex/validate-sow | 405e40e5211a464ffa94bd352b06075d67386abc | 0 |
| codex/verified-read-performance | a58acbe387f8981ae728286838baea60d49394b1 | origin/codex/verified-read-performance | a58acbe387f8981ae728286838baea60d49394b1 | 0 |
| codex/week1-defensive-fixes | 22d546e852d3a2f6dd6d0731512c8c0f6d542cf9 | sin upstream | sin cabeza homónima | 0 |
| codex/week2-access-diagnostics | 4abb97e9cddfa9bac8e5755f3b97eaba81fdfdf1 | origin/codex/week2-access-diagnostics | 4abb97e9cddfa9bac8e5755f3b97eaba81fdfdf1 | 0 |
| codex/week2-access-recovery | fbb0ad64ed74378799f24f4fb85c4f7c2a69e964 | origin/codex/week2-access-recovery | fbb0ad64ed74378799f24f4fb85c4f7c2a69e964 | 0 |
| codex/week2-final-validation | 72f57cfe3277b64d25953991278f5bc66166f14e | origin/codex/week2-final-validation | 72f57cfe3277b64d25953991278f5bc66166f14e | 0 |
| codex/week2-isolated-database | f6abfc7bb3f49e8ab0992a1a50b3fbd64591d019 | origin/codex/week2-isolated-database | f6abfc7bb3f49e8ab0992a1a50b3fbd64591d019 | 0 |
| codex/week2-main-evidence | 7e32babd04d81f03078186e391b5c1e13dabd01c | origin/codex/week2-main-evidence | 7e32babd04d81f03078186e391b5c1e13dabd01c | 0 |
| codex/week2-onboarding-recovery | de8092f0ab97d2ff2b28dcc186d6fa57fa8c2fe4 | origin/codex/week2-onboarding-recovery | de8092f0ab97d2ff2b28dcc186d6fa57fa8c2fe4 | 0 |
| codex/week2-private-portals | d10160f68d11afae66f7f1b05272d2609c1c6287 | origin/codex/week2-private-portals | d10160f68d11afae66f7f1b05272d2609c1c6287 | 0 |
| codex/week3-patient-permission-check | 7a47b6139ddf501d579e066a8f2b9b31bc3f1a22 | origin/codex/week3-patient-permission-check | 7a47b6139ddf501d579e066a8f2b9b31bc3f1a22 | 0 |
| codex/week3-rehearsal-evidence | 027dee324be9219e1b823474c876e19806f44d0f | origin/main | sin cabeza homónima | 1 |
| codex/week3-verifiable-demo | ad13afc729769de87ff2887f74669b14679ca28e | origin/codex/week3-verifiable-demo | ad13afc729769de87ff2887f74669b14679ca28e | 0 |
| codex/week4-access-languages | 409bf25097400273597e079e04f7bc096b3782bb | origin/codex/week4-access-languages | 409bf25097400273597e079e04f7bc096b3782bb | 0 |
| codex/week4-waitlist | 75779bbc94fe7154dce0e6ea25c8f7983125716c | origin/codex/week4-waitlist | 75779bbc94fe7154dce0e6ea25c8f7983125716c | 0 |
| docs/readme-enhancement-and-cover | 39436d736b5b444fc83b49633ce47c2d819f9ecc | sin upstream | 39436d736b5b444fc83b49633ce47c2d819f9ecc | 0 |
| docs/simplify | b06fbdc0ed701a73e507aa32cc7b1b1b40942bd0 | origin/docs/simplify | b06fbdc0ed701a73e507aa32cc7b1b1b40942bd0 | 0 |
| docs/sow1-notion-and-changelog | 73e0c9dab04ac537d8c77f43e93f0ddbf2ffbff3 | sin upstream | 73e0c9dab04ac537d8c77f43e93f0ddbf2ffbff3 | 0 |
| feat/admin | af83c2ec39edca4ef35b0b0ec7eec328b668c746 | origin/feat/admin | af83c2ec39edca4ef35b0b0ec7eec328b668c746 | 0 |
| feat/ai-precision-pain | 809f06feecc96bba4d0f4fd85033deb96be9f19d | sin upstream | sin cabeza homónima | 2 |
| feat/diario-de-dolor | af83c2ec39edca4ef35b0b0ec7eec328b668c746 | origin/feat/diario-de-dolor | af83c2ec39edca4ef35b0b0ec7eec328b668c746 | 0 |
| feat/doctor | af83c2ec39edca4ef35b0b0ec7eec328b668c746 | origin/feat/doctor | af83c2ec39edca4ef35b0b0ec7eec328b668c746 | 0 |
| feat/doctor-portal-and-3d-fixes | 16047c1c5a071a1a4746307349efb093c3819631 | sin upstream | sin cabeza homónima | 0 |
| feat/ficha | af83c2ec39edca4ef35b0b0ec7eec328b668c746 | origin/feat/ficha | af83c2ec39edca4ef35b0b0ec7eec328b668c746 | 0 |
| feat/ia-phase2-extraction | 81276e1be00f7aae621ac5314395d2cc35a0d553 | sin upstream | sin cabeza homónima | 0 |
| feat/ia-phase3-timeline-and-explain | a6299bd55b4bc7d441a12fd874bbc902aef2c2b2 | sin upstream | sin cabeza homónima | 0 |
| feat/mcp-server | b2457767b3681a39a5d6f4ccea2ffa7d6d5d4e02 | sin upstream | sin cabeza homónima | 1 |
| feat/patient | af83c2ec39edca4ef35b0b0ec7eec328b668c746 | origin/feat/patient | af83c2ec39edca4ef35b0b0ec7eec328b668c746 | 0 |
| feat/patient-rx-flow | 390efdd5952c67634dd42454307f3491dd70ee28 | origin/feat/patient-rx-flow | 390efdd5952c67634dd42454307f3491dd70ee28 | 0 |
| feat/region-detail-3d | 137b9599cd488349d222d1baf8d174ed141ea6b4 | origin/feat/region-detail-3d | 137b9599cd488349d222d1baf8d174ed141ea6b4 | 0 |
| feat/smart-contracts | af83c2ec39edca4ef35b0b0ec7eec328b668c746 | origin/feat/smart-contracts | af83c2ec39edca4ef35b0b0ec7eec328b668c746 | 0 |
| feat/trustleaf-verify | 5ee31e78bbab424cc297bb6c89733320f12e7ca5 | sin upstream | sin cabeza homónima | 9 |
| fix/authorization | 671a2beb1361a4b25d7d99796ee9df9cd05b4073 | origin/fix/authorization | 671a2beb1361a4b25d7d99796ee9df9cd05b4073 | 0 |
| fix/week4-bugs | 9806bec962f41736e1b13a993f8baf14a282e1ed | origin/fix/week4-bugs | 9806bec962f41736e1b13a993f8baf14a282e1ed | 0 |
| main | 9a44103c966d0f7629c3f3292df445b6ef36095a | origin/main | d96425dd3467cde74b60caf54f94e9291fc26564 | 0 |
| worktree-wf_33ffe6fa-069-1 | 1aec092ff61ce3b5344a1b1f0f7cecbc7a100145 | sin upstream | sin cabeza homónima | 0 |
| worktree-wf_4443341e-c20-1 | 4720db14bf9d4634e881f8005331af9f2e5e871f | sin upstream | sin cabeza homónima | 0 |
| worktree-wf_4443341e-c20-2 | 4720db14bf9d4634e881f8005331af9f2e5e871f | sin upstream | sin cabeza homónima | 0 |
| worktree-wf_4443341e-c20-3 | 4720db14bf9d4634e881f8005331af9f2e5e871f | sin upstream | sin cabeza homónima | 0 |
| worktree-wf_5d609641-caf-1 | 374f07880a256a26ec858b0a2a1d7026f5735c55 | sin upstream | sin cabeza homónima | 0 |
| worktree-wf_5d609641-caf-2 | 374f07880a256a26ec858b0a2a1d7026f5735c55 | sin upstream | sin cabeza homónima | 0 |
| worktree-wf_a1f73b8c-335-1 | 48041c51bca14b6c250d955ade12737b37b09a34 | sin upstream | sin cabeza homónima | 0 |
| worktree-wf_a1f73b8c-335-2 | 48041c51bca14b6c250d955ade12737b37b09a34 | sin upstream | sin cabeza homónima | 0 |
| worktree-wf_a1f73b8c-335-3 | 48041c51bca14b6c250d955ade12737b37b09a34 | sin upstream | sin cabeza homónima | 0 |
| worktree-wf_a1f73b8c-335-4 | 48041c51bca14b6c250d955ade12737b37b09a34 | sin upstream | sin cabeza homónima | 0 |
| worktree-wf_ed746b37-6d9-1 | 47612b5a4208cf1fad77d82d35a1d93d8048de41 | sin upstream | sin cabeza homónima | 0 |
| worktree-wf_ed746b37-6d9-2 | 47612b5a4208cf1fad77d82d35a1d93d8048de41 | sin upstream | sin cabeza homónima | 0 |
| worktree-wf_ed746b37-6d9-3 | 47612b5a4208cf1fad77d82d35a1d93d8048de41 | sin upstream | sin cabeza homónima | 0 |

## Preservación separada y publicación pendiente

De las 18 ramas siguientes, 14 quedaron preservadas localmente en la copia aislada con referencias nuevas y 4 siguen pendientes por contenido o alcance, según el detalle agregado al final. No se fusionaron entre sí ni se aplicaron sobre la rama de migración. La publicación de las referencias permanece pendiente del control de Vercel; no hubo push en esta preparación.

| Rama con commits locales no alcanzables | Cantidad |
|---|---:|
| codex/prescription-read-performance | 1 |
| codex/sow2-clinical-flow-check | 1 |
| codex/sow2-clinical-focus | 1 |
| codex/sow2-clinical-qa | 1 |
| codex/sow2-clinical-review | 1 |
| codex/sow2-identity-keys | 2 |
| codex/sow2-patient-history | 3 |
| codex/sow2-patient-permissions | 3 |
| codex/sow2-stellar | 2 |
| codex/sow2-storage | 2 |
| codex/sow2-testnet-rehearsal-audit-tests | 1 |
| codex/sow2-testnet-rehearsal-auth | 1 |
| codex/sow2-testnet-rehearsal-engine | 1 |
| codex/sow2-week2-delivery | 1 |
| codex/week3-rehearsal-evidence | 1 |
| feat/ai-precision-pain | 2 |
| feat/mcp-server | 1 |
| feat/trustleaf-verify | 9 |

## Worktrees: solamente metadatos ya inventariados

Se registraron seis checkouts, incluido el principal. No se abrieron archivos ni se inspeccionó el estado de trabajo de los otros cinco. Las ubicaciones se presentan como etiquetas relativas para evitar publicar rutas personales. Estos metadatos no garantizan que sus cambios sin commit estén respaldados.

| Ubicación sanitizada | HEAD inventariado | Rama/estado | Commits del HEAD no alcanzables desde GitHub |
|---|---|---|---:|
| checkout principal | 66c4deff76b8837628714f5890e41f4ad773c705 | codex/clinical-recording-mode | 0 |
| .codex/worktrees/042c/ficha-onchain | db31fbad5355359a72ad09edea7d7134a8685fa2 | HEAD separado (detached) | 0 |
| .codex/worktrees/sow2-identity/ficha-onchain | 2c10fe73ad6ab0fbc78db6bc6caaa063b32de85a | codex/sow2-testnet-rehearsal-audit-tests | 1 |
| .codex/worktrees/sow2-signatures/ficha-onchain | 42eca33c233aa04762db0a90a0115dba169210ba | codex/sow2-testnet-rehearsal-engine | 1 |
| .codex/worktrees/sow2-storage/ficha-onchain | 6bc49e6076fca33ff03f17871545f44b2e4b0556 | codex/sow2-testnet-rehearsal-auth | 1 |
| ../tl-week2-main | 6e897139245b500e8af25bc461fd4ceaf6e348c3 | codex/doctor-onboarding | 0 |

El HEAD separado db31fbad5355359a72ad09edea7d7134a8685fa2 se comprobó por metadatos de objetos ya disponibles en la copia: cero commits fuera de la alcanzabilidad de las cabezas GitHub verificadas. No se inspeccionó su carpeta externa.

## Stashes: once entradas, sin recuperación ni publicación

Los identificadores son los del inventario original; los índices stash pueden cambiar con operaciones posteriores. La procedencia es el mensaje registrado por Git. No se aplicó, eliminó ni publicó ningún stash.

| Entrada original | SHA completo | Procedencia inventariada |
|---|---|---|
| stash@{0} | c6e9fe2fb46209d4f1c4209e864ce30a93177171 | On codex/patient-mobile-ui: d4-final-integration-preserve-20260923 |
| stash@{1} | cc3af370871ab4cd020acdf2e26d1aa63a13af6e | On codex/patient-mobile-ui: prescription-performance-preserve-20260922 |
| stash@{2} | a251d034159bf5b53fc654185c758f6aad040d88 | On codex/patient-mobile-ui: d4-close-preserve-20260922 |
| stash@{3} | 1734caf4a75a61c64ea9198ddd58a8ead22db9a3 | On codex/week4-waitlist: d4-autonomous-qa-preserve-20260921 |
| stash@{4} | 382b9bfdd260ecfa064979e06e278c9be5417c6b | On codex/patient-mobile-ui: d4-admin-waitlist-preserve |
| stash@{5} | 7e105fe8eb73827d49f6a105faa26aa8fe9a20f0 | On codex/patient-mobile-ui: d4-preserve-documents-20260921 |
| stash@{6} | 59e664a5c02c05b991be737a579fb0659d76c4eb | On fix/week4-bugs: mobile-patient-preserve-pending-20260921 |
| stash@{7} | 46c71ba59ff0dbdb6914248c4263fc0f4c72d0e5 | On codex/sow-video-qa: patient-direct-login-preserve-evidence |
| stash@{8} | 1eb4eeab3071d1c58f72d35f45e9e7e8a377bd3d | On codex/sow-video-qa: sow-login-autoforward-preserve-evidence |
| stash@{9} | 32e102af03517752e5d9746534f1f459d1422429 | On codex/sow-video-qa: sow-controlled-execution-20260920-preserve-local-evidence |
| stash@{10} | dca264ca10106ffa7fb425d849c4e1efad16ed15 | autostash |

Conclusión comunicada por la auditoría de contenido paralela: stash 0 a 9 tienen el mismo diff y sus archivos coinciden con el árbol actual; stash 10 contiene documentación también duplicada. Esta sección registra esa conclusión de auditoría, sin recuperar ni publicar los objetos. Conservar las entradas originales mientras se completa y verifica la migración; la duplicación no es autorización para borrarlas.

## Límites del inventario

No se incluyeron secretos, conexiones, archivos de identidad ni datos privados de las carpetas externas. No se ejecutó el proyecto. La continuidad del código publicado, de los archivos sin commit, de los journals privados y de las claves son comprobaciones distintas. La recuperación de claves DPAPI/secure store en otra PC debe resolverse por un canal privado y con verificación propia; el clon y este inventario no la realizan.

## Referencias auxiliares creadas en la copia aislada

Se crearon 14 ramas locales nuevas sin checkout, sin forzar referencias y sin modificar el repositorio original. Antes de crearlas se comprobó que cada nombre estuviera ausente en los heads locales de la copia, en refs/source/heads/ y en las cabezas GitHub verificadas. Cada destino apunta exactamente al tip SHA original auditado: no incorpora documentos nuevos, merges, cherry-picks ni cambios de otras tareas.

La unión auditada es de 17 commits distintos no alcanzables desde las 63 cabezas GitHub verificadas. Se inspeccionaron todos sus blobs nuevos históricos dentro de la auditoría de 30 commits/60 blobs de las 18 ramas. No se detectaron secretos o identidades privadas nuevos en las 14 candidatas. Esto describe la inspección de publicación, no una validación funcional del código.

La rama principal de migración conserva los documentos y el manifiesto de procedencia. Las ramas auxiliares siguientes conservan sus tips fuente exactos. Su publicación queda pendiente de Vercel: este paso no realizó push ni inició despliegues.

| Rama original | Rama auxiliar local nueva | SHA exacto preservado | Commits locales no alcanzables |
|---|---|---|---:|
| codex/prescription-read-performance | codex/migracion-ficha-20261022/prescription-read-performance | 14f3b8cd0ca15de7a60448b6913b784c7a0b4e41 | 1 |
| codex/sow2-clinical-flow-check | codex/migracion-ficha-20261022/sow2-clinical-flow-check | d372249c8a8f09d494d83f0603ef6a142939e650 | 1 |
| codex/sow2-clinical-focus | codex/migracion-ficha-20261022/sow2-clinical-focus | 8a49b0865f051d3dfc0367564732a8d9f86da081 | 1 |
| codex/sow2-clinical-qa | codex/migracion-ficha-20261022/sow2-clinical-qa | 1882d27856634fc3270a05e0a83503cac2dde1ac | 1 |
| codex/sow2-clinical-review | codex/migracion-ficha-20261022/sow2-clinical-review | 3c685da69f92f310c7a787363712f9f6dc5ff8c6 | 1 |
| codex/sow2-identity-keys | codex/migracion-ficha-20261022/sow2-identity-keys | bef3913d3b1614add179820fdd632da11ddf1a30 | 2 |
| codex/sow2-patient-history | codex/migracion-ficha-20261022/sow2-patient-history | ff32a9f5d791af98aad7151731cb676692597629 | 3 |
| codex/sow2-patient-permissions | codex/migracion-ficha-20261022/sow2-patient-permissions | 90653d87fa554167fb1d4e399d91b08d822527f1 | 3 |
| codex/sow2-stellar | codex/migracion-ficha-20261022/sow2-stellar | c805c65eccee97caf0439fba84324fc4ef10930f | 2 |
| codex/sow2-storage | codex/migracion-ficha-20261022/sow2-storage | addc0b09790ee0845c84bbaa30f69a127ce97f4c | 2 |
| codex/sow2-testnet-rehearsal-audit-tests | codex/migracion-ficha-20261022/sow2-testnet-rehearsal-audit-tests | 2c10fe73ad6ab0fbc78db6bc6caaa063b32de85a | 1 |
| codex/sow2-testnet-rehearsal-auth | codex/migracion-ficha-20261022/sow2-testnet-rehearsal-auth | 6bc49e6076fca33ff03f17871545f44b2e4b0556 | 1 |
| codex/sow2-testnet-rehearsal-engine | codex/migracion-ficha-20261022/sow2-testnet-rehearsal-engine | 42eca33c233aa04762db0a90a0115dba169210ba | 1 |
| codex/sow2-week2-delivery | codex/migracion-ficha-20261022/sow2-week2-delivery | 31c9eb167bf0af8487182471e957265a98724aff | 1 |

## Cuatro ramas sin referencia auxiliar de publicación

Estas cuatro ramas representan 13 commits distintos de los 30 salientes originales. No se combinaron con las auxiliares ni con la rama documental. Sanear solamente el árbol final dejaría contenido histórico en sus commits anteriores.

| Rama original | Commits que requieren resolver contenido/alcance | Categoría y rutas |
|---|---|---|
| codex/week3-rehearsal-evidence | 027dee324be9219e1b823474c876e19806f44d0f | Identidades autenticadas y handles asociados a pruebas en docs/sow-delivery/week3-review/VALIDATION.md; identificadores/huellas operativas correlacionables en docs/evidence/week3-main-2026-09-14/access-control.json. |
| feat/mcp-server | b2457767b3681a39a5d6f4ccea2ffa7d6d5d4e02 | Identidad operativa literal de aprobación en src/app/api/mcp/route.ts; requiere aclarar o sanear el historial. |
| feat/trustleaf-verify | 15af7f90f0d976566460e2948bc4c359b2dfaa42; 5ee31e78bbab424cc297bb6c89733320f12e7ca5 | El primer commit contiene el mismo blob MCP con identidad operativa; el segundo incorpora la propuesta interna docs/ARCHITECTURE_REVIEW.md. Alcance de publicación pendiente. |
| feat/ai-precision-pain | 534920795e5183b301491d83dad4c6a2d7614b1d; 809f06feecc96bba4d0f4fd85033deb96be9f19d | Propuesta interna docs/PRECISION_PAIN.md y su página src/app/precision-pain/page.tsx; sin secretos detectados, alcance de publicación pendiente. |

Los stashes continúan sin aplicar, borrar ni publicar. Los cinco worktrees externos siguen sin inspección de archivos. Las referencias fuente de auditoría no autorizan publicar por wildcard: sólo las referencias auxiliares exactas inventariadas pueden considerarse en un paso posterior autorizado.
