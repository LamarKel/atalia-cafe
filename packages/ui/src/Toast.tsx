// Avisos breves ("Agregado al carrito"). Mismo lugar y forma que la referencia (common/Toast.jsx:
// abajo a la derecha, rounded-xl, sombra, se cierran solos), con colores que cumplen AA, botón de cerrar
// y animación con Motion que respeta prefers-reduced-motion.
// En la referencia el <Toast /> nunca se montaba (docs/REFERENCE.md §1): aquí el proveedor es obligatorio.
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from './cx'

export type ToastTone = 'success' | 'error' | 'warning'

export interface ToastAction {
  /** Texto del botón ("Deshacer"). */
  label: string
  onClick: () => void
}

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
  action: ToastAction | null
}

export interface ToastOptions {
  tone?: ToastTone
  /** Milisegundos antes de cerrarse solo. Los errores se quedan hasta que se cierran. */
  durationMs?: number
  /** Un botón dentro del aviso, por ejemplo "Deshacer" al quitar algo. Al usarlo, el aviso se cierra. */
  action?: ToastAction
}

type ShowToast = (message: string, options?: ToastOptions) => void

const ToastContext = createContext<ShowToast | null>(null)

const toneClasses: Record<ToastTone, string> = {
  success: 'bg-toast-success',
  error: 'bg-toast-error',
  warning: 'bg-toast-warning',
}

export interface ToastProviderProps {
  /** Texto del botón de cerrar, desde i18n ("Cerrar" / "Close"). */
  closeLabel: string
  /** Nombre de la región para lectores de pantalla ("Notificaciones"). */
  regionLabel: string
  children: ReactNode
}

export const TOAST_DEFAULT_DURATION_MS = 4000

export function ToastProvider({ closeLabel, regionLabel, children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const reduceMotion = useReducedMotion()

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback<ShowToast>(
    (message, options = {}) => {
      const tone = options.tone ?? 'success'
      const id = nextId.current++
      setToasts((prev) => [...prev, { id, message, tone, action: options.action ?? null }])
      if (tone !== 'error') {
        setTimeout(() => dismiss(id), options.durationMs ?? TOAST_DEFAULT_DURATION_MS)
      }
    },
    [dismiss],
  )

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        aria-label={regionLabel}
        className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-end gap-2 md:inset-x-auto md:right-6 md:bottom-6"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.25 }}
              className={cx(
                'pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl px-5 py-3 text-sm text-white shadow-lg',
                toneClasses[toast.tone],
              )}
            >
              <span className="flex-1">{toast.message}</span>
              {toast.action !== null && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick()
                    dismiss(toast.id)
                  }}
                  className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold underline underline-offset-2 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label={closeLabel}
                className="-mr-2 inline-flex size-11 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
              >
                <span aria-hidden="true">×</span>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </section>
    </ToastContext.Provider>
  )
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext)
  if (show === null) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>')
  }
  return show
}
