/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY · TERMINAL — F2 Movimientos
   El libro del mes: 01 la tabla con el SALDO corrido (cómo fue bajando o
   subiendo el mes, movimiento a movimiento), 02 el detalle del elegido y 03
   lo que suma lo filtrado, con las barras por día.

   Se maneja con el teclado: ↑↓ elige, E (o doble clic) edita, Supr borra,
   T/G/I filtra por tipo, F escribe en el filtro, C abre las categorías.
   Las filas se ponen al día por clave (reconcile): al filtrar, las que siguen
   viajan a su lugar y las que se van se esfuman desde donde estaban.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Menu, Modal, Toast } from '../overlays.js';
import Router from '../router.js';
import { frase, reconcile } from '../motion.js';
import { esc, paint, viewEl } from '../ui.js';
import { catColor, catLabel, catsFor } from './categories.js';
import { daysInMonth, fmtARS } from './format.js';
import { abrirFormulario } from './formulario.js';
import { movesOf } from './stats.js';
import { exportAll, exportCsv, removeMove, S } from './state.js';
import { cifra, entero, MENOS, mesCorto, mesSigla, panel, relevo, tecla } from './term.js';

const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const TIPOS = [['all', 'T', 'TODO'], ['expense', 'G', 'GASTOS'], ['income', 'I', 'INGRESOS']];

/* Lo que la vista recuerda mientras la app está abierta. */
const M = { q: '', selId: null, lista: [] };

const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fechaCorta = (d) => `${d.slice(8)} ${mesSigla(d.slice(0, 7))}`;

/* El libro entero del mes, del más nuevo al más viejo, con el saldo que
   quedaba DESPUÉS de cada movimiento (contado del más viejo al más nuevo). */
