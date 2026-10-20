// Accesibilidad del build (WCAG 2.1 A/AA con axe) en las páginas públicas. Falla si hay alguna violación.
// Uso: pnpm --filter @atalia/web build && pnpm --filter @atalia/web test:a11y
// (Checkout, confirmación y panel necesitan el Worker y una sesión con 2FA: se revisan aparte.)
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'

const PORT = 4399
// Si ya hay un servidor del build corriendo (Astro permite una sola vista previa por proyecto), úsalo
const EXTERNAL = process.env.A11Y_BASE_URL
const BASE = EXTERNAL ?? `http://127.0.0.1:${PORT}`
const PAGES = [
  '/',
  '/es',
  '/es/catering',
  '/es/catering/breakfast-tray',
  '/es/picadera',
  '/es/menu',
  '/es/cart',
  '/es/quote',
  '/es/about',
  '/es/contact',
  '/es/terms',
  '/es/privacy',
  '/es/policies',
  '/es/accessibility',
]

// astro preview directo con node (sin npx: arranca más rápido y funciona igual en Windows y en CI)
const astroBin = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url))
const server = EXTERNAL
  ? null
  : spawn(process.execPath, [astroBin, 'preview', '--host', '127.0.0.1', '--port', String(PORT)], {
      stdio: 'ignore',
    })

async function waitForServer() {
  for (let i = 0; i < 180; i++) {
    try {
      if ((await fetch(BASE)).ok) return
    } catch {
      // todavía no arranca
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('astro preview no arrancó')
}

let failures = 0
const browser = await chromium.launch()
try {
  await waitForServer()
  for (const [name, options] of [
    ['móvil', { viewport: { width: 390, height: 844 }, isMobile: true }],
    ['escritorio', { viewport: { width: 1440, height: 900 } }],
  ]) {
    // reducedMotion: todo visible desde el inicio (sin animaciones que dejen opacidad a medias)
    const context = await browser.newContext({ ...options, reducedMotion: 'reduce', bypassCSP: true })
    const page = await context.newPage()
    const check = async (label) => {
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      if (violations.length === 0) {
        console.log(`ok  ${name} ${label}`)
        return
      }
      failures += violations.length
      console.log(`XX  ${name} ${label}`)
      for (const v of violations) {
        console.log(
          `     [${v.impact}] ${v.id}: ${v.help} → ${v.nodes
            .map((n) => n.target.join(' '))
            .slice(0, 3)
            .join(' , ')}`,
        )
      }
    }
    for (const path of PAGES) {
      await page.goto(BASE + path, { waitUntil: 'load' })
      await page.waitForTimeout(800)
      await check(path)
    }
    // Estados: diálogo de producto abierto y formulario de cotización con errores
    await page.goto(`${BASE}/es/menu`, { waitUntil: 'load' })
    const add = page.getByRole('button', { name: /^Agregar/ }).first()
    if ((await add.count()) > 0) {
      await add.click()
      await page.waitForTimeout(400)
      await check('/es/menu + diálogo')
    }
    await page.goto(`${BASE}/es/quote`, { waitUntil: 'load' })
    await page.getByRole('button', { name: 'Enviar solicitud' }).click()
    await page.waitForTimeout(300)
    await check('/es/quote + errores')
    await context.close()
  }
} finally {
  await browser.close()
  server?.kill()
}

if (failures > 0) {
  console.error(`\n${failures} problema(s) de accesibilidad`)
  process.exit(1)
}
console.log('\nSin problemas de accesibilidad (WCAG 2.1 A/AA)')
