/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — la marca
   Una "F" de barras: un stem y tres brazos que se van apagando hacia abajo.
   El caudal baja y se va perdiendo. Desde Finway Terminal (oct 2026) es de
   PÍXEL: las barras son bloques de una grilla, de puntas cuadradas, y el
   stem se apaga en escalones —una banda por brazo y una cola— en vez de en
   degradé. (Se probó redondearles las puntas sacándoles las esquinas: a
   tamaño de ícono parecían lápices. `chaflan` queda por si se retoma.) Los tonos son los cuatro escalones de ámbar de --fw-mark-*.

   Este archivo es LA fuente de la forma. De acá salen:
     · la marca de la titlebar (markSVG, a 16 px: grilla de 16, 1 px por celda);
     · el splash del index.html (la misma marca escrita a mano en el HTML,
       porque pinta antes de que cargue cualquier módulo; tools/icono.mjs la
       imprime para pegarla);
     · los masters del ícono (tools/icono.mjs → assets/icon*.svg).
   Una celda tiene que caer en píxeles enteros o la F se ve borrosa: por eso
   hay dos grillas y cada tamaño usa la que le cae justa.
   ═══════════════════════════════════════════════════════════════════════════ */

/* t = grosor de las barras, g = luz entre el stem y los brazos y entre brazo y
   brazo, L = largo de cada brazo, H = alto del stem. Las proporciones son las
   de la F de barras de siempre (brazos 1 : 0,65 : 0,83; el stem sigue un
   brazo y medio más abajo del último). */
export const GRILLAS = {
  11: { t: 2, g: 1, L: [8, 5, 7], H: 11, chaflan: false },  // el ícono: 16, 32, 48, 64 y el master
  16: { t: 3, g: 1, L: [12, 8, 10], H: 16, chaflan: false }, // la titlebar (16 px) y el ícono a 24
};

/* Los escalones: 0 encendido, 1, 2 y 3 la cola del stem. */
export const TONOS_VAR = ['var(--fw-mark-a)', 'var(--fw-mark-2)', 'var(--fw-mark-3)', 'var(--fw-mark-4)'];
export const TONOS_HEX = ['#F8AC3D', '#B97F2B', '#805307', '#5C3A02'];

/** Celdas → path, una corrida horizontal por rectángulo (sin costuras). */
function trazo(celdas) {
  const filas = new Map();
  for (const [x, y] of celdas) (filas.get(y) || filas.set(y, new Set()).get(y)).add(x);
  let d = '';
  for (const [y, xs] of [...filas].sort((a, b) => a[0] - b[0])) {
    const orden = [...xs].sort((a, b) => a - b);
    for (let i = 0; i < orden.length;) {
      let w = 1;
      while (orden[i + w] === orden[i] + w) w++;
      d += `M${orden[i]} ${y}h${w}v1h${-w}z`;
      i += w;
    }
  }
  return d;
}

/** Un rectángulo de celdas, sin sus cuatro esquinas si va con chaflán. */
function barra(x0, y0, w, h, chaflan) {
  const c = [];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const esquina = (x === x0 || x === x0 + w - 1) && (y === y0 || y === y0 + h - 1);
      if (!(chaflan && esquina)) c.push([x, y]);
    }
  }
  return c;
}

/**
 * La F en una grilla: `{ lado, piezas }`, donde cada pieza es
 * `{ clase, tono, celdas, d }` con `d` en unidades de celda. El stem sale en bandas
 * (una pieza por tono) para que se apague en escalones.
 */
export function efe(n = 16) {
  const { t, g, L, H, chaflan } = GRILLAS[n];
  const x = t + g;
  const piezas = [];
  const stem = barra(0, 0, t, H, chaflan);
  /* Las bandas del stem siguen a los brazos: cada brazo + su luz es un
     escalón, y lo que sobra abajo es la cola. */
  const paso = t + g;
  for (let k = 0; k < 4; k++) {
    const celdas = stem.filter(([, y]) => (k < 3 ? y >= k * paso && y < (k + 1) * paso : y >= 3 * paso));
    if (celdas.length) piezas.push({ clase: 'fm-stem', tono: k, celdas, d: trazo(celdas) });
  }
  L.forEach((largo, i) => {
    const celdas = barra(x, i * paso, largo, t, chaflan);
    piezas.push({ clase: `fm-arm fm-a${i + 1}`, tono: i, celdas, d: trazo(celdas) });
  });
  return { lado: n, piezas };
}

/** La marca de la titlebar. A 16 px usa la grilla de 16: 1 px por celda. */
export function markSVG({ size = 16, cls = '' } = {}) {
  const n = size % 16 === 0 ? 16 : 11;
  const { piezas } = efe(n);
  return `
    <svg class="fw-mark ${cls}" width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true">
      ${piezas.map((p) => `<path class="${p.clase}" fill="${TONOS_VAR[p.tono]}" d="${p.d}"/>`).join('\n      ')}
    </svg>`;
}
