import { describe, expect, it } from 'vitest'
import { getErrorMessage, type ApiError } from '@/services/api'

/**
 * Targeted unit coverage for the api client's error-formatting helper.
 * `getErrorMessage` is the highest-mutation-density function in api.ts:
 * a lot of branching, several string-equality checks, and the order of
 * fallbacks matters. Each test below pins one branch so a Stryker mutant
 * that flips its conditional would fail at least one assertion.
 *
 * The token-refresh queue and response interceptor are exercised by the
 * E2E auth specs; we don't try to drive the full axios state machine
 * here.
 */

function withResponse(data: unknown, status = 400): ApiError {
  return Object.assign(new Error('axios error'), {
    response: { data, status },
  }) as ApiError
}

describe('getErrorMessage', () => {
  it('returns the supplied default when the input is undefined', () => {
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred.')
  })

  it('returns the supplied default when the input is null', () => {
    expect(getErrorMessage(null)).toBe('An unexpected error occurred.')
  })

  it('returns the override default when there is nothing to extract', () => {
    expect(getErrorMessage({}, 'Custom fallback')).toBe('Custom fallback')
  })

  it('returns the input when given a plain string', () => {
    expect(getErrorMessage('Bare string error')).toBe('Bare string error')
  })

  it('returns response.data.detail for the standard DRF auth error', () => {
    const err = withResponse({ detail: 'Authentication credentials were not provided.', code: 'not_authenticated' }, 401)
    expect(getErrorMessage(err)).toBe('Authentication credentials were not provided.')
  })

  it('combines detail with inline field-error arrays', () => {
    const err = withResponse({
      detail: 'Invalid input',
      email: ['This field is required.'],
      password: ['Must be at least 8 characters.'],
    })
    const out = getErrorMessage(err)
    expect(out.startsWith('Invalid input:')).toBe(true)
    expect(out).toContain('This field is required.')
    expect(out).toContain('Must be at least 8 characters.')
  })

  it('renders inline field-error arrays even without a detail key', () => {
    const err = withResponse({ email: ['Already taken.'] })
    expect(getErrorMessage(err)).toBe('Already taken.')
  })

  it('renders inline field-error strings as-is', () => {
    const err = withResponse({ first_name: 'Required.' })
    expect(getErrorMessage(err)).toBe('Required.')
  })

  it('renders field_errors keyed under that name', () => {
    const err = withResponse({
      field_errors: {
        email: ['Invalid email.', 'Already taken.'],
      },
    })
    expect(getErrorMessage(err)).toBe('Invalid email., Already taken.')
  })

  it('falls back to data.error when no detail or field errors are present', () => {
    const err = withResponse({ error: 'Bad gateway' }, 502)
    expect(getErrorMessage(err)).toBe('Bad gateway')
  })

  it('falls back to data.message when only a message key is present', () => {
    const err = withResponse({ message: 'Service unavailable' }, 503)
    expect(getErrorMessage(err)).toBe('Service unavailable')
  })

  it('prefers detail when both detail and message are present', () => {
    const err = withResponse({ detail: 'detail wins', message: 'message loses' })
    expect(getErrorMessage(err)).toBe('detail wins')
  })

  it('falls back to e.message when there is no response payload', () => {
    const err = new Error('Network Error') as ApiError
    expect(getErrorMessage(err)).toBe('Network Error')
  })

  it('uses the default for an object that has neither response nor message', () => {
    expect(getErrorMessage({})).toBe('An unexpected error occurred.')
  })

  it('coerces non-string error / message values to strings', () => {
    const err = withResponse({ error: 42 } as unknown as Record<string, unknown>)
    expect(getErrorMessage(err)).toBe('42')
  })

  it('does not treat an Array response body as a field-error map', () => {
    // Arrays pass `typeof === 'object'`, so without the `!Array.isArray`
    // guard the function would iterate them as field keys and emit "a. b".
    const err = withResponse(['a', 'b'] as unknown as Record<string, unknown>)
    expect(getErrorMessage(err)).toBe('axios error')
  })

  it('does not treat a string response body as a field-error map', () => {
    // The `typeof === 'object'` guard must reject string payloads — otherwise
    // each character becomes a field key and the output is "h. e. l. l. o".
    const err = withResponse('hello' as unknown as Record<string, unknown>)
    expect(getErrorMessage(err)).toBe('axios error')
  })

  it('renders a top-level messages array (not in the known-keys set as a singular)', () => {
    // 'messages' (plural) is in the known-top-keys set so it should NOT be
    // surfaced as an inline field error. Asserting on its absence pins the
    // membership of that key in the set.
    const err = withResponse({ messages: ['err1', 'err2'] })
    expect(getErrorMessage(err)).toBe('axios error')
  })

  it('joins multiple field-error arrays with ". " between them', () => {
    const err = withResponse({
      detail: 'Invalid input',
      field_errors: {
        email: ['required'],
        password: ['too short'],
      },
    })
    // Both inline (none here) + field_errors are joined with ". " in `${detail}: …`.
    expect(getErrorMessage(err)).toBe('Invalid input: required. too short')
  })

  it('joins items inside one field-error array with ", " (not ". ")', () => {
    const err = withResponse({
      field_errors: { email: ['Invalid email.', 'Already taken.'] },
    })
    expect(getErrorMessage(err)).toBe('Invalid email., Already taken.')
  })
})
