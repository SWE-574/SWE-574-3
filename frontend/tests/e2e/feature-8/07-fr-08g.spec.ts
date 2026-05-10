import { test } from '@playwright/test'

test('FR-08g: in-person accepted exchanges require QR-based completion checks', async () => {
  // Backend accepts `qr_token` on the handshake check-in path, but the FE
  // surfaces only a manual attendance-code input today — no camera-driven QR
  // scan UX exists yet, and Playwright can't drive a real device camera.
  // Deferred until a scanner component or a mock-camera harness lands;
  // tracked under epic #579.
  test.skip(true, 'Service QR scan completion: deferred, no FE scanner UI (#579).')
})
