// ⚠️ MENÚ DE PRUEBA para desarrollo (2026-10-18): productos, precios, tamaños, extras y nutrición FALSOS.
// No son de la clienta: se reemplazan desde el admin antes de publicar (PLAN.md §13).
//
// Uso:
//   node db/seed/dev-menu.mjs sql            → escribe db/seed/staging-dev-menu.sql
//   node db/seed/dev-menu.mjs apply <.dev.vars> <imgs.json>  → lo carga en staging por la API (service_role)
import { readFileSync, writeFileSync } from 'node:fs'

const CAT = {
  trending: '3353baa5-aede-4081-8a4c-796aa2182d68',
  protein: '9cf070ae-499c-4d16-8578-0ed627391d70',
  hotCoffee: '41d2e519-e5f3-4940-91ef-4afe27ad92c9',
  coldCoffee: '7c4a8fa9-a12b-4ca1-ae19-2de5625fc65a',
  matcha: '0ee48e03-bc27-4968-9522-7c0e254af210',
  hotTea: '48dfc55e-aff6-429a-bf6a-2d54a72b3e44',
  coldTea: 'a961d28d-9e1a-46e6-b01c-fe93353e3ee2',
  refreshers: 'b7249f6b-705d-4228-a810-a5357b0bb2a0',
  frappe: '4a584897-cdb0-456a-8bba-af3dc7d9561e',
  chocolate: 'aa86104e-d008-41f8-be10-5fe834089aa8',
  bottled: '1def5429-f3c3-40c2-8d65-71bc8e895ac1',
  bakery: 'b636bec6-4b77-4b65-b486-8e76114be9b0',
  sandwiches: 'f485dbb5-e8ef-4839-ac0b-5a6ffcc5c26a',
  desserts: '114269aa-c13f-4dcd-8a91-d4fcea799e65',
  snacks: '2ed05e69-2aec-4127-b8fb-b83d52727754',
}

