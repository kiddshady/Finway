/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY · TERMINAL — F1 Resumen
   El mes en cinco paneles: 01 el balance (la cifra grande), 02 el gasto por
   categoría contra el mes anterior, 03 el drenaje acumulado —o la tendencia
   por categoría, el mismo panel en otro modo—, 04 los últimos movimientos y
   05 los meses lado a lado.

   El mes es el de toda la app (S.month): cambiarlo repinta la vista (un
   fundido) y las cifras corren del mes viejo al nuevo (rodar con clave).
   ═══════════════════════════════════════════════════════════════════════════ */

import Router from '../router.js';
import { esc, paint, viewEl } from '../ui.js';
import { catColor, catLabel } from './categories.js';
import { currentMonth, shiftMonth, todayStr } from './format.js';
import { byCategory, categoryTrend, cumulativeFlow, monthlyFlow, monthTotals, movesOf } from './stats.js';
import { trendHTML, wireTrend } from './trend.js';
import { chromeChanged, S } from './state.js';
import { cifra, corta, entero, MENOS, mesCorto, mesSigla, panel, pct, relevo, rodar, variacion } from './term.js';

/* Lo que el panel 03 recuerda mientras la app está abierta. */
const R = {
  modo: 'acumulado',                      // acumulado | tendencia
  ver: { out: true, in: true, prev: true },
};
const RANGOS = [6, 12];
let trendElegidas = null;                 // null = todas (hasta que el usuario toque una)
const trendSel = (t) => trendElegidas ?? new Set(t.series.map((s) => s.cat));

const fechaCorta = (d) => `${d.slice(8)} ${mesSigla(d.slice(0, 7))}`;

/* ══ La vista ════════════════════════════════════════════════════════════════ */

export function viewResumen() {
  const ym = S.month;
  const ant = shiftMonth(ym, -1);
  const hayAnt = movesOf(S.moves, ant).length > 0;

  paint(`
    <div class="fw-screen fw-res">
      ${panel({ n: '01', t: 'Balance', m: mesCorto(ym), cls: 'fw-res__bal', body: balanceHTML() })}
      ${panel({
        n: '03', t: R.modo === 'acumulado' ? 'Drenaje acumulado' : 'Tendencia por categoría',
        m: R.modo === 'acumulado' ? `${mesSigla(ym)} VS ${mesSigla(ant)}` : `${S.trendRange} MESES`,
        cls: 'fw-res__dren',
        head: `<div class="fw-seg" id="res-modo">
            <button class="fw-seg__o${R.modo === 'acumulado' ? ' is-on' : ''}" data-modo="acumulado">ACUMULADO</button>
            <button class="fw-seg__o${R.modo === 'tendencia' ? ' is-on' : ''}" data-modo="tendencia">TENDENCIA</button>
          </div>`,
        body: '<div class="fw-dren" id="res-dren"></div>',
      })}
      ${panel({ n: '02', t: 'Gasto por categoría', m: '', cls: 'fw-res__cat', attrs: 'id="res-cat"',
        body: '<div class="ox-scroll ox-scroll--line-top ox-scroll--line-bottom fw-scroll" id="res-cat-zone"></div>' })}
      ${panel({ n: '04', t: 'Últimos movimientos', m: '', cls: 'fw-res__ult', attrs: 'id="res-ult"',
        body: '<div class="ox-scroll ox-scroll--line-top ox-scroll--line-bottom fw-scroll"><ul class="fw-feed" id="res-feed"></ul></div>' })}
      ${panel({ n: '05', t: 'Meses', m: 'ING / GAS', cls: 'fw-res__mes', body: '<div class="fw-months" id="res-meses"></div>' })}
    </div>`);

  const root = viewEl();
  pintarBalance(root, ym, ant, hayAnt);
  pintarCategorias(root, ym, ant, hayAnt);
  pintarFeed(root, ym);
  pintarMeses(root, ym);
  pintarPanel03(root, true);

  root.querySelector('#res-modo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-modo]');
    if (!b || b.dataset.modo === R.modo) return;
    R.modo = b.dataset.modo;
    root.querySelectorAll('#res-modo .fw-seg__o').forEach((x) => x.classList.toggle('is-on', x === b));
    const p = root.querySelector('.fw-res__dren');
    relevo(p.querySelector('.fw-p__t'), () => { p.querySelector('.fw-p__t').textContent = R.modo === 'acumulado' ? 'Drenaje acumulado' : 'Tendencia por categoría'; });
    relevo(p.querySelector('.fw-p__m'), () => { p.querySelector('.fw-p__m').textContent = R.modo === 'acumulado' ? `${mesSigla(ym)} VS ${mesSigla(ant)}` : `${S.trendRange} MESES`; });
    pintarPanel03(root, false);
  });
}

