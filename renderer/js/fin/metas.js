/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY · TERMINAL — F4 Metas
   Algo para lo que querés juntar plata: un nombre, cuánto, y si querés, para
   cuándo. Se llena con aportes a mano; un retiro es un aporte negativo.

   01 el ahorro total y, abajo, una ficha por meta: lo juntado contra el
   objetivo en un medidor de bloques, cuánto poner por mes para llegar, a tu
   ritmo cuándo llegás (en rojo si es tarde) y los últimos aportes. Aportar y
   retirar se hace en la ficha misma, en una línea: monto, nota y Enter.

   Los aportes NO son movimientos. Ahorrar no es gastar —la plata sigue siendo
   tuya—, así que no tocan el balance ni los gráficos. Viven en su propio
   documento (`metas.json`). Las cuentas son de plan.js.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from '../icons.js';
import { Menu, Modal, Toast } from '../overlays.js';
import Router from '../router.js';
import { exit, frase, raf2 } from '../motion.js';
import { esc, paint, viewEl } from '../ui.js';
import { currentMonth, dayLabel, fmtARS, monthTitle, parseAmount, shiftMonth, todayStr } from './format.js';
import { ahorradoDe, estadoMeta } from './plan.js';
import { monthTotals } from './stats.js';
import { S } from './state.js';
import { cifra, entero, llenarMedidores, medidor, medir, mesCorto, panel, pct, relevo, rodar } from './term.js';

const DOC = 'metas';
const APORTES_VISIBLES = 3;

let metas = [];
/** Las fichas con la lista de aportes entera a la vista. Dura lo que la app. */
const abiertas = new Set();

const nuevoId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const centavos = (n) => Math.round(n * 100) / 100;

/* ── Datos ───────────────────────────────────────────────────────────────── */

const esMes = (s) => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);
const esDia = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Lo que viene del disco se revisa entero: un aporte roto no puede tirar la
    vista, y un monto que no es número no puede sumarse como texto. */
function leerMeta(m) {
  if (!m || typeof m.id !== 'string' || !Number.isFinite(m.objetivo) || m.objetivo <= 0) return null;
  return {
    id: m.id,
    nombre: String(m.nombre ?? '').trim() || 'Meta',
    objetivo: m.objetivo,
    fecha: esMes(m.fecha) ? m.fecha : null,
    aportes: (Array.isArray(m.aportes) ? m.aportes : [])
      .filter((a) => a && typeof a.id === 'string' && esDia(a.fecha) && Number.isFinite(a.monto))
      .map((a) => ({ id: a.id, fecha: a.fecha, monto: a.monto, nota: String(a.nota ?? '') })),
  };
}

/** Para Ajustes: cuántas metas y aportes hay guardados. */
export const resumenMetas = () => ({ metas: metas.length, aportes: metas.reduce((a, m) => a + m.aportes.length, 0) });

/** Se llama en el arranque: así la vista pinta de una, sin estado de carga. */
export async function cargarMetas() {
  try {
    const doc = await window.onyx.doc.read(DOC, null);
    metas = (Array.isArray(doc?.metas) ? doc.metas : []).map(leerMeta).filter(Boolean);
  } catch (err) {
    console.warn('[metas] no se pudieron leer, arranca vacía:', err.message);
    metas = [];
  }
}

/** Sin demora: cada guardado es una acción confirmada, no una tecla. */
async function guardar() {
  try {
    await window.onyx.doc.write(DOC, { schema: 1, metas });
    return true;
  } catch (err) {
    Toast.error('No se pudo guardar la meta', err.message);
    return false;
  }
}

/* ── La ficha ────────────────────────────────────────────────────────────── */

/** Los últimos primero: es lo que se vuelve a mirar para ver si ya lo cargaste. */
const recientes = (meta) => [...meta.aportes]
  .sort((a, b) => b.fecha.localeCompare(a.fecha) || meta.aportes.indexOf(b) - meta.aportes.indexOf(a));

function llegadaHTML(meta, e) {
  if (e.cumplida || !e.llegada) return '—';
  const tarde = meta.fecha && e.llegada > meta.fecha;
  return tarde ? `<span class="fw-out">${mesCorto(e.llegada)}, TARDE</span>` : mesCorto(e.llegada);
}
function paraLlegarHTML(meta, e) {
  if (e.cumplida) return '—';
  if (e.vencida) return '<span class="fw-out">VENCIDA</span>';
  if (e.porMes != null) return e.meses === 1 ? `$ ${cifra(e.falta)} ESTE MES` : `$ ${cifra(Math.ceil(e.porMes))} / MES`;
  return '<span class="fw-dim">SIN FECHA</span>';
}

