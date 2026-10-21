// Concurrencia por cupo: 30 clientes distintos intentan pagar a la vez la MISMA hora, que solo tiene 3 cupos.
// Debe haber exactamente 3 checkouts creados y el resto "slot_unavailable"; nunca más reservas que cupos.
// Antes de correrlo, fija el cupo de la hora de prueba (lo hace load/README.md, paso 1).
//
// k6 run load/slot-race.js
import http from 'k6/http'
import { check } from 'k6'
import { Counter } from 'k6/metrics'

const BASE = __ENV.BASE_URL || 'http://127.0.0.1:8787'
const DATE = __ENV.DATE || '2026-12-15'
const TIME = __ENV.TIME || '10:00'
const created = new Counter('checkouts_created')
const rejected = new Counter('slot_unavailable')

export const options = {
  scenarios: {
    race: { executor: 'per-vu-iterations', vus: 30, iterations: 1, maxDuration: '1m' },
  },
  thresholds: {
    // Con 3 cupos, exactamente 3 pasan
    checkouts_created: ['count==3'],
    slot_unavailable: ['count==27'],
  },
}

export default function () {
  const n = __VU
  const res = http.post(
    `${BASE}/checkout`,
    JSON.stringify({
      checkoutToken: crypto.randomUUID(),
      locale: 'es',
      pickup: { date: DATE, time: TIME },
      customer: { name: `Carga ${n}`, phone: '+1 973 555 0100', email: `carga+${n}@example.com` },
      items: [
        {
          productId: 'a7a10000-0000-4000-8000-000000000001',
          sizeId: 'b5b50001-0000-4000-8000-000000000000',
          quantity: 1,
        },
      ],
      acceptTerms: true,
    }),
    { headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': `203.0.113.${n}` } },
  )
  if (res.status === 201) created.add(1)
  else if (res.status === 409 && res.json('error.code') === 'slot_unavailable') rejected.add(1)
  check(res, { '201 o slot_unavailable': (r) => r.status === 201 || r.status === 409 })
}
