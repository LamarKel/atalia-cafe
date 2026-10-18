// Raíz del panel: guía por el acceso (sesión → 2FA → rol) y muestra la sección según la ruta.
import { ToastProvider } from '@atalia/ui'
import { useAdminAuth, type Role } from './auth'
import { I18nProvider, useI18n } from './i18n-context'
import { Dashboard } from './screens/Dashboard'
import { Business } from './screens/Business'
import { Catalog } from './screens/Catalog'
import { Orders } from './screens/Orders'
import { Promos } from './screens/Promos'
import { Quotes } from './screens/Quotes'
import { Reports } from './screens/Reports'
import { Team } from './screens/Team'
import {
  EnrollMfaScreen,
  LoginScreen,
  NewPasswordScreen,
  NotAdminScreen,
  VerifyMfaScreen,
} from './screens/AuthScreens'
import { Shell, useRoute } from './Shell'

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

function Panel({ role, email, onSignOut }: { role: Role; email: string; onSignOut: () => void }) {
  const [route, navigate] = useRoute(role)
  return (
    <Shell role={role} email={email} route={route} onNavigate={navigate} onSignOut={onSignOut}>
      {route === 'dashboard' ? (
        <Dashboard email={email} />
      ) : route === 'orders' ? (
        <Orders />
      ) : route === 'catalog' ? (
        <Catalog section="menu" />
      ) : route === 'catering' ? (
        <Catalog section="catering" />
      ) : route === 'business' ? (
        <Business role={role} />
      ) : route === 'quotes' ? (
        <Quotes role={role} />
      ) : route === 'promos' ? (
        <Promos />
      ) : route === 'reports' ? (
        <Reports />
      ) : (
        <Team selfEmail={email} />
      )}
    </Shell>
  )
}
