// k6 perf gate — FR-17a: services listing must serve at p95 < 1s.
//
// Run against the running stack:
//   k6 run frontend/tests/perf/feed-sla.js
//
// CI: invoked from `make test-perf`; advisory on PR, gating on nightly.

import http from 'k6/http'
import { check } from 'k6'

const BASE = __ENV.BASE_URL || 'http://localhost:8000'

export const options = {
  scenarios: {
    listings: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
  thresholds: {
    'http_req_duration{endpoint:services}': ['p(95)<1000'],
    'http_req_failed': ['rate<0.01'],
  },
}

export default function () {
  const res = http.get(`${BASE}/api/services/?type=Offer`, {
    tags: { endpoint: 'services' },
  })
  check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
    'has results': (r) => {
      try {
        const body = r.json()
        return Array.isArray(body) || Array.isArray(body.results)
      } catch {
        return false
      }
    },
  })
}