// [img, categoría, slug, en, es, descripción en, descripción es, precio (centavos), opciones]
// opciones: s = tamaños de bebida, x = extras de café, n = nutrición, f = destacado, out = agotado
const P = [
  ['dulce_latte', 'trending', 'dulce-de-leche-latte', 'Dulce de leche latte', 'Latte de dulce de leche', 'Espresso, steamed milk and dulce de leche.', 'Espresso, leche vaporizada y dulce de leche.', 550, 'sxnf'],
  ['protein_shake', 'protein', 'vanilla-protein-shake', 'Vanilla protein shake', 'Batido de proteína de vainilla', 'Whey protein, banana and almond milk.', 'Proteína, guineo y leche de almendra.', 799, 'n'],
  ['smoothie', 'protein', 'tropical-smoothie', 'Tropical smoothie', 'Batido tropical', 'Mango, pineapple and passion fruit.', 'Mango, piña y chinola.', 650, 's'],
  ['espresso', 'hotCoffee', 'espresso', 'Espresso', 'Espresso', 'A double shot of our house blend.', 'Doble shot de nuestra mezcla de la casa.', 300, 'x'],
  ['cappuccino', 'hotCoffee', 'cappuccino', 'Cappuccino', 'Capuchino', 'Espresso with thick milk foam.', 'Espresso con espuma de leche.', 450, 'sx'],
  ['latte', 'hotCoffee', 'latte', 'Latte', 'Latte', 'Espresso and silky steamed milk.', 'Espresso y leche vaporizada.', 475, 'sxn'],
  ['cafe_con_leche', 'hotCoffee', 'cafe-con-leche', 'Café con leche', 'Café con leche', 'Dominican-style coffee with hot milk.', 'Café al estilo dominicano con leche caliente.', 375, 'sxf'],
  ['iced_latte', 'coldCoffee', 'iced-latte', 'Iced latte', 'Latte frío', 'Espresso and cold milk over ice.', 'Espresso y leche fría con hielo.', 525, 'sx'],
  ['cold_brew', 'coldCoffee', 'cold-brew', 'Cold brew', 'Cold brew', 'Coffee steeped cold for 18 hours.', 'Café infusionado en frío por 18 horas.', 450, 'sx'],
  ['matcha_latte', 'matcha', 'matcha-latte', 'Matcha latte', 'Matcha latte', 'Ceremonial matcha with milk.', 'Matcha ceremonial con leche.', 575, 'sxn'],
  ['chai', 'hotTea', 'chai-latte', 'Chai latte', 'Chai latte', 'Spiced black tea with steamed milk.', 'Té negro con especias y leche.', 450, 'sx'],
  ['iced_tea', 'coldTea', 'peach-iced-tea', 'Peach iced tea', 'Té helado de durazno', 'Black tea, peach and lemon.', 'Té negro, durazno y limón.', 375, 's'],
  ['lemonade', 'refreshers', 'strawberry-lemonade', 'Strawberry lemonade', 'Limonada de fresa', 'Fresh lemons and strawberries.', 'Limones frescos y fresas.', 450, 's'],
  ['frappe', 'frappe', 'caramel-frappe', 'Caramel frappe', 'Frappé de caramelo', 'Blended coffee, caramel and whipped cream.', 'Café licuado, caramelo y crema batida.', 625, 'sxf'],
  ['hot_chocolate', 'chocolate', 'hot-chocolate', 'Hot chocolate', 'Chocolate caliente', 'Dark chocolate and steamed milk.', 'Chocolate oscuro y leche vaporizada.', 425, 's'],
  ['water', 'bottled', 'water', 'Bottled water', 'Agua', '16.9 oz.', '16.9 oz.', 150, ''],
  ['orange_juice', 'bottled', 'orange-juice', 'Orange juice', 'Jugo de naranja', 'Freshly squeezed.', 'Recién exprimido.', 350, 'out'],
  ['croissant', 'bakery', 'croissant', 'Butter croissant', 'Croissant de mantequilla', 'Flaky and baked every morning.', 'Hojaldrado y horneado cada mañana.', 325, 'n'],
  ['muffin', 'bakery', 'vanilla-muffin', 'Vanilla muffin', 'Muffin de vainilla', 'Soft and moist.', 'Suave y húmedo.', 350, ''],
  ['pan_queso', 'bakery', 'cheese-bread', 'Cheese bread', 'Pan de queso', 'Six warm cheese bread rolls.', 'Seis panecitos de queso calientes.', 450, 'f'],
  ['turkey_sandwich', 'sandwiches', 'ham-cheese-sandwich', 'Ham and cheese sandwich', 'Sándwich de jamón y queso', 'Ham, cheese, lettuce and tomato.', 'Jamón, queso, lechuga y tomate.', 895, 'n'],
  ['cuban_sandwich', 'sandwiches', 'cuban-sandwich', 'Cuban sandwich', 'Sándwich cubano', 'Pork, ham, Swiss cheese, pickles and mustard.', 'Cerdo, jamón, queso suizo, pepinillos y mostaza.', 1095, 'f'],
  ['bizcocho', 'desserts', 'dominican-cake', 'Dominican cake slice', 'Bizcocho dominicano', 'With pineapple filling and meringue.', 'Relleno de piña y suspiro.', 495, 'f'],
  ['flan', 'desserts', 'flan', 'Flan', 'Flan', 'Classic caramel custard.', 'Flan clásico con caramelo.', 450, ''],
  ['cheesecake', 'desserts', 'cheesecake', 'Berry cheesecake', 'Cheesecake de frutos rojos', 'Creamy cheesecake with berries.', 'Cheesecake cremoso con frutos rojos.', 525, ''],
  ['cookie', 'snacks', 'chocolate-chip-cookie', 'Chocolate chip cookie', 'Galleta de chispas', 'Baked fresh daily.', 'Horneada cada día.', 250, ''],
  ['empanada', 'snacks', 'chicken-empanada', 'Chicken empanada', 'Empanada de pollo', 'Crispy and filled with seasoned chicken.', 'Crujiente y rellena de pollo guisado.', 300, ''],
]

const SIZES = [
  ['Small · 12 oz', 'Pequeño · 12 oz', 0],
  ['Medium · 16 oz', 'Mediano · 16 oz', 50],
  ['Large · 20 oz', 'Grande · 20 oz', 100],
]
const EXTRAS = [
  ['Oat milk', 'Leche de avena', 75],
  ['Almond milk', 'Leche de almendra', 75],
  ['Extra shot', 'Shot extra', 100],
  ['Vanilla syrup', 'Sirope de vainilla', 60],
  ['Whipped cream', 'Crema batida', 50],
]
const NUTRITION = [
  ['Calories', 'Calorías', '210'],
  ['Sugar', 'Azúcar', '18 g'],
  ['Caffeine', 'Cafeína', '150 mg'],
]

const hex = (n, w = 12) => n.toString(16).padStart(w, '0')
const id = (prefix, n) => `${prefix}-0000-4000-8000-${hex(n)}`

