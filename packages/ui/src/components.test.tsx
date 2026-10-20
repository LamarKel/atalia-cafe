import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Button, ButtonLink } from './Button'
import { Card } from './Card'
import { Dialog } from './Dialog'
import { OptionGroup, Tag, ToggleChip, type Option } from './Chip'
import { QuantityStepper, Stepper } from './Stepper'
import { TOAST_DEFAULT_DURATION_MS, ToastProvider, useToast } from './Toast'

describe('Button', () => {
  it('es un botón real, type="button" por defecto, con altura táctil de 44 px', () => {
    render(<Button>Ver catering</Button>)
    const btn = screen.getByRole('button', { name: 'Ver catering' })
    expect(btn).toHaveAttribute('type', 'button')
    expect(btn.className).toContain('min-h-11')
  })

  it('loading bloquea el botón, lo anuncia y evita el doble clic (RNF-P01)', async () => {
    const onClick = vi.fn()
    render(
      <Button loading loadingLabel="Procesando…" onClick={onClick}>
        Pagar
      </Button>,
    )
    const btn = screen.getByRole('button', { name: /Pagar/ })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Procesando…')).toHaveClass('sr-only')
    await userEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('deshabilitado usa el beige del diseño', () => {
    render(<Button disabled>Agregar paquete de 10</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-disabled')
    // Sin el fondo café: si quedan las dos clases, gana la que Tailwind ponga después en el CSS.
    expect(screen.getByRole('button')).not.toHaveClass('bg-secondary')
  })

  it('ButtonLink es un enlace, no un botón', () => {
    render(<ButtonLink href="/catering">Ver catering</ButtonLink>)
    expect(screen.getByRole('link', { name: 'Ver catering' })).toHaveAttribute('href', '/catering')
  })
})

describe('Card', () => {
  it('renderiza el elemento pedido con el estilo base', () => {
    render(
      <Card as="article" data-testid="card">
        Hola
      </Card>,
    )
    const card = screen.getByTestId('card')
    expect(card.tagName).toBe('ARTICLE')
    expect(card).toHaveClass('rounded-2xl', 'bg-white', 'shadow-sm')
  })
})

describe('ToggleChip', () => {
  it('anuncia su estado con aria-pressed y cambia al hacer clic', async () => {
    function Demo() {
      const [on, setOn] = useState(false)
      return (
        <ToggleChip pressed={on} onPressedChange={setOn}>
          Extra shot
        </ToggleChip>
      )
    }
    render(<Demo />)
    const chip = screen.getByRole('button', { name: 'Extra shot' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('OptionGroup', () => {
  const options: Option<'5' | '10' | '15' | '20'>[] = [
    { value: '5', label: '5', caption: 'personas' },
    { value: '10', label: '10', caption: 'personas' },
    { value: '15', label: '15', caption: 'personas', disabled: true },
    { value: '20', label: '20', caption: 'personas' },
  ]

  function Demo({ initial = '10' as '5' | '10' | '15' | '20' | null }) {
    const [value, setValue] = useState(initial)
    return (
      <OptionGroup
        label="¿Para cuántas personas?"
        options={options}
        value={value}
        onChange={setValue}
        layout="tile"
      />
    )
  }

  it('es un radiogroup con nombre y una opción marcada', () => {
    render(<Demo />)
    const group = screen.getByRole('radiogroup', { name: '¿Para cuántas personas?' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^10/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /^5/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('solo la opción marcada entra en el orden de tabulación', () => {
    render(<Demo />)
    expect(screen.getByRole('radio', { name: /^10/ })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: /^5/ })).toHaveAttribute('tabindex', '-1')
  })

  it('las flechas cambian la selección y saltan las deshabilitadas', async () => {
    render(<Demo />)
    const ten = screen.getByRole('radio', { name: /^10/ })
    ten.focus()
    await userEvent.keyboard('{ArrowRight}')
    const twenty = screen.getByRole('radio', { name: /^20/ })
    expect(twenty).toHaveAttribute('aria-checked', 'true') // salta el 15 deshabilitado
    expect(twenty).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: /^5/ })).toHaveAttribute('aria-checked', 'true') // da la vuelta
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('radio', { name: /^20/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('sin selección, la primera opción habilitada recibe el foco', () => {
    render(<Demo initial={null} />)
    expect(screen.getByRole('radio', { name: /^5/ })).toHaveAttribute('tabindex', '0')
  })
})

describe('Tag', () => {
  it('muestra el texto', () => {
    render(<Tag>Bandeja</Tag>)
    expect(screen.getByText('Bandeja')).toBeInTheDocument()
  })
})

describe('Stepper (pasos del checkout)', () => {
  it('marca el paso actual con aria-current="step"', () => {
    render(<Stepper label="Pasos del pedido" steps={['Cuándo', 'Tus datos', 'Pago']} current={1} />)
    expect(screen.getByRole('navigation', { name: 'Pasos del pedido' })).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveAttribute('data-state', 'done')
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(items[2]).toHaveAttribute('data-state', 'upcoming')
    expect(screen.getByText('2 · Tus datos')).toBeInTheDocument()
  })
})

describe('QuantityStepper', () => {
  function Demo(props: { min?: number; max?: number; increaseDisabled?: boolean; initial?: number }) {
    const [value, setValue] = useState(props.initial ?? 0)
    return (
      <QuantityStepper
        label="Quipe de res"
        value={value}
        onChange={setValue}
        decreaseLabel="Quitar uno"
        increaseLabel="Agregar uno"
        {...(props.min !== undefined && { min: props.min })}
        {...(props.max !== undefined && { max: props.max })}
        {...(props.increaseDisabled !== undefined && { increaseDisabled: props.increaseDisabled })}
      />
    )
  }

  it('los botones tienen nombre propio, que incluye la pieza', () => {
    render(<Demo />)
    expect(screen.getByRole('button', { name: 'Agregar uno: Quipe de res' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quitar uno: Quipe de res' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Quipe de res' })).toBeInTheDocument()
  })

  it('suma, resta y respeta el mínimo y el máximo', async () => {
    render(<Demo max={2} />)
    const plus = screen.getByRole('button', { name: /Agregar uno/ })
    const minus = screen.getByRole('button', { name: /Quitar uno/ })
    const output = screen.getByRole('status')
    expect(minus).toBeDisabled()
    await userEvent.click(plus)
    await userEvent.click(plus)
    expect(output).toHaveTextContent('2')
    expect(plus).toBeDisabled()
    await userEvent.click(minus)
    expect(output).toHaveTextContent('1')
  })

  it('increaseDisabled bloquea solo el + (picadera completa)', () => {
    render(<Demo initial={3} increaseDisabled />)
    expect(screen.getByRole('button', { name: /Agregar uno/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Quitar uno/ })).toBeEnabled()
  })

  it('los botones miden 44 px', () => {
    render(<Demo />)
    for (const btn of screen.getAllByRole('button')) {
      expect(btn.className).toContain('size-11')
    }
  })
})

describe('Toast', () => {
  function Trigger({ tone }: { tone?: 'success' | 'error' | 'warning' }) {
    const toast = useToast()
    return (
      <button type="button" onClick={() => toast('Agregado al carrito', tone === undefined ? {} : { tone })}>
        Agregar
      </button>
    )
  }

  const renderWithProvider = (tone?: 'success' | 'error' | 'warning') =>
    render(
      <ToastProvider closeLabel="Cerrar" regionLabel="Notificaciones">
        <Trigger {...(tone !== undefined && { tone })} />
      </ToastProvider>,
    )

  it('un aviso de éxito se anuncia como status y se cierra solo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      renderWithProvider()
      await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))
      expect(screen.getByRole('status')).toHaveTextContent('Agregado al carrito')
      expect(screen.getByRole('region', { name: 'Notificaciones' })).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(TOAST_DEFAULT_DURATION_MS + 500)
      })
      await vi.waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    } finally {
      vi.useRealTimers()
    }
  })

  it('un error se anuncia como alert y no se cierra solo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      renderWithProvider('error')
      await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))
      act(() => {
        vi.advanceTimersByTime(TOAST_DEFAULT_DURATION_MS * 3)
      })
      expect(screen.getByRole('alert')).toHaveTextContent('Agregado al carrito')
    } finally {
      vi.useRealTimers()
    }
  })

  it('se puede cerrar con el botón', async () => {
    renderWithProvider('error')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('useToast fuera del proveedor avisa del error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/)
    spy.mockRestore()
  })
})

describe('Dialog', () => {
  // jsdom no implementa showModal/close de <dialog>
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }

  it('abre con nombre accesible y cierra con el botón y con Esc', async () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} title="Latte" closeLabel="Cerrar" footer={<span>Agregar</span>}>
        <p>Espresso y leche</p>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Latte' })
    expect(dialog).toHaveAttribute('open')
    expect(screen.getByText('Agregar')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('al cerrarse devuelve el foco a quien lo abrió (con open=false o desmontándolo)', async () => {
    function Harness({ unmount }: { unmount: boolean }) {
      const [open, setOpen] = useState(false)
      const dialog = (
        <Dialog open={open} onClose={() => setOpen(false)} title="Latte" closeLabel="Cerrar">
          <p>Espresso</p>
        </Dialog>
      )
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Agregar Latte
          </button>
          {unmount ? open && dialog : dialog}
        </>
      )
    }
    for (const unmount of [false, true]) {
      const { unmount: cleanup } = render(<Harness unmount={unmount} />)
      const trigger = screen.getByRole('button', { name: 'Agregar Latte' })
      trigger.focus()
      await userEvent.click(trigger)
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
      expect(document.activeElement).toBe(trigger)
      cleanup()
    }
  })

  it('cerrado no muestra el contenido', () => {
    render(
      <Dialog open={false} onClose={() => undefined} title="Latte" closeLabel="Cerrar">
        <p>Espresso y leche</p>
      </Dialog>,
    )
    expect(screen.queryByText('Espresso y leche')).toBeNull()
  })
})
