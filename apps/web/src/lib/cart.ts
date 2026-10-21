// Carrito en el navegador (localStorage con try/catch, PLAN.md Fase 2).
// Los precios guardados aquí son solo para mostrar: el Worker recalcula todo al pagar (RNF-S05, A8).
import { addCents, cents, multiplyCents, type Cents } from '@atalia/shared/money'
import type { ProductType } from './catalog-format'

export interface CartComponent {
  optionId: string
  label: string
  qty: number
}

export interface CartExtra {
  id: string
  name: string
  /** Solo para mostrar; el Worker cobra el precio de la BD. */
  priceCents: number
}

export interface CartItem {
  /** Id de la línea (no del producto): dos picaderas distintas son dos líneas. */
  lineId: string
  productId: string
  slug: string
  type: ProductType
  name: string
  sizeId: string | null
  sizeLabel: string | null
  serves: number | null
  units: number | null
  /** Precio unitario mostrado; null si el producto todavía no tiene precio. */
  unitPriceCents: number | null
  quantity: number
  notes: string
  minLeadHours: number
  components: CartComponent[]
  /** Extras del menú (leche de avena, shot extra…). */
  extras: CartExtra[]
}

const KEY = 'atalia.cart.v1'
const EVENT = 'atalia:cart'

function read(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Carritos guardados antes de que existieran los extras
    return (parsed as Array<CartItem & { extras?: CartExtra[] }>).map((i) => ({
      ...i,
      extras: Array.isArray(i.extras) ? i.extras : [],
    }))
  } catch {
    return []
  }
}

function write(items: CartItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // Sin almacenamiento (modo privado, bloqueado): el carrito vive solo en esta pestaña.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: items }))
}

export function getCart(): CartItem[] {
  return read()
}

/** Agrega una línea. Si ya existe la misma opción con las mismas notas y piezas, suma la cantidad. */
export function addToCart(item: Omit<CartItem, 'lineId'>): CartItem[] {
  const items = read()
  const same = items.find(
    (i) =>
      i.productId === item.productId &&
      i.sizeId === item.sizeId &&
      i.notes === item.notes &&
      JSON.stringify(i.components) === JSON.stringify(item.components) &&
      JSON.stringify(i.extras.map((e) => e.id).sort()) ===
        JSON.stringify(item.extras.map((e) => e.id).sort()),
  )
  if (same) {
    same.quantity += item.quantity
  } else {
    items.push({ ...item, lineId: crypto.randomUUID() })
  }
  write(items)
  return items
}

export function updateQuantity(lineId: string, quantity: number): CartItem[] {
  const items = read()
    .map((i) => (i.lineId === lineId ? { ...i, quantity } : i))
    .filter((i) => i.quantity > 0)
  write(items)
  return items
}

export function removeLine(lineId: string): CartItem[] {
  const items = read().filter((i) => i.lineId !== lineId)
  write(items)
  return items
}

/** Vuelve a poner una línea en su lugar ("Deshacer" al quitarla). Si ya está, no la duplica. */
export function insertLine(items: readonly CartItem[], item: CartItem, index: number): CartItem[] {
  if (items.some((i) => i.lineId === item.lineId)) return [...items]
  const at = Math.min(Math.max(index, 0), items.length)
  return [...items.slice(0, at), item, ...items.slice(at)]
}

export function restoreLine(item: CartItem, index: number): CartItem[] {
  const items = insertLine(read(), item, index)
  write(items)
  return items
}

export function clearCart(): void {
  write([])
}

export function cartCount(items: readonly CartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0)
}

/** Se suscribe a cambios del carrito (en esta pestaña y en otras). Devuelve la función para cancelar. */
export function onCartChange(listener: (items: CartItem[]) => void): () => void {
  const local = () => listener(read())
  const storage = (e: StorageEvent) => {
    if (e.key === KEY) listener(read())
  }
  window.addEventListener(EVENT, local)
  window.addEventListener('storage', storage)
  return () => {
    window.removeEventListener(EVENT, local)
    window.removeEventListener('storage', storage)
  }
}

/** Subtotal mostrado en el carrito. Si alguna línea aún no tiene precio, se avisa (el Worker calcula el real). */
export function cartSubtotal(items: readonly CartItem[]): { cents: Cents; hasUnpriced: boolean } {
  const priced = items.filter((i) => i.unitPriceCents !== null)
  return {
    cents: addCents(...priced.map((i) => multiplyCents(cents(i.unitPriceCents ?? 0), i.quantity))),
    hasUnpriced: priced.length < items.length,
  }
}
