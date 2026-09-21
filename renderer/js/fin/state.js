/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — estado y acciones
   El main es la única fuente de verdad: TODA mutación devuelve la lista
   completa releída del disco, y acá solo se guarda ese espejo. Es lo que
   evita que una ventana vieja durmiendo en el tray pise los datos con su
   propia foto — la lección que ya está escrita en store.cjs.
   ═══════════════════════════════════════════════════════════════════════════ */

import { attempt } from '../ui.js';
import { currentMonth } from './format.js';

const api = window.fw;          // el dominio
const shell = window.onyx;      // el framework

export const S = {
  moves: [],
  month: currentMonth(),
  filter: 'all',        // all | expense | income
  trendRange: 6,        // meses de la tendencia por categoría: 6 | 12
  info: null,
  lastSaved: null,
};

/** La marca de la titlebar late cuando algo se guardó. Lo cablea app.js. */
let onSaved = () => {};
export const setOnSaved = (fn) => { onSaved = fn; };

/* El chrome (contador del rail, statusbar, el mes de la titlebar) vive afuera
   de la vista, así que el router no lo toca: Router.refresh() remonta la vista
   y no dispara onChange. Todo lo que cambie los números tiene que avisar acá,
   o la titlebar se queda diciendo el mes anterior. */
let onChrome = () => {};
export const setOnChrome = (fn) => { onChrome = fn; };
export const chromeChanged = () => onChrome();

export async function loadAll() {
  S.info = await shell.info();
  S.moves = await api.load();
}

/** Relee del disco sin tocar nada más: al volver el foco, una ventana que
    durmió en el tray se pone al día sola en vez de mostrar su foto vieja. */
export async function refresh() {
  const moves = await attempt(() => api.load(), { errorTitle: 'No se pudieron leer los movimientos' });
  if (moves) S.moves = moves;
}

export async function saveMove(move) {
  const moves = await attempt(
    () => (move.id ? api.update(move) : api.add(move)),
    { errorTitle: 'No se pudo guardar el movimiento' },
  );
  if (!moves) return false;
  S.moves = moves;
  S.lastSaved = Date.now();
  // Si cargó en otro mes, saltar a verlo: si no, el movimiento desaparece.
  S.month = move.date.slice(0, 7);
  onSaved();
  onChrome();
  return true;
}

export async function removeMove(id) {
  const moves = await attempt(() => api.remove(id), { errorTitle: 'No se pudo borrar el movimiento' });
  if (!moves) return false;
  S.moves = moves;
  S.lastSaved = Date.now();
  onChrome();
  return true;
}

export async function exportCsv(list, name) {
  return attempt(() => api.exportCsv(list, name), { errorTitle: 'No se pudo exportar' });
}

/** Respaldo de TODO, no del mes en pantalla. Los lee el main del disco. */
export async function exportAll() {
  return attempt(() => api.exportAll(), { errorTitle: 'No se pudo exportar el respaldo' });
}

/** Importa un respaldo (de Finway o de FinWatch) y recarga la lista. */
export async function importBackup() {
  const resumen = await attempt(() => api.importBackup(), { errorTitle: 'No se pudo importar' });
  if (!resumen) return null;
  S.moves = await api.load();
  S.lastSaved = Date.now();
  onChrome();
  return resumen;
}
