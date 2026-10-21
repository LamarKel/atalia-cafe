# Pruebas de carga (k6)

Contra el Worker (API). El sitio y el panel son estáticos y los sirve la CDN de Cloudflare: no hace falta
probarlos con carga.

```bash
k6 run load/rate-limit.js   # límite por IP (≈5 s)
k6 run load/slot-race.js    # concurrencia por cupo (≈5 s) — ver paso 1
k6 run load/api.js          # humo + carga sostenida + pico (≈3 min)
```

Todas usan `http://127.0.0.1:8787` por defecto; contra staging o producción: `-e BASE_URL=https://…`.
Cada usuario virtual manda su propia `cf-connecting-ip` (en Cloudflare la pone la red; aquí simula
clientes distintos para que el límite por IP no los junte).

## Prueba de concurrencia por cupo

1. Fija un cupo chico para una hora de prueba (en la BD, con service_role o el conector):
   ```sql
   insert into public.capacity_slots (store_id, date, slot_start, category, max_units, reserved_units)
   values ('<tienda>', '2026-12-15', '10:00', 'tray', 3, 0)
   on conflict (store_id, date, slot_start, category) do update set max_units = 3;
   ```
2. `k6 run load/slot-race.js` → 30 clientes piden esa hora a la vez: deben pasar exactamente 3.
3. Limpieza: liberar las retenciones (`release_holds`), cancelar los pedidos `carga+N@example.com`
   y volver a dejar `max_units = null`.

## Resultados — 2026-10-20 (Worker local `wrangler dev` + Supabase de staging + Stripe de prueba)

| Prueba | Resultado |
|---|---|
| Límite por IP (`/quotes`, 40 peticiones de una IP) | 20 pasan y 20 reciben **429** con `Retry-After: 60` |
| Concurrencia por cupo (30 clientes, 3 cupos) | **3** checkouts creados, **27** "slot_unavailable"; en la BD 3 reservados de 3 |
| Humo (1 usuario, 15 s) | p95 **638 ms**, 0 errores |
| Carga sostenida (30 usuarios, 1 min) | p95 **541 ms**, 0 errores |
| Pico (0 → 150 usuarios en 10 s, ~48 pet/s) | p95 **693 ms**, 0 errores |
| Total | **2975** peticiones a `/availability`, **0 %** de errores |

Un checkout completo (precio, cupo, pedido y sesión de Stripe) tarda ~2.2 s; el que paga es solo un cliente
por intento, así que no es un cuello de botella.

Notas:
- En local corre un solo proceso de Worker. En Cloudflare cada petición la atiende el edge más cercano
  y escala solo; ahí el límite real es Supabase. Repetir `api.js` contra staging en Cloudflare antes de lanzar.
- El pico no tocó el plan de Supabase de staging (cada consulta de horas es una llamada RPC liviana).
