// Animaciones del inicio con Motion (API de JS, sin React: la página es .astro). Solo transform y opacity
// (CLAUDE.md); con "reducir movimiento" no se anima nada y todo se ve de una vez.
import { animate, inView, scroll, stagger } from 'motion'
import { openStatus, parseStat, type HoursRow } from '../lib/home'

const root = document.documentElement
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const EASE = [0.22, 1, 0.36, 1] as const

/** Pastilla "Abierto hoy · 7:00 AM – 9:00 PM", calculada con la hora de la tienda. */
function openToday(): void {
  const el = document.querySelector<HTMLElement>('[data-open-today]')
  if (el === null) return
  try {
    const hours = JSON.parse(el.dataset.hours ?? '[]') as HoursRow[]
    const labels = JSON.parse(el.dataset.labels ?? '{}') as Record<string, string>
    const status = openStatus(hours, new Date(), el.dataset.tz ?? 'America/New_York')
    const fill = (s: string | undefined) =>
      (s ?? '')
        .replace('{from}', status.kind === 'closed_today' ? '' : status.from)
        .replace('{to}', status.kind === 'closed_today' ? '' : status.to)
    const text = el.querySelector('[data-open-text]')
    if (text !== null) text.textContent = fill(labels[status.kind])
    el.dataset.state = status.kind === 'closed_today' ? 'closed' : status.kind
    el.hidden = false
  } catch {
    // Sin horario válido: la pastilla queda oculta.
  }
}

/** Cifras del hero: cuentan desde 0 cuando aparecen. */
function countUp(el: HTMLElement): void {
  const stat = parseStat(el.textContent ?? '')
  if (stat === null) return
  const { value, decimals, prefix, suffix } = stat
  animate(0, value, {
    duration: 1.4,
    ease: EASE,
    onUpdate: (v) => {
      el.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`
    },
  })
}

openToday()

if (!reduce) {
  root.dataset.motion = 'on'

  // Hero: entrada en cascada (pastilla, título, texto, botones, cifras) y la foto desde la derecha.
  animate(
    '[data-hero-item]',
    { opacity: [0, 1], y: [28, 0] },
    { duration: 0.8, delay: stagger(0.09), ease: EASE },
  )
  animate('[data-hero-media]', { opacity: [0, 1], x: [40, 0] }, { duration: 1, delay: 0.2, ease: EASE })
  animate(
    '[data-hero-card]',
    { opacity: [0, 1], y: [24, 0], scale: [0.96, 1] },
    { duration: 0.8, delay: stagger(0.15, { startDelay: 0.6 }), ease: EASE },
  )

  // Tarjetas flotantes: un vaivén suave y continuo.
  document.querySelectorAll<HTMLElement>('[data-float]').forEach((el, i) => {
    animate(
      el,
      { y: [0, -10, 0] },
      { duration: 6 + i, repeat: Infinity, ease: 'easeInOut', delay: 1.4 + i * 0.8 },
    )
  })

  // Barra de "Tu pedido": avanza y vuelve, como un pedido en preparación.
  document.querySelectorAll<HTMLElement>('[data-progress]').forEach((el) => {
    animate(
      el,
      { scaleX: [0.25, 0.8] },
      { duration: 2.6, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' },
    )
  })

  // La foto del hero se mueve un poco más lento que la página (parallax).
  const heroImage = document.querySelector<HTMLElement>('[data-parallax]')
  const hero = document.querySelector<HTMLElement>('[data-hero]')
  if (heroImage !== null && hero !== null) {
    scroll(animate(heroImage, { y: [0, 80] }, { ease: 'linear' }), {
      target: hero,
      offset: ['start start', 'end start'],
    })
  }

  // Secciones: aparecen al entrar en pantalla; sus elementos marcados, en cascada.
  inView(
    '[data-reveal]',
    (section) => {
      const items = section.querySelectorAll('[data-reveal-item]')
      if (items.length > 0) {
        animate(section, { opacity: [0, 1] }, { duration: 0.5 })
        animate(items, { opacity: [0, 1], y: [36, 0] }, { duration: 0.8, delay: stagger(0.08), ease: EASE })
      } else {
        animate(section, { opacity: [0, 1], y: [36, 0] }, { duration: 0.8, ease: EASE })
      }
    },
    { amount: 0.15 },
  )

  // Cifras: cuentan cuando se ven.
  inView('[data-count]', (el) => {
    countUp(el as HTMLElement)
  })
}
