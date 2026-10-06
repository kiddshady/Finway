/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — los masters del ícono
   Escribe los SVG de assets/ a partir de la F de píxel de renderer/js/fin/
   mark.js. Después `npm run icons` los rasteriza.

       npm run icono        # escribe los masters (node pelado, sin Electron)
       npm run icons        # los rasteriza: PNG, .ico y hoja de control

   Por qué un master por tamaño: la F es pixel art, y una celda que no cae en
   píxeles enteros se ve borrosa. Cada tamaño chico tiene su grilla y su celda:

       16 px  grilla 11, celda 1      48 px  grilla 11, celda 3
       24 px  grilla 16, celda 1      64 px  grilla 11, celda 4
       32 px  grilla 11, celda 2      icon.svg (256) grilla 11, celda 14:
                                      128, 256 y 512 salen de él justos (7, 14, 28)
   (A 24 la grilla de 11 no entra justa —11 px es la mitad del lienzo y 22 casi
   todo—, así que va la de 16, que es la misma F con la luz más angosta.)

   La LUZ: de 128 px para arriba cada celda se dibuja suelta, con una rayita de
   fondo alrededor, y la F se lee como una matriz de puntos de fósforo. Es lo
   que la vuelve pixel art a la vista grande (Nexus, el instalador); más chico
   la luz mediría menos de un píxel.

   El CRT es la receta del ícono de NTX, en ámbar, y va de 48 px para arriba:
   la baldosa en degradé vertical (un poco de luz arriba, el negro de la app
   abajo: sin esa luz las líneas no tienen qué oscurecer), scanlines que RESTAN
   luz solo sobre la baldosa, y la F nítida encima con un halo de fósforo. Más
   chico, una línea mide menos de un píxel y solo ensucia.

   La baldosa: a sangre, sin borde, radio 18,75 % del lado (las reglas de los
   íconos de Fran).
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { efe, TONOS_HEX } from '../renderer/js/fin/mark.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');

const ARRIBA = '#17120b';
const FONDO = '#070605';     // = --ox-bg = el BG de main.cjs

/* [lado del lienzo, grilla, celda, archivo] */
const MASTERS = [
  [16, 11, 1, 'icon-16.svg'],
  [24, 16, 1, 'icon-24.svg'],
  [32, 11, 2, 'icon-32.svg'],
  [48, 11, 3, 'icon-48.svg'],
  [64, 11, 4, 'icon-64.svg'],
  [256, 11, 14, 'icon.svg'],
];

export function master(lado, grilla, celda) {
  const { piezas } = efe(grilla);
  const ancho = grilla * celda;
  const x0 = Math.round((lado - ancho) / 2);
  const y0 = Math.round((lado - ancho) / 2);
  const crt = lado >= 48;
  const rx = +(lado * 0.1875).toFixed(2);
  /* Las scanlines van alineadas a las filas de la grilla: una por celda (o
     cada 2 px si la celda es más chica que 3), un tercio de alto. */
  const per = Math.max(2, celda >= 3 ? celda : 2);
  const linea = Math.max(1, Math.round(per / 3));
  /* La luz entre celdas: 12 % de la celda, solo donde mide más de un píxel en
     el tamaño más chico que sale de este master (128 = la mitad de 256). */
  const luz = celda >= 14 ? 0.12 : 0;
  const suelta = ([x, y]) => `M${+(x + luz / 2).toFixed(2)} ${+(y + luz / 2).toFixed(2)}h${1 - luz}v${1 - luz}h${-(1 - luz)}z`;
  const f = piezas.map((p) => `<path fill="${TONOS_HEX[p.tono]}" d="${luz ? p.celdas.map(suelta).join('') : p.d}"/>`).join('');
  return `<!-- Finway: master de ${lado} px, generado por tools/icono.mjs desde fin/mark.js. No se edita a mano. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" width="${lado}" height="${lado}">
  <defs>
    <linearGradient id="tile" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${lado}">
      <stop offset="0" stop-color="${ARRIBA}"/>
      <stop offset="1" stop-color="${FONDO}"/>
    </linearGradient>${crt ? `
    <pattern id="scan" width="${lado}" height="${per}" patternUnits="userSpaceOnUse" patternTransform="translate(0 ${y0 % per})">
      <rect y="${per - linea}" width="${lado}" height="${linea}" fill="#000" opacity=".3"/>
    </pattern>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="${(celda * 0.9).toFixed(2)}"/>
    </filter>
    <clipPath id="clip"><rect width="${lado}" height="${lado}" rx="${rx}"/></clipPath>` : ''}
    <g id="f" transform="translate(${x0} ${y0}) scale(${celda})">${f}</g>
  </defs>
  <rect width="${lado}" height="${lado}" rx="${rx}" fill="url(#tile)"/>${crt ? `
  <rect width="${lado}" height="${lado}" fill="url(#scan)" clip-path="url(#clip)"/>
  <use href="#f" filter="url(#glow)" opacity=".55"/>` : ''}
  <use href="#f" shape-rendering="crispEdges"/>
</svg>
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [lado, grilla, celda, archivo] of MASTERS) {
    fs.writeFileSync(path.join(ASSETS, archivo), master(lado, grilla, celda));
    console.log(`  ${archivo.padEnd(12)} ${lado} px · grilla ${grilla} · celda ${celda}`);
  }
  /* El splash del index.html: la misma F, escrita literal (pinta antes que
     cualquier módulo). Se pega a mano cuando cambia la forma. */
  if (process.argv.includes('--splash')) {
    const { piezas } = efe(16);
    console.log('\n<svg viewBox="0 0 16 16" shape-rendering="crispEdges">');
    for (const p of piezas) console.log(`    <path class="${p.clase}" fill="${TONOS_HEX[p.tono].toLowerCase()}" d="${p.d}"/>`);
    console.log('  </svg>');
  }
}
