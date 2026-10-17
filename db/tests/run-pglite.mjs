// Prueba las migraciones con PGlite (Postgres 17 en WASM, sin Docker): stub → migraciones → seed ×2 → pruebas.
// Uso: node db/tests/run-pglite.mjs <ruta a node_modules con @electric-sql/pglite>
// Diferencias con Supabase, solo para la prueba local:
//   * PGlite no trae pgcrypto: extensions.gen_random_bytes se simula en el stub.
//   * Una sola conexión: la prueba de 20 peticiones concurrentes se hace con db/tests/run.sh (Docker).
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const modulesDir = process.argv[2]
if (!modulesDir) {
  console.error('Uso: node db/tests/run-pglite.mjs <node_modules>')
  process.exit(2)
}
const { PGlite } = await import(pathToFileURL(join(modulesDir, '@electric-sql/pglite/dist/index.js')).href)

const pg = new PGlite()
let passes = 0

const onNotice = (n) => {
  const msg = n.message ?? String(n)
  if (msg.startsWith('PASS')) {
    passes++
    console.log('   ' + msg)
  }
}

// Separa un script en sentencias (respeta comillas, $$…$$ y comentarios) para correrlas una por una
// en autocommit, igual que psql. Si no, PGlite trataría todo el archivo como una sola transacción.
function splitStatements(sql) {
  const out = []
  let buf = ''
  let i = 0
  let quote = null // "'" | '"' | '$tag$'
  while (i < sql.length) {
    const ch = sql[i]
    if (quote) {
      if (quote.startsWith('$')) {
        if (sql.startsWith(quote, i)) { buf += quote; i += quote.length; quote = null; continue }
      } else if (ch === quote) {
        quote = null
      }
      buf += ch; i++; continue
    }
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i)
      i = end === -1 ? sql.length : end
      continue
    }
    if (ch === "'" || ch === '"') { quote = ch; buf += ch; i++; continue }
    if (ch === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))
      if (m) { quote = m[0]; buf += m[0]; i += m[0].length; continue }
    }
    if (ch === ';') {
      if (buf.trim()) out.push(buf.trim())
      buf = ''; i++; continue
    }
    buf += ch; i++
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

async function run(file, transform = (s) => s) {
  console.log('── ' + file.replace(root, '.'))
  const sql = transform(readFileSync(file, 'utf8'))
  for (const stmt of splitStatements(sql)) {
    await pg.exec(stmt, { onNotice })
  }
}

const pgliteStub = `
create schema if not exists extensions;
create or replace function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$
  select decode(string_agg(lpad(to_hex((random() * 255)::int), 2, '0'), ''), 'hex') from generate_series(1, n)
$$;
`

try {
  await run(join(root, 'db/tests/supabase_stub.sql'), (s) => s + pgliteStub)
  const migrations = readdirSync(join(root, 'db/migrations')).filter((f) => f.endsWith('.sql')).sort()
  for (const f of migrations) {
    await run(join(root, 'db/migrations', f), (s) =>
      s.replace(/create extension if not exists pgcrypto with schema extensions;/i, '-- (pgcrypto simulado en PGlite)'))
  }
  await run(join(root, 'db/seed/staging.sql'))
  await run(join(root, 'db/seed/staging.sql')) // el seed se puede repetir
  await run(join(root, 'db/tests/v3_test.sql'), (s) =>
    s.split('\n').filter((l) => !l.trimStart().startsWith('\\')).join('\n'))
  console.log(`\n=== ${passes} PRUEBAS PASARON ===`)
} catch (err) {
  console.error('\nFALLÓ:', err.message)
  if (err.position) console.error('posición:', err.position)
  process.exit(1)
}
