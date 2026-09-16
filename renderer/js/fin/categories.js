/**
 * Categorías.
 *
 * Acá el color NO es decoración: es lo único que ata cada gajo del donut con
 * su renglón de la leyenda. Es la excepción a la regla de sobriedad del resto
 * de la app, y está hecha a propósito.
 *
 * Hubo un intento de rampa monocroma (sep 2026, buscando sobriedad) y fue un
 * error: quedó elegante y dejó el donut ilegible. La lección es que la
 * sobriedad se paga en los lugares donde el color decora, no en los pocos
 * donde el color carga información que no está escrita en ningún otro lado.
 *
 * Verde y rojo NO aparecen acá. Son el par semántico —entra / sale— y si
 * además fueran categorías dejarían de significar eso.
 */

/* El abanico.

   Ordenado por matiz, que es lo que hace que la fila de chips del formulario
   se lea como un abanico y no como una bolsa de colores. En el donut el orden
   no importa: ahí los segmentos van por monto, así que CUALQUIER par puede
   terminar pegado — por eso la separación tiene que valer entre todos los
   pares, no solo entre vecinos de esta lista.

   Los valores no se eligieron a ojo. Se buscó el conjunto que maximiza la
   distancia perceptual MÍNIMA entre todos los pares, dentro de estas rejas:

     · croma ≤ .14 — el techo de la sobriedad. Sin él, el optimizador empuja
       todo al máximo y salen rosas y turquesas de neón;
     · nada a menos de 20° del verde del ingreso (152) ni del rojo del gasto
       (34) — una categoría que parezca "entra" o "sale" rompe el único código
       de color que esta app pide entender;
     · todo dentro de sRGB, comprobado antes de convertir: oklchToHex() recorta
       lo que se sale y lo hace EN SILENCIO, así que un color fuera de gamut no
       da error, da otro color.

   Resultado medido: 0.100 de distancia mínima entre categorías y 0.112 contra
   los dos semánticos. Como referencia, dos colores a 0.04 son "el mismo color
   con otro nombre" — que es exactamente lo que pasaba con la rampa monocroma
   que esto reemplaza: era sobria y era ilegible, porque en un donut el color
   ES lo que ata cada gajo con su renglón de la leyenda.

   El de humo mide esa distancia mínima y falla si alguien suma una categoría
   apretando el abanico. */

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

export const EXPENSE_CATS = ABANICO.map(([id, label, color]) => ({ id, label, color }));

/* Los ingresos reusan cuatro tonos del mismo abanico, bien separados entre sí.
   Repetirlos no confunde: los ingresos nunca comparten gráfico con los gastos
   —el donut es solo de gastos— y en la lista el signo y el color del monto ya
   los distinguen. Una segunda paleta de cuatro colores más sería pedirle a
   quien mira que aprenda quince. */
export const INCOME_CATS = [
  ['sueldo', 'Sueldo', 'oklch(80% .14 84)'],
  ['freelance', 'Freelance', 'oklch(80% .14 186)'],
  ['regalo', 'Regalo', 'oklch(71% .14 294)'],
  ['otros-in', 'Otros', 'oklch(62% 0 0)'],
].map(([id, label, color]) => ({ id, label, color }));

const ALL = new Map([...EXPENSE_CATS, ...INCOME_CATS].map((c) => [c.id, c]));

export const catColor = (id) => ALL.get(id)?.color ?? 'var(--ox-text-3)';
export const catLabel = (id) => ALL.get(id)?.label ?? id;
export const catsFor = (type) => (type === 'income' ? INCOME_CATS : EXPENSE_CATS);
