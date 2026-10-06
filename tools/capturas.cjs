/* Capturas de las vistas con los datos del traspaso, en una ventana VISIBLE
   (offscreen capturePage devuelve frames viejos). Uso: electron tools/capturas.cjs [prefijo] */
const { app, BrowserWindow } = require('electron');
const path = require('path'); const fs = require('fs'); const os = require('os');
const ROOT = path.join(__dirname, '..');
const mes = Number(process.argv.find((a) => a.startsWith('--mes='))?.slice(6) || 0);
const pref = process.argv.find((a) => a.startsWith('--pref='))?.slice(7) || 'antes';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finway-shots-'));
fs.copyFileSync(path.join(ROOT, 'data/_migracion/finway-movimientos.RESULTADO.json'), path.join(tmp, 'movimientos.json'));
process.env.FINWAY_DATA = tmp;
app.setPath('userData', path.join(tmp, 'userData'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  require(path.join(ROOT, 'src', 'ipc.cjs')).register();
  const win = new BrowserWindow({ width: 1280, height: 820, center: true, frame: false, show: true, backgroundColor: '#070605',
    webPreferences: { preload: path.join(ROOT, 'preload.cjs'), contextIsolation: true, sandbox: true } });
  win.webContents.on('console-message', (e) => console.log('CONSOLE', e.level, e.message));
  await win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  await sleep(4000); await win.webContents.capturePage(); await sleep(400);
  const out = path.join(ROOT, '.shots'); fs.mkdirSync(out, { recursive: true });
  const js = (code) => win.webContents.executeJavaScript(code);
  const shot = async (name) => fs.writeFileSync(path.join(out, `${pref}-${name}.png`), (await win.webContents.capturePage()).toPNG());
  const tecla = (key) => js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }))`);
  // --mes=N: N meses para atrás (con la flecha, como se usa la app), para ver
  // gráficos y tablas con datos: el mes en curso puede estar vacío.
  for (let i = 0; i < mes; i++) { await tecla('ArrowLeft'); await sleep(700); }
  for (const v of ['resumen', 'movimientos', 'presupuestos', 'metas', 'calculadora', 'ajustes']) {
    await js(`document.querySelector('.fw-fk__b[data-view="${v}"]').click()`);
    await sleep(1600);
    await shot(v);
  }
  // --overlays: el menú de categorías, el menú contextual de una fila y el
  // formulario de un movimiento con su calendario abierto.
  if (process.argv.includes('--overlays')) {
    await js(`document.querySelector('.fw-fk__b[data-view="movimientos"]').click()`); await sleep(1600);
    await js(`document.querySelector('#mov-cat').click()`); await sleep(700); await shot('menu');
    await tecla('Escape'); await sleep(500);
    await js(`document.querySelectorAll('.fw-ledger__r')[3]?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 520, clientY: 260 }))`); await sleep(800); await shot('contextual');
    await tecla('Escape'); await sleep(500);
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }))`); await sleep(900); await shot('formulario');
    await js(`document.querySelector('#qa-dp-field').click()`); await sleep(700); await shot('calendario');
  }
  app.exit(0);
});
