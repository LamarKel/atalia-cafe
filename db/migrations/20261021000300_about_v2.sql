-- Nosotros, versión 2 (pedido de la clienta, 2026-10-21): una página propia sobre el café, distinta del inicio.
-- Secciones: portada con foto grande, la historia, "del grano a tu taza" (4 pasos), una frase, lo que nos
-- importa (3 puntos), galería y la invitación final. Todo en site_content (EN/ES), editable en el panel →
-- Negocio → Textos; una sección sin título no se muestra. Los textos son un BORRADOR: la clienta los cambia
-- por su historia real. Las fotos son las del inicio hasta que suba las suyas.
-- about.body (vacío hasta hoy) pasa a ser el texto de la historia; solo se llena si sigue vacío.

begin;

update public.site_content set value = v.value
from (values
  ('about.body', 'en', E'Atalia started with family recipes and a simple wish: to bring people together around a good cup of coffee. What began as trays for friends and family became a café in Passaic where every order is made as if it were for our own table.\n\nWe still work the same way: a short menu, made well, with ingredients we choose carefully and service that makes you feel at home.'),
  ('about.body', 'es', E'Atalia nació de las recetas de casa y de unas ganas sencillas: reunir a la gente alrededor de un buen café. Lo que empezó como bandejas para la familia y los amigos se convirtió en un café en Passaic donde cada pedido se prepara como si fuera para nuestra propia mesa.\n\nSeguimos trabajando igual: un menú corto, bien hecho, con ingredientes que elegimos con cuidado y un trato que te hace sentir en casa.')
) as v(key, locale, value)
where public.site_content.key = v.key and public.site_content.locale = v.locale
  and public.site_content.value = '';

insert into public.site_content (key, locale, value) values
-- Portada
('about.eyebrow', 'en', 'Our story'), ('about.eyebrow', 'es', 'Nuestra historia'),
('about.headline', 'en', E'A café with *roots*,\nmade with care.'),
('about.headline', 'es', E'Un café con *raíces*,\nhecho con cariño.'),
('about.hero_image', 'en', '/images/home/hero.webp'), ('about.hero_image', 'es', '/images/home/hero.webp'),
-- La historia (el texto es about.body)
('about.story.eyebrow', 'en', 'How it started'), ('about.story.eyebrow', 'es', 'Cómo empezó'),
('about.story.title', 'en', E'From a family table\nto *yours*.'),
('about.story.title', 'es', E'De una mesa familiar\na la *tuya*.'),
('about.story.signature', 'en', '— The Atalia Café team'), ('about.story.signature', 'es', '— El equipo de Atalia Café'),
('about.story.image', 'en', '/images/home/story-2.webp'), ('about.story.image', 'es', '/images/home/story-2.webp'),
-- Del grano a tu taza
('about.process.eyebrow', 'en', 'Our coffee'), ('about.process.eyebrow', 'es', 'Nuestro café'),
('about.process.title', 'en', E'From the bean\nto your *cup*.'),
('about.process.title', 'es', E'Del grano\na tu *taza*.'),
('about.process.subtitle', 'en', 'This is how we take care of every coffee we serve.'),
('about.process.subtitle', 'es', 'Así cuidamos cada café que te servimos.'),
('about.process.step1.title', 'en', 'We choose the bean'), ('about.process.step1.title', 'es', 'Elegimos el grano'),
('about.process.step1.body', 'en', 'Coffees we love for their flavor and their story.'),
('about.process.step1.body', 'es', 'Cafés que nos gustan por su sabor y su historia.'),
('about.process.step2.title', 'en', 'Ground to order'), ('about.process.step2.title', 'es', 'Molido al momento'),
('about.process.step2.body', 'en', 'We grind right before brewing so it keeps its aroma.'),
('about.process.step2.body', 'es', 'Lo molemos justo antes de prepararlo para que no pierda aroma.'),
('about.process.step3.title', 'en', 'Brewed without rushing'), ('about.process.step3.title', 'es', 'Preparado sin prisa'),
('about.process.step3.body', 'en', 'We measure, steam the milk and pour with care.'),
('about.process.step3.body', 'es', 'Medimos, calentamos la leche y servimos con calma.'),
('about.process.step4.title', 'en', 'Served your way'), ('about.process.step4.title', 'es', 'Servido a tu manera'),
('about.process.step4.body', 'en', 'To enjoy here, to go, or at your event.'),
('about.process.step4.body', 'es', 'Para tomar aquí, para llevar o en tu evento.'),
-- La frase
('about.quote', 'en', 'Good coffee is never rushed: it is shared.'),
('about.quote', 'es', 'Un buen café no se apura: se comparte.'),
('about.quote_author', 'en', 'Atalia Café'), ('about.quote_author', 'es', 'Atalia Café'),
-- Lo que nos importa
('about.values.eyebrow', 'en', 'What we care about'), ('about.values.eyebrow', 'es', 'Lo que nos importa'),
('about.values.title', 'en', E'Small things,\ndone *well*.'),
('about.values.title', 'es', E'Cosas sencillas,\nbien *hechas*.'),
('about.values.item1.title', 'en', 'Made here'), ('about.values.item1.title', 'es', 'Hecho aquí'),
('about.values.item1.body', 'en', 'We prepare everything in our own kitchen, every day.'),
('about.values.item1.body', 'es', 'Preparamos todo en nuestra cocina, todos los días.'),
('about.values.item2.title', 'en', 'Made to share'), ('about.values.item2.title', 'es', 'Hecho para compartir'),
('about.values.item2.body', 'en', 'Trays and picaderas designed to bring people together.'),
('about.values.item2.body', 'es', 'Bandejas y picaderas pensadas para reunir a la gente.'),
('about.values.item3.title', 'en', 'Neighborly service'), ('about.values.item3.title', 'es', 'Trato de casa'),
('about.values.item3.body', 'en', 'We treat you like a neighbor, because you are one.'),
('about.values.item3.body', 'es', 'Te atendemos como a un vecino, porque lo eres.'),
-- Galería (vacía = no se muestra esa foto)
('about.gallery.title', 'en', 'Moments at Atalia'), ('about.gallery.title', 'es', 'Momentos en Atalia'),
('about.gallery.image1', 'en', '/images/home/story-1.webp'), ('about.gallery.image1', 'es', '/images/home/story-1.webp'),
('about.gallery.image2', 'en', '/images/home/ways-1.webp'), ('about.gallery.image2', 'es', '/images/home/ways-1.webp'),
('about.gallery.image3', 'en', '/images/home/story-3.webp'), ('about.gallery.image3', 'es', '/images/home/story-3.webp'),
('about.gallery.image4', 'en', '/images/home/ways-2.webp'), ('about.gallery.image4', 'es', '/images/home/ways-2.webp'),
-- Invitación final
('about.cta.title', 'en', E'Come and *meet us*.'), ('about.cta.title', 'es', E'Ven a *conocernos*.'),
('about.cta.text', 'en', 'Stop by for a coffee or order for your next gathering.'),
('about.cta.text', 'es', 'Pasa por un café o pide para tu próxima reunión.')
on conflict (key, locale) do nothing;

commit;
