import type { PrivateOperation } from './types';

const messages: Record<string, string> = {
  wallet_binding_changed: 'La asociación de tu cuenta cambió. Las operaciones están bloqueadas hasta revisarla.',
  wallet_binding_ambiguous: 'Tu cuenta necesita revisar su asociación Stellar. No se creará otra wallet.',
  wallet_creation_pending: 'Tu cuenta Stellar se está preparando. Consulta nuevamente en unos instantes.',
  appointment_wallet_changed: 'La cuenta de esta consulta no coincide con tu wallet verificada. Solicita revisar la asociación.',
  booking_identity_changed: 'Cambió la identidad de un participante. La consulta queda bloqueada hasta revisarla.',
  private_writes_paused: 'Las confirmaciones están temporalmente deshabilitadas. Puedes consultar el estado de los intentos existentes.',
  private_writes_disabled: 'Las confirmaciones están temporalmente deshabilitadas. Puedes consultar el estado de los intentos existentes.',
  booking_not_eligible: 'La consulta aún no reúne las condiciones para acreditar la reserva.',
  booking_not_ready: 'Se requieren asistencia, inicio de consulta y reserva acreditada y vigente. Actualiza su estado.',
  slot_not_available: 'Ese horario ya no está disponible. Elige otro.',
  consultation_outside_checkin_window: 'La asistencia y el inicio se habilitan el día de la consulta, desde 30 minutos antes de la hora reservada (hora de Chile).',
  consultation_not_open: 'La consulta está finalizada, cancelada o con cancelación pendiente. Actualiza su estado.',
  doctor_not_authorized: 'La autorización del médico no está vigente. El administrador debe revisarla antes de continuar.',
  distinct_participants_required: 'El médico y el paciente deben utilizar cuentas de prueba distintas.',
  another_operation_pending: 'Tu cuenta tiene otra confirmación pendiente. Abre la consulta o receta anterior para consultar su estado o terminar la firma; si quedó sin firmar, puedes esperar a que venza.',
  consent_required: 'El paciente debe autorizar una emisión con un permiso vigente antes de emitir la receta.',
  consent_already_active: 'El permiso ya está vigente. Actualiza la consulta para ver su estado.',
  consent_already_consumed: 'Este permiso ya se utilizó para emitir una receta. Su retirada no puede deshacer esa emisión.',
  consent_not_available: 'No hay un permiso disponible para retirar. Actualiza el estado de la consulta.',
  booking_already_consumed: 'La reserva ya se utilizó o la consulta terminó. La receta y su historial se conservan.',
  booking_not_cancellable: 'La reserva ya no permite solicitar cancelación. Actualiza su estado.',
  private_prescription_already_prepared: 'Esta consulta ya tiene un documento guardado. Actualiza y usa «Revisar y continuar emisión»; su contenido no se reemplaza.',
  prescription_not_ready: 'Este documento ya no está listo para emitir. Revisa su vigencia, reserva y permiso del paciente.',
  prescription_not_confirmed: 'La emisión todavía no tiene un recibo confirmado. Consulta esa operación antes de continuar.',
  prescription_not_activatable: 'La receta ya no está registrada y vigente para activar. Actualiza su estado.',
  prescription_not_revocable: 'La receta ya no admite esta revocación. Actualiza para consultar su estado actual.',
  private_prescription_unavailable: 'No pudimos verificar tu acceso al documento privado. No se mostrará su contenido hasta comprobarlo.',
  operation_context_changed: 'Cambió la reserva, el permiso o la receta desde la preparación. Actualiza y revisa la operación antes de continuar.',
  signature_request_expired: 'Venció la solicitud sin firmar. Revisa la acción otra vez para preparar un nuevo intento, si sigue permitida.',
  awaiting_receipt_reconciliation: 'Seguimos comprobando un intento ya enviado. Conservamos el mismo intento y no prepararemos una firma nueva.',
  transaction_failed: 'Stellar rechazó esta operación. El cambio no quedó confirmado; actualiza la consulta antes de volver a intentarlo.',
};
export function portalErrorMessage(code: string, status?: number) {
  return messages[code] ?? (status === 401 ? 'Tu sesión venció. Vuelve a ingresar con Privy.' :
    status === 403 ? 'Tu cuenta no tiene permiso para esta acción.' :
    status === 409 ? 'El estado de la consulta cambió. Actualiza antes de volver a confirmar.' :
    'No pudimos verificar la operación. Actualiza el estado antes de intentarlo nuevamente.');
}

export function operationNoticeDetail(
  operation: Pick<PrivateOperation, 'action' | 'state' | 'transactionHash' | 'errorCode'>,
): string | null {
  if (!operation.errorCode || operation.state === 'confirmed') return null;
  const pendingReceipt = operation.state === 'submitted'
    && /^[a-f0-9]{64}$/i.test(operation.transactionHash ?? '');
  // Changed eligibility does not establish the result of this saved attempt.
  if (pendingReceipt && operation.action === 'mint'
    && ['consent_required', 'booking_not_ready', 'prescription_not_ready'].includes(operation.errorCode)) {
    return 'La reserva o el permiso cambiaron después del envío. Seguimos comprobando el recibo de este mismo intento; todavía no está confirmado.';
  }
  if (pendingReceipt && operation.action === 'consent' && operation.errorCode === 'consent_already_active') {
    return 'El permiso figura vigente. Seguimos comprobando el recibo de este intento; todavía no está confirmado.';
  }
  if (pendingReceipt && operation.action === 'activate' && operation.errorCode === 'prescription_not_activatable') {
    return 'El estado o la vigencia de la receta cambió. Seguimos comprobando el recibo de este intento; todavía no está confirmado.';
  }
  return portalErrorMessage(operation.errorCode);
}
