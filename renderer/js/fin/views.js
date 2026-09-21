/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — las dos vistas
   Resumen: los números del mes y sus tres gráficos.
   Movimientos: la lista del mes, con la carga rápida en el inspector.

   El mes es el marco de TODO: las dos vistas hablan siempre del mes que dice
   su encabezado, y por eso la navegación de mes vive en el head y no adentro.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from '../icons.js';
import { Menu, Modal, Toast } from '../overlays.js';
import Router from '../router.js';
import { bindSwitcher, stagger } from '../motion.js';
import { esc, head, paint, viewEl } from '../ui.js';
import { catColor, catLabel } from './categories.js';
import { barsHTML, donutHTML, lineHTML, wireBars, wireDonut, wireLine } from './charts.js';
import { currentMonth, dayLabel, fmtARS, monthTitle, shiftMonth, todayStr } from './format.js';
import { markSVG } from './mark.js';
import { QuickAdd, quickAddHTML, wireQuickAdd } from './quickadd.js';
import { byCategory, categoryTrend, cumulativeFlow, monthlyFlow, monthTotals, movesOf } from './stats.js';
import { trendHTML, wireTrend } from './trend.js';
import { chromeChanged, exportAll, exportCsv, removeMove, S, saveMove } from './state.js';

/* ══ Navegación de mes ═══════════════════════════════════════════════════════
   Va en las acciones del encabezado, así el título dice qué mes es y los
   controles quedan del lado donde se buscan. */

const monthNavHTML = () => `
  <div class="fw-monthnav">
    <button class="ox-iconbtn ox-iconbtn--sm" data-month="-1" data-tip="Mes anterior"><i data-icon="chevronLeft"></i></button>
    <button class="ox-iconbtn ox-iconbtn--sm" data-month="1" data-tip="Mes siguiente"><i data-icon="chevronRight"></i></button>
    ${S.month === currentMonth() ? '' :
      `<button class="ox-btn ox-btn--ghost ox-btn--sm" data-month="hoy">Hoy</button>`}
  </div>`;

/* ══ Listeners de la vista ═══════════════════════════════════════════════════
   #view NO muere entre repintados: es siempre el mismo elemento, y lo que se
   le engancha SOBREVIVE y se acumula. A la segunda visita hay dos handlers
   idénticos, y entonces un click en «Borrar» abre dos modales y uno en «mes
   anterior» salta dos meses. La primera visita anda perfecto, que es lo que lo
   vuelve traicionero. Todo lo que se enganche a la raíz pasa por acá, que lo
   suelta al navegar. */
function onView(root, tipo, fn) {
  root.addEventListener(tipo, fn);
  Router.onLeave(() => root.removeEventListener(tipo, fn));
}

function wireMonthNav(root, onChange) {
  onView(root, 'click', (e) => {
    const btn = e.target.closest('[data-month]');
    if (!btn) return;
    S.month = btn.dataset.month === 'hoy' ? currentMonth() : shiftMonth(S.month, Number(btn.dataset.month));
    chromeChanged();
    onChange();
  });
}

/* ══ Vista: Resumen ══════════════════════════════════════════════════════════ */

