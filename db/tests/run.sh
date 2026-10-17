#!/usr/bin/env bash
# Prueba las migraciones en un Postgres 17 desechable (Docker): stub de Supabase → migraciones → seed → pruebas.
# Uso: bash db/tests/run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NAME="atalia-db-test"
IMAGE="postgres:17"

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 2

run() {
  echo "── $1"
  docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -f - < "$1"
}

run "$ROOT/db/tests/supabase_stub.sql"
for f in "$ROOT"/db/migrations/*.sql; do run "$f"; done
run "$ROOT/db/seed/staging.sql"
run "$ROOT/db/seed/staging.sql"   # el seed se puede repetir
run "$ROOT/db/tests/v3_test.sql"

echo "── Concurrencia: 20 peticiones simultáneas con el mismo checkout_token"
CONC_SQL="select public.create_checkout_order(
  jsonb_build_object('checkout_token', 'cccc0000-0000-4000-8000-000000000001',
    'store_id', '69de0e2e-c905-4d36-93f6-446572005410',
    'customer_name', 'Concurrent', 'customer_phone', '9735550199', 'customer_email', 'c@example.com',
    'scheduled_for', ((public.t_sat() - 1) + time '16:00') at time zone 'America/New_York',
    'subtotal_cents', 550, 'tax_rate_ppm', 66250, 'tax_cents', 36, 'total_cents', 586),
  '[{\"product_id\": \"11111111-0000-4000-8000-000000000003\", \"product_type\": \"menu\",
     \"product_name_snapshot\": \"Latte\", \"unit_price_cents\": 550, \"quantity\": 1}]',
  jsonb_build_array(jsonb_build_object('date', public.t_sat() - 1, 'slot_start', '16:00', 'category', 'menu', 'qty', 1)));"
for i in $(seq 1 20); do
  docker exec "$NAME" psql -U postgres -q -t -c "$CONC_SQL" >/dev/null &
done
wait
RESULT=$(docker exec "$NAME" psql -U postgres -t -A -c "
  select (select count(*) from public.orders where checkout_token = 'cccc0000-0000-4000-8000-000000000001')
     || ' pedido(s), '
     || (select count(*) from public.slot_holds where checkout_token = 'cccc0000-0000-4000-8000-000000000001')
     || ' retención(es)';")
echo "   $RESULT"
[ "$RESULT" = "1 pedido(s), 1 retención(es)" ] || { echo "FAIL: concurrencia"; exit 1; }
echo "PASS: RNF-P01 20 peticiones con el mismo token → 1 pedido y 1 retención"
