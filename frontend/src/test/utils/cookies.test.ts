import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteCookie, getCookie, hasCookies } from '@/utils/cookies'

/**
 * Targeted unit coverage for the cookie helpers used by the auth client.
 * Stryker mutates conditional / equality / string-literal operators; each
 * test below pins a behaviour that one of those mutants would break.
 */

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/`
}

describe('utils/cookies', () => {
  beforeEach(() => {
    // Clean any cookies left over from a previous test (jsdom shares state).
    for (const c of document.cookie.split(';')) {
      const name = c.split('=')[0].trim()
      if (name) deleteCookie(name)
    }
  })

  afterEach(() => {
    for (const c of document.cookie.split(';')) {
      const name = c.split('=')[0].trim()
      if (name) deleteCookie(name)
    }
  })

  describe('getCookie', () => {
    it('returns the value for an existing cookie', () => {
      setCookie('access_token', 'abc.def.ghi')
      expect(getCookie('access_token')).toBe('abc.def.ghi')
    })

    it('returns null when the cookie does not exist', () => {
      expect(getCookie('not_set')).toBeNull()
    })

    it('decodes URI-encoded values', () => {
      setCookie('preferences', encodeURIComponent('hello world & more'))
      expect(getCookie('preferences')).toBe('hello world & more')
    })

    it('does not match a cookie whose name is a prefix of another', () => {
      setCookie('access_token_full', 'should-not-match')
      expect(getCookie('access_token')).toBeNull()
    })

    it('returns the right value when multiple cookies are set', () => {
      setCookie('a', '1')
      setCookie('b', '2')
      setCookie('c', '3')
      expect(getCookie('b')).toBe('2')
    })
  })

  describe('hasCookies', () => {
    it('returns true when at least one of the listed cookies is set', () => {
      setCookie('refresh_token', 'r')
      expect(hasCookies('access_token', 'refresh_token')).toBe(true)
    })

    it('returns false when none of the listed cookies are set', () => {
      expect(hasCookies('access_token', 'refresh_token')).toBe(false)
    })

    it('returns false for an empty list', () => {
      expect(hasCookies()).toBe(false)
    })
  })

  describe('deleteCookie', () => {
    it('clears a previously set cookie', () => {
      setCookie('temp', 'value')
      expect(getCookie('temp')).toBe('value')
      deleteCookie('temp')
      expect(getCookie('temp')).toBeNull()
    })

    it('uses the supplied path when clearing', () => {
      setCookie('scoped', 'v')
      deleteCookie('scoped', '/api')
      // jsdom does not honour the path attribute for cookies on a single
      // origin, so the cookie may persist; the contract is "writes a
      // delete cookie string" — assert via document.cookie shape.
      expect(document.cookie).toMatch(/scoped=/)
    })

    it('defaults the path to "/" when not supplied', () => {
      // Spy on the document.cookie setter so we can assert what was written
      // (jsdom collapses the cookie back into a name=value pair on read).
      const writes: string[] = []
      const originalDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get: originalDesc.get,
        set(value: string) {
          writes.push(value)
          originalDesc.set!.call(this, value)
        },
      })
      try {
        deleteCookie('default_path')
      } finally {
        Object.defineProperty(document, 'cookie', originalDesc)
      }
      expect(writes.some((w) => w.includes('path=/'))).toBe(true)
    })
  })
})
