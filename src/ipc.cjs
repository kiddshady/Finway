'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   ONYX — puente IPC
   El renderer no tiene fs, ni require, ni red: `contextIsolation` está activo.
   Todo lo que necesite del sistema pasa por acá, y acá se decide qué se puede
   pedir. Es la superficie de ataque de la app: todo lo que agregues es una
   puerta más.

   Convención: cada handler devuelve {ok:true, data} o {ok:false, error}. El
   preload la desenvuelve y convierte el error en una excepción real, así el
   renderer escribe try/catch normal en vez de chequear banderas.
   ═══════════════════════════════════════════════════════════════════════════ */

const { ipcMain, app, clipboard, dialog, BrowserWindow } = require('electron');
const store = require('./store.cjs');
const movimientos = require('./movimientos.cjs');
const fsp = require('fs').promises;
const path = require('path');

/* Las colecciones que el renderer puede tocar. Es una lista blanca a
   propósito: sin ella, cualquier bug en el renderer puede crear carpetas
   sueltas en tu directorio de datos. Agregá las tuyas acá. */
const COLLECTIONS = ['items'];

function coll(name) {
  if (!COLLECTIONS.includes(name)) throw new Error(`colección no permitida: ${name}`);
  return store.collection(name);
}

/** Envuelve un handler para que un throw viaje como error y no como crash. */
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      console.error(`[ipc] ${channel}:`, err);
      return { ok: false, error: err?.message || String(err) };
    }
  });
}

function register() {
  handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    dataDir: store.ROOT,
    electron: process.versions.electron,
  }));

  handle('settings:get', () => store.loadSettings());
  handle('settings:save', (patch) => store.saveSettings(patch));

  handle('doc:read', (name, fallback = null) => store.doc(name, fallback).read());
  handle('doc:write', (name, data) => store.doc(name).write(data).then(() => true));

  /* navigator.clipboard se niega a escribir si la ventana no tiene el foco;
     el portapapeles del sistema, desde acá, no pide nada. */
  handle('clipboard:write', (text) => { clipboard.writeText(String(text)); return true; });

  handle('col:list', (name) => coll(name).list());
  handle('col:get', (name, id) => coll(name).get(id));
  handle('col:save', (name, item) => coll(name).save(item));
  handle('col:remove', (name, id) => coll(name).remove(id).then(() => true));
  handle('col:next-id', (name, prefix) => coll(name).nextId(prefix));

  /* ── Movimientos: el dominio de Finway ─────────────────────────────────────
     Toda mutación devuelve la lista COMPLETA releída del disco. Es lo que hace
     imposible que el renderer quede desincronizado: no hay un "agregá esto a
     tu copia", hay una sola verdad y viaja entera. */
  handle('mov:load', () => movimientos.load());
  handle('mov:add', (move) => movimientos.add(move));
  handle('mov:update', (move) => movimientos.update(move));
  handle('mov:remove', (id) => movimientos.remove(id));

  /* El respaldo lo arma el MAIN leyendo del disco, no el renderer mandando su
     lista: un respaldo que depende del espejo en memoria de una ventana puede
     salir incompleto sin que nadie se entere, que es justo lo que un respaldo
     no puede hacer. */
  handle('mov:export-all', async () => {
    const moves = await movimientos.load();
    const hoy = new Date().toISOString().slice(0, 10);
    const r = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow(), {
      title: 'Exportar todos los movimientos',
      defaultPath: path.join(app.getPath('documents'), `finway-respaldo-${hoy}.json`),
      filters: [{ name: 'Respaldo de Finway', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return null;
    await fsp.writeFile(r.filePath, JSON.stringify(movimientos.toBackup(moves, app.getVersion()), null, 1), 'utf8');
    return { path: r.filePath, count: moves.length };
  });

  handle('mov:export-csv', async (moves, suggestedName) => {
    const r = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow(), {
      title: 'Exportar movimientos',
      defaultPath: path.join(app.getPath('documents'), suggestedName || 'finway.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (r.canceled || !r.filePath) return null;
    await fsp.writeFile(r.filePath, movimientos.toCsv(moves), 'utf8');
    return r.filePath;
  });

  /* Importar abre el diálogo acá y lee el archivo en el main: el renderer no
     tiene fs, y dárselo por un canal nuevo sería abrir una puerta más para
     leer cualquier archivo del disco. */
  handle('mov:import', async () => {
    const r = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
      title: 'Importar un respaldo',
      properties: ['openFile'],
      filters: [{ name: 'Respaldo (Finway o FinWatch)', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePaths?.[0]) return null;
    const texto = await fsp.readFile(r.filePaths[0], 'utf8');
    const resumen = await movimientos.importBackup(texto);
    return { ...resumen, archivo: path.basename(r.filePaths[0]) };
  });
}

module.exports = { register, COLLECTIONS };
