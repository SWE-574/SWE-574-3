import { describe, expect, it } from 'vitest'
import { extractFieldErrors, extractTopLevelDetail } from '@/utils/formErrors'

/**
 * `extractFieldErrors` is the seam that lets every form catch handler pin
 * the right server-side message next to the offending input. Each test
 * below pins one branch of the parser — DRF's two error shapes, the
 * envelope-key blacklist, the array-vs-string normaliser, and the
 * malformed-payload guards.
 */

describe('extractFieldErrors', () => {
  it('returns an empty object for null and undefined payloads', () => {
    expect(extractFieldErrors(null)).toEqual({})
    expect(extractFieldErrors(undefined)).toEqual({})
  })

  it('returns an empty object for non-object payloads', () => {
    expect(extractFieldErrors('error')).toEqual({})
    expect(extractFieldErrors([1, 2, 3])).toEqual({})
    expect(extractFieldErrors(42)).toEqual({})
  })

  it('reads the custom envelope under field_errors', () => {
    const out = extractFieldErrors({
      detail: 'Invalid input.',
      code: 'invalid',
      field_errors: {
        title: ['This field is required.'],
        duration: ['Must be at least 1 hour.'],
      },
    })
    expect(out).toEqual({
      title: 'This field is required.',
      duration: 'Must be at least 1 hour.',
    })
  })

  it('reads vanilla DRF top-level field arrays', () => {
    const out = extractFieldErrors({
      title: ['Title is too short.'],
      duration: ['Duration must be greater than 0.'],
    })
    expect(out).toEqual({
      title: 'Title is too short.',
      duration: 'Duration must be greater than 0.',
    })
  })

  it('skips known envelope keys at the top level', () => {
    const out = extractFieldErrors({
      detail: 'Bad request.',
      code: 'invalid',
      message: 'Something happened',
      messages: ['x'],
      non_field_errors: ['y'],
      title: ['Required.'],
    })
    expect(out).toEqual({ title: 'Required.' })
  })

  it('takes the first string when a field has multiple messages', () => {
    const out = extractFieldErrors({
      field_errors: {
        title: ['First problem.', 'Second problem.'],
      },
    })
    expect(out.title).toBe('First problem.')
  })

  it('falls back to top-level fields when field_errors is empty', () => {
    const out = extractFieldErrors({
      field_errors: {},
      title: ['Required.'],
    })
    expect(out).toEqual({ title: 'Required.' })
  })

  it('prefers field_errors when both shapes are present for the same key', () => {
    const out = extractFieldErrors({
      title: ['Top-level message.'],
      field_errors: { title: ['Envelope message.'] },
    })
    expect(out.title).toBe('Envelope message.')
  })

  it('accepts a bare string value and returns it as-is', () => {
    const out = extractFieldErrors({
      field_errors: { description: 'Plain string error.' },
    })
    expect(out.description).toBe('Plain string error.')
  })

  it('drops fields whose message is blank or non-string', () => {
    const out = extractFieldErrors({
      field_errors: {
        title: '',
        duration: ['   '],
        ignored: [123, null, {}],
        kept: ['ok'],
      },
    })
    expect(out).toEqual({ kept: 'ok' })
  })
})

describe('extractTopLevelDetail', () => {
  it('returns the detail string when present', () => {
    expect(extractTopLevelDetail({ detail: 'Permission denied.' })).toBe('Permission denied.')
  })

  it('falls back to non_field_errors when detail is missing', () => {
    expect(
      extractTopLevelDetail({ non_field_errors: ['You cannot post twice.'] }),
    ).toBe('You cannot post twice.')
  })

  it('returns null when neither key is set', () => {
    expect(extractTopLevelDetail({ field_errors: { title: ['x'] } })).toBeNull()
  })

  it('promotes nested field_errors.non_field_errors over the generic detail', () => {
    // Mirrors what `custom_exception_handler` produces when a serializer
    // raises `ValidationError({'non_field_errors': [...]})`: the helpful
    // message is buried under `field_errors.non_field_errors` while
    // `detail` carries the generic "Validation failed." string.
    expect(
      extractTopLevelDetail({
        detail: 'Validation failed.',
        code: 'VALIDATION_ERROR',
        field_errors: {
          non_field_errors: ['You cannot post twice in a row.'],
        },
      }),
    ).toBe('You cannot post twice in a row.')
  })

  it('returns null for non-object payloads', () => {
    expect(extractTopLevelDetail(null)).toBeNull()
    expect(extractTopLevelDetail('oops')).toBeNull()
    expect(extractTopLevelDetail([])).toBeNull()
  })

  it('ignores blank detail strings', () => {
    expect(extractTopLevelDetail({ detail: '   ' })).toBeNull()
  })
})