/* ══ 01 Balance ══════════════════════════════════════════════════════════════ */

function balanceHTML() {
  return `
    <div class="fw-bal">
      <div class="fw-bal__k">RESULTADO DEL MES</div>
      <div class="fw-bal__big ox-copyable"><span class="fw-bal__cur">$</span><span id="bal-big">0</span></div>
      <div class="fw-bal__vs" id="bal-vs"></div>
      <div class="fw-ratio">
        <div class="fw-ratio__bar"><div class="fw-ratio__fill" id="bal-ratio"></div></div>
        <div class="fw-ratio__lbl"><span>GASTADO SOBRE INGRESADO</span><span id="bal-ratio-p">—</span></div>
      </div>
      <div class="fw-bal__kv ox-copyable" id="bal-kv"></div>
    </div>`;
}

function pintarBalance(root, ym, ant, hayAnt) {
  const t = monthTotals(S.moves, ym);
  const p = monthTotals(S.moves, ant);
  rodar(root.querySelector('#bal-big'), t.balance, cifra, 700, 'res.bal');
  root.querySelector('#bal-vs').innerHTML = hayAnt
    ? `VS ${mesSigla(ant)} <span>${cifra(p.balance, { signo: true })}</span> ${variacion(t.balance, p.balance, { subeBien: true })}`
    : 'SIN MES ANTERIOR PARA COMPARAR';
  const r = t.income ? t.expense / t.income : (t.expense ? 1.01 : 0);
  const fill = root.querySelector('#bal-ratio');
  fill.classList.toggle('is-over', r > 1);
  requestAnimationFrame(() => requestAnimationFrame(() => fill.style.setProperty('--p', Math.min(1, r))));
  rodar(root.querySelector('#bal-ratio-p'), r * 100, (v) => (t.income ? `${entero(v)}%` : '—'), 700, 'res.ratio');

  const actual = ym === currentMonth();
  const filas = [
    ['INGRESOS', t.income, hayAnt ? variacion(t.income, p.income, { subeBien: true }) : ''],
    ['GASTOS', t.expense, hayAnt ? variacion(t.expense, p.expense) : ''],
    ['DRENAJE / DÍA', t.rate, hayAnt ? variacion(t.rate, p.rate) : ''],
    actual && t.projection > 0
      ? ['PROYECCIÓN', t.projection, '<span class="fw-dim">A FIN DE MES</span>']
      : ['MOVIMIENTOS', t.count, ''],
  ];
  const kv = root.querySelector('#bal-kv');
  kv.innerHTML = filas.map(([k], i) => `<span class="fw-bal__kk">${k}</span><span class="fw-bal__kvv" data-i="${i}">0</span><span class="fw-bal__kd">${filas[i][2]}</span>`).join('');
  filas.forEach(([k, v], i) => rodar(kv.querySelector(`[data-i="${i}"]`), v, k === 'MOVIMIENTOS' ? entero : cifra, 700, `res.kv.${k}`));
}

/* ══ 02 Categorías ═══════════════════════════════════════════════════════════ */

function pintarCategorias(root, ym, ant, hayAnt) {
  const cats = byCategory(S.moves, ym);
  const antes = new Map(byCategory(S.moves, ant).map((c) => [c.cat, c.total]));
  const total = cats.reduce((a, c) => a + c.total, 0);
  const max = Math.max(1, ...cats.map((c) => c.total));
  root.querySelector('#res-cat .fw-p__m').textContent = cats.length ? `${cats.length} CAT · ${corta(total)}` : '';
  const zona = root.querySelector('#res-cat-zone');
  if (!cats.length) {
    zona.innerHTML = '<div class="fw-empty"><div><b>SIN GASTOS</b>ESTE MES TODAVÍA NO SALIÓ NADA</div></div>';
    return;
  }
  zona.innerHTML = `
    <table class="fw-tbl ox-copyable"><thead><tr><th>CATEGORÍA</th><th>GASTO</th><th>%</th><th>VS ${mesSigla(ant)}</th><th></th></tr></thead><tbody>
    ${cats.map((c) => `<tr class="fw-res__catrow" data-cat="${esc(c.cat)}" style="--c:${catColor(c.cat)}" data-tip="Ver los movimientos de ${esc(catLabel(c.cat))}">
      <td><span class="fw-cat"><i></i>${esc(catLabel(c.cat).toUpperCase())}</span></td>
      <td>${cifra(c.total)}</td>
      <td class="fw-dim">${pct(c.total / total)}</td>
      <td>${hayAnt ? variacion(c.total, antes.get(c.cat) || 0) : '<span class="fw-d fw-d--eq">—</span>'}</td>
      <td><div class="fw-share"><i style="--p:0" data-p="${c.total / max}"></i></div></td>
    </tr>`).join('')}
    </tbody></table>`;
  requestAnimationFrame(() => requestAnimationFrame(() =>
    zona.querySelectorAll('.fw-share i').forEach((i) => i.style.setProperty('--p', i.dataset.p))));
  zona.addEventListener('click', (e) => {
    const tr = e.target.closest('[data-cat]');
    if (!tr) return;
    S.filter = 'expense';
    S.cat = tr.dataset.cat;
    Router.go('movimientos');
  });
}

