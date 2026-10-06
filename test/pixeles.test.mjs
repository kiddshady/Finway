/* ═══════════════════════════════════════════════════════════════════════════
   Los íconos de píxel y la F de píxel.
   Una fila de más o un píxel corrido no rompen nada a la vista hasta que el
   ícono sale torcido o borroso; esto lo agarra antes.
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'fs';
import { PIXELES, trazar } from '../renderer/js/fin/pixeles.js';
import { efe, GRILLAS, TONOS_HEX } from '../renderer/js/fin/mark.js';

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };

console.log('\n1. Los íconos de la interfaz son de 7×7');
const torcidos = Object.entries(PIXELES).filter(([, f]) => f.length !== 7 || f.some((r) => r.length !== 7 || /[^#.]/.test(r)));
ok('todos tienen 7 filas de 7 (solo # y .)', !torcidos.length, torcidos.map(([n]) => n).join(', '));
const vacios = Object.entries(PIXELES).filter(([, f]) => !f.join('').includes('#'));
ok('ninguno está vacío', !vacios.length, vacios.map(([n]) => n).join(', '));
ok('trazar une los píxeles seguidos de una fila', trazar(['.###...']) === 'M1 0h3v1h-3z', trazar(['.###...']));

console.log('\n2. Están todos los que usa la app');
const fuentes = ['renderer/index.html', ...fs.readdirSync('renderer/js', { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => `renderer/js/${f}`)]
  .map((f) => fs.readFileSync(f, 'utf8').replace(/\\/g, '/')).join('\n');
const usados = new Set([
  ...[...fuentes.matchAll(/Icons\.svg\('(\w+)'/g)].map((m) => m[1]),
  ...[...fuentes.matchAll(/data-icon="(\w+)"/g)].map((m) => m[1]),
  ...[...fuentes.matchAll(/icon: '(\w+)'/g)].map((m) => m[1]),
  ...[...fuentes.matchAll(/'<(\w+)>'/g)].map((m) => m[1]),
  'info', 'winRestore',          // los que se eligen en tiempo de ejecución
]);
usados.delete('nombre');         // el ejemplo del comentario de icons.js
usados.delete('play');           // idem
const faltan = [...usados].filter((n) => !PIXELES[n]);
ok(`los ${usados.size} íconos que se usan tienen versión de píxel`, !faltan.length, faltan.join(', '));

console.log('\n3. La F de píxel');
for (const n of Object.keys(GRILLAS)) {
  const { piezas } = efe(+n);
  const celdas = piezas.flatMap((p) => p.celdas);
  ok(`grilla ${n}: entra justa en ${n}×${n}`, celdas.every(([x, y]) => x >= 0 && y >= 0 && x < n && y < n)
    && Math.max(...celdas.map(([x]) => x)) === n - 1 && Math.max(...celdas.map(([, y]) => y)) === n - 1);
  ok(`grilla ${n}: ninguna celda repetida`, new Set(celdas.map((c) => c.join())).size === celdas.length);
  ok(`grilla ${n}: stem en 4 escalones y 3 brazos`, piezas.filter((p) => p.clase === 'fm-stem').length === 4 && piezas.filter((p) => p.clase.startsWith('fm-arm')).length === 3);
}
const splash = fs.readFileSync('renderer/index.html', 'utf8').match(/<div id="boot-splash">[\s\S]*?<\/svg>/)?.[0] || '';
const esperado = efe(16).piezas.map((p) => `fill="${TONOS_HEX[p.tono].toLowerCase()}" d="${p.d}"`);
ok('el splash del index.html es la misma F que mark.js', esperado.every((e) => splash.includes(e)), 'node tools/icono.mjs --splash y pegarlo');

console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
process.exit(fail ? 1 : 0);
