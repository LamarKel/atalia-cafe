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

const quoteEn = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  date: 'Event date',
  type: 'Type of event',
  guests: 'Guests',
  products: 'Interested in',
  notes: 'Notes',
  events: {
    birthday: 'Birthday',
    wedding: 'Wedding',
    baby_shower: 'Baby shower',
    baptism: 'Baptism',
    graduation: 'Graduation',
    corporate: 'Corporate event',
    other: 'Other',
  },
  businessSubject: 'New quote request {code} · {guests} guests',
  businessTitle: 'New quote request {code}',
  businessIntro: 'A customer asked for a quote. Reply to this email to answer them directly.',
  businessFooter: 'Update its status in the admin panel: new → contacted → won / lost.',
  customerSubject: 'We received your quote request {code} · Atalia Café',
  customerTitle: 'We received your request!',
  customerIntro: 'Hi {name}, thanks for thinking of us. We will contact you soon about request {code}.',
  customerFooter: 'If you need to change something, just reply to this email.',
}

const quoteEs: typeof quoteEn = {
  name: 'Nombre',
  email: 'Correo',
  phone: 'Teléfono',
  date: 'Fecha del evento',
  type: 'Tipo de evento',
  guests: 'Invitados',
  products: 'Le interesa',
  notes: 'Notas',
  events: {
    birthday: 'Cumpleaños',
    wedding: 'Boda',
    baby_shower: 'Baby shower',
    baptism: 'Bautizo',
    graduation: 'Graduación',
    corporate: 'Evento de empresa',
    other: 'Otro',
  },
  businessSubject: 'Nueva cotización {code} · {guests} invitados',
  businessTitle: 'Nueva solicitud de cotización {code}',
  businessIntro: 'Un cliente pidió una cotización. Responde a este correo para escribirle directamente.',
  businessFooter: 'Actualiza su estado en el panel: nueva → contactado → ganada / perdida.',
  customerSubject: 'Recibimos tu solicitud de cotización {code} · Atalia Café',
  customerTitle: '¡Recibimos tu solicitud!',
  customerIntro:
    'Hola {name}, gracias por pensar en nosotros. Te contactamos pronto sobre la solicitud {code}.',
  customerFooter: 'Si necesitas cambiar algo, responde a este correo.',
}

export const quoteText = { en: quoteEn, es: quoteEs } as const

const cancelEn = {
  subject: 'Your Atalia Café order {code} was cancelled',
  title: 'We had to cancel your order',
  greeting: 'Hi {name},',
  body: 'We are sorry: we had to cancel order {code} for pickup on {when}.',
  refund:
    'We are refunding {amount} to your original payment method. Depending on your bank, it can take 5 to 10 business days to show.',
  noRefund: 'If you have any questions about your payment, just reply to this email.',
  messageLabel: 'Message from Atalia Café:',
  sorry: 'We apologize for the inconvenience and hope to see you soon.',
  footer: 'If you have questions, reply to this email.',
}

const cancelEs: typeof cancelEn = {
  subject: 'Tu pedido {code} de Atalia Café fue cancelado',
  title: 'Tuvimos que cancelar tu pedido',
  greeting: 'Hola {name},',
  body: 'Lo sentimos: tuvimos que cancelar el pedido {code} para recoger el {when}.',
  refund:
    'Te devolvemos {amount} al mismo método de pago. Según tu banco, puede tardar de 5 a 10 días hábiles en verse.',
  noRefund: 'Si tienes alguna duda sobre tu pago, responde a este correo.',
  messageLabel: 'Mensaje de Atalia Café:',
  sorry: 'Te pedimos disculpas por el inconveniente y esperamos verte pronto.',
  footer: 'Si tienes preguntas, responde a este correo.',
}

export const cancelText = { en: cancelEn, es: cancelEs } as const
