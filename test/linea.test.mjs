/* ═══════════════════════════════════════════════════════════════════════════
   La línea de carga: `gasto 4500 transporte uber` y Enter.
   El intérprete es puro (renderer/js/fin/linea.js), así que se prueba acá
   con node pelado. `hoy` se inyecta: un test que dependa de la fecha real
   pasa en septiembre y falla en enero.
   ═══════════════════════════════════════════════════════════════════════════ */

import { entender, leerFecha, leerMonto } from '../renderer/js/fin/linea.js';

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };
const HOY = '2026-10-05';
const J = (x) => JSON.stringify(x);

console.log('\n1. El caso de todos los días');
let r = entender('gasto 4500 transporte uber', HOY);
ok('gasto 4500 transporte uber → un gasto listo', J(r.move) === J({ type: 'expense', amount: 4500, category: 'transporte', note: 'uber', date: HOY }), J(r.move));
r = entender('4500 transporte uber', HOY);
ok('sin decir el tipo, es gasto', r.move?.type === 'expense', J(r));
r = entender('uber 4500 transporte', HOY);
ok('las palabras van en cualquier orden', r.move?.amount === 4500 && r.move?.category === 'transporte' && r.move?.note === 'uber', J(r.move));

console.log('\n2. Ingresos');
r = entender('ingreso 40000 regalo cumple', HOY);
ok('ingreso 40000 regalo cumple', r.move?.type === 'income' && r.move?.category === 'regalo' && r.move?.note === 'cumple', J(r.move));
r = entender('+15000 freelance cliente', HOY);
ok('un + delante del monto lo vuelve ingreso', r.move?.type === 'income' && r.move?.amount === 15000, J(r.move));
r = entender('1200000 sueldo', HOY);
ok('una categoría que solo existe en ingresos lo vuelve ingreso', r.move?.type === 'income' && r.move?.category === 'sueldo', J(r.move));
r = entender('i 500 otros', HOY);
ok('con el tipo dicho, «otros» es el de ingresos', r.move?.category === 'otros-in', J(r.move));

console.log('\n3. Categorías por su principio, sin acentos ni mayúsculas');
ok('transp → transporte', entender('100 transp', HOY).categoria === 'transporte');
ok('EDUC → educacion', entender('100 EDUC', HOY).categoria === 'educacion');
ok('educación con acento → educacion', entender('100 educación', HOY).categoria === 'educacion');
ok('dos letras no alcanzan (sa podría ser salud o salidas)', entender('100 sa', HOY).categoria === null);
ok('solo la primera palabra que es categoría; el resto es nota', entender('gasto 300 comida salidas con amigos', HOY).nota === 'salidas con amigos');

console.log('\n4. Montos');
ok('4.500 son cuatro mil quinientos', leerMonto('4.500') === 4500, String(leerMonto('4.500')));
ok('4500,50 lleva centavos', leerMonto('4500,50') === 4500.5);
ok('$4500 con el signo', leerMonto('$4500') === 4500);
ok('12k son doce mil', leerMonto('12k') === 12000);
ok('4,5k son cuatro mil quinientos', leerMonto('4,5k') === 4500);
ok('una palabra no es un monto', leerMonto('uber') === null);
ok('cero no es un monto', leerMonto('0') === null);
ok('el segundo número va a la nota', entender('gasto 3000 comida 2 empanadas', HOY).nota === '2 empanadas');

console.log('\n5. Fechas');
ok('hoy', leerFecha('hoy', HOY) === HOY);
ok('ayer', leerFecha('ayer', HOY) === '2026-10-04');
ok('anteayer cruza el mes si hace falta', leerFecha('anteayer', '2026-10-01') === '2026-09-29', leerFecha('anteayer', '2026-10-01'));
ok('12/9 es de este año', leerFecha('12/9', HOY) === '2026-09-12');
ok('12/9/25 con el año corto', leerFecha('12/9/25', HOY) === '2025-09-12');
ok('31/2 no existe', leerFecha('31/2', HOY) === null);
r = entender('gasto 4500 comida pizza ayer', HOY);
ok('la fecha sale de la nota', r.move?.date === '2026-10-04' && r.move?.note === 'pizza', J(r.move));
ok('sin fecha, es hoy', entender('100 comida', HOY).fecha === HOY);

console.log('\n6. Lo que falta no se guarda');
r = entender('gasto transporte uber', HOY);
ok('sin monto: falta el monto', !r.move && r.falta.includes('monto'), J(r.falta));
r = entender('gasto 4500 uber', HOY);
ok('sin categoría: falta la categoría', !r.move && r.falta.includes('categoría'), J(r.falta));
ok('una línea vacía no es nada', entender('', HOY).move === null);

console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
process.exit(fail ? 1 : 0);
