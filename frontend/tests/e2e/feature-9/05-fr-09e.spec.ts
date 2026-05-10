import { test } from '@playwright/test'

test('FR-09e: handshake QR codes expire after use, cancellation, or scheduled session end', async () => {
  // Backend `EventQRToken.expires_at` + `is_expired` already enforce expiry,
  // but exercising it end-to-end requires a time-mock harness (Playwright
  // can't fast-forward server clocks). Deferred until a clock-fixture lands;
  // tracked under epic #579 "Testing & Validation".
  test.skip(true, 'Service QR expiration: deferred, needs time-mock harness (#579).')
})
