/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — gráficos
   SVG a mano, sin librerías: son tres formas concretas, y cualquier librería
   de charts pesa más que esto y pelea con los tokens.

   Cada gráfico expone dos funciones: `…HTML(props)` devuelve el markup, y
   `wire…(root, props)` le engancha el hover. Están separadas porque la vista
   se pinta de una sola vez con innerHTML y recién después se cablea — así el
   navegador hace un solo layout en vez de uno por gráfico.

   El hover NO repinta: mueve y re-tiñe los nodos que ya existen. Repintando,
   cada movimiento del mouse reiniciaría las animaciones de entrada.
   ═══════════════════════════════════════════════════════════════════════════ */

import { catColor, catLabel } from './categories.js';
import { fmtARS, fmtCompact, monthShort } from './format.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ══ Donut de gastos por categoría ═══════════════════════════════════════════
   Cada segmento es un <circle> con pathLength=100: el dasharray es el % del
   total y el dashoffset corre el arranque. offset 25 = empezar a las 12. */

export function donutHTML(data, total) {
  const gap = data.length > 1 ? 1.1 : 0;
  let cum = 0;
  const segs = data.map((d) => {
    const pct = total > 0 ? (d.total / total) * 100 : 0;
    const seg = { ...d, pct, start: cum };
    cum += pct;
    return seg;
  });

  const ring = segs.length === 0
    ? `<circle cx="110" cy="110" r="78" fill="none" stroke="var(--ox-line-2)" stroke-width="26"/>`
    : segs.map((s) => {
        const dash = Math.max(s.pct - gap, 0.4);
        /* El color va por `style`, no por el atributo `stroke`: los colores de
           categoría son oklch() con un var() adentro para seguir el matiz de
           la app, y var() NO se resuelve en un atributo de presentación SVG —
           se resuelve en CSS. Con el atributo, el segmento sale sin pintar. */
        return `<circle class="fw-donut__seg" data-cat="${esc(s.cat)}"
                  cx="110" cy="110" r="78" fill="none" pathLength="100"
                  style="stroke:${catColor(s.cat)}" stroke-width="26"
                  stroke-dasharray="${dash.toFixed(2)} ${(100 - dash).toFixed(2)}"
                  stroke-dashoffset="${(25 - s.start).toFixed(2)}"/>`;
      }).join('');

  const legend = segs.length === 0
    ? `<div class="ox-meta" style="padding:3px var(--ox-2)">sin gastos este mes</div>`
    : segs.map((s) => `
        <div class="fw-legend__item" data-cat="${esc(s.cat)}">
          <span class="fw-dot" style="background:${catColor(s.cat)}"></span>
          <span class="fw-legend__name ox-truncate">${esc(catLabel(s.cat))}</span>
          <span class="fw-legend__amount ox-copyable">${fmtARS(s.total)}</span>
          <span class="fw-legend__pct">${((s.total / total) * 100).toFixed(0)}%</span>
        </div>`).join('');

  return `
    <div class="fw-donut">
      <div class="fw-donut__stage">
        <svg viewBox="0 0 220 220" class="fw-chart" style="max-width:230px">
          <g class="fw-donut__ring" style="transform-origin:110px 110px">${ring}</g>
        </svg>
        <div class="fw-donut__center" id="donut-center">
          <span class="fw-donut__center-label">TOTAL</span>
          <span class="fw-donut__center-amount ox-copyable">${total > 0 ? fmtARS(total) : '—'}</span>
          <span class="fw-donut__center-sub">${segs.length} ${segs.length === 1 ? 'categoría' : 'categorías'}</span>
        </div>
      </div>
      <div class="fw-legend">${legend}</div>
    </div>`;
}

