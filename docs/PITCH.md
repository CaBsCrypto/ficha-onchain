# TrustLeaf — Pitch corto (para formularios de competencias)

> Regla de la casa: cero adjetivos, solo sustantivos verificables. Nada de
> "revolucionario" — cada palabra debe poder demostrarse en 10 segundos de demo.

---

## El one-liner (50–100 caracteres)

### ⭐ Recomendado — 79 caracteres

> Ficha médica que el paciente posee: portable, verificable on-chain, borrable.

### Alternativas según el ángulo

| Ángulo | Texto | Chars |
| --- | --- | --- |
| Seguimiento (la más humana) | Continuidad para pacientes crónicos: su historia médica los sigue a cualquier clínica. | 89 |
| Ultra-corta | La ficha médica es del paciente, no de la clínica. | 52 |
| Inglés, estilo YC | Patient-owned medical records — portable, verifiable, consent-gated. | 72 |
| Con el MCP incluido | Ficha médica del paciente + la capa para que apps de salud con IA escriban en ella con permiso. | 97 |

---

## La mini-presentación (3–4 frases más)

**¿Qué problema?**
En Chile, la historia de un paciente crónico está repartida en silos que no se
hablan. Cambias de clínica y partes de cero — no hay seguimiento.

**¿Qué hacemos?**
Una ficha clínica que **posee el paciente**: los médicos escriben en ella con su
consentimiento (firmado on-chain), y recetas, licencias y diagnósticos quedan
verificables por cualquiera — una farmacia, un empleador — sin login.

**¿Cómo?**
Hash-on-chain, dato off-chain: en Stellar viven solo las huellas SHA-256 y las
firmas; el contenido vive cifrado fuera de la cadena y es borrable (Ley 19.628).
Además exponemos un **MCP** para que cualquier sistema de salud — incluidos
agentes de IA — ancle en la ficha pidiendo permiso.

**¿Estado?**
Funcionando en producción sobre testnet: 4 contratos, flujo completo
médico↔paciente ensayado con actores reales, y el MCP conectable desde Claude
Desktop. Cada afirmación tiene un hash verificable en Stellar Expert.

---

## Frases sueltas ya pulidas (reusar donde calcen)

- "Los pacientes crónicos en Chile no tienen seguimiento entre consultas." *(apertura)*
- "La cadena nunca ve tus datos — ve la huella de tus datos." *(privacidad)*
- "El contenido es borrable; la prueba de que nadie lo alteró, no." *(derecho al olvido)*
- "El médico no puede escribir en la ficha hasta que el paciente firma. Eso es una transacción, no una promesa." *(consentimiento)*
- "Conecta Claude a nuestra URL con tu API key y tu agente de salud puede anclar registros clínicos con consentimiento. Hoy." *(MCP)*

## Evidencia pública (para pegar como links)

- Verificación sin login: `https://trustleaf-demo.vercel.app/verify/license/1`
- Receta on-chain: `https://trustleaf-demo.vercel.app/api/public/prescription/22`
- Endpoint MCP (spec-compliant): `https://trustleaf-demo.vercel.app/api/mcp`
- Contratos y transacciones: buscables en Stellar Expert (testnet)
