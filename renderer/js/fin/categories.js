/**
 * Categorías.
 *
 * CADA UNA TIENE SU COLOR (de vuelta desde el 21 sep 2026, pedido de Fran).
 * Entre el 17 y el 21 de septiembre fueron acromáticas —grises por puesto en
 * el ranking del mes— para ser más fieles a Onyx. Alcanzaba para un donut
 * solo, pero no para la tendencia por categoría: ahí conviven varias líneas a
 * la vez, se prenden y se apagan, y lo único que ata cada línea con su chip es
 * el color. Un gris por puesto encima cambia de categoría cuando cambia el
 * ranking, que es justo lo que ese gráfico muestra moverse.
 *
 * La regla de sobriedad sigue valiendo para todo lo demás: el shell es
 * acromático, las cifras son neutras. El color de categoría vive solo donde
 * identifica una categoría (gajos, líneas, el puntito de chips y filas).
 *
 * Verde y rojo NO aparecen acá. Son el par semántico —entra / sale— y si
 * además fueran categorías dejarían de significar eso.
 */

/* El abanico.

   Ordenado por matiz, que es lo que hace que la fila de chips del formulario
   se lea como un abanico y no como una bolsa de colores. En el donut y en la
   tendencia el orden lo pone el monto, así que CUALQUIER par puede terminar
   pegado — por eso la separación tiene que valer entre todos los pares, no
   solo entre vecinos de esta lista.

   Los valores no se eligieron a ojo. Se buscó el conjunto que maximiza la
   distancia perceptual MÍNIMA entre todos los pares, dentro de estas rejas:

     · croma ≤ .14 — el techo de la sobriedad. Sin él, el optimizador empuja
       todo al máximo y salen rosas y turquesas de neón;
     · lejos del verde del ingreso y del rojo del gasto — una categoría que
       parezca "entra" o "sale" rompe el único código de color que esta app
       pide entender;
     · todo dentro de sRGB: oklch() fuera de gamut no da error, da OTRO color.

   Medido: 0.100 de distancia mínima (Oklab) entre categorías, y ≥ 0.085
   contra el par verde/rojo actual (el rojo es --ox-danger). Dos colores a
   0.04 son "el mismo color con otro nombre". El de humo mide la distancia
   mínima y falla si alguien suma una categoría apretando el abanico. */

const ABANICO = [
  ['comida', 'Comida', 'oklch(77% .14 6)'],
  ['super', 'Súper', 'oklch(80% .14 84)'],
  ['transporte', 'Transporte', 'oklch(62% .12 102)'],
  ['salidas', 'Salidas', 'oklch(80% .14 186)'],
  ['servicios', 'Servicios', 'oklch(62% .10 204)'],
  ['hogar', 'Hogar', 'oklch(80% .12 234)'],
  ['salud', 'Salud', 'oklch(62% .14 270)'],
  ['subs', 'Subs', 'oklch(71% .14 294)'],
  ['ropa', 'Ropa', 'oklch(80% .14 318)'],
  ['educacion', 'Educación', 'oklch(65% .14 330)'],
  // "Otros" es gris por convención: es el cajón del resto, no una categoría más.
  ['otros', 'Otros', 'oklch(62% 0 0)'],
];

const cat = ([id, label, color]) => ({ id, label, color });

export const EXPENSE_CATS = ABANICO.map(cat);

/* Los ingresos reusan cuatro tonos del mismo abanico, bien separados entre sí.
   Nunca comparten gráfico con los gastos —el donut y la tendencia son solo de
   gastos— así que repetirlos no confunde, y una segunda paleta sería pedirle
   a quien mira que aprenda quince colores. */
export const INCOME_CATS = [
  ['sueldo', 'Sueldo', 'oklch(80% .14 84)'],
  ['freelance', 'Freelance', 'oklch(80% .14 186)'],
  ['regalo', 'Regalo', 'oklch(71% .14 294)'],
  ['otros-in', 'Otros', 'oklch(62% 0 0)'],
].map(cat);

const ALL = new Map([...EXPENSE_CATS, ...INCOME_CATS].map((c) => [c.id, c]));

/* Literales oklch() sin var() adentro: así sirven igual en `style` de HTML que
   en el `style` de un nodo SVG. */
export const catColor = (id) => ALL.get(id)?.color ?? 'oklch(62% 0 0)';
export const catLabel = (id) => ALL.get(id)?.label ?? id;
export const catsFor = (type) => (type === 'income' ? INCOME_CATS : EXPENSE_CATS);
