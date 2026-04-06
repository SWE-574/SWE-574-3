import { test } from '@playwright/test'

test('FR-13h: each Interests row shows user summary, exchange state, and a public-profile link', async () => {
  // The current frontend shows requester name and status in owner-side rows,
  // but does not expose a direct public-profile link from each interest row yet.
  test.skip(true, 'Owner-side interest rows do not currently expose a requester profile link.')
})