function build(imgs) {
  const products = [], sizes = [], extras = [], nutrition = [], images = []
  P.forEach(([img, cat, slug, en, es, dEn, dEs, price, opts], i) => {
    const pid = id('a8e10000', i + 1)
    products.push({
      id: pid, category_id: CAT[cat], type: 'menu', slug: `menu-${slug}`, name_en: en, name_es: es,
      short_description_en: dEn, short_description_es: dEs, description_en: dEn, description_es: dEs,
      price_cents: price, min_lead_hours: 0, featured: opts.includes('f'),
      stock_enabled: opts.includes('out'), in_stock: !opts.includes('out'), stock_quantity: opts.includes('out') ? 0 : null,
      sort_order: i + 1, active: true,
    })
    if (opts.includes('s')) SIZES.forEach(([sEn, sEs, mod], j) =>
      sizes.push({ id: id('a8e20000', (i + 1) * 10 + j), product_id: pid, name_en: sEn, name_es: sEs, price_modifier_cents: mod, sort_order: j + 1, active: true }))
    if (opts.includes('x')) EXTRAS.forEach(([xEn, xEs, p], j) =>
      extras.push({ id: id('a8e30000', (i + 1) * 10 + j), product_id: pid, name_en: xEn, name_es: xEs, price_cents: p, sort_order: j + 1, active: true }))
    if (opts.includes('n')) NUTRITION.forEach(([nEn, nEs, v], j) =>
      nutrition.push({ id: id('a8e40000', (i + 1) * 10 + j), product_id: pid, label_en: nEn, label_es: nEs, value: v, sort_order: j + 1 }))
    if (imgs[img]) images.push({ id: id('a8e50000', i + 1), product_id: pid, image_url: imgs[img], alt_en: en, alt_es: es, sort_order: 1, is_primary: true })
  })
  // Quitar el producto [QA] del menú visible ahora que hay menú de prueba (no se borra: se desactiva)
  return { products, sizes, extras, nutrition, images }
}

const lit = (v) => (v === null ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
function upsertSql(table, rows) {
  if (rows.length === 0) return ''
  const cols = Object.keys(rows[0])
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')
  return `insert into public.${table} (${cols.join(', ')}) values\n${rows.map((r) => `  (${cols.map((c) => lit(r[c])).join(', ')})`).join(',\n')}\non conflict (id) do update set ${updates};\n\n`
}

const [mode, varsPath, imgsPath] = process.argv.slice(2)
const imgs = imgsPath ? JSON.parse(readFileSync(imgsPath, 'utf8')) : {}
const BASE_IMG = 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/menu/'
const data = build(Object.keys(imgs).length ? imgs : Object.fromEntries(P.map(([img]) => [img, `${BASE_IMG}${img}.webp`])))

if (mode === 'sql') {
  const sql = [
    '-- ⚠️ MENÚ DE PRUEBA (generado por db/seed/dev-menu.mjs). Datos FALSOS solo para desarrollo.\n',
    'begin;\n\n',
    upsertSql('products', data.products),
    upsertSql('product_sizes', data.sizes),
    upsertSql('product_extras', data.extras),
    upsertSql('product_nutritional_info', data.nutrition),
    upsertSql('product_images', data.images),
    "-- El producto [QA] de las pruebas de pago queda inactivo (no se borra)\nupdate public.products set active = false where id = '0a000000-0000-4000-8000-0000000000aa';\n\n",
    'commit;\n',
  ].join('')
  writeFileSync(new URL('./staging-dev-menu.sql', import.meta.url), sql)
  console.log('SQL escrito:', Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])))
} else if (mode === 'apply') {
  const vars = Object.fromEntries(readFileSync(varsPath, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  const H = { apikey: vars.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${vars.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }
  for (const [table, rows] of [['products', data.products], ['product_sizes', data.sizes], ['product_extras', data.extras], ['product_nutritional_info', data.nutrition], ['product_images', data.images]]) {
    const res = await fetch(`${vars.SUPABASE_URL}/rest/v1/${table}?on_conflict=id`, { method: 'POST', headers: H, body: JSON.stringify(rows) })
    console.log(table, rows.length, res.status, res.ok ? '' : (await res.text()).slice(0, 300))
  }
  const qa = await fetch(`${vars.SUPABASE_URL}/rest/v1/products?id=eq.0a000000-0000-4000-8000-0000000000aa`, { method: 'PATCH', headers: H, body: JSON.stringify({ active: false }) })
  console.log('QA inactivo', qa.status)
}
