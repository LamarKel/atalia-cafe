// Carga sobre la API (Worker): humo, carga sostenida y pico en /availability, que es lo que más se consulta
// (cada visita al checkout pide el calendario del mes). Cada usuario virtual llega con su propia IP
// (cf-connecting-ip), como pasa con clientes reales detrás de Cloudflare, así el límite por IP no los mezcla.
//
// k6 run load/api.js                                  (Worker local, 127.0.0.1:8787)
// k6 run -e BASE_URL=https://api.staging.dominio load/api.js
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend } from 'k6/metrics'

const BASE = __ENV.BASE_URL || 'http://127.0.0.1:8787'
const availability = new Trend('availability_ms', true)

// Un producto del menú y una bandeja de catering de staging (ver db/seed)
const ITEMS = [
  [{ productId: 'a8e10000-0000-4000-8000-00000000001b', sizeId: null, quantity: 2 }],
  [
    {
      productId: 'a7a10000-0000-4000-8000-000000000001',
      sizeId: 'b5b50001-0000-4000-8000-000000000000',
      quantity: 1,
    },
  ],
]

export const options = {
  scenarios: {
    smoke: { executor: 'constant-vus', vus: 1, duration: '15s', exec: 'browse' },
    load: {
      executor: 'ramping-vus',
      startTime: '20s',
      stages: [
        { duration: '30s', target: 30 },
        { duration: '1m', target: 30 },
        { duration: '15s', target: 0 },
      ],
      exec: 'browse',
    },
    spike: {
      executor: 'ramping-vus',
      startTime: '2m10s',
      stages: [
        { duration: '10s', target: 150 },
        { duration: '20s', target: 150 },
        { duration: '10s', target: 0 },
      ],
      exec: 'browse',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'availability_ms{scenario:smoke}': ['p(95)<1500'],
    'availability_ms{scenario:load}': ['p(95)<2000'],
    'availability_ms{scenario:spike}': ['p(95)<4000'],
  },
}

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
const ip = () => `198.51.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`

export function browse() {
  const headers = { 'Content-Type': 'application/json', 'cf-connecting-ip': `${ip()}` }
  const body = JSON.stringify({
    from: day(1),
    to: day(7),
    locale: Math.random() < 0.5 ? 'es' : 'en',
    items: ITEMS[Math.floor(Math.random() * ITEMS.length)],
  })
  const res = http.post(`${BASE}/availability`, body, { headers, tags: { name: 'availability' } })
  availability.add(res.timings.duration)
  check(res, {
    'availability 200': (r) => r.status === 200,
    'trae horas': (r) => r.status === 200 && r.json('slots').length > 0,
  })
  sleep(1 + Math.random() * 2)
}
