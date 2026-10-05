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
  const win = new BrowserWindow({ width: 1280, height: 820, center: true, frame: false, show: true, backgroundColor: '#0a0a0a',
    webPreferences: { preload: path.join(ROOT, 'preload.cjs'), contextIsolation: true, sandbox: true } });
  win.webContents.on('console-message', (e) => console.log('CONSOLE', e.level, e.message));
  await win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  await sleep(4000); await win.webContents.capturePage(); await sleep(400);
  const out = path.join(ROOT, '.shots'); fs.mkdirSync(out, { recursive: true });
  for (const v of ['resumen', 'movimientos', 'presupuestos', 'metas', 'calculadora', 'ajustes']) {
    await win.webContents.executeJavaScript(`document.querySelector('[data-view="${v}"]').click()`);
    await sleep(1400);
    // --mes=-1: un mes para atrás, para ver gráficos y tabla con datos.
    if (mes && ['resumen', 'movimientos'].includes(v)) {
      for (let i = 0; i < mes; i++) { await win.webContents.executeJavaScript(`document.querySelector('[data-month="-1"]')?.click()`); await sleep(900); }
    }
    fs.writeFileSync(path.join(out, `${pref}-${v}.png`), (await win.webContents.capturePage()).toPNG());
  }
  // --overlays: el menú de categorías, el calendario y el modal de Nuevo movimiento,
  // sobre Movimientos (con datos detrás, para ver que el vidrio esmerila).
  if (process.argv.includes('--overlays')) {
    const shot = async (name) => fs.writeFileSync(path.join(out, `${pref}-${name}.png`), (await win.webContents.capturePage()).toPNG());
    const js = (code) => win.webContents.executeJavaScript(code);
    await js(`document.querySelector('[data-view="movimientos"]').click()`); await sleep(3000);
    await js(`document.querySelector('#mv-cat').click()`); await sleep(700); await shot('menu');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(500);
    await js(`document.querySelector('#qa-dp-field').click()`); await sleep(700); await shot('calendario');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(500);
    await js(`document.querySelector('.fw-tr, .ox-table tbody tr')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 600, clientY: 300 }))`); await sleep(900); await shot('contextual');
  }
  app.exit(0);
});
