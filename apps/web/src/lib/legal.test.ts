import { describe, expect, it } from 'vitest'
import { fillVars, menuRule, parseLegal, refundRows } from './legal'

describe('textos legales', () => {
  it('convierte títulos, párrafos y listas sin aceptar HTML', () => {
    const blocks = parseLegal(
      'Intro uno\nsigue igual.\n\n## Pedidos\n- Uno\n- Dos <script>\nDespués de la lista\n\n{refund_table}',
    )
    expect(blocks).toEqual([
      { kind: 'p', text: 'Intro uno sigue igual.' },
      { kind: 'h2', text: 'Pedidos' },
      { kind: 'ul', items: ['Uno', 'Dos <script>'] },
      { kind: 'p', text: 'Después de la lista' },
      { kind: 'refund_table' },
    ])
  })

  it('reemplaza los datos del negocio y marca los que faltan', () => {
    expect(
      fillVars(
        '{business_name} · {email} · {otra}',
        { business_name: 'Atalia Café', email: null },
        '(dato pendiente)',
      ),
    ).toBe('Atalia Café · (dato pendiente) · {otra}')
  })

  it('la tabla de reembolsos sigue los mismos cortes que el sistema', () => {
    const rows = refundRows(
      [
        { hoursBefore: 0, refundPpm: 0 },
        { hoursBefore: 48, refundPpm: 1_000_000 },
        { hoursBefore: 24, refundPpm: 500_000 },
      ],
      'es',
    )
    expect(rows).toEqual([
      { when: '48 h o más antes', refund: '100%' },
      { when: 'Entre 24 y 48 h antes', refund: '50%' },
      { when: 'Menos de 24 h antes', refund: '0%' },
    ])
    expect(refundRows([{ hoursBefore: 0, refundPpm: 1_000_000 }], 'en')).toEqual([
      { when: 'Any time', refund: '100%' },
    ])
  })

  it('la frase del menú depende de la regla', () => {
    expect(menuRule('confirmed', 'es')).toContain('mientras esté confirmado')
    expect(menuRule('preparing', 'en')).toContain('until it is being prepared')
  })
})
