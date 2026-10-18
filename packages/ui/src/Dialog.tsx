// Ventana modal (modal del producto en el menú, selector de recogida). Usa <dialog> nativo: mantiene el foco
// dentro, cierra con Esc y bloquea el fondo. Entrada con Motion (solo transform/opacity) y sin animación si el
// usuario pidió menos movimiento. En el teléfono sale desde abajo como una hoja; en escritorio, centrada.
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cx } from './cx'

export interface DialogProps {
  open: boolean
  onClose: () => void
  /** Título visible; también es el nombre accesible del diálogo. */
  title: string
  /** Texto del botón de cerrar para lectores de pantalla ("Cerrar" / "Close"). */
  closeLabel: string
  /** Contenido arriba del título, por ejemplo la foto del producto. */
  media?: ReactNode
  /** Barra fija abajo, por ejemplo cantidad + "Agregar · $5.25". */
  footer?: ReactNode
  children: ReactNode
  size?: 'md' | 'lg'
}

export function Dialog({
  open,
  onClose,
  title,
  closeLabel,
  media,
  footer,
  children,
  size = 'md',
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        // Clic en el fondo (fuera del panel) cierra
        if (e.target === ref.current) onClose()
      }}
      className={cx(
        'm-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-transparent p-0 backdrop:bg-dark/50 sm:m-auto sm:rounded-3xl',
        size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
      )}
    >
      {open && (
        <motion.div
          initial={reduceMotion === true ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex max-h-[92dvh] flex-col bg-white"
        >
          <div className="relative min-h-0 flex-1 overflow-y-auto">
            {media}
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full bg-white/90 text-dark shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
            <div className="p-5 md:p-6">
              <h2 id={titleId} className="pr-12 font-heading text-2xl font-bold text-dark md:text-3xl">
                {title}
              </h2>
              {children}
            </div>
          </div>
          {footer !== undefined && (
            <div className="border-t border-dark/10 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
              {footer}
            </div>
          )}
        </motion.div>
      )}
    </dialog>
  )
}