/* ══ 04 Últimos ══════════════════════════════════════════════════════════════ */

function pintarFeed(root, ym) {
  const lista = movesOf(S.moves, ym)
    .map((m, i) => ({ m, i }))
    .sort((a, b) => b.m.date.localeCompare(a.m.date) || b.i - a.i)
    .map(({ m }) => m);
  root.querySelector('#res-ult .fw-p__m').textContent = `${lista.length} EN EL MES`;
  const ul = root.querySelector('#res-feed');
  if (!lista.length) {
    ul.outerHTML = '<div class="fw-empty"><div><b>SIN MOVIMIENTOS</b><p>Cargalos en la línea de abajo: <span class="fw-acc">gasto 4500 transporte uber</span></p></div></div>';
    return;
  }
  ul.innerHTML = lista.map((m) => `
    <li data-id="${esc(m.id)}" style="--c:${catColor(m.category)}">
      <span class="fw-feed__d">${fechaCorta(m.date)}</span>
      <span class="fw-feed__m"><i></i><span>${esc(m.note || catLabel(m.category).toLowerCase())}</span></span>
      <span class="fw-feed__a${m.type === 'income' ? ' fw-in' : ''}">${m.type === 'income' ? '+' : MENOS}${cifra(m.amount)}</span>
    </li>`).join('');
  ul.addEventListener('click', (e) => {
    const li = e.target.closest('[data-id]');
    if (!li) return;
    S.verMov = li.dataset.id;
    Router.go('movimientos');
  });
}

/* ══ 05 Meses ════════════════════════════════════════════════════════════════
   Seis meses lado a lado, ingreso y gasto. La ventana termina en el mes en
   curso —o en el que se esté mirando, si es más nuevo— y se corre para que
   el elegido siempre esté adentro. Un clic lleva a ese mes. */

function pintarMeses(root, ym) {
  let fin = ym > currentMonth() ? ym : currentMonth();
  if (ym < shiftMonth(fin, -5)) fin = shiftMonth(ym, 5);
  const flujo = monthlyFlow(S.moves, fin, 6);
  const max = Math.max(1, ...flujo.flatMap((f) => [f.income, f.expense]));
  const box = root.querySelector('#res-meses');
  box.innerHTML = flujo.map((f) => {
    const bal = f.income - f.expense;
    const vacio = !f.income && !f.expense;
    return `<button class="fw-mcol${f.ym === ym ? ' is-sel' : ''}" data-ym="${f.ym}" data-tip="${mesCorto(f.ym)}: entró ${cifra(f.income)}, salió ${cifra(f.expense)}">
      <div class="fw-mcol__bars"><i class="fw-mcol__in" style="--p:0" data-p="${f.income / max}"></i><i class="fw-mcol__out" style="--p:0" data-p="${f.expense / max}"></i></div>
      <div class="fw-mcol__n">${mesSigla(f.ym)}</div>
      <div class="fw-mcol__b ${vacio ? 'fw-dim' : bal < 0 ? 'fw-out' : 'fw-in'}">${vacio ? '—' : corta(bal)}</div>
    </button>`;
  }).join('');
  requestAnimationFrame(() => requestAnimationFrame(() =>
    box.querySelectorAll('[data-p]').forEach((i) => i.style.setProperty('--p', i.dataset.p))));
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ym]');
    if (!b || b.dataset.ym === S.month) return;
    S.month = b.dataset.ym;
    chromeChanged();
    Router.refresh();
  });
}

/* ══ 03 Drenaje acumulado / Tendencia ════════════════════════════════════════ */