const aporteHTML = (a, nuevo = false) => `
  <li class="fw-meta__ap${nuevo ? ' is-new' : ''}" data-aporte="${esc(a.id)}">
    <span class="fw-dim">${dayLabel(a.fecha)}</span>
    <span class="fw-meta__nota">${esc(a.nota) || '<span class="fw-dim">—</span>'}</span>
    <span class="${a.monto < 0 ? 'fw-out' : 'fw-in'}">${cifra(a.monto, { signo: true })}</span>
    <button class="fw-iconbtn fw-iconbtn--danger fw-meta__del" data-borrar-aporte="${esc(a.id)}" data-tip="Borrar" aria-label="Borrar"><i data-icon="trash"></i></button>
  </li>`;

function cuerpoHTML(meta, { nuevos = [] } = {}) {
  const e = estadoMeta(meta);
  const todos = recientes(meta);
  const abierta = abiertas.has(meta.id);
  const lista = abierta ? todos : todos.slice(0, APORTES_VISIBLES);
  const sobran = meta.aportes.length - APORTES_VISIBLES;
  return `
    <div class="fw-meta">
      <div class="fw-meta__amt ox-copyable">$ <span class="fw-meta__ah">${cifra(e.ahorrado)}</span><small>/ ${cifra(e.objetivo)}</small></div>
      <div>
        ${medidor({ p: e.pct, cls: e.cumplida ? 'is-ok' : '' })}
        <div class="fw-meta__pct"><span>${Math.floor(e.pct * 100)}%</span><span>${e.cumplida ? 'LLEGASTE' : `FALTA $ ${cifra(e.falta)}`}</span></div>
      </div>
      <dl class="fw-kv fw-meta__kv ox-copyable">
        <dt>PARA LLEGAR</dt><dd>${paraLlegarHTML(meta, e)}</dd>
        <dt>A TU RITMO</dt><dd>${e.ritmo ? `$ ${cifra(Math.round(e.ritmo))} / MES` : '—'}</dd>
        <dt>LLEGÁS EN</dt><dd>${llegadaHTML(meta, e)}</dd>
      </dl>
      ${lista.length ? `
      <div class="fw-meta__aps">
        <div class="fw-meta__aps-h"><span>${abierta ? 'TODOS LOS APORTES' : 'ÚLTIMOS APORTES'}</span>${sobran > 0
          ? `<button class="fw-meta__todos" data-accion="todos">${abierta ? 'VER MENOS' : `VER ${sobran} MÁS`}</button>` : ''}</div>
        <ul class="ox-copyable">${lista.map((a) => aporteHTML(a, nuevos.includes(a.id))).join('')}</ul>
      </div>` : ''}
      <div class="fw-meta__form">
        <div>
          <input class="fw-fld fw-fld--num" data-f="monto" placeholder="monto" inputmode="decimal" spellcheck="false" autocomplete="off">
          <input class="fw-fld" data-f="nota" placeholder="nota (opcional)" maxlength="80" spellcheck="false" autocomplete="off">
          <span class="fw-key">ENTER</span>
        </div>
        <div class="fw-meta__hint" data-hint></div>
      </div>
      <div class="fw-meta__act">
        <button class="fw-btn fw-btn--acc fw-btn--sin-tecla" data-accion="aportar"><i data-icon="plus"></i>APORTAR</button>
        <button class="fw-btn fw-btn--sin-tecla" data-accion="retirar"${e.ahorrado > 0 ? '' : ' disabled'}><i data-icon="minus"></i>RETIRAR</button>
      </div>
    </div>`;
}

function fichaHTML(meta, i) {
  const e = estadoMeta(meta);
  return panel({
    n: `M${i + 1}`,
    t: esc(meta.nombre),
    m: e.cumplida ? '' : meta.fecha ? `PARA ${mesCorto(meta.fecha)}` : 'SIN FECHA',
    head: `${e.cumplida ? '<span class="fw-stamp">CUMPLIDA</span>' : ''}<button class="fw-iconbtn" data-accion="menu" data-tip="Editar o borrar" aria-label="Más opciones"><i data-icon="more"></i></button>`,
    cls: `fw-met__ficha ox-in-rise${e.cumplida ? ' is-done' : ''}${e.vencida ? ' is-late' : ''}`,
    attrs: `data-meta="${esc(meta.id)}" style="animation-delay:${i * 50}ms"`,
    body: `<div class="fw-meta__box">${cuerpoHTML(meta)}</div>`,
  });
}

