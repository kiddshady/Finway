/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY · TERMINAL — F3 Presupuestos
   Un tope mensual por categoría de gasto, y contra él lo que va del mes:
   01 el global (presupuestado, gastado, lo que queda y cuánto por día), 02 la
   tabla de topes con un medidor de bloques por categoría y 03 la «lectura»:
   lo que una persona diría mirando la tabla, en criollo.

   En cada medidor la raya es HOY: cuánto del mes ya pasó. Si el relleno la
   pasó, se está gastando más rápido que parejo. Los bloques tenues son la
   proyección: hasta dónde llega a este ritmo.

   El tope se escribe en la misma fila, como una celda: no hay modal ni botón
   de guardar, y vacío es «sin tope». Vive en su propio documento
   (`presupuestos.json`) y no toca los movimientos. Las cuentas son de plan.js.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from '../icons.js';
import { Toast } from '../overlays.js';
import Router from '../router.js';
import { frase } from '../motion.js';
import { esc, paint, viewEl } from '../ui.js';
import { catColor, catLabel } from './categories.js';
import { currentMonth, daysInMonth, parseAmount } from './format.js';
import { estadoPresupuesto } from './plan.js';
import { S } from './state.js';
import { cifra, llenarMedidores, medidor, medir, mesCorto, mesSigla, panel, pct, relevo, rodar } from './term.js';

const DOC = 'presupuestos';
let topes = {};
let guardadoPendiente = null;

/** Para Ajustes: cuántas categorías tienen tope. */
export const resumenPresupuestos = () => ({ topes: Object.keys(topes).length });

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

/* Con demora: tipear un tope de seis cifras no son seis escrituras. Al salir
   de la vista se guarda lo pendiente de una. */
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

function estadoDe(f, e) {
  if (f.tope == null) return f.gastado ? ['off', 'SIN TOPE'] : ['off', '—'];
  if (f.excedido) return ['bad', `PASADO +${pct(f.gastado / f.tope - 1)}`];
  if (f.diaExceso) return ['warn', `SE PASA EL ${f.diaExceso}`];
  if (e.ritmo != null && f.pct > e.ritmo + 0.1) return ['warn', 'ADELANTADO'];
  return ['ok', e.actual ? 'EN RITMO' : 'DENTRO'];
}

const nfTope = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const topeTexto = (t) => (t == null ? '' : nfTope.format(t));
const medidorDe = (f, e) => ({
  p: f.tope ? Math.min(1, f.pct) : 0,
  q: f.tope && f.proyeccion ? Math.min(1, f.proyeccion / f.tope) : 0,
  r: e.ritmo,
  cls: f.excedido ? 'is-over' : '',
});

const filaHTML = (f, e) => {
  const [c, t] = estadoDe(f, e);
  return `
  <tr class="fw-topes__r${f.tope == null ? ' is-free' : ''}" data-cat="${esc(f.cat)}" style="--c:${catColor(f.cat)}">
    <td><span class="fw-cat"><i></i>${esc(catLabel(f.cat).toUpperCase())}</span></td>
    <td><input class="fw-fld fw-fld--num fw-topes__in" data-tope="${esc(f.cat)}" value="${esc(topeTexto(f.tope))}"
               placeholder="sin tope" inputmode="decimal" spellcheck="false" autocomplete="off"
               aria-label="Tope mensual de ${esc(catLabel(f.cat))}"></td>
    <td data-c="gas">${f.gastado ? cifra(f.gastado) : '—'}</td>
    <td data-c="queda" class="${f.queda < 0 ? 'fw-out' : ''}">${f.tope == null ? '—' : cifra(f.queda)}</td>
    <td class="fw-topes__m">${medidor({ ...medidorDe(f, e), cls: `${medidorDe(f, e).cls}${f.tope == null ? ' is-hidden' : ''}` })}</td>
    <td><span class="fw-estado fw-estado--${c}" data-c="est">${t}</span></td>
  </tr>`;
};

/* ── La lectura ──────────────────────────────────────────────────────────── */

