/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — Presupuestos
   Un tope mensual por categoría de gasto, y contra él lo que va del mes: cuánto
   queda, y en el mes en curso, si a este ritmo te pasás y qué día.

   El tope se escribe en la misma fila, como una celda: no hay modal ni botón de
   guardar. Vacío es "sin tope". Igual que la calculadora, vive en su propio
   documento (`presupuestos.json`) y no toca los movimientos.

   El mes es el de toda la app (S.month): el encabezado navega igual que en
   Resumen y Movimientos.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Toast } from '../overlays.js';
import Router from '../router.js';
import { stagger } from '../motion.js';
import { esc, head, paint, viewEl } from '../ui.js';
import { catColor, catLabel } from './categories.js';
import { fmtARS, monthTitle, parseAmount } from './format.js';
import { monthNavHTML, wireMonthNav } from './views.js';
import { estadoPresupuesto } from './plan.js';
import { S } from './state.js';

const DOC = 'presupuestos';

let topes = {};
let guardadoPendiente = null;

/** Se llama en el arranque: así la vista pinta de una, sin estado de carga. */
export async function cargarPresupuestos() {
  try {
    const doc = await window.onyx.doc.read(DOC, null);
    const crudos = doc?.topes && typeof doc.topes === 'object' ? doc.topes : {};
    topes = Object.fromEntries(Object.entries(crudos).filter(([, v]) => Number.isFinite(v) && v > 0));
  } catch (err) {
    console.warn('[presupuestos] no se pudieron leer, arranca sin topes:', err.message);
    topes = {};
  }
}

/* Con demora, como la calculadora: tipear un tope de seis cifras no son seis
   escrituras. Al salir de la vista se guarda lo pendiente de una. */
function guardarYa() {
  clearTimeout(guardadoPendiente);
  guardadoPendiente = null;
  return window.onyx.doc.write(DOC, { schema: 1, topes }).catch((err) => {
    Toast.show({ title: 'No se pudo guardar el presupuesto', text: err.message, icon: 'alert' });
  });
}

function guardarLuego() {
  clearTimeout(guardadoPendiente);
  guardadoPendiente = setTimeout(guardarYa, 400);
}

/* ── Lo que dice cada fila ───────────────────────────────────────────────── */

/** El renglón de abajo de la barra: qué pasa con esta categoría. */
function detalleDe(f) {
  if (f.tope == null) {
    return f.gastado > 0 ? `${fmtARS(f.gastado)} gastado` : 'Sin gastos este mes';
  }
  const base = `${fmtARS(f.gastado)} de ${fmtARS(f.tope)}`;
  if (f.excedido) return `${base} · te pasaste ${fmtARS(-f.queda)}`;
  if (f.diaExceso) return `${base} · a este ritmo te pasás el día ${f.diaExceso}`;
  return `${base} · quedan ${fmtARS(f.queda)}`;
}

/** El valor que va en el campo: con puntos de miles y sin el $, que ya está
    dibujado al lado. parseAmount lo lee de vuelta igual. */
const nfTope = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const topeTexto = (t) => (t == null ? '' : nfTope.format(t));

const filaHTML = (f, ritmo) => `
  <div class="fw-budget__row ox-in-rise${f.tope == null ? ' is-free' : ''}${f.excedido ? ' is-over' : ''}${f.diaExceso ? ' is-warn' : ''}"
       data-cat="${esc(f.cat)}">
    <span class="fw-cat fw-budget__cat"><span class="fw-dot" style="background:${catColor(f.cat)}"></span>${esc(catLabel(f.cat))}</span>
    <div class="fw-budget__state">
      <div class="ox-meter fw-budget__meter${f.excedido ? ' ox-meter--danger' : ''}">
        <div class="ox-meter__fill" style="--ox-pct:${pctCSS(f)}"></div>
        ${ritmo != null ? `<span class="fw-budget__pace" style="left:${(ritmo * 100).toFixed(2)}%"></span>` : ''}
      </div>
      <span class="fw-budget__detail ox-copyable">
        <i data-icon="alert" data-icon-class="fw-budget__warn"></i><span class="fw-budget__text">${esc(detalleDe(f))}</span>
      </span>
    </div>
    <div class="fw-calc__monto fw-budget__tope">
      <span class="fw-calc__currency">$</span>
      <input class="ox-input ox-input--mono fw-calc__input" data-tope="${esc(f.cat)}" value="${esc(topeTexto(f.tope))}"
             placeholder="Sin tope" inputmode="decimal" spellcheck="false" autocomplete="off"
             aria-label="Tope mensual de ${esc(catLabel(f.cat))}">
    </div>
  </div>`;

const pctCSS = (f) => `${f.tope == null ? 0 : Math.min(100, f.pct * 100).toFixed(2)}%`;

/* Los KPIs se identifican por `data-k`: al tipear un tope se les cambia el
   texto sin repintarlos, que si no la animación de entrada se dispararía en
   cada tecla. Solo se rearman cuando cambia CUÁLES hay. */
const kpi = (k, label, value, { sub = '', grande = false } = {}) => `
  <div class="fw-kpi${grande ? ' fw-kpi--bal' : ''}" data-k="${k}">
    <div class="ox-stat">
      <span class="ox-stat__label">${label}</span>
      <span class="ox-stat__value ox-copyable">${value}</span>
      <span class="fw-kpi__sub">${sub}</span>
    </div>
  </div>`;

