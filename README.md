# Atalia Café v3

Catering y pedidos en línea para Atalia Café (Passaic, NJ). Plan completo en [PLAN.md](PLAN.md); reglas para Claude Code en [CLAUDE.md](CLAUDE.md).

## Estructura

| Carpeta | Qué es |
|---|---|
| `apps/web` | Sitio público en Astro + islas de React + Tailwind 4. EN en `/`, ES en `/es` |
| `apps/api` | API en Cloudflare Workers + Hono |
| `packages/shared` | Dinero en centavos (`money`) y reglas de negocio configurables (`rules`), compartidos por el front y la API |
| `packages/ui` | Tokens de la marca para Tailwind (`tokens.css`) |
| `db/` | Migraciones de Supabase, seed de staging y pruebas de la BD |
| `docs/` | Auditoría de la app anterior, diseño de la BD, reglas de negocio y pantallas aprobadas |

## Comandos

Requisitos: Node 22+ y pnpm 10 (`npm i -g pnpm@10`).

```sh
pnpm install
pnpm dev:web        # sitio en http://localhost:4321
pnpm dev:api        # Worker en http://localhost:8787 (copia apps/api/.dev.vars.example a .dev.vars)
pnpm check          # lint + formato + tipos + pruebas + pruebas de la BD
bash db/tests/run.sh  # pruebas de la BD en Postgres 17 con Docker, incluida la concurrencia
```
