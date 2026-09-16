/* ═══════════════════════════════════════════════════════════════════════════
   El formato del dominio: plata y fechas.

   parseAmount es la función más peligrosa de la app: se come lo que el usuario
   tipee —con coma, con punto, con los dos, con separador de miles, con signo
   pesos— y lo que devuelva se guarda en disco como el monto real. Un error acá
   no se ve: se ve tres meses después, en un balance que no cierra.

   Las fechas van todas en local, nunca UTC: un `new Date("2026-09-01")` se
   parsea como medianoche UTC y en Argentina cae el 31 de agosto.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  dayLabel, daysInMonth, fmtARS, monthKey, monthShort, monthTitle, parseAmount, shiftMonth,
} from '../renderer/js/fin/format.js';

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };
const eq = (n, a, b) => ok(`${n} → ${JSON.stringify(b)}`, Object.is(a, b), `dio ${JSON.stringify(a)}`);

console.log('\n1. parseAmount: lo que tipea el usuario');
eq('1500', parseAmount('1500'), 1500);
eq('1500,50 (coma decimal, es-AR)', parseAmount('1500,50'), 1500.5);
eq('1.234,56 (punto de miles + coma decimal)', parseAmount('1.234,56'), 1234.56);
eq('1,234.56 (formato inglés)', parseAmount('1,234.56'), 1234.56);
eq('1500.50 (punto decimal suelto)', parseAmount('1500.50'), 1500.5);
eq('$ 2.000 (con signo y miles)', parseAmount('$ 2.000'), 2000);
eq('  850  (con espacios)', parseAmount('  850  '), 850);
eq('12.345 (punto de miles, NO decimal)', parseAmount('12.345'), 12345);
eq('1.234.567 (dos puntos de miles)', parseAmount('1.234.567'), 1234567);
eq('3,5 (un decimal)', parseAmount('3,5'), 3.5);

console.log('\n2. parseAmount: lo que hay que rechazar');
ok('vacío no es un número', Number.isNaN(parseAmount('')));
ok('null no es un número', Number.isNaN(parseAmount(null)));
ok('texto no es un número', Number.isNaN(parseAmount('abc')));
ok('solo el signo pesos no es un número', Number.isNaN(parseAmount('$')));

console.log('\n3. fmtARS: siempre con coma decimal y el menos tipográfico');
ok('usa separador de miles es-AR', fmtARS(1234.5).includes('1.234'), fmtARS(1234.5));
ok('el decimal es coma', fmtARS(1234.5).includes(',5'), fmtARS(1234.5));
ok('el negativo lleva − (U+2212), no el guión', fmtARS(-100).startsWith('−'), fmtARS(-100));
/* Entre el signo pesos y la cifra va un THIN SPACE (U+2009), no un espacio
   común: es una decisión tipográfica del formato original y se afirma acá para
   que nadie la "limpie" pensando que es un espacio que se coló. */
eq('el cero se escribe', fmtARS(0), '$ 0');
eq('el separador es thin space, no espacio común', fmtARS(5).charCodeAt(1), 0x2009);

console.log('\n4. Fechas, todas en local');
eq('monthKey recorta el día', monthKey('2026-09-16'), '2026-09');
eq('shiftMonth cruza el año hacia atrás', shiftMonth('2026-01', -1), '2025-12');
eq('shiftMonth cruza el año hacia adelante', shiftMonth('2026-12', 1), '2027-01');
eq('daysInMonth de febrero bisiesto', daysInMonth('2024-02'), 29);
eq('daysInMonth de febrero común', daysInMonth('2026-02'), 28);
eq('daysInMonth de un mes de 30', daysInMonth('2026-09'), 30);
eq('dayLabel', dayLabel('2026-09-07'), '07 SEP');
eq('monthShort', monthShort('2026-09'), 'SEP');
eq('monthTitle capitaliza para el encabezado', monthTitle('2026-09'), 'Septiembre 2026');

/* El caso que rompe si alguien "simplifica" con new Date(str): el 1º de mes
   parseado como UTC cae el día anterior en Argentina (UTC-3). */
eq('el 1º de mes no se cae al mes anterior', monthKey('2026-09-01'), '2026-09');
eq('y su etiqueta tampoco', dayLabel('2026-09-01'), '01 SEP');

console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
process.exit(fail ? 1 : 0);