export function viewResumen() {
  const t = monthTotals(S.moves, S.month);
  const cats = byCategory(S.moves, S.month);
  const flow = monthlyFlow(S.moves, S.month, 6);
  const cur = cumulativeFlow(S.moves, S.month);
  const prev = cumulativeFlow(S.moves, shiftMonth(S.month, -1));
  const isCurrent = S.month === currentMonth();
  const todayDay = isCurrent ? Number(todayStr().slice(8, 10)) : null;
  const trend = categoryTrend(S.moves, S.month, S.trendRange);

  const kpi = (mod, label, value, sub = '') => `
    <div class="fw-kpi fw-kpi--${mod}${mod === 'bal' && t.balance < 0 ? ' is-negative' : ''}">
      <div class="ox-stat">
        <span class="ox-stat__label">${label}</span>
        <span class="ox-stat__value ox-copyable">${value}</span>
        ${sub ? `<span class="fw-kpi__sub">${sub}</span>` : ''}
      </div>
    </div>`;

  /* Sin bullet de color en el encabezado: era decoración, y encima mentía —
     "Drenaje acumulado" llevaba el punto del balance y lo que dibuja son
     gastos, y "Flujo" el del ingreso mostrando las dos cosas. El título dice
     de qué es la card; el color vive adentro, donde es un dato. */
  const card = (title, body, wide = false, { id = '', actions = '' } = {}) => `
    <section class="ox-card${wide ? ' fw-card--wide' : ''}"${id ? ` id="${id}"` : ''}>
      <div class="ox-card__head"><span class="ox-label">${title}</span>${actions}</div>
      <div class="ox-card__body fw-card__body">${body}</div>
    </section>`;

  paint(
    head({
      title: monthTitle(S.month),
      sub: `${t.count} ${t.count === 1 ? 'movimiento' : 'movimientos'} en el mes`,
      actions: monthNavHTML(),
    })
    + `<div class="ox-scroll ox-grow">
         <div class="fw-kpis">
           ${kpi('in', 'Ingresos', fmtARS(t.income))}
           ${kpi('out', 'Gastos', fmtARS(t.expense))}
           ${kpi('bal', 'Balance', fmtARS(t.balance))}
           ${kpi('rate', 'Drenaje diario', fmtARS(t.rate),
             t.projection > 0 ? `proyección a fin de mes ${fmtARS(t.projection)}` : '')}
         </div>
         <div class="fw-charts">
           ${card('Gastos por categoría', donutHTML(cats, t.expense))}
           ${card('Drenaje acumulado', lineHTML(cur, prev, todayDay))}
           ${card('Flujo · últimos 6 meses', barsHTML(flow, S.month), true)}
           ${card('Tendencia por categoría', trendHTML(trend, trendSel(trend)), true, {
             id: 'trend-card',
             actions: `<div class="ox-segmented fw-card__actions" id="trend-range">
               ${TREND_RANGES.map((n) =>
                 `<button class="ox-segmented__opt${S.trendRange === n ? ' is-active' : ''}" data-value="${n}">${n} meses</button>`).join('')}
             </div>`,
           })}
         </div>
       </div>`,
  );

  const root = viewEl();
  wireMonthNav(root, () => Router.refresh());
  wireDonut(root, cats, t.expense);
  wireLine(root, cur, prev, todayDay);
  wireBars(root, flow, (ym) => { S.month = ym; chromeChanged(); Router.refresh(); });
  wireTrend(root, trend, trendSel(trend), trendPick);

  // El rango repinta SOLO la tendencia: remontar la vista entera reiniciaría
  // las animaciones de entrada de los otros tres gráficos.
  bindSwitcher(root.querySelector('#trend-range'), (value) => {
    S.trendRange = Number(value);
    const body = root.querySelector('#trend-card .ox-card__body');
    const t = categoryTrend(S.moves, S.month, S.trendRange);
    const sel = trendSel(t);
    body.innerHTML = trendHTML(t, sel);
    wireTrend(root, t, sel, trendPick);
  });
}

/* ══ Tendencia: qué categorías se ven ════════════════════════════════════════
   Mientras el usuario no toque nada, se ven TODAS — también las que aparezcan
   al cambiar de mes o de rango. Apenas prende o apaga una, la elección pasa a
   ser suya y se respeta tal cual hasta que cierre la app. */

const TREND_RANGES = [6, 12];
let trendPicked = null;

const trendSel = (trend) => trendPicked ?? new Set(trend.series.map((s) => s.cat));
const trendPick = (sel) => { trendPicked = sel; };

/* ══ Vista: Movimientos ══════════════════════════════════════════════════════ */

const FILTERS = [['all', 'Todo'], ['expense', 'Gastos'], ['income', 'Ingresos']];

const filtered = () => {
  const ms = movesOf(S.moves, S.month);
  return S.filter === 'all' ? ms : ms.filter((m) => m.type === S.filter);
};

