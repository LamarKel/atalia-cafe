// Límite por IP: una sola IP que inunda /quotes (límite estricto: 20 por minuto) recibe 429 con Retry-After.
// k6 run load/rate-limit.js
import http from 'k6/http'
import { check } from 'k6'
import { Counter } from 'k6/metrics'

const BASE = __ENV.BASE_URL || 'http://127.0.0.1:8787'
const limited = new Counter('rate_limited')
const passed = new Counter('passed_through')

export const options = {
  scenarios: { flood: { executor: 'shared-iterations', vus: 5, iterations: 40, maxDuration: '30s' } },
  thresholds: { passed_through: ['count<=20'], rate_limited: ['count>=20'] },
}

export default function () {
  const res = http.post(`${BASE}/quotes`, '{}', {
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '192.0.2.77' },
  })
  if (res.status === 429) limited.add(1)
  else passed.add(1)
  check(res, { 'el 429 trae Retry-After': (r) => r.status !== 429 || r.headers['Retry-After'] === '60' })
}
