// k6 perf gate — NFR-19a: authenticated activity feed must serve at p95 < 2s.
//
// Authenticates via /api/auth/login/ once, then loops the feed under load.
// Requires a seeded test user — set TEST_EMAIL / TEST_PASSWORD env vars or
// rely on the demo seed (elif@demo.com / demo123).

import http from 'k6/http'
import { check } from 'k6'

const BASE = __ENV.BASE_URL || 'http://localhost:8000'
const EMAIL = __ENV.TEST_EMAIL || 'elif@demo.com'
const PASSWORD = __ENV.TEST_PASSWORD || 'demo123'

export const options = {
  scenarios: {
    feed: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 50,
      stages: [
        { target: 10, duration: '20s' },
        { target: 20, duration: '40s' },
        { target: 0, duration: '10s' },
      ],
    },
  },
  thresholds: {
    'http_req_duration{endpoint:feed}': ['p(95)<2000'],
    'http_req_failed': ['rate<0.02'],
  },
}

export function setup() {
  const login = http.post(
    `${BASE}/api/auth/login/`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  )
  if (login.status !== 200) {
    throw new Error(`Login failed: ${login.status} ${login.body}`)
  }
  const body = login.json()
  return { access: body.access }
}

export default function (data) {
  const res = http.get(`${BASE}/api/activity/feed/`, {
    headers: { Authorization: `Bearer ${data.access}` },
    tags: { endpoint: 'feed' },
  })
  check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
  })
}