function rowsHTML(list) {
  if (!list.length) {
    return `<tr><td colspan="5" style="padding:0">
      <div class="ox-empty">
        <span class="fw-empty-mark">${markSVG({ size: 40, cls: 'fw-mark--dim' })}</span>
        <div class="ox-empty__title">Sin movimientos este mes</div>
        <div class="ox-empty__text">${S.filter === 'all'
          ? 'Todavía no se drenó nada. Cargá el primero con el formulario de la derecha.'
          : 'No hay movimientos de este tipo. Probá con otro filtro.'}</div>
      </div></td></tr>`;
  }

  return list.map((m) => `
    <tr class="ox-tr ox-in-fade${QuickAdd.editing?.id === m.id ? ' is-editing' : ''}" data-id="${esc(m.id)}">
      <td class="ox-mono ox-dim" style="width:1%;white-space:nowrap">${dayLabel(m.date)}</td>
      <td style="width:1%">
        <span class="fw-cat"><span class="fw-dot" style="background:${catColor(m.category)}"></span>${esc(catLabel(m.category))}</span>
      </td>
      <td><div class="fw-note ox-truncate ox-copyable">${esc(m.note)}</div></td>
      <td class="ox-td--num fw-amount fw-amount--${m.type === 'income' ? 'in' : 'out'} ox-copyable">
        ${m.type === 'income' ? '+' : '−'}${fmtARS(m.amount)}
      </td>
      <td class="ox-td--tight" style="width:1%">
        <div class="ox-rowactions">
          <button class="ox-iconbtn ox-iconbtn--sm" data-edit="${esc(m.id)}" data-tip="Editar"><i data-icon="edit"></i></button>
          <button class="ox-iconbtn ox-iconbtn--sm" data-del="${esc(m.id)}" data-tip="Borrar"><i data-icon="trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

export function viewMovimientos() {
  const list = filtered();

  const actions = `
    <div class="ox-segmented" id="mv-filter">
      ${FILTERS.map(([id, label]) =>
        `<button class="ox-segmented__opt${S.filter === id ? ' is-active' : ''}" data-value="${id}">${label}</button>`).join('')}
    </div>
    <button class="ox-iconbtn" id="mv-export" data-tip="Exportar"${S.moves.length ? '' : ' disabled'}>
      <i data-icon="download"></i>
    </button>
    ${monthNavHTML()}`;

  paint(
    head({ title: monthTitle(S.month), sub: `${list.length} ${list.length === 1 ? 'movimiento' : 'movimientos'}`, actions })
    + `<div class="ox-viewbody">
         <div class="ox-viewbody__main">
           <div class="ox-scroll ox-grow">
             <table class="ox-table">
               <thead><tr>
                 <th>Fecha</th><th>Categoría</th><th>Nota</th><th class="ox-td--num">Monto</th><th></th>
               </tr></thead>
               <tbody id="mv-rows">${rowsHTML(list)}</tbody>
             </table>
           </div>
         </div>
         <aside class="ox-inspector">
           <div class="ox-inspector__head">
             <span class="ox-label">${QuickAdd.editing ? 'Editar movimiento' : 'Cargar movimiento'}</span>
           </div>
           <div class="ox-inspector__body ox-scroll" id="mv-inspector">${quickAddHTML()}</div>
         </aside>
       </div>`,
  );

  const root = viewEl();
  wireMonthNav(root, () => Router.refresh());
  bindSwitcher(root.querySelector('#mv-filter'), (value) => {
    S.filter = value;
    repaintRows();
  });
  const btnExport = root.querySelector('#mv-export');
  btnExport.addEventListener('click', () => exportMenu(btnExport));
  wireRows(root);
  wireInspector(root);
  stagger(root.querySelector('#mv-rows'));
  QuickAdd.focusAmount(root);
}

/** Repinta SOLO las filas. Repintando la vista entera se perdería el foco del
    campo de monto, que es exactamente donde el usuario quiere seguir. */
function repaintRows() {
  const root = viewEl();
  const list = filtered();
  const body = root.querySelector('#mv-rows');
  if (!body) return;
  body.innerHTML = rowsHTML(list);
  Icons.mount(body);
  stagger(body);

  const sub = root.querySelector('.ox-viewhead__sub');
  if (sub) sub.textContent = `${list.length} ${list.length === 1 ? 'movimiento' : 'movimientos'}`;
  root.querySelector('#mv-export').disabled = !S.moves.length;
}

/** Repinta el inspector: hace falta cuando cambia el catálogo de categorías
    (al cambiar de tipo) o cuando se entra o sale del modo edición. */
function repaintInspector({ focus = true } = {}) {
  const root = viewEl();
  const box = root.querySelector('#mv-inspector');
  if (!box) return;
  box.innerHTML = quickAddHTML();
  Icons.mount(box);
  wireInspector(root);

  const label = root.querySelector('.ox-inspector__head .ox-label');
  if (label) label.textContent = QuickAdd.editing ? 'Editar movimiento' : 'Cargar movimiento';
  if (focus) QuickAdd.focusAmount(root);
}

/* El cableado del inspector deja listeners fuera de la vista (el calendario
   se portalea a #ox-layer), así que hay que soltarlos antes de rearmarlo. */
let soltarQuickAdd = null;

function wireInspector(root) {
  soltarQuickAdd?.();
  Router.onLeave(() => { soltarQuickAdd?.(); soltarQuickAdd = null; });
  soltarQuickAdd = wireQuickAdd(root, {
    onTypeChange: () => repaintInspector(),
    onCancelEdit: () => { QuickAdd.reset(); repaintInspector(); repaintRows(); },
    onSubmit: async (move) => {
      const editing = !!move.id;
      if (!await saveMove(move)) return;
      QuickAdd.reset({ keepDate: true });
      // Guardar puede haber saltado de mes: si el movimiento entró en otro, la
      // vista entera tiene que hablar de ese mes o el usuario no lo ve.
      Router.refresh();
      Toast.show({
        title: editing ? 'Movimiento editado' : 'Movimiento cargado',
        text: `${move.type === 'income' ? '+' : '−'}${fmtARS(move.amount)} · ${catLabel(move.category)}`,
        icon: 'check',
      });
    },
  });
}

function wireRows(root) {
  const byId = (id) => S.moves.find((m) => m.id === id) || null;

  const startEdit = (m) => {
    if (!m) return;
    QuickAdd.edit(m);
    repaintInspector();
    repaintRows();
  };

  const confirmDelete = async (m) => {
    if (!m) return;
    const ok = await Modal.confirm({
      title: '¿Borrar el movimiento?',
      sub: `${m.type === 'income' ? '+' : '−'}${fmtARS(m.amount)} · ${catLabel(m.category)} · ${dayLabel(m.date)}`,
      confirmLabel: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    if (!await removeMove(m.id)) return;
    if (QuickAdd.editing?.id === m.id) { QuickAdd.reset(); repaintInspector({ focus: false }); }
    repaintRows();
    Toast.show({ title: 'Movimiento borrado', icon: 'trash' });
  };

  onView(root, 'click', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) return startEdit(byId(ed.dataset.edit));
    const del = e.target.closest('[data-del]');
    if (del) return confirmDelete(byId(del.dataset.del));
  });

  // Doble click sobre la fila edita: es el gesto que ya tenía la app.
  onView(root, 'dblclick', (e) => {
    const tr = e.target.closest('.ox-tr');
    if (tr) startEdit(byId(tr.dataset.id));
  });

  onView(root, 'contextmenu', (e) => {
    const tr = e.target.closest('.ox-tr');
    if (!tr) return;
    e.preventDefault();
    const m = byId(tr.dataset.id);
    if (!m) return;

    /* El ancla es un punto, no la fila. Menu.show() le da al menú como mínimo
       el ancho de su ancla —lo correcto cuando cuelga de un .ox-select, que
       tiene que calzar con el control— y anclándolo al <tr> el menú salía de
       688px y se iba de la ventana. Un contextual nace donde está el mouse. */
    const ancla = document.createElement('div');
    ancla.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:0;height:0;pointer-events:none`;
    document.getElementById('ox-layer').appendChild(ancla);

    Menu.show(ancla, [
      { label: 'Editar', icon: 'edit', onSelect: () => startEdit(m) },
      { sep: true },
      { label: 'Borrar', icon: 'trash', danger: true, onSelect: () => confirmDelete(m) },
    ], { onClose: () => ancla.remove() });
  });
}

