/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — tendencia por categoría
   Una línea por categoría, un punto por mes. Arriba, los chips: cada uno
   prende o apaga su línea, doble click deja solo esa, y el botón del final
   prende o apaga todas.

   Mismo contrato que charts.js: `trendHTML()` devuelve el markup y
   `wireTrend()` lo cablea después del único innerHTML de la vista.

   LAS LÍNEAS NO SE REPINTAN AL ELEGIR. Todas existen siempre, y lo que cambia
   es su `d` (y el cy de sus puntos) por CSS, con transición: al sumar o sacar
   una categoría la escala se reacomoda y cada línea VIAJA a su nueva altura en
   vez de aparecer de golpe. La que se apaga baja al piso y se desvanece; la
   que se prende crece desde el piso. Para que `d` se pueda interpolar los dos
   caminos tienen que tener los mismos comandos — por eso "apagada" es la misma
   polilínea con todas las y en cero, y no un camino vacío.
   ═══════════════════════════════════════════════════════════════════════════ */

import { catColor, catLabel } from './categories.js';
import { fmtARS, fmtCompact, monthShort } from './format.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TW = 960, TH = 250, TL = 56, TR = 20, TT = 16, TB = 30;
const TIW = TW - TL - TR, TIH = TH - TT - TB;
const TICKS = [0.25, 0.5, 0.75, 1];

/** Geometría para una selección: la escala sale SOLO de las prendidas, así
    una categoría chica elegida sola ocupa todo el alto y se le ve la forma. */
function geo(trend, sel) {
  const n = trend.months.length;
  const on = trend.series.filter((s) => sel.has(s.cat));
  const maxVal = Math.max(1, ...on.flatMap((s) => s.values));
  const x = (i) => TL + (n > 1 ? (i / (n - 1)) * TIW : TIW / 2);
  const y = (v) => TT + TIH - (v / maxVal) * TIH;
  const pathOf = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return { n, maxVal, x, y, pathOf, floor: y(0) };
}

const allOn = (trend, sel) => trend.series.every((s) => sel.has(s.cat));
const anyOn = (trend, sel) => trend.series.some((s) => sel.has(s.cat));

export function trendHTML(trend, sel) {
  if (!trend.series.length) {
    return `<div class="ox-meta fw-trend__empty">sin gastos en estos meses</div>`;
  }
  const g = geo(trend, sel);
  const zeros = trend.months.map(() => 0);

  const chips = trend.series.map((s) => `
    <button class="fw-tcat${sel.has(s.cat) ? ' is-on' : ''}" data-cat="${esc(s.cat)}" style="--fw-cat:${catColor(s.cat)}">
      <span class="fw-dot"></span>${esc(catLabel(s.cat))}
    </button>`).join('');

  const grid = TICKS.map((f) => {
    const yy = TT + TIH - f * TIH;
    return `<line class="fw-grid-line" x1="${TL}" y1="${yy.toFixed(1)}" x2="${TW - TR}" y2="${yy.toFixed(1)}"/>
      <text class="fw-tick fw-trend__tick" data-f="${f}" x="${TL - 8}" y="${(yy + 3).toFixed(1)}" text-anchor="end">${fmtCompact(f * g.maxVal)}</text>`;
  }).join('');

  /* De la más chica a la más grande: la que más gastó queda arriba de todo y
     no la tapa una menor que la cruza. */
  const lines = [...trend.series].reverse().map((s) => {
    const on = sel.has(s.cat);
    const pts = s.values.map((v, i) => `
      <circle class="fw-trend__pt" data-i="${i}" r="3"
        style="fill:${catColor(s.cat)};cx:${g.x(i).toFixed(1)}px;cy:${(on ? g.y(v) : g.floor).toFixed(1)}px"/>`).join('');
    return `
      <g class="fw-trend__serie${on ? '' : ' is-off'}" data-cat="${esc(s.cat)}">
        <path class="fw-trend__line" pathLength="1" style="stroke:${catColor(s.cat)};d:path('${g.pathOf(on ? s.values : zeros)}')"/>
        ${pts}
      </g>`;
  }).join('');

  const months = trend.months.map((ym, i) =>
    `<text class="fw-bar-month" x="${g.x(i).toFixed(1)}" y="${TH - 9}" text-anchor="middle">${monthShort(ym)}</text>`).join('');

  return `
    <div class="fw-trend${anyOn(trend, sel) ? '' : ' is-none'}">
      <div class="fw-trend__cats" id="trend-cats">
        ${chips}
        <button class="ox-btn ox-btn--ghost ox-btn--sm fw-trend__all" id="trend-all">${allOn(trend, sel) ? 'Ninguna' : 'Todas'}</button>
      </div>
      <div class="fw-trend__stage">
        <svg viewBox="0 0 ${TW} ${TH}" class="fw-chart" id="trend-svg">
          ${grid}
          <line class="fw-axis" x1="${TL}" y1="${g.floor.toFixed(1)}" x2="${TW - TR}" y2="${g.floor.toFixed(1)}"/>
          <line class="fw-hairline fw-trend__hair" id="trend-hair" x1="0" y1="${TT}" x2="0" y2="${g.floor.toFixed(1)}"/>
          ${lines}
          ${months}
        </svg>
        <div class="fw-trend__tip" id="trend-tip"></div>
        <div class="fw-trend__none${anyOn(trend, sel) ? '' : ' is-open'}" id="trend-none">elegí una o más categorías</div>
      </div>
    </div>`;
}

