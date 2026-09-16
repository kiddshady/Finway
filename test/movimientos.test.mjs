/* ═══════════════════════════════════════════════════════════════════════════
   Los movimientos: la capa de datos del dominio.

   Lo que se afirma acá no es "el código hace lo que dice el código", es el
   puñado de comportamientos por los que está escrito así:

     · no hay cache — una ventana dormida en el tray no puede pisar el archivo;
     · lo que viene de afuera se normaliza siempre, venga del renderer o de un
       archivo importado;
     · exportar e importar es un viaje de ida y vuelta sin pérdida, porque de
       eso depende poder mudarse de app;
     · importar dos veces el mismo archivo no duplica nada.

   Corre contra un directorio temporal: nunca toca los datos reales.
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'fs';
import os from 'os';
import path from 'path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finway-test-'));
/* El store lee FINWAY_DATA al CARGARSE, así que la variable tiene que estar
   puesta antes del import — de ahí que este sea dinámico y no estático. */
process.env.FINWAY_DATA = dir;
const mov = (await import('../src/movimientos.cjs')).default
  ?? await import('../src/movimientos.cjs').then((m) => m.default ?? m);

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };
const nuevo = (over = {}) => ({ type: 'expense', amount: 1500, date: '2026-09-16', category: 'comida', note: 'prueba', ...over });

console.log('\n1. Arranque en limpio');
ok('sin archivo, la lista está vacía', (await mov.load()).length === 0);

console.log('\n2. Alta');
let moves = await mov.add(nuevo());
ok('devuelve la lista completa, no el ítem', Array.isArray(moves) && moves.length === 1);
ok('le pone un id', typeof moves[0].id === 'string' && moves[0].id.length > 10, moves[0].id);
ok('le pone un timestamp', Number.isFinite(moves[0].ts));
ok('escribió en el directorio de datos', fs.existsSync(path.join(dir, 'movimientos.json')));

console.log('\n3. Lo que llega de afuera no se confía');
moves = await mov.add(nuevo({ type: 'cualquier-cosa', amount: '2000.567', note: 'x'.repeat(300) }));
const raro = moves.find((m) => m.note.length === 200);
ok('un tipo desconocido cae a gasto', raro.type === 'expense', raro.type);
ok('el monto se redondea a centavos', raro.amount === 2000.57, String(raro.amount));
ok('la nota se recorta a 200', raro.note.length === 200, String(raro.note.length));

for (const [caso, patch] of [['monto 0', { amount: 0 }], ['monto negativo', { amount: -5 }],
  ['fecha con otro formato', { date: '16/09/2026' }]]) {
  let tiro = null;
  try { await mov.add(nuevo(patch)); } catch (e) { tiro = e; }
  ok(`${caso} se rechaza`, !!tiro, 'no tiró');
}

console.log('\n4. Orden: los más nuevos arriba');
await mov.add(nuevo({ date: '2026-01-05', note: 'viejo' }));
await mov.add(nuevo({ date: '2026-12-20', note: 'nuevo' }));
moves = await mov.load();
ok('la lista baja por fecha', moves[0].date >= moves[moves.length - 1].date,
  `${moves[0].date} … ${moves[moves.length - 1].date}`);
ok('el más nuevo primero', moves[0].note === 'nuevo', moves[0].note);

console.log('\n5. Edición y borrado');
const target = (await mov.load())[0];
moves = await mov.update({ ...target, amount: 999, note: 'editado' });
const editado = moves.find((m) => m.id === target.id);
ok('actualiza el monto', editado.amount === 999);
ok('conserva el id y el ts', editado.id === target.id && editado.ts === target.ts);
let tiro = null;
try { await mov.update({ ...target, id: 'no-existe' }); } catch (e) { tiro = e; }
ok('editar un id inexistente tira', !!tiro);
const antes = (await mov.load()).length;
moves = await mov.remove(target.id);
ok('borrar saca uno solo', moves.length === antes - 1);

console.log('\n6. Sin cache: el disco manda');
/* Una escritura hecha por fuera —otra ventana, otro proceso— tiene que verse
   en la próxima lectura, y una mutación propia tiene que INTEGRARSE a eso en
   vez de pisarlo. Con un cache en memoria, las dos cosas fallan en silencio. */
const archivo = path.join(dir, 'movimientos.json');
const externo = JSON.parse(fs.readFileSync(archivo, 'utf8'));
externo.moves.push({ id: 'externo-1', ts: Date.now(), type: 'income', amount: 10, date: '2026-09-16', category: 'sueldo', note: 'de afuera' });
fs.writeFileSync(archivo, JSON.stringify(externo));
ok('load() ve lo que escribió otro proceso', (await mov.load()).some((m) => m.id === 'externo-1'));
moves = await mov.add(nuevo({ note: 'después del externo' }));
ok('add() no pisa lo que escribió el otro', moves.some((m) => m.id === 'externo-1'));

