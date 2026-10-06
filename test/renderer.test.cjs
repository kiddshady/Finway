/* ═══════════════════════════════════════════════════════════════════════════
   Humo del renderer: monta la app de verdad y la recorre, como la usa una
   persona: con las teclas de función, la línea de carga y el mouse.

   Se corre con `npm run smoke` (necesita Electron, por eso no está en el
   `npm test`, que es node pelado).

   Lo que busca es lo que un test de unidad NO ve: pantallas que no montan,
   overlays que aterrizan fuera de la ventana, gráficos sin geometría, un
   movimiento que se "guarda" y no llega al disco, glifos unicode colados. La
   regla que lo guía: **medí dónde CAE una cosa, no solo si existe**.

   Corre contra un directorio de datos temporal (FINWAY_DATA): nunca toca los
   datos reales.
   ═══════════════════════════════════════════════════════════════════════════ */

const { app, BrowserWindow } = require('electron');
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
setTimeout(() => bail('timeout de 150s'), 150000);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finway-smoke-'));
process.env.FINWAY_DATA = tmp;   // lo lee src/store.cjs al cargarse
app.setPath('userData', path.join(tmp, 'userData'));

const hoy = new Date();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 12);
const leerDoc = (n) => { try { return JSON.parse(fs.readFileSync(path.join(tmp, `${n}.json`), 'utf8')); } catch { return null; } };
const movs = () => leerDoc('movimientos')?.moves || [];

