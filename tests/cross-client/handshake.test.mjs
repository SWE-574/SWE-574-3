import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, env, login } from './helpers.mjs';

test('web handshake request → mobile sees pending: user A on web posts an Offer, user B on mobile requests a handshake; both clients agree on the pending state', async () => {
  const webA = await login(env.USER_A_EMAIL, env.USER_A_PASSWORD, 'web');
  const mobileB = await login(env.USER_B_EMAIL, env.USER_B_PASSWORD, 'mobile');

  // A creates an offer on web.
  const offer = await api('POST', '/api/services/', webA, {
    title: `cross-client handshake offer ${Date.now()}`,
    description: 'Created by tests/cross-client/handshake.test.mjs',
    type: 'Offer',
    status: 'Active',
    location_type: 'Online',
    duration: '1.00',
  });
  assert.equal(offer.status, 201, `offer create failed: ${JSON.stringify(offer.body)}`);
  const serviceId = offer.body.id;

  // B requests a handshake on mobile.
  const hs = await api('POST', '/api/handshakes/', mobileB, {
    service: serviceId,
    initial_message: 'cross-client request',
  });
  assert.equal(hs.status, 201, `handshake create failed: ${JSON.stringify(hs.body)}`);
  const handshakeId = hs.body.id;
  assert.equal(hs.body.status, 'Pending');

  // Mobile B (the requester) lists own handshakes and sees the pending one.
  const mobileListing = await api('GET', '/api/handshakes/?role=requester', mobileB);
  assert.equal(mobileListing.status, 200);
  const mobileIds = (mobileListing.body.results || mobileListing.body || []).map((h) => h.id);
  assert.ok(
    mobileIds.includes(handshakeId),
    `mobile requester listing missing handshake ${handshakeId}`,
  );

  // Web A (the provider) lists incoming handshakes and sees the same pending one.
  const webListing = await api('GET', '/api/handshakes/?role=provider', webA);
  assert.equal(webListing.status, 200);
  const webIds = (webListing.body.results || webListing.body || []).map((h) => h.id);
  assert.ok(
    webIds.includes(handshakeId),
    `web provider listing missing handshake ${handshakeId}`,
  );

  // Cleanup: cancel the handshake, delete the service.
  await api('POST', `/api/handshakes/${handshakeId}/cancel/`, mobileB);
  await api('DELETE', `/api/services/${serviceId}/`, webA);
});
