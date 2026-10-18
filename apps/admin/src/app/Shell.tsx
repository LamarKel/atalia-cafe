// Marco del panel: menú lateral en escritorio, cajón en el teléfono, y la sección actual (ruta en el hash,
// así el panel funciona como sitio estático y los enlaces se pueden compartir: #/pedidos).
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AdminKey } from '../i18n'
import type { Role } from './auth'
import { useI18n } from './i18n-context'

export type Route =
  'dashboard' | 'orders' | 'catalog' | 'catering' | 'business' | 'quotes' | 'promos' | 'team' | 'reports'

interface NavItem {
  route: Route
  label: AdminKey
  icon: string
  /** Roles que la ven; el resto ni la ve (la RLS igual lo impide). */
  roles: Role[]
}

const ALL: Role[] = ['owner', 'admin', 'staff']
export const NAV: NavItem[] = [
  { route: 'dashboard', label: 'nav.dashboard', icon: 'M3 11l9-8 9 8M5 10v10h14V10', roles: ALL },
  { route: 'orders', label: 'nav.orders', icon: 'M6 4h12l1 4H5l1-4ZM5 8h14v12H5zM9 12h6', roles: ALL },
  {
    route: 'catalog',
    label: 'nav.catalog',
    icon: 'M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v6H4zM13 14h7v6h-7z',
    roles: ['owner', 'admin'],
  },
  {
    route: 'catering',
    label: 'nav.catering',
    icon: 'M4 15h16M6 15a6 6 0 0 1 12 0M12 7V5M3 19h18',
    roles: ['owner', 'admin'],
  },
  { route: 'quotes', label: 'nav.quotes', icon: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6', roles: ALL },
  {
    route: 'business',
    label: 'nav.business',
    icon: 'M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    roles: ['owner', 'admin'],
  },
  { route: 'promos', label: 'nav.promos', icon: 'M4 12l8-8h8v8l-8 8zM15 9h.01', roles: ['owner'] },
  {
    route: 'reports',
    label: 'nav.reports',
    icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    roles: ['owner', 'admin'],
  },
  {
    route: 'team',
    label: 'nav.team',
    icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a5 5 0 0 0-4-5',
    roles: ['owner'],
  },
]

export function useRoute(role: Role): [Route, (r: Route) => void] {
  const read = (): Route => {
    const r = window.location.hash.replace(/^#\//, '') as Route
    const item = NAV.find((n) => n.route === r)
    return item !== undefined && item.roles.includes(role) ? r : 'dashboard'
  }
  const [route, setRoute] = useState<Route>(read)
  useEffect(() => {
    const onHash = () => setRoute(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  })
  return [route, (r) => (window.location.hash = `/${r}`)]
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

export function Shell(props: {
  role: Role
  email: string
  route: Route
  onNavigate: (r: Route) => void
  onSignOut: () => void
  children: ReactNode
}) {
  const { t, toggle } = useI18n()
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const menuButton = useRef<HTMLButtonElement>(null)
  const drawer = useRef<HTMLDivElement>(null)
  const main = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  // Al cambiar de sección, el foco va al título de la sección nueva (lectores de pantalla y teclado).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    main.current?.querySelector<HTMLElement>('h1')?.focus()
  }, [props.route])

  // Cajón: el foco entra al abrir y vuelve al botón al cerrar.
  useEffect(() => {
    if (open) drawer.current?.querySelector<HTMLElement>('a, button')?.focus()
    else if (!firstRender.current) menuButton.current?.focus()
  }, [open])
  const items = NAV.filter((n) => n.roles.includes(props.role))

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const nav = (
    <nav aria-label={t('nav.main')} className="flex h-full flex-col">
      <p className="px-5 pb-6 pt-6 font-heading text-2xl font-bold text-secondary">Atalia Café</p>
      <ul className="grid gap-1 px-3">
        {items.map((item) => {
          const current = item.route === props.route
          return (
            <li key={item.route}>
              <a
                href={`#/${item.route}`}
                aria-current={current ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${
                  current ? 'bg-secondary text-white' : 'text-dark hover:bg-dark/5'
                }`}
              >
                <Icon d={item.icon} />
                {t(item.label)}
              </a>
            </li>
          )
        })}
      </ul>
      <div className="mt-auto grid gap-1 border-t border-dark/10 px-3 py-4 text-sm">
        <p className="truncate px-3 text-muted" title={props.email}>
          {props.email}
        </p>
        <p className="px-3 text-xs font-semibold uppercase tracking-wide text-primary-ink">
          {t(`role.${props.role}`)}
        </p>
        <a
          href="/"
          target="_blank"
          rel="noopener"
          className="flex min-h-11 items-center rounded-xl px-3 hover:bg-dark/5"
        >
          {t('nav.view_site')}
        </a>
        <button
          type="button"
          onClick={toggle}
          className="flex min-h-11 items-center rounded-xl px-3 text-left hover:bg-dark/5"
        >
          {t('lang.switch')}
        </button>
        <button
          type="button"
          onClick={props.onSignOut}
          className="flex min-h-11 items-center rounded-xl px-3 text-left text-secondary hover:bg-dark/5"
        >
          {t('auth.signout')}
        </button>
      </div>
    </nav>
  )

  return (
    <div className="min-h-dvh bg-accent lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-secondary px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t('app.skip')}
      </a>

      <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r border-dark/5 bg-white lg:block">
        {nav}
      </aside>

      {/* Teléfono y tablet: barra superior + cajón */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-dark/5 bg-white/95 px-4 backdrop-blur lg:hidden">
        <span className="font-heading text-xl font-bold text-secondary">Atalia Café</span>
        <button
          ref={menuButton}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="admin-drawer"
          aria-label={t('nav.open')}
          className="inline-flex size-11 items-center justify-center rounded-full border border-dark/15"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.button
              type="button"
              aria-label={t('nav.close')}
              className="absolute inset-0 bg-dark/40"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              ref={drawer}
              id="admin-drawer"
              role="dialog"
              aria-modal="true"
              aria-label={t('nav.main')}
              className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-white shadow-xl"
              initial={reduceMotion === true ? false : { x: '-100%' }}
              animate={{ x: 0 }}
              exit={reduceMotion === true ? { opacity: 0 } : { x: '-100%' }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {nav}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main ref={main} id="main" className="min-w-0 px-4 pb-16 pt-6 md:px-8 md:pt-10 [&_h1]:outline-none">
        {props.children}
      </main>
    </div>
  )
}