/* Dos exportaciones distintas detrás del mismo botón, porque responden a dos
   preguntas distintas: el CSV es para mirar un mes en Excel, el respaldo es
   para llevarse TODO a otro lado sin perder nada. Un solo botón que hace una
   sola de las dos obligaría a elegir cuál merece estar arriba. */
function exportMenu(anchor) {
  const list = filtered();
  Menu.show(anchor, [
    {
      label: `Este mes a CSV (${list.length})`,
      icon: 'download',
      disabled: !list.length,
      onSelect: exportMonth,
    },
    { sep: true },
    {
      label: `Todo a un respaldo (${S.moves.length})`,
      icon: 'save',
      disabled: !S.moves.length,
      onSelect: exportBackup,
    },
  ], { align: 'end' });
}

async function exportMonth() {
  const list = filtered();
  if (!list.length) return;
  const saved = await exportCsv(list, `finwatch-${S.month}.csv`);
  if (saved) Toast.show({ title: 'Exportado', text: saved.split('\\').pop(), icon: 'download' });
}

async function exportBackup() {
  const hecho = await exportAll();
  if (!hecho) return;
  Toast.show({
    title: `Respaldo de ${hecho.count} ${hecho.count === 1 ? 'movimiento' : 'movimientos'}`,
    text: hecho.path.split('\\').pop(),
    icon: 'save',
  });
}

/** La usa el botón del rail y el Ctrl+N: si ya estamos en la lista, no hace
    falta repintar nada — alcanza con poner el cursor donde se escribe. */
export function focusCarga() {
  if (Router.name !== 'movimientos') { Router.go('movimientos'); return; }
  QuickAdd.focusAmount(viewEl());
}
