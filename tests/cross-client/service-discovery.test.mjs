import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, env, login } from './helpers.mjs';

test('web post → mobile discovery: an Offer posted by a web client appears in the discovery feed for a mobile client', async () => {
  const webA = await login(env.USER_A_EMAIL, env.USER_A_PASSWORD, 'web');
  const mobileB = await login(env.USER_B_EMAIL, env.USER_B_PASSWORD, 'mobile');

  const title = `cross-client offer ${Date.now()}`;
  const create = await api('POST', '/api/services/', webA, {
    title,
    description: 'Created by tests/cross-client/service-discovery.test.mjs',
    type: 'Offer',
    status: 'Active',
    location_type: 'Online',
    duration: '1.00',
    schedule_type: 'One-Time',
  });
  assert.equal(create.status, 201, `service create failed: ${JSON.stringify(create.body)}`);
  const serviceId = create.body.id;

  // Mobile B browses the discovery feed and confirms the new offer is there.
  // Search by the unique title rather than scanning unfiltered top results so
  // the test does not race against pagination or a stale list cache.
  const feed = await api(
    'GET',
    `/api/services/?type=Offer&search=${encodeURIComponent(title)}&page_size=100`,
    mobileB,
  );
  assert.equal(feed.status, 200);
  const ids = ((feed.body.results ?? feed.body) || []).map((s) => s.id);
  assert.ok(
    ids.includes(serviceId),
    `mobile feed missing the new offer ${serviceId}; got ${ids.length} services`,
  );

  // Cleanup.
  await api('DELETE', `/api/services/${serviceId}/`, webA);
});