function kpisDe(e) {
  if (!e.presupuestado) return [];
  const out = [
    ['pres', 'Presupuestado', fmtARS(e.presupuestado), { sub: e.sinTope ? `${fmtARS(e.sinTope)} en categorías sin tope` : '' }],
    ['gast', 'Gastado', fmtARS(e.gastado), {}],
    ['queda', e.queda < 0 ? 'Te pasaste' : 'Queda', fmtARS(Math.abs(e.queda)), { grande: true }],
  ];
  if (e.porDia != null) {
    // Sin centavos y hacia abajo: es un "podés gastar hasta", y redondear para
    // arriba sería prometer unos pesos que no están.
    out.push(['dia', 'Por día', fmtARS(Math.floor(e.porDia)),
      { sub: `para no pasarte, ${e.restantes === 1 ? 'queda hoy' : `quedan ${e.restantes} días`}` }]);
  }
  return out;
}

const INTRO = `<p class="fw-budget__intro">Poné un tope mensual a las categorías que quieras cuidar.
  El mismo tope vale para todos los meses, y acá ves cuánto te queda de cada uno.</p>`;

const kpisHTML = (e) => {
  const ks = kpisDe(e);
  return ks.length ? ks.map(([k, ...r]) => kpi(k, ...r)).join('') : INTRO;
};

function actualizarKpis(box, e) {
  const ks = kpisDe(e);
  const hay = [...box.querySelectorAll('[data-k]')].map((el) => el.dataset.k).join();
  if (!ks.length || hay !== ks.map(([k]) => k).join()) { box.innerHTML = kpisHTML(e); return; }
  for (const [k, label, value, { sub = '' }] of ks) {
    const el = box.querySelector(`[data-k="${k}"]`);
    el.querySelector('.ox-stat__label').textContent = label;
    el.querySelector('.ox-stat__value').textContent = value;
    el.querySelector('.fw-kpi__sub').textContent = sub;
  }
}

/* ── Vista ───────────────────────────────────────────────────────────────── */

export function viewPresupuestos() {
  const e = estadoPresupuesto(S.moves, S.month, topes);
  // Las que tienen tope primero: son las que se vienen a mirar. Se ordena al
  // pintar y nunca mientras se tipea, así la fila no se escapa del cursor.
  const filas = [...e.filas.filter((f) => f.tope != null), ...e.filas.filter((f) => f.tope == null)];
  const n = filas.filter((f) => f.tope != null).length;

  paint(
    head({
      title: monthTitle(S.month),
      sub: n ? `${n} ${n === 1 ? 'categoría' : 'categorías'} con tope` : 'Sin topes todavía',
      actions: monthNavHTML(),
      linea: true,
    })
    + `<div class="ox-scroll ox-grow">
         <div class="fw-kpis" id="bg-kpis">${kpisHTML(e)}</div>
         <section class="ox-card fw-budget">
           <div class="ox-card__head">
             <span class="ox-label">Topes por categoría</span>
             <span class="ox-meta fw-budget__hint">${e.ritmo != null
               ? 'La marca en cada barra es cuánto del mes ya pasó'
               : 'El tope es mensual y vale para todos los meses'}</span>
           </div>
           <div class="fw-budget__rows" id="bg-rows">${filas.map((f) => filaHTML(f, e.ritmo)).join('')}</div>
         </section>
       </div>`,
  );

  const root = viewEl();
  const lista = root.querySelector('#bg-rows');
  stagger(lista);
  wireMonthNav(root, () => Router.refresh());

  lista.addEventListener('input', (ev) => {
    const cat = ev.target.dataset.tope;
    if (!cat) return;
    const texto = ev.target.value.trim();
    const n = texto ? parseAmount(texto) : null;
    const invalido = texto !== '' && !(Number.isFinite(n) && n >= 0);
    ev.target.classList.toggle('is-invalid', invalido);
    if (invalido) return;
    if (n) topes[cat] = Math.round(n * 100) / 100;
    else delete topes[cat];
    actualizar(root);
    guardarLuego();
  });

  // Enter baja al tope de la fila siguiente, como en la calculadora.
  lista.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || !ev.target.dataset.tope) return;
    ev.preventDefault();
    const sig = ev.target.closest('.fw-budget__row').nextElementSibling;
    if (sig) sig.querySelector('[data-tope]').focus();
    else ev.target.blur();
  });

  Router.onLeave(() => { if (guardadoPendiente) guardarYa(); });
}

/** Al tipear un tope se actualiza lo que depende de él SIN repintar: la barra
    viaja con su transición y el cursor sigue donde estaba. */
function actualizar(root) {
  const e = estadoPresupuesto(S.moves, S.month, topes);
  for (const f of e.filas) {
    const row = root.querySelector(`.fw-budget__row[data-cat="${CSS.escape(f.cat)}"]`);
    if (!row) continue;
    row.classList.toggle('is-free', f.tope == null);
    row.classList.toggle('is-over', f.excedido);
    row.classList.toggle('is-warn', !!f.diaExceso);
    row.querySelector('.fw-budget__meter').classList.toggle('ox-meter--danger', f.excedido);
    row.querySelector('.ox-meter__fill').style.setProperty('--ox-pct', pctCSS(f));
    row.querySelector('.fw-budget__text').textContent = detalleDe(f);
  }
  actualizarKpis(root.querySelector('#bg-kpis'), e);
  const n = e.filas.filter((f) => f.tope != null).length;
  const sub = root.querySelector('.ox-viewhead__sub');
  if (sub) sub.textContent = n ? `${n} ${n === 1 ? 'categoría' : 'categorías'} con tope` : 'Sin topes todavía';
}
