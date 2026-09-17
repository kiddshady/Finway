/* Capturas de las vistas con los datos del traspaso, en una ventana VISIBLE
   (offscreen capturePage devuelve frames viejos). Uso: electron tools/capturas.cjs [prefijo] */
const { app, BrowserWindow } = require('electron');
const path = require('path'); const fs = require('fs'); const os = require('os');
const ROOT = path.join(__dirname, '..');
const pref = process.argv.find((a) => a.startsWith('--pref='))?.slice(7) || 'antes';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finway-shots-'));
fs.copyFileSync(path.join(ROOT, 'data/_migracion/finway-movimientos.RESULTADO.json'), path.join(tmp, 'movimientos.json'));
process.env.FINWAY_DATA = tmp;
app.setPath('userData', path.join(tmp, 'userData'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  require(path.join(ROOT, 'src', 'ipc.cjs')).register();
  const win = new BrowserWindow({ width: 1280, height: 820, center: true, frame: false, show: true, backgroundColor: '#0a0b0d',
    webPreferences: { preload: path.join(ROOT, 'preload.cjs'), contextIsolation: true, sandbox: true } });
  win.webContents.on('console-message', (e) => console.log('CONSOLE', e.level, e.message));
  await win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  await sleep(4000); await win.webContents.capturePage(); await sleep(400);
  const out = path.join(ROOT, '.shots'); fs.mkdirSync(out, { recursive: true });
  for (const v of ['resumen', 'movimientos', 'calculadora', 'ajustes']) {
    await win.webContents.executeJavaScript(`document.querySelector('[data-view="${v}"]').click()`);
    await sleep(1400);
    fs.writeFileSync(path.join(out, `${pref}-${v}.png`), (await win.webContents.capturePage()).toPNG());
  }
  app.exit(0);
});
