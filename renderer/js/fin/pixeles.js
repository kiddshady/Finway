/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY · TERMINAL — los íconos de píxel
   Los íconos de Onyx son de línea fina con puntas redondas y, al lado de la
   VT323, se ven de otra app. Estos están dibujados en la grilla de la letra:
   una grilla de 7×7 que se muestra a 14 px (cada píxel del ícono mide 2 px,
   lo mismo que un píxel de la VT323 a ese tamaño) o a 7 px adentro de una
   tecla (1 px). Cualquier otro tamaño los deja borrosos: los tamaños están en
   terminal.css, al final.

   Reemplazan a los del set base con el MISMO nombre, así que el motor no se
   entera: `Icons.svg('trash')` sigue funcionando en todos lados. Un '#' es un
   píxel prendido; las filas van de arriba abajo.

   La maqueta con los dos juegos lado a lado: docs/maquetas/iconos.html (local,
   fuera del repo).
   ═══════════════════════════════════════════════════════════════════════════ */

export const PIXELES = {
  chevronLeft:  ['....#..', '...#...', '..#....', '.#.....', '..#....', '...#...', '....#..'],
  chevronRight: ['..#....', '...#...', '....#..', '.....#.', '....#..', '...#...', '..#....'],
  chevronUp:    ['.......', '...#...', '..#.#..', '.#...#.', '#.....#', '.......', '.......'],
  chevronDown:  ['.......', '.......', '#.....#', '.#...#.', '..#.#..', '...#...', '.......'],
  plus:         ['.......', '...#...', '...#...', '.#####.', '...#...', '...#...', '.......'],
  minus:        ['.......', '.......', '.......', '.#####.', '.......', '.......', '.......'],
  close:        ['.......', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '.......'],
  check:        ['.......', '......#', '.....#.', '#...#..', '.#.#...', '..#....', '.......'],
  edit:         ['.....##', '....###', '...###.', '..###..', '.###...', '##.....', '#......'],
  trash:        ['..###..', '#######', '.#...#.', '.#.#.#.', '.#.#.#.', '.#...#.', '..###..'],
  copy:         ['####...', '#..#...', '#..####', '#..#..#', '####..#', '...#..#', '...####'],
  undo:         ['..#....', '.#.....', '######.', '.#....#', '..#...#', '......#', '..####.'],
  more:         ['.......', '...#...', '.......', '...#...', '.......', '...#...', '.......'],
  calendar:     ['.#...#.', '#######', '#.....#', '#.#.#.#', '#.....#', '#.#.#.#', '#######'],
  save:         ['######.', '#.###.#', '#.....#', '#.....#', '#.###.#', '#.###.#', '#######'],
  download:     ['...#...', '...#...', '...#...', '.#.#.#.', '..###..', '...#...', '#######'],
  alert:        ['..###..', '.#.#.#.', '#..#..#', '#..#..#', '#.....#', '.#.#.#.', '..###..'],
  info:         ['..###..', '.#.#.#.', '#.....#', '#..#..#', '#..#..#', '.#.#.#.', '..###..'],
  target:       ['..###..', '.#...#.', '#..#..#', '#.###.#', '#..#..#', '.#...#.', '..###..'],
  prompt:       ['#......', '.#.....', '..#....', '.#.....', '#......', '.......', '...####'],
  winMin:       ['.......', '.......', '.......', '.......', '.......', '#######', '.......'],
  winMax:       ['#######', '#######', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
  winRestore:   ['..#####', '..#...#', '#####.#', '#####.#', '#...###', '#...#..', '#####..'],
  winClose:     ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
};

/** Una fila de píxeles seguidos es un solo rectángulo: menos nodos y sin
    costuras entre píxeles vecinos. */
export function trazar(filas) {
  let d = '';
  filas.forEach((fila, y) => {
    for (let x = 0; x < fila.length;) {
      if (fila[x] !== '#') { x++; continue; }
      let w = 0;
      while (fila[x + w] === '#') w++;
      d += `M${x} ${y}h${w}v1h${-w}z`;
      x += w;
    }
  });
  return d;
}

/* El motor envuelve cada ícono en un <svg viewBox="0 0 16 16">: adentro va
   otro que ocupa el lienzo entero con la grilla de 7. Relleno y no trazo. */
export const cuerpos = () => Object.fromEntries(Object.entries(PIXELES).map(([n, filas]) => [n,
  `<svg class="fw-px" width="16" height="16" viewBox="0 0 7 7" shape-rendering="crispEdges" fill="currentColor" stroke="none"><path d="${trazar(filas)}"/></svg>`]));
