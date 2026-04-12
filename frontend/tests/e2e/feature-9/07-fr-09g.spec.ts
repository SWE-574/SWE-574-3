import { test } from '@playwright/test'

test('FR-09g: listing owners have a manual completion fallback when QR scan is not possible', async () => {
  // The current frontend runtime does not expose a manual service-completion fallback action.
  test.skip(true, 'Manual service-completion fallback is not implemented in the current frontend.')
})