app.whenReady().then(async () => {
  const mov = require(path.join(ROOT, 'src', 'movimientos.cjs'));
  await mov.add({ type: 'expense', amount: 12500, date: ymd(hoy), category: 'comida', note: 'semilla comida' });
  await mov.add({ type: 'expense', amount: 8400, date: ymd(hoy), category: 'transporte', note: 'semilla nafta' });
  await mov.add({ type: 'income', amount: 300000, date: ymd(hoy), category: 'sueldo', note: 'semilla sueldo' });
  await mov.add({ type: 'expense', amount: 5000, date: ymd(mesPasado), category: 'salidas', note: 'semilla mes pasado' });

  /* Los diálogos nativos (guardar el respaldo, abrir uno para importar)
     bloquearían el test esperando un click: se les fija la respuesta antes de
     registrar los handlers, así se prueba todo el camino menos ese tramo. */
  const { dialog } = require('electron');
  const destinoBackup = path.join(tmp, 'respaldo-de-prueba.json');
  const guardarFalso = async () => ({ canceled: false, filePath: destinoBackup });
  try { Object.defineProperty(dialog, 'showSaveDialog', { value: guardarFalso, writable: true, configurable: true }); } catch { /* se verifica */ }
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
  try { Object.defineProperty(dialog, 'showOpenDialog', { value: abrirFalso, writable: true, configurable: true }); } catch { /* se verifica */ }

  require(path.join(ROOT, 'src', 'ipc.cjs')).register();

  const win = new BrowserWindow({
    x: -20000, y: -20000, width: W, height: H, useContentSize: true,
    frame: false, show: false, paintWhenInitiallyHidden: true, backgroundColor: '#000',
    webPreferences: {
      preload: path.join(ROOT, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      navigateOnDragDrop: false, backgroundThrottling: false,
    },
  });

  const errores = [];
  win.webContents.on('console-message', (e) => {
    const lvl = typeof e.level === 'number' ? e.level : { warning: 2, error: 3 }[e.level] ?? 0;
    if (lvl >= 2) errores.push(`${e.level}: ${e.message}`);
  });
  await win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  win.show();
  win.focus();
  await sleep(2200);

  const js = (c) => win.webContents.executeJavaScript(c);
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false; el.click(); return true; })()`);
  const rect = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null; const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right }; })()`);
  const dentro = (r) => !!r && r.w > 0 && r.h > 0 && r.x >= 0 && r.y >= 0 && r.right <= W + 1 && r.bottom <= H + 1;
  /* Las teclas van como teclas de verdad (sendInputEvent): así pasan por el
     mismo camino que las del usuario, foco incluido. */
  const tecla = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (keyCode.length === 1) win.webContents.sendInputEvent({ type: 'char', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await sleep(60);
  };
  const escribir = async (sel, texto) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false; el.focus(); el.value = ${JSON.stringify(texto)};
    el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const vista = () => js(`document.querySelector('.fw-fk__b.is-active')?.dataset.view`);
  const filasLibro = () => js(`document.querySelectorAll('#mov-filas .fw-ledger__r:not([data-state="closing"])').length`);

  console.log('\n1. Arranque');
  ok('el splash se fue', !(await js(`!!document.getElementById('boot-splash')`)));
  ok('el chasis está montado (titlebar, cinta, escenario, línea, teclas)',
    await js(`['.ox-titlebar', '.fw-tape', '#view', '.fw-cmd', '.fw-fk'].every((s) => !!document.querySelector(s))`));
  ok('los <i data-icon> se reemplazaron por SVG', !(await js(`!!document.querySelector('i[data-icon]')`)));
  ok('arranca en F1 Resumen', (await vista()) === 'resumen');
  ok('la marca está en la titlebar', dentro(await rect('#brand-mark svg')));
  ok('la cinta tiene cifras (y dobladas para el empalme)', (await js(`document.querySelectorAll('#tape .fw-tape__item').length`)) >= 10);
  ok('el reloj anda', /^\d\d:\d\d/.test(await js(`document.getElementById('clock').textContent`)));
  ok('VT323 está cargada', await js(`document.fonts.check('16px VT323')`));
  ok('el CRT arranca en suave', (await js(`document.documentElement.dataset.crt`)) === 'suave');
  ok('la capa CRT cubre la ventana sin tapar los clics',
    await js(`(() => { const c = document.querySelector('.fw-crt'); const s = getComputedStyle(c);
      return s.position === 'fixed' && s.pointerEvents === 'none' && +s.opacity > 0.9; })()`));
  const hex = await js(`(() => { const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ox-bg').trim(); c.fillRect(0,0,1,1);
    const d = c.getImageData(0,0,1,1).data; return '#' + [0,1,2].map((i) => d[i].toString(16).padStart(2,'0')).join(''); })()`);
  ok(`--ox-bg (${hex}) es el backgroundColor de la ventana (${BG_MAIN})`, hex === BG_MAIN);

  console.log('\n2. Las teclas de función');
  const pantallas = ['resumen', 'movimientos', 'presupuestos', 'metas', 'calculadora', 'ajustes'];
  for (let i = 0; i < pantallas.length; i++) {
    await tecla(`F${i + 1}`);
    await sleep(650);
    ok(`F${i + 1} → ${pantallas[i]}`, (await vista()) === pantallas[i]
      && (await js(`document.getElementById('crumb-view').textContent.trim()`)) === pantallas[i].toUpperCase());
  }
  ok('en Ajustes las migas no muestran mes', await js(`document.getElementById('crumb').classList.contains('is-sin-mes')`));
  await click('.fw-fk__b[data-view="resumen"]');
  await sleep(650);
  ok('un clic en la tecla también navega', (await vista()) === 'resumen');
  ok('en Resumen las migas muestran el mes', !(await js(`document.getElementById('crumb').classList.contains('is-sin-mes')`)));

  console.log('\n3. F1 Resumen');
  await sleep(900);
  const bal = await js(`document.getElementById('bal-big').textContent`);
  ok('el balance rodó hasta su valor (300.000 − 20.900)', bal === '279.100', bal);
  ok('una fila por categoría con gasto', (await js(`document.querySelectorAll('#res-cat-zone tbody tr').length`)) === 2);
  ok('los últimos movimientos del mes', (await js(`document.querySelectorAll('#res-feed li').length`)) === 3);
  ok('seis meses en el panel 05, con el actual elegido', await js(`document.querySelectorAll('.fw-mcol').length === 6 && !!document.querySelector('.fw-mcol.is-sel')`));
  const largo = await js(`document.querySelector('#dren-svg .fw-s--out')?.getTotalLength() || 0`);
  ok('la línea de gasto tiene trazo', largo > 5, String(largo));
  await js(`(() => { const h = document.getElementById('dren-hit'); const r = h.getBoundingClientRect();
    h.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.x + r.width * .4, clientY: r.y + r.height / 2 })); })()`);
  await sleep(300);
  ok('al pasar el mouse aparece la lectura del día', await js(`document.getElementById('dren-ro').classList.contains('is-on')`));
  ok('y cae adentro del panel', await js(`(() => { const a = document.getElementById('dren-ro').getBoundingClientRect(); const b = document.querySelector('.fw-res__dren').getBoundingClientRect();
    return a.x >= b.x - 1 && a.right <= b.right + 1 && a.y >= b.y; })()`));
  await click('.fw-dren__legend [data-s="in"]');
  await sleep(400);
  ok('apagar INGRESO esconde su línea', await js(`document.querySelector('#dren-svg .fw-s--in').classList.contains('is-off')`));
  await click('.fw-dren__legend [data-s="in"]');
  await click('#res-modo [data-modo="tendencia"]');
  await sleep(700);
  ok('el panel 03 pasa a TENDENCIA, con un chip por categoría', (await js(`document.querySelectorAll('.fw-tcat').length`)) >= 2);
  await click('#res-modo [data-modo="acumulado"]');
  await sleep(700);
  ok('y vuelve a ACUMULADO', await js(`!!document.getElementById('dren-svg')`));

  console.log('\n4. El mes');
  await tecla('Left');
  await sleep(1000);
  ok('← va al mes anterior', (await js(`document.querySelector('.fw-mcol.is-sel')?.dataset.ym`)) === ymd(mesPasado).slice(0, 7));
  ok('y el balance es el de ese mes', (await js(`document.getElementById('bal-big').textContent`)) === '−5.000',
    await js(`document.getElementById('bal-big').textContent`));
  await tecla('Home');
  await sleep(1000);
  ok('Inicio vuelve al mes de hoy', (await js(`document.querySelector('.fw-mcol.is-sel')?.dataset.ym`)) === ymd(hoy).slice(0, 7));

  console.log('\n5. La línea de carga');
  await tecla('/');
  await sleep(150);
  ok('/ la enfoca', (await js(`document.activeElement?.id`)) === 'cmd');
  await escribir('#cmd', 'gasto 4500 transp prueba humo');
  await sleep(200);
  const toks = await js(`[...document.querySelectorAll('#parse .fw-tok')].map((t) => t.classList.contains('is-ok') ? 1 : 0).join('')`);
  ok('se entiende mientras se escribe (tipo, monto, cat, nota, fecha)', toks === '11111', toks);
  const antes = movs().length;
  await tecla('Return');
  await sleep(900);
  ok('Enter lo guarda EN EL DISCO', movs().length === antes + 1
    && movs().some((m) => m.note === 'prueba humo' && m.amount === 4500 && m.category === 'transporte'), `${antes} → ${movs().length}`);
  ok('la línea queda vacía para el siguiente', (await js(`document.getElementById('cmd').value`)) === '');
  ok('el toast aparece adentro de la ventana', dentro(await rect('.ox-toast')));
  await escribir('#cmd', 'gasto uber');
  await tecla('Return');
  await sleep(250);
  ok('sin monto no guarda y la línea se sacude', movs().length === antes + 1
    && await js(`document.getElementById('cmd').classList.contains('is-shaking')`));
  await escribir('#cmd', '');
  await tecla('Up');
  await sleep(150);
  ok('↑ con la línea vacía trae la última que se guardó', (await js(`document.getElementById('cmd').value`)) === 'gasto 4500 transp prueba humo');
  await escribir('#cmd', '');
  await tecla('Escape');
  await sleep(200);

  console.log('\n6. F2 Movimientos');
  await tecla('F2');
  await sleep(900);
  ok('el libro tiene los movimientos del mes', (await filasLibro()) === 4, String(await filasLibro()));
  ok('con su saldo corrido', await js(`[...document.querySelectorAll('.fw-ledger__saldo')].every((td) => td.textContent.trim().length > 0)`));
  const sel0 = await js(`document.querySelector('.fw-ledger__r.is-sel')?.dataset.id`);
  await tecla('Down');
  await sleep(400);
  const sel1 = await js(`document.querySelector('.fw-ledger__r.is-sel')?.dataset.id`);
  ok('↓ elige el de abajo', !!sel0 && !!sel1 && sel0 !== sel1);
  ok('y el detalle habla de él', (await js(`document.querySelector('#mov-det-p .fw-p__m').textContent`)) === '2 DE 4');
  await tecla('g');
  await sleep(700);
  ok('G deja solo los gastos', (await filasLibro()) === 3, String(await filasLibro()));
  await tecla('t');
  await sleep(700);
  await click('#mov-cat');
  await sleep(500);
  ok('el menú de categorías cae adentro de la ventana', dentro(await rect('.ox-menu')));
  await js(`[...document.querySelectorAll('.ox-menuitem')].find((b) => /Comida/.test(b.textContent))?.click()`);
  await sleep(700);
  ok('elegir Comida filtra el libro', (await filasLibro()) === 1, String(await filasLibro()));
  ok('y el botón dice la categoría', /COMIDA/.test(await js(`document.getElementById('mov-cat').textContent`)));
  await click('#mov-cat');
  await sleep(450);
  await js(`[...document.querySelectorAll('.ox-menuitem')].find((b) => /Todas/.test(b.textContent))?.click()`);
  await sleep(600);
  await escribir('#mov-q', 'nafta');
  await sleep(700);
  ok('el filtro de texto busca en la nota', (await filasLibro()) === 1, String(await filasLibro()));
  await escribir('#mov-q', '');
  await sleep(700);
  await js(`document.activeElement.blur()`);

  // Editar: E abre el formulario con el movimiento cargado.
  await js(`[...document.querySelectorAll('.fw-ledger__r')].find((r) => /semilla nafta/.test(r.textContent))?.click()`);
  await sleep(300);
  await tecla('e');
  await sleep(700);
  ok('E abre el formulario del movimiento', await js(`!!document.querySelector('.ox-modal .fw-qa')`));
  ok('con su monto cargado', (await js(`document.getElementById('qa-amount')?.value`)) === '8400');
  ok('y el modal cae adentro de la ventana', dentro(await rect('.ox-modal')));
  await click('#qa-dp-field');
  await sleep(500);
  ok('el calendario abre adentro de la ventana', dentro(await rect('.fw-dp__pop')));
  ok('con su grilla fija de 42 días', (await js(`document.querySelectorAll('.fw-dp__day').length`)) === 42);
  const fondosUA = await js(`(() => [...document.querySelectorAll('button')]
    .map((b) => ({ id: b.className || b.id, bg: getComputedStyle(b).backgroundColor, border: getComputedStyle(b).borderStyle }))
    .filter((x) => x.bg === 'rgb(240, 240, 240)' || x.border === 'outset').map((x) => x.id))()`);
  ok('ningún botón heredó el fondo o el borde de fábrica de Chromium', fondosUA.length === 0, [...new Set(fondosUA)].join(' | '));
  await tecla('Escape');
  await sleep(400);
  ok('Esc cierra el calendario y el formulario sigue', !(await js(`!!document.querySelector('.fw-dp__pop')`)) && await js(`!!document.querySelector('.ox-modal')`));
  await escribir('#qa-amount', '9100');
  await tecla('Return');
  await sleep(1000);
  ok('Enter guarda la edición en el disco', movs().some((m) => m.note === 'semilla nafta' && m.amount === 9100));
  ok('y el modal se cerró', !(await js(`!!document.querySelector('.ox-modal')`)));

  // Borrar: Supr pide confirmación.
  await js(`[...document.querySelectorAll('.fw-ledger__r')].find((r) => /prueba humo/.test(r.textContent))?.click()`);
  await sleep(300);
  await tecla('Delete');
  await sleep(600);
  ok('Supr pide confirmación', /Borrar/.test(await js(`document.querySelector('.ox-modal__title')?.textContent || ''`)));
  await js(`[...document.querySelectorAll('.ox-modal__foot .ox-btn')].find((b) => /Borrar/i.test(b.textContent))?.click()`);
  await sleep(1000);
  ok('borrar lo saca del disco', !movs().some((m) => m.note === 'prueba humo'));
  ok('y del libro', (await filasLibro()) === 3, String(await filasLibro()));

  // El menú contextual de una fila.
  await js(`(() => { const r = document.querySelector('.fw-ledger__r'); const b = r.getBoundingClientRect();
    r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: b.x + 200, clientY: b.y + 10 })); })()`);
  await sleep(500);
  ok('el clic derecho abre el menú de la fila adentro de la ventana', dentro(await rect('.ox-menu')));
  await tecla('Escape');
  await sleep(400);

  // Exportar todo a un respaldo.
  await click('#mov-exp');
  await sleep(500);
  await js(`[...document.querySelectorAll('.ox-menuitem')].find((b) => /respaldo/i.test(b.textContent))?.click()`);
  await sleep(1000);
  ok('exportar el respaldo escribe el archivo', fs.existsSync(destinoBackup));

  console.log('\n7. Ctrl+N: el formulario completo');
  await tecla('n', ['control']);
  await sleep(700);
  ok('Ctrl+N abre un movimiento nuevo', /Nuevo/.test(await js(`document.querySelector('.ox-modal__title')?.textContent || ''`)));
  await escribir('#qa-amount', '777');
  await tecla('Return');
  await sleep(1000);
  ok('y Enter lo guarda', movs().some((m) => m.amount === 777));

  console.log('\n8. F3 Presupuestos');
  await tecla('F3');
  await sleep(900);
  ok('una fila por categoría de gasto', (await js(`document.querySelectorAll('.fw-topes__r').length`)) === 11);
  await escribir('[data-tope="comida"]', '10000');
  await sleep(800);
  ok('un tope que se pasa: PASADO', /PASADO/.test(await js(`document.querySelector('[data-cat="comida"] [data-c="est"]').textContent`)));
  ok('el medidor de esa fila se llenó', (await js(`document.querySelector('[data-cat="comida"] .fw-meter').dataset.p`)) === '1');
  ok('el global ya tiene presupuestado', (await js(`document.getElementById('g-pres').dataset.v`)) === '10000');
  await sleep(900);
  ok('la lectura lo dice en criollo', /COMIDA/.test(await js(`document.getElementById('pre-lect-ul').textContent`)));
  await js(`document.activeElement.blur()`);
  await tecla('F1');
  await sleep(800);
  ok('el tope se guardó (presupuestos.json)', leerDoc('presupuestos')?.topes?.comida === 10000, JSON.stringify(leerDoc('presupuestos')));

  console.log('\n9. F4 Metas');
  await tecla('F4');
  await sleep(800);
  await click('#mt-primera');
  await sleep(600);
  await escribir('.ox-modal [data-f="nombre"]', 'Viaje de prueba');
  await escribir('.ox-modal [data-f="objetivo"]', '50000');
  await sleep(200);
  await js(`[...document.querySelectorAll('.ox-modal__foot .ox-btn')].find((b) => /Crear/i.test(b.textContent))?.click()`);
  await sleep(1300);
  ok('crear una meta la pone en pantalla', (await js(`document.querySelectorAll('.fw-met__ficha').length`)) === 1);
  ok('y en metas.json', leerDoc('metas')?.metas?.[0]?.nombre === 'Viaje de prueba');
  await click('.fw-met__ficha [data-accion="aportar"]');
  await sleep(450);
  await escribir('.fw-met__ficha [data-f="monto"]', '20000');
  await js(`document.querySelector('.fw-met__ficha [data-f="monto"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  await sleep(1200);
  ok('aportar en la ficha suma (20.000 de 50.000)', /20\.000/.test(await js(`document.querySelector('.fw-meta__ah')?.textContent || ''`)));
  ok('y queda en metas.json', leerDoc('metas')?.metas?.[0]?.aportes?.[0]?.monto === 20000);
  await click('.fw-met__ficha [data-accion="retirar"]');
  await sleep(450);
  await escribir('.fw-met__ficha [data-f="monto"]', '99999');
  await sleep(300);
  ok('retirar más de lo ahorrado no se deja', /NO PODÉS/.test(await js(`document.querySelector('.fw-meta__hint').textContent`)));
  await js(`document.querySelector('.fw-met__ficha [data-f="monto"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);

  console.log('\n10. F5 Calculadora');
  await tecla('F5');
  await sleep(800);
  await escribir('.fw-hoja [data-campo="concepto"]', 'pan');
  await escribir('.fw-hoja [data-campo="monto"]', '1.500');
  await sleep(800);
  ok('el total suma al tipear', /1\.500/.test(await js(`document.querySelector('[data-tot]').textContent`)));
  await js(`(() => { const ms = document.querySelectorAll('.fw-hoja [data-campo="monto"]'); const m = ms[1]; m.focus(); m.value = '12.5oo'; m.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(500);
  ok('un monto mal escrito queda marcado y no suma', /1 NO SUMA/.test(await js(`document.querySelector('[data-bad]').textContent`)));
  await js(`document.activeElement.blur()`);
  await tecla('n');
  await sleep(700);
  ok('N abre otra hoja', (await js(`document.querySelectorAll('.fw-hoja').length`)) === 2);
  await js(`document.activeElement.blur()`);
  await sleep(700);

  console.log('\n11. F6 Ajustes');
  await tecla('F6');
  await sleep(800);
  await click('#aj-crt [data-v="fuerte"]');
  await sleep(500);
  ok('el CRT se cambia al toque', (await js(`document.documentElement.dataset.crt`)) === 'fuerte');
  ok('y se guarda (pantalla.json)', leerDoc('pantalla')?.crt === 'fuerte');
  await click('#aj-cinta [data-v="quieta"]');
  await sleep(300);
  ok('la cinta se puede dejar quieta', (await js(`getComputedStyle(document.getElementById('tape')).animationPlayState`)) === 'paused');
  await click('#aj-crt [data-v="suave"]');
  await click('#aj-cinta [data-v="mueve"]');
  await sleep(300);
  await tecla('i');
  await sleep(1300);
  ok('I importa un respaldo de FinWatch y muestra el resumen', /importados/i.test(await js(`document.querySelector('.ox-modal__title')?.textContent || ''`)));
  ok('con la fila rota descartada', /DESCARTADOS/.test(await js(`document.querySelector('.ox-modal__body')?.textContent || ''`)));
  await js(`document.querySelector('.ox-modal__foot .ox-btn')?.click()`);
  await sleep(900);
  ok('y los movimientos nuevos están en el disco', movs().some((m) => m.id === 'mudanza-1'));

  console.log('\n12. Nada nativo de Chromium, nada de glifos, consola limpia');
  ok('ningún title= nativo', (await js(`document.querySelectorAll('[title]').length`)) === 0);
  /* Todo símbolo es un SVG propio. Se permiten los tipográficos que SÍ son
     texto: el menos real (−), el separador (·) y las comillas. Se barre cada
     pantalla. */
  const glifos = [];
  for (let i = 1; i <= 6; i++) {
    await tecla(`F${i}`);
    await sleep(600);
    glifos.push(...await js(`(() => {
      const malos = /[\\u2190-\\u21FF\\u2700-\\u27BF\\u2B00-\\u2BFF\\uFE0F\\u2600-\\u26FF\\u25A0-\\u25FF]|[\\uD83C-\\uDBFF][\\uDC00-\\uDFFF]/;
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const out = [];
      while (w.nextNode()) { const t = w.currentNode.nodeValue; if (malos.test(t)) out.push(t.trim().slice(0, 40)); }
      return out;
    })()`));
  }
  ok('cero emojis y cero flechas o triángulos unicode, en las seis pantallas', glifos.length === 0, [...new Set(glifos)].join(' | '));

  /* El anillo de foco va por fuera del control (offset + trazo). Si un
     ancestro que recorta (overflow, clip-path) o el borde de la ventana le
     queda más cerca, se pierde un lado: pasó con las teclas F, al pie de la
     ventana. Se recorre cada pantalla con Tab, como con el teclado, y se mide
     dónde CAE el anillo contra cada recorte. La ventana de prueba no tiene el
     foco del sistema, y sin él no hay :focus-visible: se emula. */
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  const anilloCortado = `(() => {
    let el = document.activeElement;
    if (!el || el === document.body || !el.matches(':focus-visible')) return null;
    const foco = el;
    let s = getComputedStyle(el);
    if (s.outlineStyle === 'none') {   // un scroller le pasa el anillo a su panel
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const as = getComputedStyle(a);
        if (as.outlineStyle !== 'none') { el = a; s = as; break; }
      }
    }
    if (s.outlineStyle === 'none') return null;
    const ext = parseFloat(s.outlineOffset) + parseFloat(s.outlineWidth);
    const r = el.getBoundingClientRect();
    const ring = { l: r.left - ext, t: r.top - ext, r: r.right + ext, b: r.bottom + ext };
    const nombre = foco.id ? '#' + foco.id : (foco.getAttribute('aria-label') || foco.textContent.trim().slice(0, 20) || foco.className);
    if (ring.l < 0 || ring.t < 0 || ring.r > innerWidth || ring.b > innerHeight) return nombre + ' (borde de la ventana)';
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const as = getComputedStyle(a);
      const x = as.overflowX !== 'visible' || as.clipPath !== 'none', y = as.overflowY !== 'visible' || as.clipPath !== 'none';
      if (!x && !y) continue;
      const b = a.getBoundingClientRect();
      if ((x && (ring.l < b.left - .01 || ring.r > b.right + .01)) || (y && (ring.t < b.top - .01 || ring.b > b.bottom + .01)))
        return nombre + ' (lo recorta ' + (a.id ? '#' + a.id : '.' + [...a.classList].join('.')) + ')';
    }
    return null;
  })()`;
  const cortados = [];
  let recorridos = 0;
  for (let i = 1; i <= 6; i++) {
    await tecla(`F${i}`);
    await sleep(700);
    await js(`document.activeElement?.blur()`);
    const vistos = new Set();
    for (let n = 0; n < 80; n++) {
      await tecla('Tab');
      await sleep(30);
      const id = await js(`(() => { const e = document.activeElement; const r = e.getBoundingClientRect(); return e.tagName + e.className + Math.round(r.x) + ',' + Math.round(r.y); })()`);
      if (vistos.has(id)) break;
      vistos.add(id);
      recorridos++;
      const corte = await js(anilloCortado);
      if (corte) cortados.push(`F${i} ${corte}`);
    }
  }
  win.webContents.debugger.detach();
  ok(`ningún anillo de foco cortado (${recorridos} paradas de Tab en las seis pantallas)`, recorridos > 30 && cortados.length === 0, [...new Set(cortados)].join(' | '));
  ok('sin errores ni warnings del renderer', errores.length === 0, errores.slice(0, 6).join(' | '));

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* lo tiene Electron */ }
  console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
  app.exit(fail ? 1 : 0);
});