const FLECHA = Icons.svg('chevronRight');
function lecturaDe(e) {
  const L = [];
  const mes = mesSigla(S.month);
  const nombre = (f) => `<b>${esc(catLabel(f.cat).toUpperCase())}</b>`;
  if (!e.presupuestado) {
    L.push('Poné un tope a las categorías que quieras cuidar: escribilo en la columna TOPE. El mismo tope vale para todos los meses.');
    return L;
  }
  for (const f of e.filas.filter((x) => x.excedido)) L.push(`${nombre(f)} se pasó del tope por <span class="fw-out">$ ${cifra(-f.queda)}</span>.`);
  for (const f of e.filas.filter((x) => x.diaExceso)) L.push(`${nombre(f)} va camino a pasarse: a este ritmo llega al tope el <span class="fw-acc">${f.diaExceso} ${mes}</span>.`);
  if (e.ritmo != null) {
    for (const f of e.filas.filter((x) => x.tope != null && !x.excedido && !x.diaExceso && x.pct > e.ritmo + 0.1)) {
      L.push(`${nombre(f)} gastó ${pct(f.pct)} del tope con ${pct(e.ritmo)} del mes andado.`);
    }
  }
  if (e.porDia != null) {
    L.push(`Para no pasarte del total podés gastar <span class="fw-in">$ ${cifra(Math.floor(e.porDia))}</span> por día (${e.restantes === 1 ? 'queda hoy' : `quedan ${e.restantes} días`}).`);
  } else if (e.queda < 0) {
    L.push(`En total te pasaste <span class="fw-out">$ ${cifra(-e.queda)}</span> de lo presupuestado.`);
  } else if (!e.actual) {
    L.push(`El mes cerró <span class="fw-in">$ ${cifra(e.queda)}</span> por debajo de lo presupuestado.`);
  }
  const sinTope = e.filas.filter((f) => f.tope == null && f.gastado > 0);
  if (sinTope.length) L.push(`Hay <b>$ ${cifra(e.sinTope)}</b> gastados en ${sinTope.length} ${sinTope.length === 1 ? 'categoría' : 'categorías'} sin tope.`);
  if (L.length === 0 || (L.length === 1 && e.porDia != null)) L.unshift('Todo en ritmo: ninguna categoría va camino a pasarse.');
  return L;
}
const lecturaHTML = (e) => lecturaDe(e).map((t, i) => `<li style="animation-delay:${i * 60}ms">${FLECHA}<span>${t}</span></li>`).join('');

/* ── Vista ───────────────────────────────────────────────────────────────── */

export function viewPresupuestos() {
  const e = estadoPresupuesto(S.moves, S.month, topes);
  // Las que tienen tope primero: son las que se vienen a mirar. Se ordena al
  // pintar y nunca mientras se tipea, así la fila no se escapa del cursor.
  const filas = [...e.filas.filter((f) => f.tope != null), ...e.filas.filter((f) => f.tope == null)];

  paint(`
    <div class="fw-screen fw-pre">
      ${panel({ n: '01', t: 'Global', m: '', cls: 'fw-pre__glob', attrs: 'id="pre-glob"', body: `
        <div class="fw-glob ox-copyable">
          <div><div class="fw-st__k">PRESUPUESTADO</div><div class="fw-st__v" id="g-pres">0</div><div class="fw-st__s" id="g-pres-s"></div></div>
          <div><div class="fw-st__k">GASTADO</div><div class="fw-st__v" id="g-gas">0</div><div class="fw-st__s"></div></div>
          <div><div class="fw-st__k" id="g-queda-k">QUEDA</div><div class="fw-st__v" id="g-queda">0</div><div class="fw-st__s"></div></div>
          <div><div class="fw-st__k">POR DÍA</div><div class="fw-st__v" id="g-dia">—</div><div class="fw-st__s" id="g-dia-s"></div></div>
          <div class="fw-glob__m">
            ${medidor({ big: true, r: e.ritmo })}
            <div class="fw-glob__lbl"><span id="g-pct">—</span><span id="g-now">—</span></div>
          </div>
        </div>` })}
      ${panel({ n: '02', t: 'Topes por categoría', m: 'EL MISMO TOPE VALE TODOS LOS MESES', cls: 'fw-pre__topes', body: `
        <div class="ox-scroll ox-scroll--line-top ox-scroll--line-bottom fw-scroll">
          <table class="fw-tbl fw-topes ox-copyable"><thead><tr>
            <th>CATEGORÍA</th><th>TOPE</th><th>GASTADO</th><th>QUEDA</th><th class="fw-l">CONSUMO</th><th>ESTADO</th>
          </tr></thead><tbody id="pre-filas">${filas.map((f) => filaHTML(f, e)).join('')}</tbody></table>
        </div>
        <div class="fw-hints"><span>${'<span class="fw-key">ENTER</span>'}BAJA AL SIGUIENTE TOPE</span><span>VACÍO = SIN TOPE</span><span><i class="fw-pre__raya"></i>LA RAYA: CUÁNTO DEL MES YA PASÓ</span></div>` })}
      ${panel({ n: '03', t: 'Lectura', m: '', cls: 'fw-pre__lect', attrs: 'id="pre-lect"', body: `
        <div class="ox-scroll ox-scroll--line-top ox-scroll--line-bottom fw-scroll"><ul class="fw-lect" id="pre-lect-ul">${lecturaHTML(e)}</ul></div>` })}
    </div>`);

  const root = viewEl();
  pintarGlobal(root, e);
  llenarMedidores(root);
  const lista = root.querySelector('#pre-filas');

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
  // Enter baja al tope de la fila siguiente, como en una planilla.
  lista.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || !ev.target.dataset.tope) return;
    ev.preventDefault();
    const sig = ev.target.closest('tr').nextElementSibling;
    if (sig) sig.querySelector('[data-tope]').focus();
    else ev.target.blur();
  });
  Router.onLeave(() => { if (guardadoPendiente) guardarYa(); clearTimeout(lecturaPendiente); });
}

