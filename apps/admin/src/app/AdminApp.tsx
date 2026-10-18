// Raíz del panel: guía por el acceso (sesión → 2FA → rol) y muestra la sección según la ruta.
import { ToastProvider } from '@atalia/ui'
import { useAdminAuth, type Role } from './auth'
import { I18nProvider, useI18n } from './i18n-context'
import { Dashboard } from './screens/Dashboard'
import { Orders } from './screens/Orders'
import {
  EnrollMfaScreen,
  LoginScreen,
  NewPasswordScreen,
  NotAdminScreen,
  VerifyMfaScreen,
} from './screens/AuthScreens'
import { Shell, useRoute, type Route } from './Shell'

export default function AdminApp() {
  return (
    <I18nProvider>
      <Root />
    </I18nProvider>
  )
}

function Root() {
  const { t } = useI18n()
  const { state, refresh, finishRecovery, signOut } = useAdminAuth()

  switch (state.kind) {
    case 'loading':
      return (
        <p role="status" className="flex min-h-dvh items-center justify-center bg-accent text-muted">
          {t('app.loading')}
        </p>
      )
    case 'signed_out':
      return <LoginScreen />
    case 'new_password':
      return <NewPasswordScreen onDone={() => void finishRecovery()} />
    case 'enroll_mfa':
      return <EnrollMfaScreen onDone={() => void refresh()} />
    case 'verify_mfa':
      return <VerifyMfaScreen factorId={state.factorId} onDone={() => void refresh()} />
    case 'not_admin':
      return <NotAdminScreen onSignOut={() => void signOut()} />
    case 'ready':
      return (
        <ToastProvider closeLabel={t('nav.close')} regionLabel={t('app.notifications')}>
          <Panel role={state.role} email={state.email} onSignOut={() => void signOut()} />
        </ToastProvider>
      )
  }
}

/** Fase del plan en la que llega cada sección (las que todavía no están hechas). */
const PHASE: Partial<Record<Route, number>> = {
  catalog: 3,
  catering: 3,
  business: 4,
  quotes: 5,
  promos: 5,
  team: 5,
  reports: 5,
}

function Panel({ role, email, onSignOut }: { role: Role; email: string; onSignOut: () => void }) {
  const { t } = useI18n()
  const [route, navigate] = useRoute(role)
  return (
    <Shell role={role} email={email} route={route} onNavigate={navigate} onSignOut={onSignOut}>
      {route === 'dashboard' ? (
        <Dashboard email={email} />
      ) : route === 'orders' ? (
        <Orders />
      ) : (
        <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 text-center">
          <h1 tabIndex={-1} className="font-heading text-3xl font-bold">
            {t('soon.title')}
          </h1>
          <p className="mt-2 text-muted">{t('soon.text', { n: PHASE[route] ?? 2 })}</p>
        </div>
      )}
    </Shell>
  )
}