console.log('\n7. Respaldo: el viaje de ida y vuelta');
const original = await mov.load();
const backup = mov.toBackup(original, '0.1.0');
ok('se declara', backup.format === 'finway/backup', backup.format);
ok('dice su esquema y cuántos trae', backup.schema === 1 && backup.count === original.length);
ok('trae TODOS los meses, no uno', new Set(backup.moves.map((m) => m.date.slice(0, 7))).size > 1);

const vuelta = mov.fromBackup(JSON.stringify(backup));
ok('la vuelta trae la misma cantidad', vuelta.moves.length === original.length);
ok('los ids sobreviven', vuelta.moves.every((m, i) => m.id === original[i].id));
ok('los timestamps sobreviven', vuelta.moves.every((m, i) => m.ts === original[i].ts));
ok('los montos sobreviven, decimales incluidos', vuelta.moves.every((m, i) => m.amount === original[i].amount));

console.log('\n8. Importar desde FinWatch');
/* El caso real: mudarse. El respaldo de la app anterior se declara con OTRO
   format y tiene que entrar igual — es la app de la que salió esta. */
const deFinWatch = JSON.stringify({
  format: 'finwatch/backup',
  schema: 1,
  app: 'FinWatch 1.4.0',
  moves: [
    { id: 'fw-1', ts: 1, type: 'expense', amount: 3200, date: '2026-05-02', category: 'comida', note: 'viene de FinWatch' },
    { id: 'fw-2', ts: 2, type: 'income', amount: 780000, date: '2026-05-05', category: 'sueldo', note: 'sueldo mayo' },
  ],
});
const totalAntes = (await mov.load()).length;
const r1 = await mov.importBackup(deFinWatch);
ok('acepta el respaldo de FinWatch', r1.importados === 2, JSON.stringify(r1));
ok('dice de dónde vino', r1.origen === 'FinWatch 1.4.0', String(r1.origen));
ok('se sumaron a lo que ya había', r1.total === totalAntes + 2, `${r1.total} vs ${totalAntes + 2}`);
ok('y están en la lista', (await mov.load()).some((m) => m.note === 'viene de FinWatch'));

/* Importar el mismo archivo dos veces es un error humano corriente: no puede
   terminar en movimientos duplicados. */
const r2 = await mov.importBackup(deFinWatch);
ok('importarlo de nuevo no duplica nada', r2.importados === 0 && r2.repetidos === 2, JSON.stringify(r2));
ok('y el total no se movió', r2.total === r1.total);

console.log('\n9. Un archivo de afuera no se confía');
for (const [caso, texto, patron] of [
  ['uno que no es JSON', 'no soy json', /JSON/],
  ['un respaldo de otra app', '{"format":"otra-app/backup","moves":[]}', /otra-app/],
  ['un JSON sin movimientos', '{"cualquier":"cosa"}', /movimientos/],
]) {
  let e = null;
  try { mov.fromBackup(texto); } catch (err) { e = err; }
  ok(`${caso} se rechaza con un motivo`, !!e && patron.test(e.message), e?.message);
}

/* Una fila rota no puede llevarse puesto el import entero. */
const mixto = await mov.importBackup(JSON.stringify({
  moves: [
    { id: 'mix-1', type: 'expense', amount: 100, date: '2026-02-01', category: 'comida', note: 'ok' },
    { id: 'mix-2', type: 'expense', amount: -5, date: '2026-02-02', category: 'comida', note: 'monto negativo' },
    { id: 'mix-3', type: 'expense', amount: 200, date: '01/02/2026', category: 'comida', note: 'fecha rara' },
  ],
}));
ok('entran las filas buenas', mixto.importados === 1, JSON.stringify(mixto));
ok('y las rotas se cuentan', mixto.rechazados === 2, JSON.stringify(mixto));
ok('el archivo de datos crudo también entra (sin envoltorio)', mixto.leidos === 3);

console.log('\n10. CSV para Excel en es-AR');
const csv = mov.toCsv([
  { date: '2026-09-16', type: 'expense', amount: 1234.5, category: 'comida', note: 'con "comillas"' },
  { date: '2026-09-17', type: 'income', amount: 50000, category: 'sueldo', note: '' },
]);
ok('arranca con BOM (si no, Excel come los acentos)', csv.charCodeAt(0) === 0xFEFF);
ok('separa con ;', csv.split('\r\n')[0].replace(/^﻿/, '') === 'fecha;tipo;categoria;monto;nota');
ok('el decimal va con coma', csv.includes('1234,5'));
ok('traduce el tipo al castellano', csv.includes(';gasto;') && csv.includes(';ingreso;'));
ok('las comillas internas se duplican', csv.includes('""comillas""'));

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
process.exit(fail ? 1 : 0);
