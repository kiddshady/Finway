/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — la marca
   Una "F" de barras: un stem en degradé y tres brazos que se van apagando
   hacia abajo. El caudal baja y se va perdiendo — la forma dice lo mismo que
   decía cuando era cyan y magenta, pero ahora con la escalera de énfasis de
   Onyx en vez de con los colores del dominio.

   Los tonos salen de tokens (--fw-mark-a/b y la escalera de texto): volver a
   la marca CMY es cambiar esas variables, no este archivo.

   Misma geometría que scripts/make-icons.cjs y que el splash del index.html —
   si tocás una, tocá las tres o el arranque pega un salto cuando el splash le
   pasa la posta a la titlebar.
   ═══════════════════════════════════════════════════════════════════════════ */

let seq = 0;

/** El id del gradiente tiene que ser único por instancia: dos marcas en
    pantalla con el mismo id hacen que la segunda herede el degradé de la
    primera cuando la primera se va del DOM. */
export function markSVG({ size = 20, cls = '' } = {}) {
  const gid = `fw-mark-${++seq}`;
  return `
    <svg class="fw-mark ${cls}" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--fw-mark-a)"/>
          <stop offset="1" stop-color="var(--fw-mark-b)"/>
        </linearGradient>
      </defs>
      <rect class="fm-stem" x="9" y="9" width="5.5" height="30.5" rx="2.75" fill="url(#${gid})"/>
      <rect class="fm-arm fm-a1" x="17.3" y="9"    width="21.7" height="5.5" rx="2.75" fill="var(--ox-text)"/>
      <rect class="fm-arm fm-a2" x="17.3" y="17.3" width="14"   height="5.5" rx="2.75" fill="var(--ox-text-2)"/>
      <rect class="fm-arm fm-a3" x="17.3" y="25.6" width="18"   height="5.5" rx="2.75" fill="var(--ox-text-3)"/>
    </svg>`;
}
