-- Contacto: foto debajo de las formas de contactar (pantallas grandes), para que la columna de la izquierda no
-- quede vacía junto al formulario. Editable en el panel → Negocio → Textos (contact.image); vacía = sin foto.
-- Es una foto del inicio hasta que la clienta suba la suya.

begin;

insert into public.site_content (key, locale, value) values
('contact.image', 'en', '/images/home/story-3.webp'), ('contact.image', 'es', '/images/home/story-3.webp')
on conflict (key, locale) do nothing;

commit;