function pintarPanel03(root, primero) {
  const zona = root.querySelector('#res-dren');
  relevo(zona, () => {
    if (R.modo === 'acumulado') {
      zona.innerHTML = `
        <div class="fw-dren__legend">
          <button class="fw-chip${R.ver.out ? ' is-on' : ''}" data-s="out" style="--c:var(--ox-accent)"><i></i>GASTO</button>
          <button class="fw-chip${R.ver.in ? ' is-on' : ''}" data-s="in" style="--c:var(--fw-in)"><i></i>INGRESO</button>
          <button class="fw-chip fw-chip--dash${R.ver.prev ? ' is-on' : ''}" data-s="prev" style="--c:var(--ox-text-3)"><i></i>GASTO MES ANT.</button>
        </div>
        <div class="fw-dren__chart" id="dren-chart"><svg id="dren-svg"></svg><div class="fw-readout" id="dren-ro"></div></div>`;
      cablearAcumulado(zona);
    } else {
      const t = categoryTrend(S.moves, S.month, S.trendRange);
      const sel = trendSel(t);
      zona.innerHTML = `
        <div class="fw-dren__legend">
          <div class="fw-seg" id="trend-range">${RANGOS.map((n) =>
            `<button class="fw-seg__o${S.trendRange === n ? ' is-on' : ''}" data-n="${n}">${n} MESES</button>`).join('')}</div>
        </div>
        <div class="fw-dren__trend" id="trend-box">${trendHTML(t, sel)}</div>`;
      wireTrend(zona.querySelector('.fw-trend'), t, sel, (s) => { trendElegidas = s; });
      zona.querySelector('#trend-range').addEventListener('click', (e) => {
        const b = e.target.closest('[data-n]');
        if (!b || Number(b.dataset.n) === S.trendRange) return;
        S.trendRange = Number(b.dataset.n);
        zona.querySelectorAll('#trend-range .fw-seg__o').forEach((x) => x.classList.toggle('is-on', x === b));
        viewEl().querySelector('.fw-res__dren .fw-p__m').textContent = `${S.trendRange} MESES`;
        const box = zona.querySelector('#trend-box');
        relevo(box, () => {
          const t2 = categoryTrend(S.moves, S.month, S.trendRange);
          const sel2 = trendSel(t2);
          box.innerHTML = trendHTML(t2, sel2);
          wireTrend(box.querySelector('.fw-trend'), t2, sel2, (s) => { trendElegidas = s; });
        });
      });
    }
  }, primero);
}

/* El gráfico se dibuja al tamaño real del panel (no un viewBox estirado: las
   letras de los ejes se deformarían) y se vuelve a dibujar si el panel cambia
   de tamaño. En el mes en curso las líneas terminan HOY: más allá no pasó
   nada todavía, y una línea plana hasta el 31 diría que no se va a gastar. */