export function wireDonut(root, data, total) {
  const center = root.querySelector('#donut-center');
  const segs = [...root.querySelectorAll('.fw-donut__seg')];
  const rows = [...root.querySelectorAll('.fw-legend__item')];
  if (!center) return;

  const paintCenter = (cat) => {
    const d = cat ? data.find((x) => x.cat === cat) : null;
    const label = center.children[0];
    const amount = center.children[1];
    const sub = center.children[2];
    if (d) {
      label.textContent = catLabel(d.cat).toUpperCase();
      label.style.color = catColor(d.cat);
      amount.textContent = fmtARS(d.total);
      sub.textContent = `${((d.total / total) * 100).toFixed(1)}%`;
    } else {
      label.textContent = 'TOTAL';
      label.style.color = '';
      amount.textContent = total > 0 ? fmtARS(total) : '—';
      sub.textContent = `${data.length} ${data.length === 1 ? 'categoría' : 'categorías'}`;
    }
  };

  const focus = (cat) => {
    segs.forEach((s) => {
      const on = !cat || s.dataset.cat === cat;
      s.style.opacity = on ? '1' : '0.25';
      s.setAttribute('stroke-width', s.dataset.cat === cat ? '32' : '26');
    });
    rows.forEach((r) => r.classList.toggle('is-dim', !!cat && r.dataset.cat !== cat));
    paintCenter(cat);
  };

  [...segs, ...rows].forEach((el) => {
    el.addEventListener('mouseenter', () => focus(el.dataset.cat));
    el.addEventListener('mouseleave', () => focus(null));
  });
}

/* ══ Línea: drenaje acumulado ════════════════════════════════════════════════
   El mes en curso (rojo, con área) contra el anterior (punteado dim). La
   pregunta que responde: ¿vengo gastando más rápido que el mes pasado? */

const LW = 560, LH = 230, LL = 56, LR = 16, LT = 16, LB = 28;
const LIW = LW - LL - LR, LIH = LH - LT - LB;

export function lineHTML(cur, prev, todayDay) {
  const curDrawn = todayDay ? cur.slice(0, todayDay) : cur;
  const maxDays = Math.max(cur.length, prev.length, 2);
  const maxVal = Math.max(curDrawn[curDrawn.length - 1] ?? 0, prev[prev.length - 1] ?? 0, 1);

  const x = (day) => LL + ((day - 1) / (maxDays - 1)) * LIW;
  const y = (v) => LT + LIH - (v / maxVal) * LIH;
  const pathOf = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  const curPath = curDrawn.length > 1 ? pathOf(curDrawn) : '';
  const prevPath = prev.length > 1 ? pathOf(prev) : '';
  const area = curPath
    ? `${curPath} L${x(curDrawn.length).toFixed(1)},${y(0).toFixed(1)} L${x(1).toFixed(1)},${y(0).toFixed(1)} Z`
    : '';

  const grid = [0.25, 0.5, 0.75, 1].map((f) => {
    const v = f * maxVal;
    return `<line class="fw-grid-line" x1="${LL}" y1="${y(v).toFixed(1)}" x2="${LW - LR}" y2="${y(v).toFixed(1)}"/>
            <text class="fw-tick" x="${LL - 8}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${fmtCompact(v)}</text>`;
  }).join('');

  const xLabels = [...new Set([1, 10, 20, maxDays])].map((d) =>
    `<text class="fw-tick" x="${x(d).toFixed(1)}" y="${LH - 8}" text-anchor="middle">${d}</text>`).join('');

  return `
    <div class="fw-line" data-max-days="${maxDays}">
      <svg viewBox="0 0 ${LW} ${LH}" class="fw-chart" id="line-svg">
        <defs>
          <linearGradient id="fw-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="var(--fw-out)" stop-opacity=".22"/>
            <stop offset="100%" stop-color="var(--fw-out)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${grid}
        <line class="fw-axis" x1="${LL}" y1="${y(0).toFixed(1)}" x2="${LW - LR}" y2="${y(0).toFixed(1)}"/>
        ${prevPath ? `<path class="fw-line__prev" d="${prevPath}"/>` : ''}
        ${todayDay && todayDay <= maxDays
          ? `<line class="fw-line__today" x1="${x(todayDay).toFixed(1)}" y1="${LT}" x2="${x(todayDay).toFixed(1)}" y2="${y(0).toFixed(1)}"/>`
          : ''}
        ${area ? `<path class="fw-line__area" d="${area}" fill="url(#fw-area-grad)"/>` : ''}
        ${curPath ? `<path class="fw-line__cur" d="${curPath}" pathLength="1"/>` : ''}
        ${curDrawn.length
          ? `<circle class="fw-line__tip" cx="${x(curDrawn.length).toFixed(1)}" cy="${y(curDrawn[curDrawn.length - 1]).toFixed(1)}" r="4"/>`
          : ''}
        <g id="line-hover" style="opacity:0;transition:opacity var(--ox-t-1) var(--ox-ease-soft)">
          <line class="fw-hairline" id="line-hair" x1="0" y1="${LT}" x2="0" y2="${y(0).toFixed(1)}"/>
          <circle class="fw-line__hover" id="line-dot" r="4.5" cx="0" cy="0"/>
          <circle class="fw-line__hover fw-line__hover--prev" id="line-dot-prev" r="3" cx="0" cy="0"/>
        </g>
        ${xLabels}
      </svg>
      <div class="fw-readout" id="line-readout">
        <span class="fw-key fw-key--out"><i class="fw-key__line"></i> este mes</span>
        <span class="fw-key fw-key--prev"><i class="fw-key__line"></i> mes anterior</span>
      </div>
    </div>`;
}

