/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY · TERMINAL — cómo se ve la pantalla
   Dos preferencias, las únicas que tiene sentido tocar: el filtro CRT (no,
   suave, fuerte) y la cinta de cotizaciones (se mueve o queda quieta). Viven
   en su propio documento (`pantalla.json`) y se aplican como atributos en
   <html> (data-crt, data-cinta): el CSS hace el resto, con su transición.

   Las scanlines se calibran a los pixeles REALES: una línea cada tres pixeles
   de la pantalla, no del CSS. Con la escala de Windows en 125 %, tres pixeles
   de CSS son 3,75 de la pantalla y las líneas salían desparejas (unas de uno,
   otras de dos). --fw-scan-px es un pixel físico entero expresado en CSS.
   ═══════════════════════════════════════════════════════════════════════════ */

const DOC = 'pantalla';
export const P = { crt: 'suave', cinta: 'mueve' };
const CRT = new Set(['no', 'suave', 'fuerte']);
const CINTA = new Set(['mueve', 'quieta']);

function aplicar() {
  const html = document.documentElement;
  html.dataset.crt = P.crt;
  html.dataset.cinta = P.cinta;
}

function calibrar() {
  const dpr = window.devicePixelRatio || 1;
  const px = Math.max(1, Math.round(dpr)) / dpr;
  document.documentElement.style.setProperty('--fw-scan-px', `${px}px`);
}

/** En el arranque, antes del primer pintado: así no hay un cuadro sin CRT. */
export async function cargarPantalla() {
  try {
    const doc = await window.onyx.doc.read(DOC, null);
    if (CRT.has(doc?.crt)) P.crt = doc.crt;
    if (CINTA.has(doc?.cinta)) P.cinta = doc.cinta;
  } catch (err) {
    console.warn('[pantalla] no se pudo leer, quedan los valores de fábrica:', err.message);
  }
  aplicar();
  calibrar();
  // Mover la ventana a otro monitor (o cambiar la escala) cambia el dpr.
  matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener?.('change', calibrar);
  window.addEventListener('resize', calibrar);
}

export async function cambiarPantalla(cambio) {
  Object.assign(P, cambio);
  aplicar();
  try {
    await window.onyx.doc.write(DOC, { schema: 1, ...P });
  } catch (err) {
    console.warn('[pantalla] no se pudo guardar:', err.message);
  }
}