function cablearAcumulado(zona) {
  const box = zona.querySelector('#dren-chart');
  const svg = zona.querySelector('#dren-svg');
  const ro = zona.querySelector('#dren-ro');
  const ym = S.month;
  const actual = ym === currentMonth();
  const hoy = actual ? Number(todayStr().slice(8, 10)) : null;
  const corte = (arr) => (hoy ? arr.slice(0, hoy) : arr);
  const out = corte(cumulativeFlow(S.moves, ym));
  const inn = corte(cumulativeFlow(S.moves, ym, 'income'));
  const antes = cumulativeFlow(S.moves, shiftMonth(ym, -1));
  const D = cumulativeFlow(S.moves, ym).length;
  let G = null;

  const dibujar = (animar) => {
    const W = box.clientWidth, H = box.clientHeight;
    if (W < 40 || H < 40) return;
    const pad = { l: 14, r: 64, t: 12, b: 22 };
    // La escala incluye siempre al mes anterior: prender o apagar su línea no
    // tiene que mover las otras dos.
    const techo = Math.max(1, out.at(-1) || 0, inn.at(-1) || 0, antes.at(-1) || 0) * 1.08;
    const x = (i, n = D) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v / techo) * (H - pad.t - pad.b);
    const camino = (arr, n = D) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i, n).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => (f * techo) / 1.08);
    const area = out.length ? `${camino(out)} L${x(out.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z` : '';
    svg.innerHTML = `
      <defs><linearGradient id="dren-ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--ox-accent)" stop-opacity=".16"/><stop offset="1" stop-color="var(--ox-accent)" stop-opacity="0"/></linearGradient></defs>
      ${marcas.map((v) => `<line class="fw-g-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="fw-g-lbl" x="${W - pad.r + 10}" y="${y(v) + 4}">${corta(v)}</text>`).join('')}
      ${[1, 10, 20, D].map((d) => `<text class="fw-g-lbl" x="${x(d - 1)}" y="${H - 6}" text-anchor="middle">${d}</text>`).join('')}
      ${hoy ? `<line class="fw-g-hoy" x1="${x(hoy - 1)}" x2="${x(hoy - 1)}" y1="${pad.t}" y2="${H - pad.b}"/>` : ''}
      <path class="fw-s fw-area${R.ver.out ? '' : ' is-off'}" data-s="out" d="${area}" fill="url(#dren-ga)"/>
      ${antes.some((v) => v) ? `<path class="fw-s fw-s--prev${R.ver.prev ? '' : ' is-off'}" data-s="prev" d="${camino(antes, antes.length)}"/>` : ''}
      <path class="fw-s fw-s--in fw-s--draw${R.ver.in ? '' : ' is-off'}" data-s="in" d="${camino(inn)}"/>
      <path class="fw-s fw-s--out fw-s--draw${R.ver.out ? '' : ' is-off'}" data-s="out" d="${camino(out)}"/>
      <g class="fw-xh" id="dren-xh"><line id="dren-xl" y1="${pad.t}" y2="${H - pad.b}"/><circle id="dren-co" r="3.5"/><circle id="dren-ci" r="3.5"/></g>
      <rect id="dren-hit" x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="${H}" fill="transparent"/>`;
    G = { x, y, W };
    if (animar) {
      svg.querySelectorAll('.fw-s--draw').forEach((p) => {
        const L = p.getTotalLength();
        if (!L) return;
        p.style.strokeDasharray = L;
        p.style.strokeDashoffset = L;
        p.getBoundingClientRect();
        p.style.transition = 'stroke-dashoffset 1100ms cubic-bezier(.16,1,.3,1), opacity 320ms';
        p.style.strokeDashoffset = 0;
      });
    }
    const hit = svg.querySelector('#dren-hit');
    hit.addEventListener('mousemove', (e) => leer(e, hit));
    hit.addEventListener('mouseleave', () => { svg.querySelector('#dren-xh')?.classList.remove('is-on'); ro.classList.remove('is-on'); });
  };

  const leer = (e, hit) => {
    const r = hit.getBoundingClientRect();
    const i = Math.max(0, Math.min(D - 1, Math.round(((e.clientX - r.left) / r.width) * (D - 1))));
    const X = G.x(i);
    const xl = svg.querySelector('#dren-xl');
    xl.setAttribute('x1', X); xl.setAttribute('x2', X);
    const co = svg.querySelector('#dren-co');
    const ci = svg.querySelector('#dren-ci');
    const vo = out[Math.min(i, out.length - 1)] ?? 0;
    const vi = inn[Math.min(i, inn.length - 1)] ?? 0;
    const futuro = hoy && i >= hoy;
    co.setAttribute('cx', X); co.setAttribute('cy', G.y(vo)); co.style.opacity = R.ver.out && !futuro ? 1 : 0;
    ci.setAttribute('cx', X); ci.setAttribute('cy', G.y(vi)); ci.style.opacity = R.ver.in && !futuro ? 1 : 0;
    svg.querySelector('#dren-xh').classList.add('is-on');
    const pv = antes.length ? antes[Math.min(i, antes.length - 1)] : null;
    ro.innerHTML = `<div class="fw-readout__h">DÍA ${i + 1} · ${mesSigla(ym)}</div>
      ${futuro ? '<div class="fw-readout__r">TODAVÍA NO LLEGÓ</div>' : `
      <div class="fw-readout__r">GASTO <b>${cifra(vo)}</b></div>
      <div class="fw-readout__r">INGRESO <b>${cifra(vi)}</b></div>`}
      ${pv != null && antes.some((v) => v) ? `<div class="fw-readout__r">MES ANT. <b>${cifra(pv)}</b></div>` : ''}`;
    ro.style.left = `${X + 14 + 190 > G.W ? X - 14 - 190 : X + 14}px`;
    ro.classList.add('is-on');
  };

  dibujar(true);
  const obs = new ResizeObserver(() => dibujar(false));
  obs.observe(box);
  Router.onLeave(() => obs.disconnect());

  zona.querySelector('.fw-dren__legend').addEventListener('click', (e) => {
    const c = e.target.closest('[data-s]');
    if (!c) return;
    const k = c.dataset.s;
    R.ver[k] = !R.ver[k];
    c.classList.toggle('is-on', R.ver[k]);
    svg.querySelectorAll(`.fw-s[data-s="${k}"]`).forEach((p) => p.classList.toggle('is-off', !R.ver[k]));
  });
}
