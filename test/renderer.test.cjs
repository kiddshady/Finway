/* ═══════════════════════════════════════════════════════════════════════════
   Humo del renderer: monta la app de verdad y la recorre.

   Se corre con `npm run smoke` (necesita Electron, por eso no está en el
   `npm test`, que es node pelado).

   Lo que busca es lo que un test de unidad NO ve: overlays que aterrizan fuera
   de pantalla, vistas que no montan, gráficos que existen pero salen sin
   geometría, glifos unicode que se colaron. La regla que lo guía: **medí dónde
   CAE una cosa, no solo si existe**. El bug más caro de este sistema fue un
   modal que renderizaba en top:-281px — presente en el DOM, correcto en el
   HTML, e inalcanzable con el mouse.

   Corre contra un directorio de datos temporal (FINWAY_DATA): nunca toca los
   datos reales.
   ═══════════════════════════════════════════════════════════════════════════ */

const { app, BrowserWindow, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const W = 1280; const H = 860;

const BG_MAIN = (fs.readFileSync(path.join(ROOT, 'main.cjs'), 'utf8')
  .match(/const BG = '(#[0-9a-f]{6})'/i)?.[1] || '').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };
const bail = (w, e) => { console.log(`ABORTADO ${w}`, e?.stack || e || ''); app.exit(3); };
process.on('unhandledRejection', (e) => bail('rechazo', e));
process.on('uncaughtException', (e) => bail('excepción', e));
setTimeout(() => bail('timeout de 120s'), 120000);

// Datos de prueba, en un userData aparte. Sin esto el humo escribiría en los
// movimientos de verdad.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finway-smoke-'));
process.env.FINWAY_DATA = tmp;   // lo lee src/store.cjs al cargarse
app.setPath('userData', path.join(tmp, 'userData'));

const hoy = new Date();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 12);

