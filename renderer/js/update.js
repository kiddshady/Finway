/* ═══════════════════════════════════════════════════════════════════════════
   ONYX — actualizaciones (lado renderer)
   El main baja la versión nueva solo (src/updater.cjs); acá vive lo que el
   usuario ve de eso: un modal cuando ya está lista, y el estado para que
   Ajustes lo muestre. No decide nada: refleja y ofrece el botón.

   Todavía no está en la plantilla de Onyx: nació acá y es candidata a viajar.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Modal, Toast } from './overlays.js';

const shell = window.onyx;

/** Estado tal como lo manda el main: { state, version?, percent?, error? }. */
export let estado = { state: 'idle' };

const oyentes = new Set();
/** true mientras la búsqueda la pidió el usuario: sus errores sí se muestran. */
let aMano = false;
/** La versión por la que ya se preguntó "¿reiniciar?": se pregunta una vez. */
let preguntada = null;

function emitir() {
  for (const fn of oyentes) {
    try { fn(estado); } catch (err) { console.error('[update] oyente:', err); }
  }
}

/** Llamá a lo que devuelve para dejar de escuchar (Router.onLeave lo acepta). */
export function onChange(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

/** Texto para una fila de Ajustes o una statusbar: una línea, sin rojo. */
export function describir(e = estado) {
  switch (e.state) {
    case 'dev':         return 'Corriendo desde el repo: no se actualiza';
    case 'checking':    return 'Buscando…';
    case 'none':        return 'Estás al día';
    case 'available':   return `Hay una versión nueva: ${e.version}`;
    case 'downloading': return `Bajando la ${e.version}… ${e.percent ?? 0}%`;
    case 'ready':       return `La ${e.version} está lista para instalar`;
    case 'error':       return 'No se pudo buscar';
    default:            return 'Todavía no se buscó';
  }
}

async function preguntarReinicio(version) {
  if (preguntada === version) return;
  preguntada = version;
  const ahora = await Modal.show({
    title: `Finway ${version} está lista`,
    sub: 'Ya se descargó. Se instala al reiniciar la app.',
    body: '<div class="ox-meta">Si preferís seguir, se instala sola la próxima vez que salgas desde el tray, o desde Ajustes cuando quieras.</div>',
    actions: [
      { label: 'Más tarde', value: false },
      { label: 'Reiniciar ahora', value: true, variant: 'primary', autofocus: true },
    ],
  });
  if (ahora) shell.update.install();
}

/** Pide una búsqueda. El resultado llega por eventos, no por el return. */
export async function buscar() {
  aMano = true;
  estado = await shell.update.check();
  emitir();
}

export function instalar() {
  shell.update.install();
}

/** Una vez, al arrancar. */
export function initUpdates() {
  shell.update.onStatus((e) => {
    estado = e;
    emitir();

    if (e.state === 'ready') preguntarReinicio(e.version);

    /* Un error de la búsqueda automática no le importa a nadie: sin red es lo
       normal y se vuelve a intentar en el próximo arranque. El de una búsqueda
       pedida a mano sí, porque alguien está esperando la respuesta. */
    if (e.state === 'error' && aMano) Toast.error('No se pudo buscar actualizaciones', e.error);
    if (e.state === 'none' || e.state === 'ready' || e.state === 'error') aMano = false;
  });
}
