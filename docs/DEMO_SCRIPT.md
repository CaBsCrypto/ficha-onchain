# Guion de grabación — Demo D3

> Secuencia para grabar la demo del SOW (D3). ~5–7 min. Muestra el flujo
> médico↔paciente de punta a punta con anclaje on-chain verificable en Stellar
> Expert. Todo corre logueado, con cuentas Privy reales, contra Stellar Testnet.

## Antes de grabar (checklist)

- [ ] Dev server arriba (`npm run dev`) **o** el deploy con los secrets on-chain cargados.
- [ ] Enforcement de auth activo (`TRUSTLEAF_REQUIRE_AUTH=true`).
- [ ] Tres contextos de navegador listos (para no re-loguear en cámara):
  - **Admin** → `brownsstudiocontact@gmail.com`
  - **Médico** → `cabscryptocontacto@gmail.com`
  - **Paciente** → un email nuevo (ej. el de la demo)
- [ ] DB en estado limpio: desde el panel admin → **Reset** (preserva la waitlist).
- [ ] Pestaña de **Stellar Expert testnet** abierta para pegar los hashes.

## Escenas

### 0. Intro (20 s)
"TrustLeaf: la ficha médica del paciente, anclada en Stellar. Cada acción
clínica deja un hash verificable en la cadena; la PII queda off-chain."

### 1. Admin — arranque limpio (30 s) · pantalla: Admin
1. Login como admin (allowlist Privy). Mostrar que un email fuera de la lista → "Acceso denegado".
2. **Reset** del entorno (se preserva la waitlist).
3. Mostrar el **Historial global** vacío.

### 2. Médico se registra + Admin aprueba (40 s)
1. **Médico**: solicita acceso → queda `pending`.
2. **Admin**: lo aprueba desde el panel → `active`. *(Esto es el gate real; no es automático.)*
3. **Médico**: configura disponibilidad (L–V).

### 3. Paciente reserva + consentimiento **on-chain** (60 s) · pantalla: Paciente
1. Login del paciente (email nuevo, Privy). Mostrar su wallet `G…`.
2. Reserva hora con el médico (elige slot; el dedup evita doble-reserva).
3. **"Iniciar consulta — Autorizar a mi médico"** → "Acceso otorgado".
4. 🔗 Pegar el **tx del consentimiento** en Stellar Expert → `SUCCESS`.

### 4. Médico documenta la consulta **on-chain** (120 s) · pantalla: Médico
1. Pacientes → abre la ficha del paciente.
2. **Antecedentes**: grupo sanguíneo, talla/peso (IMC automático), alergias, condiciones → Guardar. → **tx antecedentes**.
3. **Ficha**: agrega Condición (Dolor neuropático crónico, CIE-10 M79.7) → badge **On-chain** + **tx ficha**.
4. **Examen**: adjunta un laboratorio → **tx examen**.
5. **Nueva Receta** (Decreto 41): Pregabalina 75 mg → **Firmar on-chain** → "Receta anclada en Stellar" + **tx receta**.
6. 🔗 Pegar cada tx en Stellar Expert a medida que salen.

### 5. Paciente recibe y **activa** (40 s) · pantalla: Paciente
1. Recetas → aparece la receta leída **desde Soroban** (Registrada).
2. **Activar** → estado **Activa** + **Ver QR** (para la farmacia).

### 6. Trazabilidad — Admin (30 s) · pantalla: Admin
1. **Historial global**: todos los movimientos con timestamp, badge `on-chain` y link al explorer.
2. Cierre: "Cada paso quedó anclado y es auditable — sin exponer datos clínicos."

## Mapa de evidencia
Los hashes de una corrida real están en [`docs/D3_EVIDENCE.md`](./D3_EVIDENCE.md).
Al grabar, se generan hashes nuevos; anótalos y actualiza ese archivo si querés
que la evidencia coincida con el video.