export function wireLine(root, cur, prev, todayDay) {
  const svg = root.querySelector('#line-svg');
  const readout = root.querySelector('#line-readout');
  const hover = root.querySelector('#line-hover');
  if (!svg || !readout || !hover) return;

  const curDrawn = todayDay ? cur.slice(0, todayDay) : cur;
  const maxDays = Math.max(cur.length, prev.length, 2);
  const maxVal = Math.max(curDrawn[curDrawn.length - 1] ?? 0, prev[prev.length - 1] ?? 0, 1);
  const x = (day) => LL + ((day - 1) / (maxDays - 1)) * LIW;
  const y = (v) => LT + LIH - (v / maxVal) * LIH;

  const hair = root.querySelector('#line-hair');
  const dot = root.querySelector('#line-dot');
  const dotPrev = root.querySelector('#line-dot-prev');
  const idle = readout.innerHTML;

  svg.addEventListener('mousemove', (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * LW;
    const day = Math.max(1, Math.min(maxDays, Math.round(((px - LL) / LIW) * (maxDays - 1)) + 1));
    const vCur = day <= curDrawn.length ? curDrawn[day - 1] : null;
    const vPrev = day <= prev.length ? prev[day - 1] : null;

    hover.style.opacity = '1';
    hair.setAttribute('x1', x(day).toFixed(1));
    hair.setAttribute('x2', x(day).toFixed(1));
    dot.style.opacity = vCur != null ? '1' : '0';
    if (vCur != null) { dot.setAttribute('cx', x(day).toFixed(1)); dot.setAttribute('cy', y(vCur).toFixed(1)); }
    dotPrev.style.opacity = vPrev != null ? '1' : '0';
    if (vPrev != null) { dotPrev.setAttribute('cx', x(day).toFixed(1)); dotPrev.setAttribute('cy', y(vPrev).toFixed(1)); }

    readout.innerHTML = `
      <span class="fw-readout__label">DÍA ${String(day).padStart(2, '0')}</span>
      ${vCur != null ? `<span class="fw-readout__out">${fmtARS(vCur)}</span>` : ''}
      ${vPrev != null ? `<span class="ox-dim">mes ant. ${fmtARS(vPrev)}</span>` : ''}`;
  });

  svg.addEventListener('mouseleave', () => {
    hover.style.opacity = '0';
    readout.innerHTML = idle;
  });
}

/* ══ Barras: flujo de los últimos meses ══════════════════════════════════════ */

const BW = 560, BH = 230, BL = 56, BR = 16, BT = 18, BB = 30;
const BIW = BW - BL - BR, BIH = BH - BT - BB;

