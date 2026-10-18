// Textos fijos de los correos (i18n). Las mismas claves en EN y ES; lo verifica el tipo.
const en = {
  subject: 'Your Atalia Café order {code} is confirmed',
  title: 'Your order is confirmed!',
  greeting: 'Hi {name}, we received your payment. Here are the details.',
  order: 'Order',
  pickup: 'Pickup',
  subtotal: 'Subtotal',
  discount: 'Discount',
  tax: 'Tax',
  paid: 'Paid',
  view: 'View my order',
}

const es: typeof en = {
  subject: 'Tu pedido {code} de Atalia Café está confirmado',
  title: '¡Tu pedido está confirmado!',
  greeting: 'Hola {name}, recibimos tu pago. Estos son los detalles.',
  order: 'Pedido',
  pickup: 'Recogida',
  subtotal: 'Subtotal',
  discount: 'Descuento',
  tax: 'Impuestos',
  paid: 'Pagado',
  view: 'Ver mi pedido',
}

export const emailText = { en, es } as const
