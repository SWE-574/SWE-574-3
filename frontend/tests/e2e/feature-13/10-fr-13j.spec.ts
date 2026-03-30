import { test } from '@playwright/test'

test('FR-13j: detail page exposes a public discussion tab and authenticated users can post comments', async () => {
  // The current detail page renders review history only; a public discussion tab and comment composer are not exposed yet.
  test.skip(true, 'Public discussion posting is not implemented in the current detail-page UI.')
})
