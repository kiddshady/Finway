/* ═══════════════════════════════════════════════════════════════════════════
   Las cuentas de Presupuestos y Metas (renderer/js/fin/plan.js).

   `hoy` se inyecta en todas: un test que dependa de la fecha real pasa en
   septiembre y falla en febrero.
   ═══════════════════════════════════════════════════════════════════════════ */

import { estadoMeta, estadoPresupuesto, mesesEntre, topeDe } from '../renderer/js/fin/plan.js';

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };
const eq = (n, a, b) => ok(`${n} → ${JSON.stringify(b)}`, Object.is(a, b), `dio ${JSON.stringify(a)}`);

let seq = 0;
const g = (date, category, amount) => ({ id: `m${seq++}`, type: 'expense', date, category, amount });
const ing = (date, amount) => ({ id: `m${seq++}`, type: 'income', date, category: 'sueldo', amount });

console.log('\n1. Topes');
eq('un número positivo es tope', topeDe({ comida: 1000 }, 'comida'), 1000);
eq('cero es sin tope', topeDe({ comida: 0 }, 'comida'), null);
eq('negativo es sin tope', topeDe({ comida: -5 }, 'comida'), null);
eq('texto es sin tope', topeDe({ comida: '1000' }, 'comida'), null);
eq('sin topes cargados', topeDe(undefined, 'comida'), null);

console.log('\n2. Presupuesto del mes en curso');
const moves = [
  g('2026-09-02', 'comida', 10000), g('2026-09-05', 'comida', 12000), g('2026-09-09', 'comida', 8000),
  g('2026-09-01', 'hogar', 200000),
  g('2026-09-03', 'salidas', 30000), g('2026-09-04', 'salidas', 25000),
  g('2026-08-20', 'comida', 99999),          // otro mes: no cuenta
  ing('2026-09-01', 500000),                 // un ingreso: no cuenta
];
const topes = { comida: 60000, hogar: 200000, salidas: 50000 };
const p = estadoPresupuesto(moves, '2026-09', topes, '2026-09-10');
const fila = (cat) => p.filas.find((f) => f.cat === cat);

eq('comida: lo gastado del mes, sin el de agosto', fila('comida').gastado, 30000);
eq('comida: queda', fila('comida').queda, 30000);
eq('comida: proyecta (3 movimientos, día 10)', fila('comida').proyeccion, 90000);
eq('comida: a este ritmo se pasa el día 20', fila('comida').diaExceso, 20);
eq('hogar: un solo pago no proyecta', fila('hogar').proyeccion, null);
eq('hogar: justo en el tope no está excedido', fila('hogar').excedido, false);
eq('salidas: excedido', fila('salidas').excedido, true);
eq('salidas: queda en negativo', fila('salidas').queda, -5000);
eq('salidas: excedido no avisa el día (ya se pasó)', fila('salidas').diaExceso, null);
eq('transporte: sin tope', fila('transporte').tope, null);
eq('una fila por categoría de gasto', p.filas.length, 11);
eq('presupuestado', p.presupuestado, 310000);
eq('gastado en lo que tiene tope', p.gastado, 285000);
eq('queda en total', p.queda, 25000);
// Del 10 al 30 inclusive son 21 días.
eq('por día hasta fin de mes', p.porDia, Math.round(25000 / 21 * 100) / 100);
eq('ritmo del mes', p.ritmo, 10 / 30);

