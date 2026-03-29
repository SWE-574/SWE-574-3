import { test } from '@playwright/test'

test('FR-09d: provider can generate a unique QR code for accepted in-person exchanges', async () => {
  // The current frontend runtime does not expose a service QR generation flow yet.
  test.skip(true, 'Service QR generation is not implemented in the current frontend.')
})
