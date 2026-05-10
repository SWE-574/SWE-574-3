import { test } from '@playwright/test'

test('FR-09d: provider can generate a unique QR code for accepted in-person exchanges', async () => {
  // Service-level QR generation is not exposed in the current frontend
  // (the `generate-qr-token` backend endpoint exists, but no service-detail
  // UI control wires it up). Event QR has a separate working surface via
  // EventRosterModal and is covered by feature-15 specs. Deferred — re-enable
  // when a service-side button lands. Tracked under epic #579.
  test.skip(true, 'Service QR generation: deferred, no FE wiring yet (#579).')
})