const nuevaHTML = () => `<button class="fw-nueva fw-met__nueva" id="mt-nueva"><span><i data-icon="plus"></i>NUEVA META</span></button>`;

/* ── Vista ───────────────────────────────────────────────────────────────── */

export function viewMetas() {
  paint(`
    <div class="fw-screen fw-met">
      ${panel({ n: '01', t: 'Ahorro', m: 'LOS APORTES NO SON MOVIMIENTOS', cls: 'fw-met__tot', body: `
        <div class="fw-glob fw-glob--4 ox-copyable">
          <div><div class="fw-st__k">TOTAL AHORRADO</div><div class="fw-st__v" id="m-tot">0</div></div>
          <div><div class="fw-st__k">METAS ACTIVAS</div><div class="fw-st__v" id="m-act">0</div></div>
          <div><div class="fw-st__k">CUMPLIDAS</div><div class="fw-st__v" id="m-ok">0</div></div>
          <div><div class="fw-st__k">APORTADO ESTE MES</div><div class="fw-st__v" id="m-mes">0</div></div>
        </div>` })}
      <div class="fw-met__grilla" id="mt-grilla">
        ${metas.length ? metas.map(fichaHTML).join('') + (metas.length < 12 ? nuevaHTML() : '') : `
          <div class="fw-empty fw-met__vacio"><div><b>SIN METAS TODAVÍA</b>
            <p>Una meta es algo para lo que querés juntar plata: un viaje, un fondo de emergencia. Los aportes no se mezclan con los movimientos.</p>
            <button class="fw-btn fw-btn--acc fw-btn--sin-tecla" id="mt-primera"><i data-icon="plus"></i>CREAR UNA META</button></div></div>`}
      </div>
    </div>`);

  const root = viewEl();
  pintarTotales(root);
  llenarMedidores(root);
  root.querySelector('#mt-nueva, #mt-primera')?.addEventListener('click', () => editarMeta(null));

  const grilla = root.querySelector('#mt-grilla');
  grilla.addEventListener('click', async (ev) => {
    const card = ev.target.closest('[data-meta]');
    const meta = card && metas.find((m) => m.id === card.dataset.meta);
    if (!meta) return;
    const borrar = ev.target.closest('[data-borrar-aporte]');
    if (borrar) { borrarAporte(meta, borrar.dataset.borrarAporte); return; }
    const btn = ev.target.closest('[data-accion]');
    const accion = btn?.dataset.accion;
    if (accion === 'todos') {
      const filas = [...card.querySelectorAll('[data-aporte]')];
      if (abiertas.has(meta.id)) {
        abiertas.delete(meta.id);
        await Promise.all(filas.slice(APORTES_VISIBLES).map((f) => exit(f, { fallback: 260 })));
        repintarMeta(meta);
      } else {
        const antes = new Set(filas.map((f) => f.dataset.aporte));
        abiertas.add(meta.id);
        repintarMeta(meta, { nuevos: meta.aportes.map((a) => a.id).filter((id) => !antes.has(id)) });
      }
    } else if (accion === 'aportar') abrirForm(card, meta, 1);
    else if (accion === 'retirar') abrirForm(card, meta, -1);
    else if (accion === 'menu') {
      Menu.show(btn, [
        { label: 'Editar', icon: 'edit', onSelect: () => editarMeta(meta) },
        { sep: true },
        { label: 'Borrar meta', icon: 'trash', danger: true, onSelect: () => borrarMeta(meta) },
      ], { align: 'end' });
    }
  });
  grilla.addEventListener('keydown', (ev) => {
    const card = ev.target.closest('[data-meta]');
    const meta = card && metas.find((m) => m.id === card.dataset.meta);
    if (!meta || !ev.target.closest('.fw-meta__form')) return;
    if (ev.key === 'Escape') { ev.stopPropagation(); cerrarForm(card); }
    else if (ev.key === 'Enter') { ev.preventDefault(); confirmarForm(card, meta); }
  });
  grilla.addEventListener('input', (ev) => {
    const card = ev.target.closest('[data-meta]');
    const meta = card && metas.find((m) => m.id === card.dataset.meta);
    if (meta && ev.target.dataset.f === 'monto') validarForm(card, meta);
  });
}