/** `sel` es el Set de categorías prendidas: acá se muta en el lugar, y cada
    cambio se avisa con `onPick(sel)` para que la vista lo recuerde al cambiar
    de mes o de rango. Todo lo que se engancha cuelga de nodos de la card, que
    mueren con el repintado. */
export function wireTrend(root, trend, sel, onPick) {
  const box = root.querySelector('.fw-trend');
  if (!box) return;
  const svg = box.querySelector('#trend-svg');
  const stage = box.querySelector('.fw-trend__stage');
  const tip = box.querySelector('#trend-tip');
  const hair = box.querySelector('#trend-hair');
  const none = box.querySelector('#trend-none');
  const allBtn = box.querySelector('#trend-all');
  const catsBox = box.querySelector('#trend-cats');
  const chips = [...box.querySelectorAll('.fw-tcat')];
  const series = new Map([...box.querySelectorAll('.fw-trend__serie')].map((el) => [el.dataset.cat, el]));
  const ticks = [...box.querySelectorAll('.fw-trend__tick')];
  const zeros = trend.months.map(() => 0);
  let g = geo(trend, sel);
  let hoverI = null;

  const apply = () => {
    g = geo(trend, sel);
    for (const s of trend.series) {
      const el = series.get(s.cat);
      const on = sel.has(s.cat);
      el.classList.toggle('is-off', !on);
      el.querySelector('.fw-trend__line').style.d = `path('${g.pathOf(on ? s.values : zeros)}')`;
      el.querySelectorAll('.fw-trend__pt').forEach((pt, i) => {
        pt.style.cy = `${(on ? g.y(s.values[i]) : g.floor).toFixed(1)}px`;
      });
    }
    chips.forEach((c) => c.classList.toggle('is-on', sel.has(c.dataset.cat)));
    ticks.forEach((t) => {
      const txt = fmtCompact(Number(t.dataset.f) * g.maxVal);
      if (t.textContent === txt) return;
      t.textContent = txt;
      t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    });
    allBtn.textContent = allOn(trend, sel) ? 'Ninguna' : 'Todas';
    // Sin nada prendido la escala no mide nada: los números del eje se van.
    box.classList.toggle('is-none', !anyOn(trend, sel));
    none.classList.toggle('is-open', !anyOn(trend, sel));
    if (hoverI != null) showTip(hoverI);
    onPick?.(sel);
  };

  /* Pasar por un chip prendido resalta su línea y apaga un poco las demás. */
  const focus = (cat) => {
    box.classList.toggle('has-focus', !!cat);
    series.forEach((el, c) => el.classList.toggle('is-focus', c === cat));
  };

  catsBox.addEventListener('click', (e) => {
    if (e.target.closest('#trend-all')) {
      const all = allOn(trend, sel);
      sel.clear();
      if (!all) trend.series.forEach((s) => sel.add(s.cat));
      return apply();
    }
    const chip = e.target.closest('.fw-tcat');
    if (!chip) return;
    const cat = chip.dataset.cat;
    if (sel.has(cat)) sel.delete(cat); else sel.add(cat);
    focus(sel.has(cat) ? cat : null);
    apply();
  });
  // Doble click: SOLO esa. Los dos clicks de antes ya la prendieron y
  // apagaron; acá el Set queda con ella sola, que es lo que se pidió.
  catsBox.addEventListener('dblclick', (e) => {
    const chip = e.target.closest('.fw-tcat');
    if (!chip) return;
    sel.clear();
    sel.add(chip.dataset.cat);
    focus(chip.dataset.cat);
    apply();
  });
  chips.forEach((c) => {
    c.addEventListener('mouseenter', () => focus(sel.has(c.dataset.cat) ? c.dataset.cat : null));
    c.addEventListener('mouseleave', () => focus(null));
  });

  /* El tooltip del mes: cuánto gastó cada categoría prendida, de mayor a
     menor, y el total si hay más de una. Flota al lado de la línea vertical,
     del lado donde hay lugar. */
  const showTip = (i) => {
    const on = trend.series.filter((s) => sel.has(s.cat));
    if (!on.length) return hideTip();
    const rows = [...on].sort((a, b) => b.values[i] - a.values[i]);
    const total = on.reduce((a, s) => a + s.values[i], 0);
    tip.innerHTML = `
      <div class="fw-trend__tip-head">
        <span class="fw-readout__label">${monthShort(trend.months[i])} ${trend.months[i].slice(0, 4)}</span>
        ${on.length > 1 ? `<span class="fw-trend__tip-total">${fmtARS(total)}</span>` : ''}
      </div>
      ${rows.map((s) => `
        <div class="fw-trend__tip-row${s.values[i] ? '' : ' is-zero'}">
          <span class="fw-dot" style="background:${catColor(s.cat)}"></span>
          <span class="fw-trend__tip-name">${esc(catLabel(s.cat))}</span>
          <span class="fw-trend__tip-amount">${fmtARS(s.values[i])}</span>
        </div>`).join('')}`;

    const w = svg.getBoundingClientRect().width;
    const px = (g.x(i) / TW) * w;
    const right = px < w * 0.6;
    tip.style.setProperty('--tip-x', `${(right ? px + 14 : px - 14).toFixed(1)}px`);
    tip.classList.toggle('is-left', !right);
    tip.classList.add('is-open');

    hair.setAttribute('x1', g.x(i).toFixed(1));
    hair.setAttribute('x2', g.x(i).toFixed(1));
    svg.classList.add('is-hover');
    svg.querySelectorAll('.fw-trend__pt').forEach((p) => p.classList.toggle('is-hot', Number(p.dataset.i) === i));
  };
  const hideTip = () => {
    tip.classList.remove('is-open');
    svg.classList.remove('is-hover');
    svg.querySelectorAll('.fw-trend__pt.is-hot').forEach((p) => p.classList.remove('is-hot'));
  };

  svg.addEventListener('mousemove', (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * TW;
    const i = g.n > 1 ? Math.max(0, Math.min(g.n - 1, Math.round(((px - TL) / TIW) * (g.n - 1)))) : 0;
    if (i === hoverI) return;
    hoverI = i;
    showTip(i);
  });
  stage.addEventListener('mouseleave', () => { hoverI = null; hideTip(); });
}
