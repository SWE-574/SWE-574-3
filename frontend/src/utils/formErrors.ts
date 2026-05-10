/**
 * Helpers for parsing the backend's validation-error envelope into a
 * `{ field: message }` map that callers can attach to the right inputs.
 *
 * Backend shape (see `backend/api/exceptions.py`):
 *
 *   {
 *     "detail": "Invalid input.",
 *     "code": "invalid",
 *     "field_errors": {
 *       "title": ["This field is required."],
 *       "duration": ["Must be at least 1 hour."]
 *     }
 *   }
 *
 * Some endpoints fall back to vanilla DRF ValidationError, which surfaces
 * field-level errors at the top level of `response.data`:
 *
 *   { "title": ["This field is required."], "duration": ["..."] }
 *
 * We normalise both shapes so each form's catch handler can pin a message
 * next to the offending input instead of dumping everything into a toast.
 */

const ENVELOPE_KEYS = new Set([
  'detail',
  'code',
  'field_errors',
  'error',
  'message',
  'messages',
  'non_field_errors',
])

/**
 * Pull a `{ field: message }` map out of the raw `response.data` payload.
 * Returns an empty object when the payload is missing, malformed, or only
 * contains envelope-level fields like `detail`.
 */
export function extractFieldErrors(data: unknown): Record<string, string> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
  const out: Record<string, string> = {}

  const merge = (record: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(record)) {
      if (ENVELOPE_KEYS.has(key)) continue
      const msg = firstStringOf(value)
      if (msg) out[key] = msg
    }
  }

  // DRF default: top-level `{ field: [...] }` siblings of `detail`. Merged
  // first so the custom envelope (which is the more specific shape used by
  // the project's exception handler) can overwrite it on collision.
  merge(data as Record<string, unknown>)

  // Custom envelope: `{ field_errors: { field: [...] } }`. Wins on overlap.
  const fieldErrors = (data as Record<string, unknown>).field_errors
  if (fieldErrors && typeof fieldErrors === 'object' && !Array.isArray(fieldErrors)) {
    merge(fieldErrors as Record<string, unknown>)
  }

  return out
}

/**
 * Best-effort top-level `detail` extraction. Returned alongside the field
 * map when callers want to surface a banner / toast for non-field errors
 * (e.g. permission denied, throttled).
 */
export function extractTopLevelDetail(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const detail = (data as Record<string, unknown>).detail
  if (typeof detail === 'string' && detail.trim()) return detail
  const nonField = (data as Record<string, unknown>).non_field_errors
  const nonFieldMsg = firstStringOf(nonField)
  if (nonFieldMsg) return nonFieldMsg
  return null
}

function firstStringOf(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const s = firstStringOf(item)
      if (s) return s
    }
  }
  return null
}