function pintarTotales(root) {
  // Con flecha: map le pasaría el índice como `hoy` a estadoMeta.
  const Es = metas.map((m) => estadoMeta(m));
  const mes = currentMonth();
  rodar(root.querySelector('#m-tot'), Es.reduce((a, e) => a + e.ahorrado, 0), cifra, 700, 'met.tot');
  rodar(root.querySelector('#m-act'), Es.filter((e) => !e.cumplida).length, entero, 500, 'met.act');
  rodar(root.querySelector('#m-ok'), Es.filter((e) => e.cumplida).length, entero, 500, 'met.ok');
  rodar(root.querySelector('#m-mes'), metas.flatMap((m) => m.aportes).filter((a) => a.fecha.slice(0, 7) === mes)
    .reduce((a, x) => a + x.monto, 0), (v) => cifra(v, { signo: true }), 700, 'met.mes');
}

/** Pone UNA ficha al día en el lugar: el cuerpo hace relevo y el medidor
    viaja desde donde estaba. Las demás fichas ni se enteran. */
function repintarMeta(meta, { nuevos = [] } = {}) {
  const root = viewEl();
  const card = root.querySelector(`[data-meta="${CSS.escape(meta.id)}"]`);
  if (!card) { Router.refresh(); return; }
  const e = estadoMeta(meta);
  card.classList.toggle('is-done', e.cumplida);
  card.classList.toggle('is-late', e.vencida);
  const box = card.querySelector('.fw-meta__box');
  const antes = card.querySelector('.fw-meter')?.dataset.p;
  relevo(box, () => {
    box.innerHTML = cuerpoHTML(meta, { nuevos });
    const m = box.querySelector('.fw-meter');
    if (m && antes != null) { m.style.setProperty('--p', antes); raf2(() => medir(m, { p: e.pct, cls: e.cumplida ? 'is-ok' : '' })); }
  });
  const i = metas.indexOf(meta);
  frase(card.querySelector('.fw-p__t'), esc(meta.nombre));
  frase(card.querySelector('.fw-p__m'), e.cumplida ? '' : meta.fecha ? `PARA ${mesCorto(meta.fecha)}` : 'SIN FECHA');
  const stamp = card.querySelector('.fw-stamp');
  if (e.cumplida && !stamp) card.querySelector('.fw-p__m').insertAdjacentHTML('afterend', '<span class="fw-stamp ox-in-fade">CUMPLIDA</span>');
  else if (!e.cumplida && stamp) exit(stamp, { fallback: 200 });
  card.querySelector('.fw-p__n').textContent = `M${i + 1}`;
  pintarTotales(root);
}

/* ── Aportar y retirar, en la ficha ──────────────────────────────────────── */

function abrirForm(card, meta, signo) {
  const f = card.querySelector('.fw-meta__form');
  f.dataset.signo = String(signo);
  f.classList.add('is-open');
  card.querySelectorAll('[data-accion="aportar"], [data-accion="retirar"]').forEach((b) =>
    b.classList.toggle('is-on', Number(b.dataset.accion === 'aportar' ? 1 : -1) === signo));
  const monto = f.querySelector('[data-f="monto"]');
  monto.placeholder = signo > 0 ? 'cuánto ponés' : 'cuánto sacás';
  validarForm(card, meta);
  setTimeout(() => monto.focus(), 60);
}

function cerrarForm(card) {
  const f = card.querySelector('.fw-meta__form');
  f.classList.remove('is-open');
  card.querySelectorAll('.fw-meta__act .fw-btn').forEach((b) => b.classList.remove('is-on'));
  f.querySelectorAll('input').forEach((i) => { i.value = ''; i.classList.remove('is-invalid'); i.blur(); });
}

/** Un monto positivo, o null. Un retiro no puede dejar la meta en negativo:
    no se saca lo que no se puso. La pista dice de dónde sale la plata. */
