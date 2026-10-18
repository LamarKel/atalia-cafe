// Dónde recoge el cliente (tienda y punto: en la tienda, en el carro…). Se elige en el menú, como en la
// app anterior, y el checkout lo usa como valor inicial. Guardado en localStorage con try/catch.
export interface PickupChoice {
  storeId: string
  locationId: string | null
}

const KEY = 'atalia.pickup.v1'
const EVENT = 'atalia:pickup'

export function getPickup(): PickupChoice | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PickupChoice | null
    return parsed !== null && typeof parsed.storeId === 'string' ? parsed : null
  } catch {
    return null
  }
}

export function setPickup(choice: PickupChoice): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(choice))
  } catch {
    // Sin almacenamiento: la elección dura solo esta visita.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: choice }))
}

export function onPickupChange(listener: (choice: PickupChoice | null) => void): () => void {
  const local = () => listener(getPickup())
  window.addEventListener(EVENT, local)
  return () => window.removeEventListener(EVENT, local)
}
