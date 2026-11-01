/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — el vigía del día
   La app vive días abierta en el tray, y lo que se calculó como «hoy» al
   arrancar (la fecha del formulario, el mes en pantalla) se quedaba en el día
   en que se abrió. Esto guarda qué día es y avisa cuando cambió.

   Quién lo revisa: el reloj de la titlebar (cada segundo) y el foco de la
   ventana (al volver del tray o de una suspensión, antes que el reloj).
   Qué hace cada uno al enterarse es cosa suya, con una regla: solo sigue al
   día nuevo lo que estaba en «hoy» porque sí. Una fecha o un mes elegidos a
   mano se respetan.

   Puro: el reloj se inyecta, así se prueba la medianoche con node pelado.
   ═══════════════════════════════════════════════════════════════════════════ */

import { todayStr } from './format.js';

export function crearVigia(hoy = todayStr) {
  let dia = hoy();
  const oyentes = new Set();
  return {
    get dia() { return dia; },

    /** `fn({ antes, ahora })` en cada cambio de día. Devuelve cómo soltarlo. */
    alCambiar(fn) {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },

    /** Mira el reloj. Si el día cambió, avisa y devuelve { antes, ahora };
        si no, null. Uno que falla no les corta el aviso a los demás. */
    revisar() {
      const ahora = hoy();
      if (ahora === dia) return null;
      const cambio = { antes: dia, ahora };
      dia = ahora;
      for (const fn of oyentes) {
        try { fn(cambio); } catch (err) { console.error(err); }
      }
      return cambio;
    },
  };
}

/** Una fecha que estaba en el día viejo pasa al nuevo; cualquier otra queda. */
export const seguirDia = (fecha, { antes, ahora }) => (fecha === antes ? ahora : fecha);

/** Lo mismo con un mes "aaaa-mm": sigue solo si era el mes en curso. */
export const seguirMes = (ym, { antes, ahora }) => (ym === antes.slice(0, 7) ? ahora.slice(0, 7) : ym);

export const Dia = crearVigia();
