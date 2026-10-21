# SOW 2 · Recordatorio de cierre y próximo ciclo

Registrado el **8 de octubre de 2026**, por solicitud de Cristian Brown.

## Idea pendiente: compartir información seleccionada con un médico externo

**Estado:** propuesta posterior al SOW 2. No implementada, no comprometida como entregable actual y no bloquea la entrega de este ciclo.

### Problema

Un paciente puede acudir a un médico que todavía no utiliza TrustLeaf. Exigirle adoptar todo el portal durante la consulta puede dificultar que revise los antecedentes que el paciente quiere mostrar.

### Experiencia que queremos evaluar

El paciente selecciona antecedentes, notas o archivos concretos y prepara una vista privada de **sólo lectura**, accesible mediante un enlace temporal personalizado y un QR equivalente. El médico receptor puede revisar esa selección sin obtener permiso para agregar, corregir ni eliminar información.

La propuesta debe reducir la fricción para un receptor que no tenga cuenta en TrustLeaf o no la use habitualmente. Aún no está decidido cómo se identificará al receptor ni qué comprobación necesitará para abrir la vista; llamar al enlace “magic link” no resuelve por sí mismo esos controles.

### Decisiones antes de construirlo

- Qué elementos y versiones incluye el enlace. No compartir todo el historial por defecto ni conceder acceso indirecto a otros documentos.
- Duración del acceso, revocación por el paciente y comportamiento al reenviar el enlace. El QR debe aplicar exactamente los mismos controles que el enlace.
- Identificación del receptor, tratamiento del enlace como credencial y protección frente a accesos no autorizados. Evaluar una comprobación ligera del destinatario antes de elegir el mecanismo.
- Vista adaptable a móvil y escritorio, con autor, fecha y procedencia claros. Un receptor externo no se presenta automáticamente como médico autorizado por TrustLeaf.
- Consulta y descarga: decidir si se permite descargar y explicarlo. Retirar el enlace bloquea accesos posteriores; no elimina copias obtenidas previamente.
- Correspondencia con los permisos e integridad existentes. Definir qué queda registrado en la aplicación y qué requiere Stellar, sin crear transacciones para cada apertura por defecto.

### Cómo evaluar una futura entrega

La vista muestra únicamente la selección autorizada; nunca permite agregar o editar. Un enlace vencido o revocado deja de abrir contenido. QR y enlace tienen el mismo alcance. Cambios de sesión y errores no muestran información anterior. Se prueban accesos indebidos, reenvío y recuperación con datos sintéticos antes de ofrecerlo.

Esta idea es distinta de la página pública para consultar el estado de una receta mediante QR: aquí se comparten documentos privados del paciente con un receptor concreto.

## Checklist al terminar SOW 2

- [ ] Confirmar el cierre de los cuatro entregables del SOW 2 con su evidencia y registrar aparte el estado de aceptación del revisor.
- [ ] **Recordarle a Cristian la propuesta de enlace temporal y QR de sólo lectura para médicos externos.** Revisar este documento antes de definir la siguiente fase.
- [ ] Decidir si se incorpora a una propuesta de SOW 3 o queda en el backlog. Acordar alcance, condiciones y presupuesto antes de implementar.
- [ ] Si se aprueba, definir el diseño de acceso externo y su matriz de pruebas; no reutilizar rutas retiradas como si estuvieran validadas.

**Disparador del recordatorio:** cierre confirmado del SOW 2 completo, no la grabación o finalización de la semana 1. El seguimiento no debe declarar cerrado el ciclo por la antigüedad de los archivos ni por una fecha prevista.

## Referencias

- [Objetivo de la semana 1](OBJETIVO-SEMANA-1.md).
- [Informe de la semana 1](INFORME-SEMANA-1.md).
- [Plan de aportes y adjuntos para semanas 2–3](PLAN-APORTES-Y-ADJUNTOS.md).

Este registro conserva la idea y su momento de revisión. No cambia el SOW presentado, los contratos, las APIs, los permisos ni los datos actuales.