function validarForm(card, meta) {
  const f = card.querySelector('.fw-meta__form');
  const signo = Number(f.dataset.signo);
  const input = f.querySelector('[data-f="monto"]');
  const texto = input.value.trim();
  const n = parseAmount(texto);
  const bien = Number.isFinite(n) && n > 0;
  const ahorrado = ahorradoDe(meta);
  const pasado = signo < 0 && bien && n > ahorrado;
  input.classList.toggle('is-invalid', (texto !== '' && !bien) || pasado);
  const hint = f.querySelector('[data-hint]');
  frase(hint, pasado ? `NO PODÉS SACAR MÁS DE $ ${cifra(ahorrado)}`
    : signo < 0 ? `TENÉS $ ${cifra(ahorrado)} EN ESTA META`
      : `EL BALANCE DE ESTE MES VA $ ${cifra(monthTotals(S.moves, currentMonth()).balance)}`);
  hint.classList.toggle('fw-out', pasado);
  return bien && !pasado ? centavos(n) : null;
}

async function confirmarForm(card, meta) {
  const n = validarForm(card, meta);
  if (n == null) return;
  const f = card.querySelector('.fw-meta__form');
  const signo = Number(f.dataset.signo);
  const aporte = { id: nuevoId('a'), fecha: todayStr(), monto: signo * n, nota: f.querySelector('[data-f="nota"]').value.trim() };
  const estabaCumplida = estadoMeta(meta).cumplida;
  meta.aportes.push(aporte);
  if (!await guardar()) { meta.aportes.pop(); return; }
  repintarMeta(meta, { nuevos: [aporte.id] });
  const ahora = estadoMeta(meta);
  Toast.show(ahora.cumplida && !estabaCumplida
    ? { title: 'Meta cumplida', text: `${meta.nombre}: ${fmtARS(ahora.ahorrado)}`, icon: 'check' }
    : { title: signo < 0 ? 'Retiro cargado' : 'Aporte cargado', text: `${signo < 0 ? '−' : '+'}${fmtARS(n)} · ${meta.nombre}`, icon: signo < 0 ? 'minus' : 'plus' });
}

/* ── Crear y editar: un modal, porque son tres campos y una decisión ─────── */

/* El modal cierra con cualquier botón del pie: para no dejar pasar un
   formulario a medias, el de confirmar se apaga mientras no sea válido. */
function cablearForm(body, valido) {
  const ok = body.closest('.ox-modal').querySelector('.ox-modal__foot .ox-btn--primary');
  const revisar = () => { ok.disabled = !valido(); };
  body.addEventListener('input', revisar);
  body.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT') return;
    ev.preventDefault();
    if (!ok.disabled) ok.click();
  });
  revisar();
}

const nfMonto = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

function leerMontoCampo(input) {
  const texto = input.value.trim();
  const n = parseAmount(texto);
  const bien = Number.isFinite(n) && n > 0;
  input.classList.toggle('is-invalid', texto !== '' && !bien);
  return bien ? centavos(n) : null;
}

