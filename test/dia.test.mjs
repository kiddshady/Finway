/* ═══════════════════════════════════════════════════════════════════════════
   El vigía del día (renderer/js/fin/dia.js): la app abierta días seguidos
   tiene que enterarse de la medianoche, y lo elegido a mano no se pisa.
   El reloj se inyecta: la medianoche se simula, no se espera.
   ═══════════════════════════════════════════════════════════════════════════ */

import { crearVigia, seguirDia, seguirMes } from '../renderer/js/fin/dia.js';

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };
const J = (x) => JSON.stringify(x);

console.log('\n1. El vigía');
let reloj = '2026-10-31';
const v = crearVigia(() => reloj);
const avisos = [];
v.alCambiar((c) => avisos.push(c));
ok('arranca en el día del reloj', v.dia === '2026-10-31');
ok('sin medianoche, revisar no avisa', v.revisar() === null && avisos.length === 0);
reloj = '2026-11-01';
const c = v.revisar();
ok('pasada la medianoche avisa con el día viejo y el nuevo', J(c) === J({ antes: '2026-10-31', ahora: '2026-11-01' }), J(c));
ok('avisa una sola vez', v.revisar() === null && avisos.length === 1, J(avisos));
ok('y queda en el día nuevo', v.dia === '2026-11-01');
reloj = '2026-11-04';
ok('dos días de golpe (suspendida) es un solo aviso', J(v.revisar()) === J({ antes: '2026-11-01', ahora: '2026-11-04' }) && avisos.length === 2);

console.log('\n2. Un oyente que falla no corta a los demás');
const v2 = crearVigia(() => reloj);
let llego = false;
const errorOriginal = console.error;
console.error = () => {};
v2.alCambiar(() => { throw new Error('a propósito'); });
v2.alCambiar(() => { llego = true; });
reloj = '2026-11-05';
v2.revisar();
console.error = errorOriginal;
ok('el segundo oyente se entera igual', llego);
const v3 = crearVigia(() => reloj);
let corrio = false;
const soltar = v3.alCambiar(() => { corrio = true; });
soltar();
reloj = '2026-11-06';
v3.revisar();
ok('soltar() lo saca de la lista', !corrio);

console.log('\n3. Qué sigue al día nuevo y qué no');
const medianoche = { antes: '2026-10-31', ahora: '2026-11-01' };
ok('la fecha que estaba en «hoy» pasa al día nuevo', seguirDia('2026-10-31', medianoche) === '2026-11-01');
ok('una fecha elegida a mano se queda', seguirDia('2026-10-25', medianoche) === '2026-10-25');
ok('el mes en curso pasa al mes nuevo', seguirMes('2026-10', medianoche) === '2026-11');
ok('un mes viejo que se estaba mirando se queda', seguirMes('2026-08', medianoche) === '2026-08');
const mitadDeMes = { antes: '2026-11-14', ahora: '2026-11-15' };
ok('a mitad de mes, el mes no cambia', seguirMes('2026-11', mitadDeMes) === '2026-11');
ok('fin de año: diciembre pasa a enero', seguirMes('2026-12', { antes: '2026-12-31', ahora: '2027-01-01' }) === '2027-01');

console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
process.exit(fail ? 1 : 0);
