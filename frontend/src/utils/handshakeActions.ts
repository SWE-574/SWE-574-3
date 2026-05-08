export function canDirectlyAcceptHandshake(
  handshakeStatus: string,
  serviceType: string,
): boolean {
  return handshakeStatus === 'pending' && serviceType === 'Event'
}