async function editarMeta(meta) {
  const body = document.createElement('div');
  body.className = 'fw-form';
  body.innerHTML = `
    <label class="fw-form__f"><span>NOMBRE</span>
      <input class="fw-fld" data-f="nombre" maxlength="60" value="${esc(meta?.nombre ?? '')}" placeholder="por ejemplo: viaje a Chile" spellcheck="false" autocomplete="off"></label>
    <label class="fw-form__f"><span>CUÁNTO QUERÉS JUNTAR</span>
      <input class="fw-fld fw-fld--num" data-f="objetivo" value="${meta ? nfMonto.format(meta.objetivo) : ''}" placeholder="0" inputmode="decimal" spellcheck="false" autocomplete="off"></label>
    <div class="fw-form__f"><span>PARA CUÁNDO</span>
      <div class="fw-mesfield">
        <button class="fw-iconbtn" data-mes="-1" aria-label="Un mes antes"><i data-icon="chevronLeft"></i></button>
        <span class="fw-mesfield__v"></span>
        <button class="fw-iconbtn" data-mes="1" aria-label="Un mes después"><i data-icon="chevronRight"></i></button>
        <button class="fw-btn fw-btn--sin-tecla fw-mesfield__quitar" data-mes="0">SIN FECHA</button>
      </div>
      <em>Opcional. Con fecha, te digo cuánto poner por mes.</em></div>`;
  Icons.mount(body);
  const esperando = Modal.show({
    title: meta ? `Editar «${meta.nombre}»` : 'Nueva meta',
    body,
    width: 440,
    actions: [
      { label: 'Cancelar', value: false },
      { label: meta ? 'Guardar' : 'Crear meta', value: true, variant: 'primary' },
    ],
  });

  /* El mes límite se mueve con flechas y no con un calendario: es un mes, no
     un día, y un selector de dos pasos para eso sería más trabajo que dato. */
  let fecha = meta?.fecha ?? null;
  const hoy = currentMonth();
  const pintarMes = () => {
    frase(body.querySelector('.fw-mesfield__v'), fecha ? monthTitle(fecha).toUpperCase() : 'SIN FECHA');
    body.querySelector('.fw-mesfield__v').classList.toggle('fw-dim', !fecha);
    body.querySelector('[data-mes="-1"]').disabled = !fecha || fecha <= hoy;
    body.querySelector('.fw-mesfield__quitar').classList.toggle('is-hidden', !fecha);
  };
  body.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-mes]');
    if (!b) return;
    const d = Number(b.dataset.mes);
    fecha = d === 0 ? null : fecha ? shiftMonth(fecha, d) : shiftMonth(hoy, 1);
    if (fecha && fecha < hoy) fecha = hoy;
    pintarMes();
  });
  pintarMes();

  const nombre = body.querySelector('[data-f="nombre"]');
  const objetivo = body.querySelector('[data-f="objetivo"]');
  cablearForm(body, () => nombre.value.trim() !== '' && leerMontoCampo(objetivo) != null);
  setTimeout(() => nombre.focus(), 60);

  if (!await esperando) return;
  const datos = { nombre: nombre.value.trim(), objetivo: leerMontoCampo(objetivo), fecha };
  if (!datos.objetivo || !datos.nombre) return;

  if (meta) {
    Object.assign(meta, datos);
    if (!await guardar()) return;
    repintarMeta(meta);
    Toast.show({ title: 'Meta editada', text: meta.nombre, icon: 'check' });
  } else {
    const nueva = { id: nuevoId('m'), ...datos, aportes: [] };
    metas.push(nueva);
    if (!await guardar()) { metas.pop(); return; }
    Router.refresh();
    Toast.show({ title: 'Meta creada', text: nueva.nombre, icon: 'target' });
  }
}

async function borrarAporte(meta, id) {
  const a = meta.aportes.find((x) => x.id === id);
  if (!a) return;
  const quedaria = centavos(ahorradoDe(meta) - a.monto);
  const ok = await Modal.confirm({
    title: `¿Borrar el ${a.monto < 0 ? 'retiro' : 'aporte'}?`,
    sub: `${a.monto < 0 ? '−' : '+'}${fmtARS(Math.abs(a.monto))} · ${dayLabel(a.fecha)}${quedaria < 0
      ? ` · la meta quedaría en ${fmtARS(quedaria)}` : ''}`,
    confirmLabel: 'Borrar',
    danger: true,
  });
  if (!ok || !meta.aportes.includes(a)) return;
  const idx = meta.aportes.indexOf(a);
  meta.aportes.splice(idx, 1);
  if (!await guardar()) { meta.aportes.splice(idx, 0, a); return; }
  const fila = viewEl().querySelector(`[data-aporte="${CSS.escape(id)}"]`);
  await exit(fila, { fallback: 260 });
  repintarMeta(meta);
}

async function borrarMeta(meta) {
  const ahorrado = ahorradoDe(meta);
  const ok = await Modal.confirm({
    title: `¿Borrar «${meta.nombre}»?`,
    sub: `Se borran la meta y sus ${meta.aportes.length} ${meta.aportes.length === 1 ? 'aporte' : 'aportes'}`
      + `${ahorrado ? ` (${fmtARS(ahorrado)})` : ''}. Los movimientos no se tocan.`,
    confirmLabel: 'Borrar',
    danger: true,
  });
  if (!ok || !metas.includes(meta)) return;
  const idx = metas.indexOf(meta);
  metas.splice(idx, 1);
  if (!await guardar()) { metas.splice(idx, 0, meta); return; }
  const root = viewEl();
  const card = root.querySelector(`[data-meta="${CSS.escape(meta.id)}"]`);
  await exit(card, { fallback: 300 });
  Router.refresh();
  Toast.show({ title: 'Meta borrada', text: meta.nombre, icon: 'trash' });
}
