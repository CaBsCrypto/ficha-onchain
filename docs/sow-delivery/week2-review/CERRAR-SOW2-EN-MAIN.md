# Cierre final SOW 2 · Semana 2 en `main`

## 1) Estado actual del código

- Rama de trabajo actual: `codex/week2-private-portals`.
- Estado `main`: `c704bfc`.
- Confirmado: la rama contiene los bloques funcionales de PR #101 y #102 y el cierre documental de semana 2 (commits `7c2ff26`, `df812d8`, `58d0df0`, `dda4bf5`, `b8effe2`).
- Faltante para cerrar: confirmar PR #105 en el repositorio y que `main` reciba el merge final con evidencia de despliegue + grabación.

## 2) Entorno de grabación objetivo

- URL canónica: `https://trustleaf-demo.vercel.app`
- Entorno: `TRUSTLEAF_ENV=test`
- Base de datos: rama Neon exclusiva de pruebas para `main`.
- Contratos: `DoctorRegistryPrivate` + `PrescriptionPrivate v2`.
- Wallet: Privy (`ficha-onchain`) con una wallet Stellar por usuario.
- Relayer: firma y paga comisión; el usuario firma su operación.

## 3) Recorrido final en `main` (3 cuentas)

1. Admin autoriza médico.
2. Médico entra y comprueba estado.
3. Paciente realiza dos reservas.
4. Paciente confirma asistencia.
5. Médico inicia ambas consultas.
6. Worker acredita reservas.
7. Paciente autoriza consulta A y consulta B, retira y reautoriza en una.
8. Médico emite ambas, activa ambas.
9. Médico revoca una.
10. Paciente ve estado y abre documento de la receta activa y la revocada.

Requisito de UI: estado visible de cada operación en `Pendiente / Confirmada / Error recuperable`.

## 4) Evidencia mínima a adjuntar

- 5 acciones en cadena en `main`: `authorize_doctor` (si aplica), dos `attest_booking`, dos `mint_prescription` y al menos dos activaciones/revocación según el caso.
- Recibos de la sesión completa y captura de pantallas de autorización / emisión / activación / revocación.
- Resultado final: 1 receta activa + 1 revocada.
- Resultados de pruebas y build del tag de cierre.

## 5) Cierres de control

- Sin transacciones duplicadas en doble clic.
- Consentimiento retirado antes de emisión bloquea esa acción.
- Wallet distinta/ambigua para rol no permite operación.
- Worker caído/reiniciado: operación pendiente recuperable, nunca "éxito simulado".

## 6) Entregables de revisión

- Página de revisores actualizada con link main.
- Nota de grabación actualizada con secuencia y límites.
- PR documental final con estos cambios y el estado de cierre.
