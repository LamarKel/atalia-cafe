// RNF-P01: 20 POST /checkout simultáneos con el mismo checkout_token → 1 pedido y 1 sesión de Stripe.
import { randomUUID } from 'node:crypto'
// Uso: node apps/api/scripts/concurrency.mjs [URL de la API] [producto del menú con precio]
const API = process.argv[2] ?? 'http://127.0.0.1:8787'
const H = { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4321' }
const items = [
  { productId: process.argv[3] ?? 'a8e10000-0000-4000-8000-00000000001b', sizeId: null, quantity: 2 },
]
const today = new Date().toISOString().slice(0, 10)
const to = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
const av = await (
  await fetch(`${API}/availability`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ from: today, to, locale: 'es', items }),
  })
).json()
const slot = av.slots.find((s) => s.available)
const token = randomUUID()
const body = JSON.stringify({
  checkoutToken: token,
  locale: 'es',
  pickup: { date: slot.date, time: slot.time },
  customer: { name: 'Prueba Concurrencia', phone: '+1 973 555 0100', email: 'qa@example.com' },
  items,
})
const res = await Promise.all(
  Array.from({ length: 20 }, () =>
    fetch(`${API}/checkout`, { method: 'POST', headers: H, body }).then(async (r) => ({
      status: r.status,
      body: await r.json(),
    })),
  ),
)
const byStatus = {}
for (const r of res) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
console.log('token', token, 'hora', slot.date, slot.time)
console.log('respuestas por estado:', byStatus)
console.log('códigos distintos:', [...new Set(res.filter((r) => r.status === 201).map((r) => r.body.code))])
console.log(
  'sesiones distintas:',
  new Set(res.filter((r) => r.status === 201).map((r) => r.body.url.split('#')[0])).size,
)
console.log('errores:', [
  ...new Set(res.filter((r) => r.status !== 201).map((r) => JSON.stringify(r.body.error))),
])