function libro() {
  const asc = movesOf(S.moves, S.month)
    .map((m, n) => ({ ...m, n }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.n - b.n);
  let saldo = 0;
  for (const m of asc) { saldo += m.type === 'income' ? m.amount : -m.amount; m.saldo = saldo; }
  return asc.reverse();
}

function filtrar(todo) {
  const q = normal(M.q.trim());
  return todo.filter((m) => (S.filter === 'all' || m.type === S.filter)
    && (!S.cat || m.category === S.cat)
    && (!q || normal(m.note).includes(q) || normal(catLabel(m.category)).includes(q)));
}

const elegido = () => M.lista.find((m) => m.id === M.selId) || null;

/* ══ La vista ════════════════════════════════════════════════════════════════ */

export function viewMovimientos() {
  const todo = libro();
  // Si llegó pidiendo un movimiento (un clic en el Resumen), que se vea: se
  // sueltan los filtros que lo esconderían.
  if (S.verMov) {
    const m = todo.find((x) => x.id === S.verMov);
    if (m && !filtrar(todo).some((x) => x.id === m.id)) { S.filter = 'all'; S.cat = null; M.q = ''; }
    M.selId = S.verMov;
    S.verMov = null;
  }
  M.lista = filtrar(todo);
  if (!elegido()) M.selId = M.lista[0]?.id ?? null;

  paint(`
    <div class="fw-screen fw-mov">
      ${panel({
        n: '01', t: 'Libro', m: '', cls: 'fw-mov__libro', attrs: 'id="mov-libro"',
        body: `
          <div class="fw-bar">
            <div class="fw-seg" id="mov-tipo">${TIPOS.map(([id, k, l]) =>
              `<button class="fw-seg__o${S.filter === id ? ' is-on' : ''}" data-t="${id}">${tecla(k)}${l}</button>`).join('')}</div>
            <button class="fw-btn fw-catfilter${S.cat ? ' is-set' : ''}" id="mov-cat" style="--c:${S.cat ? catColor(S.cat) : 'transparent'}">${tecla('C')}<i class="fw-catfilter__dot"></i><span id="mov-cat-v">${S.cat ? esc(catLabel(S.cat).toUpperCase()) : 'CATEGORÍAS'}</span></button>
            <input class="fw-fld" id="mov-q" value="${esc(M.q)}" placeholder="filtrar nota o categoría" spellcheck="false" autocomplete="off">
            <span class="ox-grow"></span>
            <button class="fw-btn" id="mov-exp"${S.moves.length ? '' : ' disabled'}>${tecla('X')}EXPORTAR</button>
          </div>
          <div class="ox-scroll ox-scroll--line-top ox-scroll--line-bottom fw-scroll" id="mov-zona">
            <table class="fw-tbl fw-ledger ox-copyable"><thead><tr>
              <th>FECHA</th><th class="fw-l">CATEGORÍA</th><th class="fw-l">NOTA</th><th>MONTO</th><th>SALDO</th>
            </tr></thead><tbody id="mov-filas"></tbody></table>
          </div>
          <div class="fw-hints">
            <span>${tecla('<chevronUp>')}${tecla('<chevronDown>')}MOVERSE</span>
            <span>${tecla('E')}EDITAR</span><span>${tecla('SUPR')}BORRAR</span>
            <span>${tecla('F')}FILTRAR</span><span>${tecla('CTRL N')}NUEVO</span>
          </div>`,
      })}
      <div class="fw-mov__col">
        ${panel({ n: '02', t: 'Detalle', m: '', attrs: 'id="mov-det-p"', body: '<div id="mov-det"></div>' })}
        ${panel({ n: '03', t: 'Lo filtrado', m: '', attrs: 'id="mov-fil-p"', body: `
          <div class="fw-mov__fil"><dl class="fw-kv ox-copyable" id="mov-fil"></dl></div>
          <div class="fw-days" id="mov-dias"></div>
          <div class="fw-days__ax" id="mov-ax"></div>` })}
      </div>
    </div>`);

  const root = viewEl();
  pintarFilas(root, true);
  pintarDetalle(root, true);
  pintarFiltrado(root);
  cablear(root);
  root.querySelector('#mov-zona tr.is-sel')?.scrollIntoView({ block: 'nearest' });
}

/* ══ 01 Libro ════════════════════════════════════════════════════════════════ */

const filaHTML = (m) => `
  <tr class="fw-ledger__r${m.id === M.selId ? ' is-sel' : ''}" data-id="${esc(m.id)}" style="--c:${catColor(m.category)}">
    <td>${fechaCorta(m.date)}</td>
    <td class="fw-l"><span class="fw-cat"><i></i>${esc(catLabel(m.category).toUpperCase())}</span></td>
    <td class="fw-l fw-ledger__nota">${esc(m.note) || '<span class="fw-dim">—</span>'}</td>
    <td class="${m.type === 'income' ? 'fw-in' : ''}">${m.type === 'income' ? '+' : MENOS}${cifra(m.amount)}</td>
    <td class="fw-ledger__saldo${m.saldo < 0 ? ' is-neg' : ''}">${cifra(m.saldo)}</td>
  </tr>`;

const vacioHTML = () => `<tr class="fw-ledger__vacio"><td colspan="5"><div class="fw-empty"><div>
  <b>${M.lista.length || S.moves.length ? 'NADA COINCIDE' : 'SIN MOVIMIENTOS'}</b>
  <p>${S.cat || M.q || S.filter !== 'all'
    ? 'Con estos filtros no queda ningún movimiento de este mes.'
    : 'Este mes todavía no tiene movimientos. Cargá el primero en la línea de abajo.'}</p></div></div></td></tr>`;

function pintarFilas(root, primero = false) {
  const tbody = root.querySelector('#mov-filas');
  const items = M.lista.length
    ? M.lista.map((m) => ({ key: m.id, html: filaHTML(m) }))
    : [{ key: '__vacio', html: vacioHTML() }];
  reconcile(tbody, items, { enter: !primero });
  const n = M.lista.length;
  const p = root.querySelector('#mov-libro .fw-p__m');
  const txt = `${mesCorto(S.month)} · ${entero(n)} MOV`;
  if (primero) p.textContent = txt; else frase(p, txt);
}

function marcarSeleccion(root, scroll = true) {
  root.querySelectorAll('#mov-filas .fw-ledger__r').forEach((tr) => tr.classList.toggle('is-sel', tr.dataset.id === M.selId));
  if (scroll) root.querySelector('#mov-filas tr.is-sel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Elegir otro movimiento: la fila se marca en el lugar y el detalle hace relevo. */
function elegir(root, id, scroll = true) {
  if (!id || id === M.selId) return;
  M.selId = id;
  marcarSeleccion(root, scroll);
  pintarDetalle(root);
  marcarDia(root);
}

/** Lo que cambia el conjunto (tipo, categoría, texto, borrar): filas por clave,
    y lo de alrededor al día. */
function refiltrar(root) {
  M.lista = filtrar(libro());
  if (!elegido()) M.selId = M.lista[0]?.id ?? null;
  pintarFilas(root);
  marcarSeleccion(root, false);
  pintarDetalle(root);
  pintarFiltrado(root);
}

/* ══ 02 Detalle ══════════════════════════════════════════════════════════════ */

function pintarDetalle(root, primero = false) {
  const m = elegido();
  const pos = m ? M.lista.indexOf(m) + 1 : 0;
  root.querySelector('#mov-det-p .fw-p__m').textContent = m ? `${pos} DE ${M.lista.length}` : '';
  relevo(root.querySelector('#mov-det'), () => {
    const box = root.querySelector('#mov-det');
    if (!m) { box.innerHTML = '<div class="fw-empty fw-det__vacio"><div>NADA ELEGIDO</div></div>'; return; }
    const d = new Date(`${m.date}T12:00`);
    box.innerHTML = `
      <div class="fw-det">
        <div class="fw-det__top"><span class="fw-tag ${m.type === 'income' ? 'fw-tag--in' : 'fw-tag--out'}">${m.type === 'income' ? 'INGRESO' : 'GASTO'}</span></div>
        <div class="fw-det__amt ox-copyable">${m.type === 'income' ? '+' : MENOS}$ ${cifra(m.amount)}</div>
        <dl class="fw-kv ox-copyable">
          <dt>FECHA</dt><dd>${DIAS[d.getDay()]} ${m.date.slice(8)} ${mesSigla(m.date.slice(0, 7))} ${m.date.slice(0, 4)}</dd>
          <dt>CATEGORÍA</dt><dd><span class="fw-cat" style="--c:${catColor(m.category)}"><i></i>${esc(catLabel(m.category).toUpperCase())}</span></dd>
          <dt>NOTA</dt><dd>${esc(m.note) || '—'}</dd>
          <dt>SALDO DEL MES</dt><dd class="${m.saldo < 0 ? 'fw-out' : ''}">${cifra(m.saldo)}</dd>
        </dl>
        <div class="fw-det__act">
          <button class="fw-btn" data-acc="editar">${tecla('E')}EDITAR</button>
          <button class="fw-btn fw-btn--danger" data-acc="borrar">${tecla('SUPR')}BORRAR</button>
        </div>
      </div>`;
  }, primero);
}

/* ══ 03 Lo filtrado ══════════════════════════════════════════════════════════ */

function pintarFiltrado(root) {
  const L = M.lista;
  const entra = L.filter((m) => m.type === 'income').reduce((a, m) => a + m.amount, 0);
  const gastos = L.filter((m) => m.type === 'expense');
  const sale = gastos.reduce((a, m) => a + m.amount, 0);
  const conFiltro = S.filter !== 'all' || S.cat || M.q.trim();
  frase(root.querySelector('#mov-fil-p .fw-p__m'), conFiltro ? 'CON FILTRO' : 'TODO EL MES');
  root.querySelector('#mov-fil').innerHTML = `
    <dt>MOVIMIENTOS</dt><dd>${entero(L.length)}</dd>
    <dt>ENTRÓ</dt><dd class="fw-in">+${cifra(entra)}</dd>
    <dt>SALIÓ</dt><dd class="fw-out">${MENOS}${cifra(sale)}</dd>
    <dt>NETO</dt><dd>${cifra(entra - sale, { signo: true })}</dd>
    <dt>GASTO PROMEDIO</dt><dd>${gastos.length ? cifra(Math.round(sale / gastos.length)) : '—'}</dd>`;
  const D = daysInMonth(S.month);
  const porDia = Array.from({ length: D }, (_, i) => gastos
    .filter((m) => Number(m.date.slice(8)) === i + 1).reduce((a, m) => a + m.amount, 0));
  const max = Math.max(1, ...porDia);
  const dias = root.querySelector('#mov-dias');
  if (dias.children.length !== D) dias.innerHTML = porDia.map((_, i) => `<i data-d="${i + 1}" style="--p:0"></i>`).join('');
  requestAnimationFrame(() => requestAnimationFrame(() =>
    [...dias.children].forEach((b, i) => b.style.setProperty('--p', Math.max(0.02, porDia[i] / max)))));
  root.querySelector('#mov-ax').innerHTML = [1, 10, 20, D].map((d) => `<span>${d}</span>`).join('');
  marcarDia(root);
}

function marcarDia(root) {
  const m = elegido();
  root.querySelectorAll('#mov-dias i').forEach((b) => b.classList.toggle('is-hit', !!m && Number(b.dataset.d) === Number(m.date.slice(8))));
}

/* ══ Acciones ════════════════════════════════════════════════════════════════ */

async function editar(m) {
  if (!m) return;
  await abrirFormulario(S.moves.find((x) => x.id === m.id) || m);
}

async function borrar(root, m) {
  if (!m) return;
  const ok = await Modal.confirm({
    title: '¿Borrar el movimiento?',
    sub: `${m.type === 'income' ? '+' : '−'}${fmtARS(m.amount)} · ${catLabel(m.category)} · ${fechaCorta(m.date)}`,
    confirmLabel: 'Borrar',
    danger: true,
  });
  if (!ok) return;
  const i = M.lista.findIndex((x) => x.id === m.id);
  if (!await removeMove(m.id)) return;
  // La selección pasa al de abajo (o al de arriba si era el último).
  const vecino = M.lista[i + 1] || M.lista[i - 1];
  M.selId = vecino?.id ?? null;
  refiltrar(root);
  Toast.show({ title: 'Movimiento borrado', icon: 'trash' });
}

function menuCategorias(root, ancla) {
  const ms = movesOf(S.moves, S.month);
  const delTipo = S.filter === 'all' ? ms : ms.filter((m) => m.type === S.filter);
  const elegir = (id) => {
    S.cat = id;
    const b = root.querySelector('#mov-cat');
    b.classList.toggle('is-set', !!id);
    if (id) b.style.setProperty('--c', catColor(id));
    frase(root.querySelector('#mov-cat-v'), id ? esc(catLabel(id).toUpperCase()) : 'CATEGORÍAS');
    refiltrar(root);
  };
  const item = (c) => {
    const n = ms.filter((m) => m.category === c.id).length;
    return { label: c.label, dot: c.color, key: String(n), selected: S.cat === c.id,
      disabled: !n && S.cat !== c.id, onSelect: () => elegir(c.id) };
  };
  const grupos = S.filter === 'all' ? [['Gastos', 'expense'], ['Ingresos', 'income']] : [[null, S.filter]];
  const items = [{ label: 'Todas las categorías', key: String(delTipo.length), selected: !S.cat, onSelect: () => elegir(null) }];
  for (const [rotulo, tipo] of grupos) {
    items.push({ sep: true });
    if (rotulo) items.push({ groupLabel: rotulo });
    items.push(...catsFor(tipo).map(item));
  }
  Menu.show(ancla, items);
}

/* Dos exportaciones detrás de la misma tecla, porque responden a dos preguntas:
   el CSV es para mirar un mes en una planilla, el respaldo es para llevarse
   TODO a otro lado sin perder nada. */
function menuExportar(ancla) {
  const L = M.lista;
  Menu.show(ancla, [
    { label: `Lo filtrado a CSV (${L.length})`, icon: 'download', disabled: !L.length, onSelect: async () => {
      const hecho = await exportCsv(L, `finway-${S.month}${S.cat ? `-${S.cat}` : ''}.csv`);
      if (hecho) Toast.show({ title: 'Exportado', text: hecho.split('\\').pop(), icon: 'download' });
    } },
    { sep: true },
    { label: `Todo a un respaldo (${S.moves.length})`, icon: 'save', disabled: !S.moves.length, onSelect: async () => {
      const hecho = await exportAll();
      if (hecho) Toast.show({ title: `Respaldo de ${hecho.count} ${hecho.count === 1 ? 'movimiento' : 'movimientos'}`, text: hecho.path.split('\\').pop(), icon: 'save' });
    } },
  ], { align: 'end' });
}

function setTipo(root, t) {
  if (S.filter === t) return;
  S.filter = t;
  root.querySelectorAll('#mov-tipo .fw-seg__o').forEach((b) => b.classList.toggle('is-on', b.dataset.t === t));
  // Pasar a Ingresos con Comida elegida dejaría la tabla vacía sin motivo:
  // una categoría del otro tipo se suelta sola.
  if (S.cat && t !== 'all' && !catsFor(t).some((c) => c.id === S.cat)) {
    S.cat = null;
    root.querySelector('#mov-cat').classList.remove('is-set');
    frase(root.querySelector('#mov-cat-v'), 'CATEGORÍAS');
  }
  refiltrar(root);
}

/* ══ Cableado ════════════════════════════════════════════════════════════════
   Todo se engancha a nodos que mueren con el pintado, salvo el teclado, que
   va al documento y se suelta al irse de la vista (Router.onLeave). */

function cablear(root) {
  root.querySelector('#mov-tipo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (b) setTipo(root, b.dataset.t);
  });
  const btnCat = root.querySelector('#mov-cat');
  btnCat.addEventListener('click', () => menuCategorias(root, btnCat));
  const btnExp = root.querySelector('#mov-exp');
  btnExp.addEventListener('click', () => menuExportar(btnExp));

  let espera;
  const q = root.querySelector('#mov-q');
  q.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => { M.q = q.value; refiltrar(root); }, 160);
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && q.value) { e.stopPropagation(); q.value = ''; M.q = ''; refiltrar(root); }
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); q.blur(); }
  });

  const tbody = root.querySelector('#mov-filas');
  tbody.addEventListener('click', (e) => {
    const tr = e.target.closest('[data-id]');
    if (tr) elegir(root, tr.dataset.id, false);
  });
  tbody.addEventListener('dblclick', (e) => {
    const tr = e.target.closest('[data-id]');
    if (tr) editar(M.lista.find((m) => m.id === tr.dataset.id));
  });
  tbody.addEventListener('contextmenu', (e) => {
    const tr = e.target.closest('[data-id]');
    if (!tr) return;
    e.preventDefault();
    elegir(root, tr.dataset.id, false);
    const m = elegido();
    /* El ancla es un punto, no la fila: Menu.show() le da al menú como mínimo
       el ancho de su ancla, y anclado al <tr> salía del ancho de la tabla. */
    const ancla = document.createElement('div');
    ancla.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:0;height:0;pointer-events:none`;
    document.getElementById('ox-layer').appendChild(ancla);
    Menu.show(ancla, [
      { label: 'Editar', icon: 'edit', hint: 'E', onSelect: () => editar(m) },
      { sep: true },
      { label: 'Borrar', icon: 'trash', danger: true, onSelect: () => borrar(root, m) },
    ], { onClose: () => ancla.remove() });
  });

  root.querySelector('#mov-det').addEventListener('click', (e) => {
    const acc = e.target.closest('[data-acc]')?.dataset.acc;
    if (acc === 'editar') editar(elegido());
    else if (acc === 'borrar') borrar(root, elegido());
  });

  const teclas = (e) => {
    if (Modal.isOpen || e.ctrlKey || e.altKey || e.metaKey) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    if (document.querySelector('.ox-menu')) return;
    const i = M.lista.findIndex((m) => m.id === M.selId);
    const k = e.key.toLowerCase();
    if (e.key === 'ArrowDown') { e.preventDefault(); elegir(root, M.lista[Math.min(M.lista.length - 1, i + 1)]?.id); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); elegir(root, M.lista[Math.max(0, i - 1)]?.id); }
    else if (e.key === 'PageDown') { e.preventDefault(); elegir(root, M.lista[Math.min(M.lista.length - 1, i + 10)]?.id); }
    else if (e.key === 'PageUp') { e.preventDefault(); elegir(root, M.lista[Math.max(0, i - 10)]?.id); }
    else if (k === 'e' || e.key === 'Enter') { e.preventDefault(); editar(elegido()); }
    else if (e.key === 'Delete') { e.preventDefault(); borrar(root, elegido()); }
    else if (k === 't') setTipo(root, 'all');
    else if (k === 'g') setTipo(root, 'expense');
    else if (k === 'i') setTipo(root, 'income');
    else if (k === 'f') { e.preventDefault(); q.focus(); q.select(); }
    else if (k === 'c') { e.preventDefault(); menuCategorias(root, btnCat); }
    else if (k === 'x') { e.preventDefault(); if (!btnExp.disabled) menuExportar(btnExp); }
  };
  document.addEventListener('keydown', teclas);
  Router.onLeave(() => document.removeEventListener('keydown', teclas));
}
