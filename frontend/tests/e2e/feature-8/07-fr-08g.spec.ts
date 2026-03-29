import { test } from '@playwright/test'

test('FR-08g: in-person accepted exchanges require QR-based completion checks', async () => {
  // The current frontend runtime does not expose a service QR scan flow for in-person
  // handshakes, so this requirement cannot yet be exercised end to end in Playwright.
  test.skip(true, 'Service QR completion is not implemented in the current frontend.')
})