app.whenReady().then(async () => {
  const mov = require(path.join(ROOT, 'src', 'movimientos.cjs'));
  await mov.add({ type: 'expense', amount: 12500, date: ymd(hoy), category: 'comida', note: 'semilla comida' });
  await mov.add({ type: 'expense', amount: 8400, date: ymd(hoy), category: 'transporte', note: 'semilla nafta' });
  await mov.add({ type: 'income', amount: 300000, date: ymd(hoy), category: 'sueldo', note: 'semilla sueldo' });
  await mov.add({ type: 'expense', amount: 5000, date: ymd(mesPasado), category: 'salidas', note: 'semilla mes pasado' });

  /* El respaldo pasa por un diálogo nativo de guardar, que en un test
     bloquearía para siempre esperando a alguien que haga click. Se le fija la
     respuesta ANTES de registrar los handlers: así se prueba el camino
     completo —menú → IPC → store → archivo en disco— sin el único tramo que
     no es nuestro. */
  const destinoBackup = path.join(tmp, 'respaldo-de-prueba.json');
  const { dialog } = require('electron');
  const guardarFalso = async () => ({ canceled: false, filePath: destinoBackup });
  try {
    // Asignar a secas no alcanza si la propiedad no es escribible, y falla en
    // silencio: el diálogo real se abre y el test se cuelga esperando un click
    // que nadie va a hacer.
    Object.defineProperty(dialog, 'showSaveDialog', { value: guardarFalso, writable: true, configurable: true });
  } catch { /* se verifica abajo */ }
  const dialogoInterceptado = dialog.showSaveDialog === guardarFalso;

  /* El mismo truco para importar: se deja escrito un respaldo con formato de
     FinWatch —el caso real de la mudanza— y el diálogo de abrir lo devuelve. */
  const origenImport = path.join(tmp, 'respaldo-finwatch.json');
  fs.writeFileSync(origenImport, JSON.stringify({
    format: 'finwatch/backup', schema: 1, app: 'FinWatch 1.4.0',
    moves: [
      { id: 'mudanza-1', ts: 1, type: 'expense', amount: 4800, date: '2025-11-03', category: 'comida', note: 'viene de FinWatch' },
      { id: 'mudanza-2', ts: 2, type: 'income', amount: 640000, date: '2025-11-05', category: 'sueldo', note: 'sueldo viejo' },
      { id: 'mudanza-3', ts: 3, type: 'expense', amount: -1, date: '2025-11-06', category: 'otros', note: 'fila rota a propósito' },
    ],
  }), 'utf8');
  const abrirFalso = async () => ({ canceled: false, filePaths: [origenImport] });
  try {
    Object.defineProperty(dialog, 'showOpenDialog', { value: abrirFalso, writable: true, configurable: true });
  } catch { /* se verifica abajo */ }
  const abrirInterceptado = dialog.showOpenDialog === abrirFalso;

  require(path.join(ROOT, 'src', 'ipc.cjs')).register();

  const win = new BrowserWindow({
    x: -20000, y: -20000, width: W, height: H,
    frame: false, show: false, paintWhenInitiallyHidden: true, backgroundColor: '#000',
    /* Misma configuración que main.cjs, sandbox incluido: si el test corriera
       sin sandbox probaría una app que no es la que se instala. */
    webPreferences: {
      preload: path.join(ROOT, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      navigateOnDragDrop: false, backgroundThrottling: false,
    },
  });

  const errores = [];
  win.webContents.on('console-message', (e) => { if (e.level >= 2) errores.push(`${e.level}: ${e.message}`); });
  await win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  win.show();
  await sleep(2000);

  const js = (c) => win.webContents.executeJavaScript(c);
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false; el.click(); return true; })()`);
  // Un click real es pointerdown → pointerup → click, y varios overlays se
  // cierran en pointerdown. Con `el.click()` solo, ese orden nunca se prueba.
  const tap = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
    el.click(); return true; })()`);
  const escape = () => win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  const rect = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null; const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right }; })()`);
  const dentro = (r) => !!r && r.w > 0 && r.h > 0 && r.x >= 0 && r.y >= 0 && r.right <= W + 1 && r.bottom <= H + 1;

  console.log('\n1. Arranque');
  ok('el splash se fue', !(await js(`!!document.getElementById('boot-splash')`)));
  ok('el shell está montado', await js(`!!document.querySelector('.ox-titlebar') && !!document.querySelector('.ox-rail')`));
  ok('los <i data-icon> se reemplazaron por SVG', !(await js(`!!document.querySelector('i[data-icon]')`)));
  ok('la vista inicial pintó algo', (await js(`document.getElementById('view').children.length`)) > 0);
  ok('la marca está en la titlebar', dentro(await rect('#brand-mark svg')));
  // La titlebar es la de Onyx: marca y nombre. La versión vive en Ajustes.
  ok('la titlebar no muestra la versión', !(await js(`!!document.getElementById('brand-version')`)));

  console.log('\n2. El color que la app le manda a su propia ventana');
  const hex = await js(`(async () => (await import('./js/ui.js')).colorToken('--ox-bg'))()`);
  ok(`colorToken('--ox-bg') devuelve un hex (${hex})`, /^#[0-9a-f]{6}$/i.test(hex || ''), String(hex));
  ok(`coincide con el BG de main.cjs (${BG_MAIN})`, (hex || '').toLowerCase() === BG_MAIN, `${hex} vs ${BG_MAIN}`);

  console.log('\n3. Resumen: los números y los tres gráficos');
  ok('hay cuatro KPIs', (await js(`document.querySelectorAll('.fw-kpi').length`)) === 4);
  const balance = await js(`document.querySelector('.fw-kpi--bal .ox-stat__value').textContent.trim()`);
  ok('el balance dice plata', /\$/.test(balance), balance);
  const segs = await js(`document.querySelectorAll('.fw-donut__seg').length`);
  ok('el donut tiene un segmento por categoría con gasto', segs === 2, String(segs));
  /* Un <path> puede existir con d="" y no dibujar nada: hay que medir el largo
     del trazo, no la presencia del nodo. */
  const largo = await js(`(() => { const p = document.querySelector('.fw-line__cur'); return p ? p.getTotalLength() : 0; })()`);
  ok('la línea del mes tiene trazo real', largo > 10, String(largo));
  const barras = await js(`[...document.querySelectorAll('.fw-bar')].filter(b => Number(b.getAttribute('height')) > 0).length`);
  ok('las barras tienen altura', barras >= 2, String(barras));
  ok('el eje de las barras muestra 6 meses', (await js(`document.querySelectorAll('#bars-svg .fw-bar-month').length`)) === 6);

  /* Cada categoría tiene SU color (21 sep 2026). No alcanza con que los
     strings sean distintos: once strings distintos pueden ser once colores
     casi iguales, que es lo que ya falló con la rampa monocroma. Se mide la
     distancia perceptual real en Oklab de lo que se pinta. */
  const labDe = async (sel, prop) => js(`(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    return [...document.querySelectorAll(${JSON.stringify(sel)})].map((el) => {
      cx.clearRect(0, 0, 1, 1); cx.fillStyle = getComputedStyle(el)[${JSON.stringify(prop)}]; cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; });
  })()`);
  const aLab = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const [R, G, B] = [f(r), f(g), f(b)];
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const q = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * q,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * q,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * q];
  };
  const croma = ([, a, b]) => Math.hypot(a, b);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const gajos = (await labDe('.fw-donut__seg', 'stroke')).map(aLab);
  ok('los gajos del donut tienen color', gajos.length > 0 && gajos.some((g) => croma(g) > 0.05),
    gajos.map((g) => croma(g).toFixed(3)).join(' '));
  const leyenda = (await labDe('.fw-legend__item .fw-dot', 'backgroundColor')).map(aLab);
  ok('la leyenda repite el color de su gajo, en el mismo orden',
    leyenda.length === gajos.length && leyenda.every((c, i) => dist(c, gajos[i]) < 0.01));

  console.log('\n3b. Tendencia por categoría');
  const tr = await js(`(() => {
    const series = [...document.querySelectorAll('.fw-trend__serie')];
    return {
      chips: document.querySelectorAll('.fw-tcat').length,
      series: series.length,
      on: series.filter((g) => !g.classList.contains('is-off')).length,
      meses: document.querySelectorAll('#trend-svg .fw-bar-month').length,
    }; })()`);
  ok('un chip y una línea por categoría con gasto', tr.chips === 3 && tr.series === 3, JSON.stringify(tr));
  ok('arranca con todas prendidas', tr.on === 3, JSON.stringify(tr));
  ok('y muestra 6 meses', tr.meses === 6, JSON.stringify(tr));
  const alturaDe = (cat) => js(`parseFloat(getComputedStyle(document.querySelector('.fw-trend__serie[data-cat="${cat}"] .fw-trend__pt:last-of-type')).cy)`);
  const piso = await js(`Number(document.querySelector('#trend-svg .fw-axis').getAttribute('y1'))`);
  // Doble click deja SOLO esa: las demás bajan al piso y se apagan, y la
  // escala se rehace sobre ella — su punto del mes queda arriba de todo.
  await js(`document.querySelector('.fw-tcat[data-cat="transporte"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await sleep(800);
  const solo = await js(`[...document.querySelectorAll('.fw-trend__serie')].filter((g) => !g.classList.contains('is-off')).map((g) => g.dataset.cat)`);
  ok('doble click en un chip deja solo esa categoría', solo.length === 1 && solo[0] === 'transporte', JSON.stringify(solo));
  ok('la escala se rehace sobre ella (llega al techo)', (await alturaDe('transporte')) < 30, String(await alturaDe('transporte')));
  ok('las apagadas bajan al piso', Math.abs((await alturaDe('comida')) - piso) < 1, `${await alturaDe('comida')} vs ${piso}`);
  await click('.fw-tcat[data-cat="comida"]');
  await sleep(700);
  ok('un click prende otra más', (await js(`document.querySelectorAll('.fw-tcat.is-on').length`)) === 2);
  await click('#trend-all');   // con dos de tres, «Todas»
  await sleep(200);
  ok('«Todas» prende todas', (await js(`document.querySelectorAll('.fw-tcat.is-on').length`)) === 3);
  await click('#trend-all');   // y ahora dice «Ninguna»
  await sleep(500);
  ok('«Ninguna» las apaga y avisa', (await js(`document.querySelectorAll('.fw-tcat.is-on').length`)) === 0
    && (await js(`document.querySelector('#trend-none').classList.contains('is-open')`)));
  await click('#trend-all');
  await click('#trend-range [data-value="12"]');
  await sleep(600);
  ok('el rango de 12 meses repinta solo la tendencia',
    (await js(`document.querySelectorAll('#trend-svg .fw-bar-month').length`)) === 12
    && (await js(`document.querySelectorAll('.fw-donut__seg').length`)) === 2);
  // El tooltip: pasar el mouse por el último mes lo abre DENTRO de la card.
  await js(`document.querySelector('#trend-card').scrollIntoView({ block: 'end' })`);
  await sleep(300);
  const svgR = await rect('#trend-svg');
  win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(svgR.right - 30), y: Math.round(svgR.y + svgR.h / 2) });
  await sleep(500);
  const tipR = await rect('#trend-tip');
  const cardR = await rect('#trend-card');
  ok('el tooltip del mes se abre y cae dentro de la card',
    (await js(`document.querySelector('#trend-tip').classList.contains('is-open')`)) && tipR.x >= cardR.x && tipR.right <= cardR.right + 1,
    JSON.stringify({ tipR, cardR }));
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 5, y: 5 });
  await click('#trend-range [data-value="6"]');

  await click('[data-view="movimientos"]');
  await sleep(700);
  ok('están los once chips de categoría', (await js(`document.querySelectorAll('#qa-cats .fw-cat-btn').length`)) === 11);
  const puntos = (await labDe('#qa-cats .fw-cat-btn .fw-dot', 'backgroundColor')).map(aLab);
  let minima = Infinity;
  puntos.forEach((a, i) => puntos.forEach((b, j) => { if (j > i) minima = Math.min(minima, dist(a, b)); }));
  ok(`el abanico separa a todas las categorías (mínima ${minima.toFixed(3)} ≥ 0.09)`, puntos.length === 11 && minima >= 0.09);
  const sem = (await js(`(() => { const cs = getComputedStyle(document.documentElement);
    const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d');
    return ['--fw-in', '--fw-out'].map((v) => { cx.fillStyle = cs.getPropertyValue(v); cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }); })()`)).map(aLab);
  const contraPar = Math.min(...puntos.flatMap((p) => sem.map((q) => dist(p, q))));
  ok(`y ninguna se confunde con el verde o el rojo (mínima ${contraPar.toFixed(3)} ≥ 0.08)`, contraPar >= 0.08);
  ok('la tabla pinta el puntito de su categoría', await js(`!!document.querySelector('#mv-rows .fw-cat .fw-dot')`));

  /* Las cifras NO cambian de color con el signo (17 sep 2026): el balance da
     positivo este mes y negativo el anterior —el anterior tiene un gasto y
     ningún ingreso— y tiene que verse con la misma tinta en los dos. */
  await click('[data-view="resumen"]');
  await sleep(800);
  ok('los KPIs son cifras sueltas de Onyx, sin tarjeta',
    await js(`[...document.querySelectorAll('.fw-kpi')].every((k) => getComputedStyle(k).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(k).boxShadow === 'none')`));
  const valorBal = () => js(`getComputedStyle(document.querySelector('.fw-kpi--bal .ox-stat__value')).color`);
  const balPos = await valorBal();
  await click('[data-month="-1"]');
  await sleep(800);
  const balNeg = await valorBal();
  ok('con balance negativo la cifra NO cambia de color', balNeg === balPos, `${balPos} -> ${balNeg}`);
  const textoPrim = await js(`(() => { const p = document.createElement('span'); p.style.color = 'var(--ox-text)';
    document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; })()`);
  ok('y es el texto primario de Onyx, no el par verde/rojo', balNeg === textoPrim, `${balNeg} vs ${textoPrim}`);
  /* Ninguna cifra de la app se tiñe: ni los otros KPIs, ni los montos de la
     lista, ni el campo de carga. El croma lo mide el mismo lector de siempre. */
  const cifras = await js(`(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const leer = (c) => { cx.clearRect(0,0,1,1); cx.fillStyle = c; cx.fillRect(0,0,1,1);
      const d = cx.getImageData(0,0,1,1).data; return [d[0], d[1], d[2]]; };
    return [...document.querySelectorAll('.fw-kpi .ox-stat__value, .fw-amount, .fw-readout__in, .fw-readout__out, .fw-readout__net, .fw-amountfield__input')]
      .map((e) => leer(getComputedStyle(e).color));
  })()`);
  const gris = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) < 12;
  ok(`las ${cifras.length} cifras a la vista son neutras`, cifras.length > 0 && cifras.every(gris),
    JSON.stringify(cifras.filter((c) => !gris(c))));
  await click('[data-month="hoy"]');
  await sleep(800);

  console.log('\n3-bis. El par verde/rojo: parejo entre sí y legible');
  /* El par es el protagonista de la app, así que tiene dos obligaciones que un
     color decorativo no tiene: pesar IGUAL entre sí —si no, la pantalla se
     inclina para un lado— y leerse al tamaño en que se lo usa. */
  const par = await js(`(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const leer = (c) => { cx.clearRect(0,0,1,1); cx.fillStyle = c; cx.fillRect(0,0,1,1);
      const d = cx.getImageData(0,0,1,1).data; return [d[0], d[1], d[2]]; };
    const cs = getComputedStyle(document.documentElement);
    const t = (n) => leer(cs.getPropertyValue(n));
    return { in: t('--fw-in'), out: t('--fw-out'), bg: t('--ox-bg'), s2: t('--ox-s2') };
  })()`);

  const relL = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contraste = (a, b) => {
    const [x, y] = [relL(a), relL(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  /* Pesar igual = misma luminancia. No se comparan las cromas: en sRGB el verde
     no llega tan lejos como el rojo, y exigir el mismo número dejaría el verde
     apagado — el emparejado es por porcentaje del techo de cada matiz. */
  const dif = Math.abs(relL(par.in) - relL(par.out));
  ok(`el verde y el rojo pesan lo mismo (luminancias a ${dif.toFixed(3)})`, dif < 0.06,
    `verde ${relL(par.in).toFixed(3)} · rojo ${relL(par.out).toFixed(3)}`);

  /* El par vive solo en masas y trazos del gráfico —barras, línea, leyendas—,
     nunca en texto chico: le alcanza con 3:1 contra la card. */
  for (const [nombre, color] of [['rojo', par.out], ['verde', par.in]]) {
    const c = contraste(color, par.s2);
    ok(`el ${nombre} se lee sobre la card (${c.toFixed(2)}:1)`, c >= 3);
  }

  console.log('\n4. Las dos vistas montan y quedan activas en el rail');
  for (const v of ['movimientos', 'resumen', 'movimientos']) {
    await click(`[data-view="${v}"]`);
    await sleep(600);
    const hijos = await js(`document.getElementById('view').children.length`);
    const activo = await js(`!!document.querySelector('[data-view="${v}"].is-active')`);
    ok(`${v}: pinta y se ilumina`, hijos > 0 && activo, `hijos=${hijos} activo=${activo}`);
  }

  console.log('\n5. Cargar un movimiento por la UI real: teclado → disco');
  ok('el inspector de carga está montado', dentro(await rect('#qa')));
  await js(`(() => { const i = document.getElementById('qa-amount');
    i.value = '4321,50'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await click('[data-cat="super"]');
  await js(`(() => { const n = document.getElementById('qa-note');
    n.value = 'cargado por el humo'; n.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await click('#qa-submit');
  await sleep(900);

  const guardado = await js(`window.fw.load().then(l => l.find(m => m.note === 'cargado por el humo') || null)`);
  ok('quedó en disco', !!guardado, JSON.stringify(guardado));
  ok('la coma decimal se guardó como 4321.5', guardado?.amount === 4321.5, String(guardado?.amount));
  ok('con la categoría elegida', guardado?.category === 'super', String(guardado?.category));
  ok('el toast avisa', dentro(await rect('.ox-toast')));
  ok('el campo de monto se vació para el siguiente', (await js(`document.getElementById('qa-amount').value`)) === '');
  ok('y se quedó con el foco', await js(`document.activeElement?.id === 'qa-amount'`),
    await js(`document.activeElement?.id || '(nada)'`));

  console.log('\n5-bis. El campo de monto: un solo anillo y un cursor blanco');
  /* El focus ring de base.css se dibuja alrededor del elemento enfocado, que
     acá es el <input> de adentro: quedaba el anillo blanco del sistema
     encerrado dentro del anillo magenta de la caja. Dos anillos concéntricos.

     Para verlo hay que llegar con el TECLADO y con un Tab de verdad: la
     heurística de :focus-visible solo mira eventos confiables, así que con un
     dispatchEvent o un .focus() programático el anillo nunca aparece y el
     arreglo parece bueno sin haberse probado. */
  await js(`document.querySelector('#qa-type [data-value="income"]').focus()`);
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
  // El box-shadow tiene transición: medir de inmediato devuelve el valor viejo.
  await sleep(500);
  const foco = await js(`(() => { const i = document.getElementById('qa-amount');
    if (document.activeElement !== i) return { llego: false };
    const s = getComputedStyle(i);
    const p = document.createElement('span'); p.style.color = 'var(--ox-text)';
    document.body.appendChild(p); const primario = getComputedStyle(p).color; p.remove();
    return { llego: true, focusVisible: i.matches(':focus-visible'),
             sombra: s.boxShadow, caret: s.caretColor, texto: s.color, primario }; })()`);
  ok('el Tab llega al campo de monto', foco.llego, JSON.stringify(foco));
  ok('el input NO dibuja su propio anillo adentro de la caja',
    foco.sombra === 'none', String(foco.sombra));

  /* Lo de arriba mide el estado en el que quedó el campo, y si Chromium no
     marcó este foco como "de teclado" (`focusVisible` abajo), entonces NO
     probó el caso que importa: el anillo de base.css se dibuja bajo
     :focus-visible. La modalidad depende de con qué se tocó la app por última
     vez y el test hace clicks antes de llegar acá, así que en vez de pelearle
     a la heurística se verifica la REGLA, que es determinista. */
  const reglaFoco = await js(`(() => {
    for (const hoja of document.styleSheets) {
      let reglas; try { reglas = hoja.cssRules; } catch { continue; }
      for (const r of reglas) {
        if (r.selectorText === '.fw-amountfield__input:focus-visible') return r.style.boxShadow;
      }
    }
    return null;
  })()`);
  ok('y hay una regla que se lo apaga cuando el foco viene del teclado',
    reglaFoco === 'none', `modalidad de este foco: ${foco.focusVisible ? 'teclado' : 'puntero'} · regla: ${reglaFoco}`);
  /* La caja es un .ox-input agrandado: hairline en reposo y, con el foco, el
     mismo anillo que cualquier campo de Onyx. */
  const caja = await js(`(() => { const s = getComputedStyle(document.getElementById('qa-amountfield'));
    return { sombra: s.boxShadow, fondo: s.backgroundColor }; })()`);
  ok('con el foco, la caja lleva el anillo de Onyx', /0px 0px 0px 3px/.test(caja.sombra), String(caja.sombra));
  /* Antes esto medía caret ≠ texto, porque la cifra se teñía según el tipo.
     Desde que las cifras son neutras los dos son el texto primario de Onyx, y
     lo que hay que custodiar es justamente eso: que ninguno de los dos vuelva
     a tomar el verde o el rojo. */
  ok('el cursor y la cifra son el texto primario, sin tinte del tipo',
    foco.caret === foco.primario && foco.texto === foco.primario,
    `caret=${foco.caret} texto=${foco.texto} primario=${foco.primario}`);
  await js(`document.getElementById('qa-amount').blur()`);
  await sleep(400);
  const sinFoco = await js(`getComputedStyle(document.getElementById('qa-amountfield')).boxShadow`);
  ok('y sin foco vuelve a su hairline, sin el anillo',
    sinFoco !== 'none' && !/0px 0px 0px 3px/.test(sinFoco), String(sinFoco));

  /* El botón de registrar es un botón común de Onyx: sin teclas adentro. La
     que estaba se leía como un segundo botón metido en el primero. */
  ok('el botón de registrar no lleva una tecla adentro',
    !(await js(`!!document.querySelector('#qa-submit .ox-kbd')`)));
  ok('pero el atajo sigue anunciado en su tooltip',
    (await js(`document.getElementById('qa-submit').dataset.tipKey`)) === 'Enter');

  console.log('\n6. El calendario aterriza DONDE se lo puede usar');
  await click('#qa-dp-field');
  await sleep(400);
  const pop = await rect('.fw-dp__pop');
  ok('el calendario abre', !!pop);
  ok('y cae entero dentro de la ventana', dentro(pop), JSON.stringify(pop));
  ok('se portalea al layer, fuera del scroll que lo recortaba',
    await js(`!!document.querySelector('#ox-layer .fw-dp__portal')`));
  /* El bug que motivó el portal: abriéndose hacia arriba tapaba el monto, las
     categorías y el banner — el formulario entero quedaba atrás. */
  const monto = await rect('#qa-amountfield');
  const tapa = !!pop && !!monto && pop.y < monto.bottom && pop.bottom > monto.y
            && pop.x < monto.right && pop.right > monto.x;
  ok('NO tapa el campo de monto', !tapa, `cal=${JSON.stringify(pop)} monto=${JSON.stringify(monto)}`);
  ok('tiene la grilla fija de 42 días', (await js(`document.querySelectorAll('.fw-dp__day').length`)) === 42);
  const hoyMarcado = await js(`document.querySelectorAll('.fw-dp__day.is-today').length`);
  ok('hoy está marcado una sola vez', hoyMarcado === 1, String(hoyMarcado));
  /* Hoy y el día elegido son el mismo al arrancar: si los dos estilos se
     pisaran, el amarillo de la selección con la tinta cyan de hoy encima queda
     ilegible. Gana la selección. */
  const hoySel = await js(`(() => { const d = document.querySelector('.fw-dp__day.is-today.is-selected');
    if (!d) return null; const s = getComputedStyle(d); return { sombra: s.boxShadow }; })()`);
  ok('el día que es hoy Y está elegido no lleva los dos estilos encimados',
    !hoySel || hoySel.sombra === 'none', JSON.stringify(hoySel));
  await tap('#qa-dp-field');
  await sleep(500);
  ok('y cierra', !(await js(`!!document.querySelector('.fw-dp__pop')`)));

  /* El portal vive afuera de la vista: si el inspector se repinta con el
     calendario abierto, tiene que irse con él y no quedar flotando. */
  await click('#qa-dp-field');
  await sleep(350);
  await click('#qa-type [data-value="income"]');
  await sleep(500);
  ok('repintar el inspector se lleva el calendario abierto',
    !(await js(`!!document.querySelector('#ox-layer .fw-dp__portal')`)));
  await click('#qa-type [data-value="expense"]');
  await sleep(400);

  console.log('\n7. Borrar pide confirmación propia, no un confirm() del sistema');
  await click('[data-del]');
  await sleep(600);
  const modal = await rect('.ox-modal');
  ok('el modal de confirmación abre', !!modal);
  ok('y cae entero dentro de la ventana', dentro(modal), JSON.stringify(modal));
  ok('el botón de borrar es el rojo macizo', await js(`!!document.querySelector('.ox-modal .ox-btn--danger-solid')`));
  const antes = await js(`window.fw.load().then(l => l.length)`);
  await click('.ox-modal .ox-btn--danger-solid');
  await sleep(900);
  const despues = await js(`window.fw.load().then(l => l.length)`);
  ok('confirmar borra exactamente uno', despues === antes - 1, `${antes} → ${despues}`);
  ok('el modal se fue', !(await js(`!!document.querySelector('.ox-modal')`)));

  console.log('\n7-bis. El menú contextual de la fila');
  /* Menu.show() le da al menú como mínimo el ancho de su ancla. Anclado al
     <tr> —que ocupa toda la tabla— salía de 688px y se iba de la ventana; por
     eso el contextual se ancla a un punto de 0×0 donde está el mouse. */
  await js(`(() => { const tr = document.querySelector('.ox-tr');
    tr.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 400, clientY: 300 })); })()`);
  await sleep(600);
  const menu = await rect('.ox-menu');
  ok('el menú abre', !!menu);
  ok('y cae entero dentro de la ventana', dentro(menu), JSON.stringify(menu));
  ok('no se estira al ancho de la fila', !!menu && menu.w < 300, `ancho=${menu?.w}`);
  await escape();
  await sleep(400);
  ok('Escape lo cierra', !(await js(`!!document.querySelector('.ox-menu:not([data-state="closing"])')`)));

  /* Y navegar también. Con el mouse el menú se cierra solo —el pointerdown cae
     afuera— pero por teclado o por un atajo quedaba flotando sobre una vista
     que ya no es la suya. */
  await js(`(() => { const tr = document.querySelector('.ox-tr');
    tr.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 400, clientY: 300 })); })()`);
  await sleep(500);
  await click('[data-view="resumen"]');
  await sleep(700);
  ok('cambiar de vista también lo cierra',
    !(await js(`!!document.querySelector('.ox-menu:not([data-state="closing"])')`)));
  await click('[data-view="movimientos"]');
  await sleep(700);

  console.log('\n7-ter. El respaldo se lleva TODO, no el mes en pantalla');
  /* El mes actual tiene 3 movimientos sembrados (uno se cargó y otro se borró
     más arriba) y el anterior tiene 1. El respaldo tiene que traer los dos
     meses: si alguien lo hiciera sobre la lista filtrada que se está viendo,
     este número sería menor y el archivo mentiría. */
  ok('se pudo interceptar el diálogo de guardar', dialogoInterceptado,
    'sin esto el test abriría el diálogo real y se colgaría');
  const enDisco = await js(`window.fw.load().then((l) => l.length)`);
  if (!dialogoInterceptado) { fail++; console.log('  FALLA se saltea el resto del respaldo'); }
  else {
  await click('#mv-export');
  await sleep(600);
  const items = await js(`[...document.querySelectorAll('.ox-menuitem')].map((b) => b.textContent.trim())`);
  ok('el botón de exportar ofrece las dos salidas', items.length === 2, items.join(' | '));
  ok('y dice cuántos se lleva cada una', items.some((t) => t.includes(String(enDisco))), items.join(' | '));
  await js(`[...document.querySelectorAll('.ox-menuitem')].find((b) => /respaldo/i.test(b.textContent)).click()`);
  await sleep(900);

  ok('el archivo quedó escrito', fs.existsSync(destinoBackup));
  const guardado = JSON.parse(fs.readFileSync(destinoBackup, 'utf8'));
  ok('se declara como respaldo de Finway', guardado.format === 'finway/backup', String(guardado.format));
  ok('trae TODOS los movimientos del disco', guardado.moves.length === enDisco,
    `${guardado.moves.length} en el archivo · ${enDisco} en disco`);
  ok('y más de un mes', new Set(guardado.moves.map((m) => m.date.slice(0, 7))).size > 1,
    [...new Set(guardado.moves.map((m) => m.date.slice(0, 7)))].join(', '));
  ok('el toast lo confirma', dentro(await rect('.ox-toast')));
  }

  console.log('\n8. Filtro y navegación de mes');
  await click('#mv-filter [data-value="income"]');
  await sleep(500);
  const filas = await js(`document.querySelectorAll('#mv-rows .ox-tr').length`);
  ok('el filtro de ingresos deja solo ingresos', filas === 1, String(filas));
  await click('#mv-filter [data-value="all"]');
  await sleep(400);

  const mesAntes = await js(`document.querySelector('.ox-viewhead__title').textContent.trim()`);
  await click('[data-month="-1"]');
  await sleep(700);
  const mesDespues = await js(`document.querySelector('.ox-viewhead__title').textContent.trim()`);
  ok('ir al mes anterior cambia el encabezado', mesAntes !== mesDespues, `${mesAntes} → ${mesDespues}`);
  ok('y la titlebar lo sigue',
    (await js(`document.getElementById('titlebar-context').textContent.trim()`)) === mesDespues);
  ok('aparece el botón Hoy al salir del mes actual', await js(`!!document.querySelector('[data-month="hoy"]')`));
  await click('[data-month="hoy"]');
  await sleep(700);
  ok('y volver a Hoy lo esconde de nuevo', !(await js(`!!document.querySelector('[data-month="hoy"]')`)));

  console.log('\n9. Estado vacío');
  for (let i = 0; i < 14; i++) await click('[data-month="-1"]');
  await sleep(900);
  ok('un mes sin movimientos muestra el vacío, no una tabla pelada',
    await js(`!!document.querySelector('.ox-empty')`));
  ok('el vacío trae la marca apagada', await js(`!!document.querySelector('.fw-mark--dim')`));
  await click('[data-month="hoy"]');
  await sleep(700);

  console.log('\n9-bis. Ajustes: traer los datos de la app anterior');
  /* El motivo por el que esta app existe: mudarse desde FinWatch sin perder
     nada. Se prueba por la UI real —vista, botón, diálogo, modal— y no
     llamando al importador de costado, porque el camino es lo que falla. */
  await click('[data-view="ajustes"]');
  await sleep(800);
  ok('la vista de ajustes monta', (await js(`document.querySelectorAll('.ox-section').length`)) >= 2);
  const totalAntes = await js(`window.fw.load().then((l) => l.length)`);
  ok('dice cuántos movimientos hay',
    await js(`[...document.querySelectorAll('.ox-kv__v')].some((v) => v.textContent.trim() === '${totalAntes}')`),
    String(totalAntes));
  ok('muestra la carpeta de datos', await js(`!!document.querySelector('.ox-kv__v.ox-mono[data-tip]')`));

  ok('se pudo interceptar el diálogo de abrir', abrirInterceptado);
  if (abrirInterceptado) {
    await click('#aj-importar');
    await sleep(1300);
    const modalImp = await rect('.ox-modal');
    ok('el resumen del import abre en un modal', !!modalImp && dentro(modalImp), JSON.stringify(modalImp));
    const resumen = await js(`document.querySelector('.ox-modal')?.textContent || ''`);
    ok('dice de qué app vino', /FinWatch/.test(resumen), resumen.slice(0, 140));
    await click('.ox-modal .ox-btn--primary');
    await sleep(800);

    const totalDespues = await js(`window.fw.load().then((l) => l.length)`);
    ok('entraron los dos válidos', totalDespues === totalAntes + 2, `${totalAntes} → ${totalDespues}`);
    ok('la fila inválida NO entró', totalDespues !== totalAntes + 3);
    ok('y son los de FinWatch',
      await js(`window.fw.load().then((l) => l.some((m) => m.note === 'viene de FinWatch'))`));

    /* Importar dos veces el mismo archivo es un error humano corriente y no
       puede terminar en movimientos duplicados. */
    await click('#aj-importar');
    await sleep(1300);
    const r2 = await js(`document.querySelector('.ox-modal')?.textContent || ''`);
    ok('reimportar avisa que no entró nada nuevo', /No entró nada nuevo/.test(r2), r2.slice(0, 140));
    await click('.ox-modal .ox-btn--primary');
    await sleep(700);
    ok('y el total no se movió',
      (await js(`window.fw.load().then((l) => l.length)`)) === totalDespues, String(totalDespues));
  }
  console.log('\n9-ter. Calculadora: filas a mano y su suma');
  await click('[data-view="calculadora"]');
  await sleep(800);
  ok('la calculadora monta con tres filas vacías', (await js(`document.querySelectorAll('.fw-calc__row').length`)) === 3);
  const escribir = (i, campo, valor) => js(`(() => {
    const el = document.querySelectorAll('.fw-calc__row')[${i}].querySelector('[data-campo="${campo}"]');
    el.focus(); el.value = ${JSON.stringify(valor)};
    el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  // fmtARS separa el $ con un espacio fino (U+2009): se normaliza para comparar.
  const totalCalc = (n = 0) => js(`document.querySelectorAll('.fw-calc__total')[${n}].textContent.replace(/\\s/g, ' ')`);

  await escribir(0, 'concepto', 'Alquiler');
  await escribir(0, 'monto', '250.000');
  await escribir(1, 'monto', '1.234,50');
  await escribir(2, 'monto', '15500');
  ok('suma los formatos que acepta la carga ($ 266.734,5)', (await totalCalc()) === '$ 266.734,5', await totalCalc());

  await escribir(2, 'monto', 'quince mil');
  ok('un monto que no se entiende no suma', (await totalCalc()) === '$ 251.234,5', await totalCalc());
  ok('y queda marcado en la fila', await js(`document.querySelectorAll('.fw-calc__input.is-invalid').length === 1`));
  ok('y el pie lo dice', /sin entender/.test(await js(`document.querySelector('.fw-calc__detalle').textContent`)));
  await escribir(2, 'monto', '15500');

  /* Enter en el último monto agrega una fila y deja el cursor ahí: es lo que
     permite cargar una lista larga sin tocar el mouse. Tecla REAL, no un
     evento sintético, para probar el camino que usa Fran. */
  await js(`document.querySelectorAll('.fw-calc__row')[2].querySelector('[data-campo="monto"]').focus()`);
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  await sleep(500);
  ok('Enter en el último monto agrega una fila', (await js(`document.querySelectorAll('.fw-calc__row').length`)) === 4);
  ok('y el cursor queda en su concepto',
    await js(`document.activeElement === document.querySelectorAll('.fw-calc__row')[3].querySelector('[data-campo="concepto"]')`));

  const filasAntes = await js(`document.querySelectorAll('.fw-calc__row').length`);
  await click('.fw-calc__row:nth-child(2) [data-borrar]');
  await sleep(500);
  ok('borrar una fila la saca (con su salida animada)',
    (await js(`document.querySelectorAll('.fw-calc__row').length`)) === filasAntes - 1);
  ok('y el total la descuenta', (await totalCalc()) === '$ 265.500', await totalCalc());

  /* Irse de la vista guarda lo pendiente sin esperar la demora, y la vuelta
     trae lo mismo. Volver es también lo que delata un listener duplicado: un
     click en «Agregar fila» tiene que agregar UNA. */
  await click('[data-view="resumen"]');
  await sleep(600);
  const calcEnDisco = JSON.parse(fs.readFileSync(path.join(tmp, 'calculadora.json'), 'utf8'));
  const filasEnDisco = calcEnDisco.calculadoras?.[0]?.filas;
  ok('se guardó en calculadora.json al salir', filasEnDisco?.length === 3, JSON.stringify(calcEnDisco).slice(0, 160));
  ok('el monto se guarda como se escribió', filasEnDisco?.[0]?.monto === '250.000', filasEnDisco?.[0]?.monto);
  ok('y no tocó los movimientos',
    !(await js(`window.fw.load().then((l) => l.some((m) => /Alquiler/.test(m.note || '')))`)));
  await click('[data-view="calculadora"]');
  await sleep(700);
  ok('al volver están las mismas filas', (await totalCalc()) === '$ 265.500', await totalCalc());
  const n0 = await js(`document.querySelectorAll('.fw-calc__row').length`);
  await click('.fw-calc__agregar');
  await sleep(300);
  ok('«Agregar fila» agrega una sola tras volver a la vista',
    (await js(`document.querySelectorAll('.fw-calc__row').length`)) === n0 + 1);
  const filaR = await rect('.fw-calc__row:last-child');
  ok('la fila nueva cae dentro de la ventana', dentro(filaR), JSON.stringify(filaR));

  /* Copiar deja la tabla en el portapapeles separada por tabs: solo lo
     cargado, con encabezado y total. */
  /* El portapapeles es el del sistema y sobrevive entre corridas: se vacía
     antes y se espera a que llegue lo nuevo, que la escritura es asíncrona.
     Windows guarda los saltos como \r\n. */
  const copiarYLeer = async () => {
    clipboard.writeText('');
    await click('.fw-calc__copiar');
    for (let i = 0; i < 20 && !clipboard.readText(); i++) await sleep(100);
    return clipboard.readText().replace(/\r\n/g, '\n');
  };
  const copiado = await copiarYLeer();
  ok('«Copiar» deja la tabla en el portapapeles',
    copiado === 'Concepto\tMonto\nAlquiler\t250.000\n\t15500\nTotal\t$ 265.500', JSON.stringify(copiado));

  /* El título es opcional: vacío, el placeholder la nombra por su lugar; con
     texto, se guarda y encabeza la tabla copiada. */
  ok('sin título, se llama por su lugar',
    (await js(`document.querySelector('.fw-calc__titulo').placeholder`)) === 'Calculadora 1');
  await js(`(() => { const el = document.querySelector('.fw-calc__titulo');
    el.focus(); el.value = 'Mudanza'; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const copiadoConTitulo = await copiarYLeer();
  ok('el título encabeza la tabla copiada',
    copiadoConTitulo.startsWith('Mudanza\nConcepto\tMonto\n'), JSON.stringify(copiadoConTitulo));

  /* Hasta cuatro calculadoras, cada una con su propia cuenta. */
  ok('con una sola, la X de cerrar no está a mano',
    await js(`getComputedStyle(document.querySelector('.fw-calc__cerrar')).visibility === 'hidden'`));
  for (let i = 0; i < 3; i++) { await click('#calc-nueva'); await sleep(300); }
  ok('se abren hasta cuatro calculadoras', (await js(`document.querySelectorAll('.fw-calc').length`)) === 4);
  ok('y en la cuarta el botón se deshabilita', await js(`document.getElementById('calc-nueva').disabled`));
  ok('las nuevas se nombran por su lugar, la titulada conserva el suyo',
    (await js(`[...document.querySelectorAll('.fw-calc__titulo')].map((n) => n.value || n.placeholder).join('|')`))
      === 'Mudanza|Calculadora 2|Calculadora 3|Calculadora 4');
  await js(`(() => {
    const el = document.querySelectorAll('.fw-calc')[1].querySelector('[data-campo="monto"]');
    el.focus(); el.value = '1000'; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  ok('la segunda suma aparte', (await totalCalc(1)) === '$ 1.000', await totalCalc(1));
  ok('y la primera no se mueve', (await totalCalc(0)) === '$ 265.500', await totalCalc(0));

  await click('.fw-calc:nth-child(4) .fw-calc__cerrar');
  await sleep(500);
  ok('cerrar una vacía no pregunta', (await js(`document.querySelectorAll('.fw-calc').length`)) === 3
    && !(await js(`!!document.querySelector('.ox-modal')`)));
  ok('y el botón vuelve a estar disponible', !(await js(`document.getElementById('calc-nueva').disabled`)));
  await click('.fw-calc:nth-child(2) .fw-calc__cerrar');
  await sleep(600);
  ok('cerrar una con datos pide confirmación', dentro(await rect('.ox-modal')));
  await click('.ox-modal .ox-btn--danger-solid');
  await sleep(800);
  ok('y se va, dejando las demás', (await js(`document.querySelectorAll('.fw-calc').length`)) === 2
    && (await totalCalc(0)) === '$ 265.500', await totalCalc(0));
  await click('.fw-calc:nth-child(2) .fw-calc__cerrar');
  await sleep(600);
  ok('queda una sola y sin X', (await js(`document.querySelectorAll('.fw-calc').length`)) === 1);

  await click('[data-view="resumen"]');
  await sleep(600);
  const calcsEnDisco = JSON.parse(fs.readFileSync(path.join(tmp, 'calculadora.json'), 'utf8')).calculadoras;
  ok('en disco queda una sola calculadora, con su título',
    calcsEnDisco?.length === 1 && calcsEnDisco[0].titulo === 'Mudanza', JSON.stringify(calcsEnDisco).slice(0, 160));
  await click('[data-view="calculadora"]');
  await sleep(700);

  await click('.fw-calc__vaciar');
  await sleep(600);
  ok('vaciar pide confirmación', dentro(await rect('.ox-modal')));
  await click('.ox-modal .ox-btn--danger-solid');
  await sleep(800);
  ok('y deja tres filas vacías en $ 0', (await js(`document.querySelectorAll('.fw-calc__row').length`)) === 3
    && (await totalCalc()) === '$ 0', await totalCalc());

  await click('[data-view="movimientos"]');
  await sleep(700);

  console.log('\n9-quater. El encabezado de la tabla queda clavado arriba');
  /* El th sticky se enganchaba al borde del CONTENIDO del scroller, debajo del
     padding del esfumado: al scrollear bajaba con la tabla y las filas pasaban
     por el hueco de arriba, por encima de los títulos. Con los datos del humo
     la tabla no scrollea, así que se clonan filas solo en el DOM. */
  const clavado = await js(`(async () => {
    const body = document.getElementById('mv-rows');
    const fila = body.querySelector('.ox-tr');
    for (let i = 0; i < 60; i++) body.appendChild(fila.cloneNode(true));
    const sc = body.closest('.ox-scroll');
    const th = sc.querySelector('th');
    const antes = th.getBoundingClientRect().top;
    sc.scrollTop = 400;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const caja = sc.getBoundingClientRect().top;
    const t = th.getBoundingClientRect();
    const asoman = [...body.querySelectorAll('.ox-tr')].filter((f) => {
      // Lo que se VE de la fila entre el borde del scroll y los títulos.
      const r = f.getBoundingClientRect(); return Math.min(r.bottom, t.top) - Math.max(r.top, caja) > 1; }).length;
    const res = { antes, despues: t.top, caja, asoman, scrolleo: sc.scrollTop };
    sc.scrollTop = 0;
    return res;
  })()`);
  ok('la tabla de verdad scrolleó', clavado.scrolleo > 0, JSON.stringify(clavado));
  ok('el encabezado no se movió al scrollear', Math.abs(clavado.antes - clavado.despues) < 1, JSON.stringify(clavado));
  ok('y está pegado al borde de arriba del scroll', Math.abs(clavado.despues - clavado.caja) < 1, JSON.stringify(clavado));
  ok('ninguna fila asoma por encima de los títulos', clavado.asoman === 0, JSON.stringify(clavado));
  await click('[data-view="resumen"]');
  await sleep(500);
  await click('[data-view="movimientos"]');
  await sleep(700);

  console.log('\n10. Nada nativo de Chromium, nada de glifos');
  ok('ningún title= nativo', (await js(`document.querySelectorAll('[title]').length`)) === 0,
    await js(`[...document.querySelectorAll('[title]')].map(e => e.tagName).join(', ')`));

  /* base.css resetea el padding de fábrica del <button> pero no su background:
     sin `color-scheme` declarado, un botón que no declara el suyo hereda
     `buttonface` —rgb(240,240,240), el gris del tema claro de Windows— y se
     pinta un cuadradito claro en una app que es solo oscura. No se ve en el
     DOM ni en el HTML: hay que medir el estilo computado. Pasó con cada día
     del calendario. Se permiten los claros a propósito: el botón primario
     lleva el acento, que en esta paleta ES la luz. */
  // Con el calendario abierto: sus 42 días son botones y fue donde apareció.
  await click('#qa-dp-field');
  await sleep(450);
  const fondosUA = await js(`(() => {
    const permitidos = /ox-btn--primary|ox-btn--danger-solid|fw-cat-btn|ox-segmented__opt|ox-switch|ox-check|ox-slider/;
    return [...document.querySelectorAll('button')]
      .filter((b) => !permitidos.test(b.className))
      .map((b) => ({ id: b.className || b.id || 'button', bg: getComputedStyle(b).backgroundColor }))
      .filter((x) => x.bg === 'rgb(240, 240, 240)')
      .map((x) => x.id);
  })()`);
  ok('ningún botón heredó el fondo de fábrica de Chromium',
    fondosUA.length === 0, [...new Set(fondosUA)].join(' | '));

  /* El gemelo del anterior: Chromium también le da a todo <button> un
     `border: 2px outset`. Salía como un reborde biselado alrededor de cada
     chip de categoría y del campo de fecha. */
  const bordesUA = await js(`(() => [...document.querySelectorAll('button')]
    .filter((b) => getComputedStyle(b).borderStyle === 'outset')
    .map((b) => b.className || b.id || 'button'))()`);
  ok('ningún botón heredó el borde de fábrica de Chromium',
    bordesUA.length === 0, [...new Set(bordesUA)].join(' | '));
  ok('y el barrido incluyó los días del calendario',
    (await js(`document.querySelectorAll('.fw-dp__day').length`)) === 42);
  await tap('#qa-dp-field');
  await sleep(400);
  /* Todo símbolo es un SVG propio. Se permiten los tipográficos que SÍ son
     texto: el menos real (−), el separador (·) y las comillas. */
  const glifos = await js(`(() => {
    const malos = /[\\u2190-\\u21FF\\u2700-\\u27BF\\u2B00-\\u2BFF\\uFE0F\\u2600-\\u26FF]|[\\uD83C-\\uDBFF][\\uDC00-\\uDFFF]/;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const out = [];
    while (w.nextNode()) { const t = w.currentNode.nodeValue; if (malos.test(t)) out.push(t.trim().slice(0, 40)); }
    return out;
  })()`);
  ok('cero emojis y cero flechas unicode en la UI', glifos.length === 0, glifos.join(' | '));

  console.log('\n11. El esfumado del scroll, lado por lado');
  /* La vista corta al aire arriba (contra el encabezado) pero abajo muere
     contra la línea de la statusbar: ese lado NO lleva fade. */
  await click('[data-view="resumen"]');
  await sleep(700);
  const mask = await js(`getComputedStyle(document.querySelector('.ox-main > .ox-scroll')).maskImage`);
  ok('la vista con scroll tiene máscara', mask && mask !== 'none', String(mask));
  const fadeBottom = await js(`getComputedStyle(document.querySelector('.ox-main > .ox-scroll')).getPropertyValue('--ox-fade-bottom').trim()`);
  ok('y el lado de abajo está apagado (lo cierra la statusbar)', fadeBottom === '0px', `"${fadeBottom}"`);

  console.log('\n12. La consola quedó limpia');
  ok('sin errores ni warnings del renderer', errores.length === 0, errores.slice(0, 6).join(' | '));

  /* Electron todavía tiene tomado el userData (Cache, Local Storage, el
     lockfile de la sesión), así que borrarlo acá da EPERM en Windows. No es
     una falla del test: el directorio es temporal y lo limpia el sistema. */
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* lo tiene Electron */ }
  console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
  app.exit(fail ? 1 : 0);
});