export function barsHTML(flow, selected) {
  const maxVal = Math.max(...flow.map((f) => Math.max(f.income, f.expense)), 1);
  const slot = BIW / flow.length;
  const barW = Math.min(20, slot / 3.2);
  const y = (v) => BT + BIH - (v / maxVal) * BIH;

  const grid = [0.5, 1].map((f) => {
    const v = f * maxVal;
    return `<line class="fw-grid-line" x1="${BL}" y1="${y(v).toFixed(1)}" x2="${BW - BR}" y2="${y(v).toFixed(1)}"/>
            <text class="fw-tick" x="${BL - 8}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${fmtCompact(v)}</text>`;
  }).join('');

  const groups = flow.map((f, i) => {
    const cx = BL + slot * i + slot / 2;
    const hIn = Math.max(BT + BIH - y(f.income), f.income > 0 ? 2 : 0);
    const hOut = Math.max(BT + BIH - y(f.expense), f.expense > 0 ? 2 : 0);
    return `
      <g class="fw-bargroup" data-i="${i}" data-ym="${f.ym}" style="animation-delay:${i * 60}ms;transform-origin:${cx.toFixed(1)}px ${(BT + BIH).toFixed(1)}px">
        <rect x="${(BL + slot * i).toFixed(1)}" y="${BT}" width="${slot.toFixed(1)}" height="${BIH + BB}" fill="transparent"/>
        <rect class="fw-bar fw-bar--in"  x="${(cx - barW - 2).toFixed(1)}" y="${y(f.income).toFixed(1)}"  width="${barW.toFixed(1)}" height="${hIn.toFixed(1)}"  rx="2"/>
        <rect class="fw-bar fw-bar--out" x="${(cx + 2).toFixed(1)}"        y="${y(f.expense).toFixed(1)}" width="${barW.toFixed(1)}" height="${hOut.toFixed(1)}" rx="2"/>
        <text class="fw-bar-month${f.ym === selected ? ' is-selected' : ''}" x="${cx.toFixed(1)}" y="${BH - 9}" text-anchor="middle">${monthShort(f.ym)}</text>
      </g>`;
  }).join('');

  return `
    <div class="fw-bars">
      <svg viewBox="0 0 ${BW} ${BH}" class="fw-chart" id="bars-svg">
        ${grid}
        <line class="fw-axis" x1="${BL}" y1="${y(0).toFixed(1)}" x2="${BW - BR}" y2="${y(0).toFixed(1)}"/>
        ${groups}
      </svg>
      <div class="fw-readout" id="bars-readout">
        <span class="fw-key fw-key--in"><i class="fw-key__dot"></i> ingresos</span>
        <span class="fw-key fw-key--out"><i class="fw-key__dot"></i> gastos</span>
        <span class="fw-readout__hint">click en un mes para verlo</span>
      </div>
    </div>`;
}

export function wireBars(root, flow, onPick) {
  const svg = root.querySelector('#bars-svg');
  const readout = root.querySelector('#bars-readout');
  if (!svg || !readout) return;
  const groups = [...svg.querySelectorAll('.fw-bargroup')];
  const idle = readout.innerHTML;

  groups.forEach((g) => {
    const f = flow[Number(g.dataset.i)];
    g.addEventListener('mouseenter', () => {
      groups.forEach((o) => o.classList.toggle('is-dim', o !== g));
      const net = f.income - f.expense;
      readout.innerHTML = `
        <span class="fw-readout__label">${monthShort(f.ym)} ${f.ym.slice(0, 4)}</span>
        <span class="fw-readout__in">+${fmtARS(f.income)}</span>
        <span class="fw-readout__out">−${fmtARS(f.expense)}</span>
        <span class="fw-readout__net fw-readout__net--${net < 0 ? "neg" : "pos"}">= ${fmtARS(net)}</span>`;
    });
    g.addEventListener('click', () => onPick(f.ym));
  });

  svg.addEventListener('mouseleave', () => {
    groups.forEach((o) => o.classList.remove('is-dim'));
    readout.innerHTML = idle;
  });
}