console.log('\n3. Presupuesto: bordes');
const temprano = estadoPresupuesto(moves.filter((m) => m.date <= '2026-09-03'), '2026-09', topes, '2026-09-03');
eq('antes del día 5 no proyecta nada', temprano.filas.every((f) => f.proyeccion == null), true);
const pasado = estadoPresupuesto(moves, '2026-08', topes, '2026-09-10');
eq('un mes cerrado no proyecta', pasado.filas.every((f) => f.proyeccion == null), true);
eq('un mes cerrado no tiene por día', pasado.porDia, null);
eq('un mes cerrado no tiene ritmo', pasado.ritmo, null);
const pasadoDeTope = estadoPresupuesto(moves, '2026-09', { salidas: 50000 }, '2026-09-10');
eq('si el total ya se pasó, no hay por día', pasadoDeTope.porDia, null);
const vacio = estadoPresupuesto([], '2026-09', {}, '2026-09-10');
eq('sin topes: presupuestado cero', vacio.presupuestado, 0);
eq('sin topes: sin por día', vacio.porDia, null);
// Un ritmo que cruza el tope el último día no puede dar un día 31 en septiembre.
const justo = estadoPresupuesto(
  [g('2026-09-01', 'ropa', 100), g('2026-09-02', 'ropa', 100), g('2026-09-05', 'ropa', 800)],
  '2026-09', { ropa: 2990 }, '2026-09-10');
ok('el día del exceso nunca pasa del último del mes', justo.filas.find((f) => f.cat === 'ropa').diaExceso <= 30);
const centavo = estadoPresupuesto([g('2026-09-01', 'comida', 0.1), g('2026-09-01', 'comida', 0.2)],
  '2026-09', { comida: 1 }, '2026-09-10');
eq('redondea a centavos (0,1 + 0,2)', centavo.filas.find((f) => f.cat === 'comida').gastado, 0.3);

console.log('\n4. Meses entre dos meses');
eq('mismo mes', mesesEntre('2026-09', '2026-09'), 0);
eq('cruzando el año', mesesEntre('2026-11', '2027-02'), 3);
eq('hacia atrás', mesesEntre('2026-09', '2026-07'), -2);

console.log('\n5. Metas');
const a = (fecha, monto) => ({ id: `a${seq++}`, fecha, monto, nota: '' });
const viaje = { id: 'v', nombre: 'Viaje', objetivo: 400000, fecha: '2026-12',
  aportes: [a('2026-08-10', 100000), a('2026-09-05', 60000), a('2026-09-08', -10000)] };
const e = estadoMeta(viaje, '2026-09-20');
eq('ahorrado suma aportes y resta retiros', e.ahorrado, 150000);
eq('falta', e.falta, 250000);
eq('porcentaje', e.pct, 150000 / 400000);
eq('sep a dic son 4 meses', e.meses, 4);
eq('por mes para llegar', e.porMes, 62500);
eq('ritmo: 150 000 en dos meses', e.ritmo, 75000);
// Faltan 250 000 a 75 000 por mes: oct, nov y dic no alcanzan (225 000), llega en enero.
eq('llegada a ese ritmo', e.llegada, '2027-01');
eq('no está vencida', e.vencida, false);

const vencida = estadoMeta({ ...viaje, fecha: '2026-08' }, '2026-09-20');
eq('fecha pasada sin cumplir: vencida', vencida.vencida, true);
eq('vencida no tiene por mes', vencida.porMes, null);

const cumplida = estadoMeta({ ...viaje, aportes: [a('2026-09-01', 450000)] }, '2026-09-20');
eq('cumplida', cumplida.cumplida, true);
eq('cumplida: no falta nada', cumplida.falta, 0);
eq('cumplida: el porcentaje topea en 1', cumplida.pct, 1);
eq('cumplida: no hay plan', cumplida.porMes, null);
eq('cumplida: no hay llegada', cumplida.llegada, null);

const nueva = estadoMeta({ id: 'n', nombre: 'Fondo', objetivo: 100000, fecha: null, aportes: [] }, '2026-09-20');
eq('sin aportes: cero ahorrado', nueva.ahorrado, 0);
eq('sin aportes: sin ritmo', nueva.ritmo, null);
eq('sin fecha: sin meses', nueva.meses, null);

console.log(`\n═══ ${pass} ok · ${fail} fallas ═══\n`);
process.exit(fail ? 1 : 0);
