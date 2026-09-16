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
  /* Ojo con lo que afirma esto: acá app.getVersion() devuelve la de Electron,
     porque bajo `electron test/renderer.test.cjs` el app path no es el del
     proyecto. Lo que se prueba es que el viaje main → IPC → titlebar funciona
     y que el renderer pinta lo que le llega, no CUÁL número es. */
  ok('la titlebar pinta la versión que le pasó el main',
    /^v\d+\.\d+\.\d+$/.test(await js(`document.getElementById('brand-version').textContent`)),
    await js(`document.getElementById('brand-version').textContent`));

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
  ok('el eje de las barras muestra 6 meses', (await js(`document.querySelectorAll('.fw-bar-month').length`)) === 6);

  /* Los colores de categoría son lo único que ata cada gajo del donut con su
     renglón de la leyenda, así que tienen que ser DISTINGUIBLES — no alcanza
     con que sean distintos. Un test que compara strings encuentra once colores
     distintos en una rampa de grises casi iguales y da verde igual: es
     exactamente el que dejó pasar la rampa monocroma ilegible.
     Acá se mide la distancia perceptual real en Oklab. */
  const trazos = await js(`[...document.querySelectorAll('.fw-donut__seg')].map((s) => getComputedStyle(s).stroke)`);
  ok('cada segmento resuelve a un color real',
    trazos.length > 0 && trazos.every((t) => /^(rgb|oklch|color)/.test(t)), trazos.join(' | '));

  // Los once colores se leen de los chips del formulario, donde están todos.
  await click('[data-view="movimientos"]');
  await sleep(700);
  const rgbs = await js(`(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const leer = (color) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = color; cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
    const cs = getComputedStyle(document.documentElement);
    return {
      cats: [...document.querySelectorAll('#qa-cats .fw-dot')].map((d) => leer(getComputedStyle(d).backgroundColor)),
      sem: [leer(cs.getPropertyValue('--fw-in')), leer(cs.getPropertyValue('--fw-out'))],
    };
  })()`);

  const aLab = ([r, g, b]) => {
    const s = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const [R, G, B] = [s(r), s(g), s(b)];
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const q = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * q,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * q,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * q];
  };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  ok('los once colores de categoría llegaron', rgbs.cats.length === 11, String(rgbs.cats.length));
  const labs = rgbs.cats.map(aLab);
  let peor = Infinity; let quienes = '';
  for (let i = 0; i < labs.length; i++) {
    for (let j = i + 1; j < labs.length; j++) {
      const d = dist(labs[i], labs[j]);
      if (d < peor) { peor = d; quienes = `${i} vs ${j}`; }
    }
  }
  /* 0.04 es "el mismo color con otro nombre" (es lo que separa al rojo del
     gasto del rojo del fallo, y ya cuesta). Para gajos de un donut se pide más
     del doble. */
  ok(`dos categorías nunca se parecen demasiado (mínima ${peor.toFixed(3)})`,
    peor >= 0.085, `el par más cercano es ${quienes}`);

  const sem = rgbs.sem.map(aLab);
  let peorSem = Infinity;
  for (const c of labs) for (const s of sem) peorSem = Math.min(peorSem, dist(c, s));
  ok(`ninguna categoría se parece a "entra" ni a "sale" (mínima ${peorSem.toFixed(3)})`,
    peorSem >= 0.085);

  /* El canto del balance sigue al signo. Con datos sembrados el mes actual da
     positivo; el anterior tiene un gasto y ningún ingreso, así que da negativo
     y el canto tiene que cambiar con él — es lo que se ve de reojo, sin leer. */
  // El bloque de categorías dejó la app en Movimientos: los KPIs viven en Resumen.
  await click('[data-view="resumen"]');
  await sleep(800);
  const cantoBal = () => js(`getComputedStyle(document.querySelector('.fw-kpi--bal'), '::before').backgroundColor`);
  const valorBal = () => js(`getComputedStyle(document.querySelector('.fw-kpi--bal .ox-stat__value')).color`);
  const balPos = { canto: await cantoBal(), valor: await valorBal() };
  ok('con balance positivo, el canto acompaña a la cifra',
    balPos.canto === balPos.valor, `canto ${balPos.canto} · cifra ${balPos.valor}`);
  await click('[data-month="-1"]');
  await sleep(800);
  const balNeg = { canto: await cantoBal(), valor: await valorBal() };
  ok('con balance negativo la cifra cambia de color', balNeg.valor !== balPos.valor,
    `${balPos.valor} → ${balNeg.valor}`);
  ok('y el canto cambia con ella', balNeg.canto === balNeg.valor,
    `canto ${balNeg.canto} · cifra ${balNeg.valor}`);
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
    return { in: t('--fw-in'), out: t('--fw-out'),
             inText: t('--fw-in-text'), outText: t('--fw-out-text'),
             bg: t('--ox-bg'), s2: t('--ox-s2') };
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

  /* El par pleno se usa en cifras grandes y en masas: le alcanza con 3:1.
     Las variantes de texto van en el readout de 11px y necesitan 4.5:1. */
  const cBalance = contraste(par.out, par.s2);
  ok(`el rojo se lee en el balance de 26px (${cBalance.toFixed(2)}:1 sobre la card)`, cBalance >= 3);
  for (const [nombre, color] of [['rojo', par.outText], ['verde', par.inText]]) {
    const c = contraste(color, par.s2);
    ok(`la variante de texto del ${nombre} se lee a 11px (${c.toFixed(2)}:1)`, c >= 4.5);
  }
  /* Y tienen que ser el MISMO color, no otro: si alguien "arregla" el contraste
     cambiando el matiz, el verde de un readout dejaría de ser el verde de la app. */
  const mismoTono = (a, b) => {
    const h = ([r, g, bl]) => Math.atan2(g - bl, r - g);
    return Math.abs(h(a) - h(b)) < 0.25;
  };
  ok('la variante clara del rojo sigue siendo el mismo rojo', mismoTono(par.out, par.outText),
    `${par.out} vs ${par.outText}`);
  ok('y la del verde, el mismo verde', mismoTono(par.in, par.inText), `${par.in} vs ${par.inText}`);

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
    return { llego: true, focusVisible: i.matches(':focus-visible'),
             sombra: s.boxShadow, caret: s.caretColor, texto: s.color }; })()`);
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
  /* La caja tampoco lleva contorno: lo que dice "acá se escribe" es el plano
     hundido. El foco se marca aclarando el fondo, no con un anillo. */
  const caja = await js(`(() => { const s = getComputedStyle(document.getElementById('qa-amountfield'));
    return { sombra: s.boxShadow, fondo: s.backgroundColor }; })()`);
  ok('la caja del monto no dibuja contorno', caja.sombra === 'none', String(caja.sombra));
  ok('el cursor es blanco, no del color del tipo',
    foco.caret !== foco.texto, `caret=${foco.caret} texto=${foco.texto}`);
  await js(`document.getElementById('qa-amount').blur()`);
  await sleep(400);
  const sinFoco = await js(`getComputedStyle(document.getElementById('qa-amountfield')).backgroundColor`);
  ok('pero el foco se nota igual: el fondo cambia',
    caja.fondo !== sinFoco, `con foco ${caja.fondo} · sin foco ${sinFoco}`);

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
