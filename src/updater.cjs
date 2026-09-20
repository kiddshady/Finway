'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   ONYX — actualizaciones
   La app instalada no ve el repo: sin esto, cada arreglo exige bajar el
   instalador a mano. Con esto, mira los Releases de GitHub al arrancar, baja
   la versión nueva en silencio y avisa recién cuando está lista para
   instalarse. Nunca reinicia sola: el momento lo elige el usuario.

   Lo que lee es el `latest.yml` que electron-builder deja junto al instalador
   en cada Release (ver `build.publish` en package.json y el workflow de
   .github/). Sin ese archivo en el Release, no hay actualización que ver.

   Estados que viajan al renderer por `update:status`:
     idle → checking → none | available → downloading → ready
                    ↘ error
   `dev` cuando la app corre desde el repo: ahí no hay nada que actualizar y
   electron-updater se niega a mirar, así que ni se lo pide.
   ═══════════════════════════════════════════════════════════════════════════ */

const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

/** Cuánto esperar después del arranque antes de mirar: la ventana primero. */
const DEMORA_INICIAL_MS = 8_000;

/** @type {{ state: string, version?: string, percent?: number, error?: string }} */
let estado = { state: app.isPackaged ? 'idle' : 'dev' };
/** @type {(estado: object) => void} */
let avisar = () => {};

function set(patch) {
  estado = { ...patch };
  avisar(estado);
}

/**
 * @param {object} opts
 * @param {(estado: object) => void} opts.onStatus  Se llama con cada cambio; el
 *   main lo usa para empujarlo al renderer y para tocar el menú del tray.
 */
function init({ onStatus }) {
  avisar = onStatus;
  if (!app.isPackaged) {
    ipcMain.handle('update:check', () => estado);
    ipcMain.on('update:install', () => {});
    return;
  }

  autoUpdater.autoDownload = true;
  /* Cerrar la ventana no mata la app (va al tray), así que "al salir" es el
     Salir del tray o apagar Windows. En cualquiera de los dos, si ya hay una
     versión bajada, se instala sola. */
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => set({ state: 'none', version: app.getVersion() }));
  autoUpdater.on('update-available', (info) => set({ state: 'available', version: info.version }));
  autoUpdater.on('download-progress', (p) =>
    set({ state: 'downloading', version: estado.version, percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => {
    /* Sin red no es un error que haya que mostrar en rojo: es un martes. Se
       reporta igual para que Ajustes pueda decir "no se pudo mirar". */
    console.error('[updater]', err?.message || err);
    set({ state: 'error', error: err?.message || String(err) });
  });

  ipcMain.handle('update:check', () => buscar());
  ipcMain.on('update:install', () => instalar());

  setTimeout(buscar, DEMORA_INICIAL_MS);
}

/** Dispara una búsqueda y devuelve el estado actual (el resultado llega por eventos). */
async function buscar() {
  if (!app.isPackaged) return estado;
  if (estado.state === 'checking' || estado.state === 'downloading') return estado;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    set({ state: 'error', error: err?.message || String(err) });
  }
  return estado;
}

/** Cierra la app e instala. Solo hace algo si la descarga ya terminó. */
function instalar() {
  if (estado.state !== 'ready') return;
  // isSilent:false → el NSIS muestra su progreso; isForceRunAfter:true → vuelve a abrir.
  autoUpdater.quitAndInstall(false, true);
}

function actual() {
  return estado;
}

module.exports = { init, buscar, instalar, actual };
