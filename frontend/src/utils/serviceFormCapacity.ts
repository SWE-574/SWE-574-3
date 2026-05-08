export function maxParticipantsFloor(
  isEditMode: boolean,
  participantCount: number | null | undefined,
): number {
  if (!isEditMode) return 1
  return Math.max(1, Number(participantCount ?? 0))
}

export function validateMaxParticipantsValue(
  value: unknown,
  isEditMode: boolean,
  floor: number,
): true | string {
  if (!isEditMode) return true
  return (
    Number(value) >= floor
    || `Cannot lower below the current accepted count (${floor}).`
  )
}
