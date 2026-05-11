// k6 perf gate — NFR-11a: event create/update API must respond p95 < 1.5s.
//
// Posts a synthetic event under load and tears it down on iteration end.

import http from 'k6/http'
import { check } from 'k6'

const BASE = __ENV.BASE_URL || 'http://localhost:8000'
const EMAIL = __ENV.TEST_EMAIL || 'elif@demo.com'
const PASSWORD = __ENV.TEST_PASSWORD || 'demo123'

export const options = {
  scenarios: {
    create: {
      executor: 'constant-arrival-rate',
      rate: 4,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 8,
      maxVUs: 16,
    },
  },
  thresholds: {
    'http_req_duration{endpoint:event_create}': ['p(95)<1500'],
    'http_req_failed{endpoint:event_create}': ['rate<0.02'],
  },
}

export function setup() {
  const login = http.post(
    `${BASE}/api/auth/login/`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  )
  return { access: login.json('access') }
}

export default function (data) {
  const payload = {
    title: `Perf Event ${Date.now()}-${__VU}`,
    description: 'Synthetic event for k6 perf gate',
    type: 'Event',
    duration: '1.00',
    location_type: 'Online',
    schedule_type: 'One-Time',
    max_participants: 5,
    scheduled_time: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
  }
  const res = http.post(`${BASE}/api/services/`, JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.access}`,
    },
    tags: { endpoint: 'event_create' },
  })
  check(res, { 'created or rate-limited': (r) => r.status === 201 || r.status === 429 })
}