function pintarGlobal(root, e) {
  const hay = e.presupuestado > 0;
  const dias = daysInMonth(S.month);
  root.querySelector('#pre-glob .fw-p__m').textContent = e.actual
    ? `${mesCorto(S.month)} · DÍA ${dias - e.restantes + 1} DE ${dias}`
    : `${mesCorto(S.month)} · ${S.month < currentMonth() ? 'MES CERRADO' : 'TODAVÍA NO EMPEZÓ'}`;
  rodar(root.querySelector('#g-pres'), e.presupuestado, cifra, 600, 'pre.pres');
  rodar(root.querySelector('#g-gas'), e.gastado, cifra, 600, 'pre.gas');
  const queda = root.querySelector('#g-queda');
  rodar(queda, Math.abs(e.queda), cifra, 600, 'pre.queda');
  queda.classList.toggle('fw-out', e.queda < 0);
  frase(root.querySelector('#g-queda-k'), e.queda < 0 ? 'TE PASASTE' : 'QUEDA');
  const dia = root.querySelector('#g-dia');
  if (e.porDia != null) rodar(dia, Math.floor(e.porDia), cifra, 600, 'pre.dia');
  else { dia.dataset.v = 0; dia.textContent = '—'; }
  frase(root.querySelector('#g-dia-s'), e.porDia != null ? `${e.restantes === 1 ? 'QUEDA HOY' : `QUEDAN ${e.restantes} DÍAS`}` : '');
  frase(root.querySelector('#g-pres-s'), e.sinTope ? `+ ${cifra(e.sinTope)} SIN TOPE` : '');
  const m = root.querySelector('.fw-glob .fw-meter');
  medir(m, { p: hay ? Math.min(1, e.gastado / e.presupuestado) : 0, r: e.ritmo ?? 1, cls: e.gastado > e.presupuestado ? 'is-over' : '' });
  m.querySelector('.fw-meter__now')?.style.setProperty('opacity', e.ritmo != null ? 1 : 0);
  frase(root.querySelector('#g-pct'), hay ? `${pct(e.gastado / e.presupuestado)} DEL TOTAL` : 'SIN TOPES TODAVÍA');
  frase(root.querySelector('#g-now'), e.ritmo != null ? `LA RAYA: ${pct(e.ritmo)} DEL MES` : 'MES CERRADO');
}

/* Al tipear un tope se pone al día lo que depende de él SIN repintar: los
   medidores viajan con su transición y el cursor sigue donde estaba. La
   lectura espera a que se deje de tipear (un relevo por tecla sería ruido). */
let lecturaPendiente = null;
function actualizar(root) {
  const e = estadoPresupuesto(S.moves, S.month, topes);
  for (const f of e.filas) {
    const row = root.querySelector(`.fw-topes__r[data-cat="${CSS.escape(f.cat)}"]`);
    if (!row) continue;
    row.classList.toggle('is-free', f.tope == null);
    const q = row.querySelector('[data-c="queda"]');
    frase(q, f.tope == null ? '—' : cifra(f.queda));
    q.classList.toggle('fw-out', f.queda < 0);
    const m = row.querySelector('.fw-meter');
    m.classList.toggle('is-hidden', f.tope == null);
    medir(m, medidorDe(f, e));
    const [c, t] = estadoDe(f, e);
    const est = row.querySelector('[data-c="est"]');
    est.className = `fw-estado fw-estado--${c}`;
    frase(est, t);
  }
  pintarGlobal(root, e);
  clearTimeout(lecturaPendiente);
  lecturaPendiente = setTimeout(() => {
    const ul = root.querySelector('#pre-lect-ul');
    if (ul?.isConnected) relevo(ul, () => { ul.innerHTML = lecturaHTML(estadoPresupuesto(S.moves, S.month, topes)); });
  }, 600);
}
