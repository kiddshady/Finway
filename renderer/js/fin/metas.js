/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — Metas de ahorro
   Algo para lo que querés juntar plata: un nombre, cuánto, y si querés, para
   cuándo. Se llena con aportes a mano; un retiro es un aporte negativo.

   Los aportes NO son movimientos. Ahorrar no es gastar —la plata sigue siendo
   tuya—, así que no tocan el balance ni los gráficos. Viven en su propio
   documento (`metas.json`), igual que la calculadora. Lo que sí se muestra al
   aportar es el balance del mes, que es de donde sale lo que se ahorra.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from '../icons.js';
import { Menu, Modal, Toast } from '../overlays.js';
import Router from '../router.js';
import { exit, raf2, stagger } from '../motion.js';
import { empty, esc, head, paint, viewEl } from '../ui.js';
import { currentMonth, dayLabel, fmtARS, monthTitle, parseAmount, shiftMonth, todayStr } from './format.js';
import { ahorradoDe, estadoMeta } from './plan.js';
import { monthTotals } from './stats.js';
import { S } from './state.js';

const DOC = 'metas';
const APORTES_VISIBLES = 3;

let metas = [];
/** Las tarjetas con la lista de aportes entera a la vista. Dura lo que la app. */
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

/** Sin demora, a diferencia de la calculadora: acá cada guardado es una
    acción confirmada en un diálogo, no una tecla. Devuelve si salió. */
async function guardar() {
  try {
    await window.onyx.doc.write(DOC, { schema: 1, metas });
    return true;
  } catch (err) {
    Toast.error('No se pudo guardar la meta', err.message);
    return false;
  }
}

/* ── Textos ──────────────────────────────────────────────────────────────── */

const pctTexto = (pct) => `${Math.floor(pct * 100)} %`;   // floor: 99,6 no es 100
const pctCSS = (pct) => `${(pct * 100).toFixed(2)}%`;

/** El renglón que dice qué hacer con la meta, o cómo viene. */
function planDe(meta, e) {
  if (e.cumplida) return `Cumplida: juntaste ${fmtARS(e.ahorrado)}`;
  if (e.vencida) return `La fecha era ${monthTitle(meta.fecha).toLowerCase()} y faltan ${fmtARS(e.falta)}`;
  if (e.porMes != null) {
    return e.meses === 1
      ? `Para ${monthTitle(meta.fecha).toLowerCase()}: te faltan ${fmtARS(e.falta)} este mes`
      // Sin centavos y hacia arriba: poniendo un peso menos por mes, no se llega.
      : `Para ${monthTitle(meta.fecha).toLowerCase()}: ${fmtARS(Math.ceil(e.porMes))} por mes durante ${e.meses} meses`;
  }
  if (e.llegada) return `A tu ritmo de ${fmtARS(Math.round(e.ritmo))} por mes, llegás en ${monthTitle(e.llegada).toLowerCase()}`;
  return 'Sin fecha. Con el primer aporte te digo cuándo llegás';
}

/* Al pintar la vista entran todos; al repintar una tarjeta, solo el aporte que
   se acaba de cargar — el resto ya estaba ahí y no tiene por qué parpadear. */
const aporteHTML = (a, clase = '') => `
  <div class="fw-meta__aporte${clase ? ` ${clase}` : ''}" data-aporte="${esc(a.id)}">
    <span class="ox-mono ox-dim">${dayLabel(a.fecha)}</span>
    <span class="fw-meta__nota ox-truncate ox-copyable">${esc(a.nota)}</span>
    <span class="fw-meta__monto ox-num ox-copyable">${a.monto < 0 ? '−' : '+'}${fmtARS(Math.abs(a.monto))}</span>
    <button class="ox-iconbtn ox-iconbtn--sm fw-meta__del" data-borrar-aporte="${esc(a.id)}"
            data-tip="Borrar" aria-label="Borrar"><i data-icon="trash"></i></button>
  </div>`;

/** Los últimos primero: es lo que se vuelve a mirar para ver si ya lo cargaste. */
const recientes = (meta) => [...meta.aportes]
  .sort((a, b) => b.fecha.localeCompare(a.fecha) || meta.aportes.indexOf(b) - meta.aportes.indexOf(a));

function metaHTML(meta, { entrada = true, nuevos = [] } = {}) {
  const e = estadoMeta(meta);
  const todos = recientes(meta);
  const abierta = abiertas.has(meta.id);
  const ultimos = abierta ? todos : todos.slice(0, APORTES_VISIBLES);
  const sobran = meta.aportes.length - APORTES_VISIBLES;
  return `
  <article class="ox-card fw-meta${entrada ? ' ox-in-rise' : ''}${e.cumplida ? ' is-done' : ''}${e.vencida ? ' is-late' : ''}"
           data-meta="${esc(meta.id)}">
    <div class="ox-card__head">
      <span class="fw-meta__nombre ox-truncate">${esc(meta.nombre)}</span>
      ${meta.fecha ? `<span class="ox-meta fw-meta__fecha">${monthTitle(meta.fecha)}</span>` : ''}
      <button class="ox-iconbtn ox-iconbtn--sm fw-meta__mas" data-accion="menu" data-tip="Más"
              aria-label="Más opciones"><i data-icon="more"></i></button>
    </div>
    <div class="ox-card__body fw-meta__body">
      <div class="fw-meta__cifras">
        <span class="fw-meta__ahorrado ox-copyable">${fmtARS(e.ahorrado)}</span>
        <span class="ox-meta">de <span class="ox-copyable">${fmtARS(e.objetivo)}</span></span>
      </div>
      <div class="ox-meter fw-meta__meter">
        <div class="ox-meter__fill" style="--ox-pct:${pctCSS(e.pct)}"></div>
      </div>
      <div class="fw-meta__estado">
        <span class="ox-num">${pctTexto(e.pct)}</span>
        <span class="ox-meta">${e.cumplida ? '' : `faltan ${fmtARS(e.falta)}`}</span>
      </div>
      <div class="fw-meta__plan">
        <i data-icon="${e.cumplida ? 'check' : e.vencida ? 'alert' : 'target'}"></i>
        <span>${esc(planDe(meta, e))}</span>
      </div>
      ${ultimos.length ? `
      <div class="fw-meta__aportes${!entrada && ultimos.every((a) => nuevos.includes(a.id)) ? ' ox-in-fade' : ''}">
        <div class="fw-meta__aportes-head">
          <span class="ox-eyebrow">${abierta ? 'Todos los aportes' : 'Últimos aportes'}</span>
          ${sobran > 0 ? `<button class="ox-btn ox-btn--ghost ox-btn--sm fw-meta__todos" data-accion="todos">${
            abierta ? 'Ver menos' : `Ver ${sobran} más`}</button>` : ''}
        </div>
        ${ultimos.map((a) => aporteHTML(a, entrada ? 'ox-in-fade' : nuevos.includes(a.id) ? 'is-new' : '')).join('')}
      </div>` : ''}
    </div>
    <div class="ox-card__foot">
      <button class="ox-btn ox-btn--secondary ox-btn--sm ox-flashable" data-accion="aportar">
        <i data-icon="plus"></i> Aportar</button>
      <button class="ox-btn ox-btn--ghost ox-btn--sm ox-flashable" data-accion="retirar"${e.ahorrado > 0 ? '' : ' disabled'}>
        <i data-icon="minus"></i> Retirar</button>
    </div>
  </article>`;
}

const subDe = () => {
  if (!metas.length) return 'Ahorro aparte de los movimientos';
  const total = centavos(metas.reduce((a, m) => a + ahorradoDe(m), 0));
  return `${fmtARS(total)} juntado en ${metas.length} ${metas.length === 1 ? 'meta' : 'metas'}`;
};

/* ── Vista ───────────────────────────────────────────────────────────────── */

export function viewMetas() {
  const nueva = `<button class="ox-btn ox-btn--ghost ox-btn--sm ox-flashable" id="mt-nueva">
                   <i data-icon="plus"></i> Nueva meta</button>`;

  paint(
    head({ title: 'Metas', sub: subDe(), actions: metas.length ? nueva : '', linea: true })
    + (metas.length
      ? `<div class="ox-scroll ox-grow"><div class="fw-metas" id="mt-grilla">${metas.map((m) => metaHTML(m)).join('')}</div></div>`
      : empty({
        icon: 'target',
        title: 'Sin metas todavía',
        text: 'Una meta es algo para lo que querés juntar plata: un viaje, un fondo de emergencia. '
          + 'Los aportes no se mezclan con los movimientos.',
        actions: '<button class="ox-btn ox-btn--primary ox-flashable" id="mt-primera"><i data-icon="plus"></i> Crear una meta</button>',
      })),
  );

  const root = viewEl();
  root.querySelector('#mt-nueva, #mt-primera')?.addEventListener('click', () => editarMeta(null));

  const grilla = root.querySelector('#mt-grilla');
  if (!grilla) return;
  stagger(grilla);

  // Una sola delegación en la grilla, que muere con el pintado: enganchada a
  // #view sobreviviría a la navegación y se duplicaría en cada visita.
  grilla.addEventListener('click', async (ev) => {
    const card = ev.target.closest('[data-meta]');
    const meta = card && metas.find((m) => m.id === card.dataset.meta);
    if (!meta) return;
    const borrar = ev.target.closest('[data-borrar-aporte]');
    if (borrar) { borrarAporte(meta, borrar.dataset.borrarAporte); return; }
    const btn = ev.target.closest('[data-accion]');
    const accion = btn?.dataset.accion;
    if (accion === 'todos') {
      // Se abre y se cierra en el lugar: las filas de más entran o salen con
      // su animación, y la tarjeta cambia de alto de a poco.
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
    } else if (accion === 'aportar') aportar(meta, 1);
    else if (accion === 'retirar') aportar(meta, -1);
    else if (accion === 'menu') {
      Menu.show(btn, [
        { label: 'Editar', icon: 'edit', onSelect: () => editarMeta(meta) },
        { sep: true },
        { label: 'Borrar meta', icon: 'trash', danger: true, onSelect: () => borrarMeta(meta) },
      ], { align: 'end' });
    }
  });
}

/** Repinta UNA tarjeta sin su animación de entrada, y hace viajar la barra
    desde donde estaba: el cambio se ve, y las demás tarjetas ni se enteran. */
function repintarMeta(meta, { nuevos = [] } = {}) {
  const root = viewEl();
  const vieja = root.querySelector(`[data-meta="${CSS.escape(meta.id)}"]`);
  if (!vieja) { Router.refresh(); return; }
  const antes = vieja.querySelector('.ox-meter__fill')?.style.getPropertyValue('--ox-pct');
  vieja.insertAdjacentHTML('afterend', metaHTML(meta, { entrada: false, nuevos }));
  const card = vieja.nextElementSibling;
  vieja.remove();
  Icons.mount(card);
  const fill = card.querySelector('.ox-meter__fill');
  const despues = fill.style.getPropertyValue('--ox-pct');
  if (antes && antes !== despues) {
    fill.style.setProperty('--ox-pct', antes);
    raf2(() => fill.style.setProperty('--ox-pct', despues));
  }
  const sub = root.querySelector('.ox-viewhead__sub');
  if (sub) sub.textContent = subDe();
}

/* ── Formularios ─────────────────────────────────────────────────────────────
   El modal de Onyx cierra con cualquier botón del pie. Para no dejar pasar un
   formulario a medias, el botón de confirmar se apaga mientras no sea válido,
   y Enter en un campo confirma solo si está prendido. */

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
  return revisar;
}

const nfMonto = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

const campoMonto = (f, valor = '', label = 'Monto') => `
  <div class="ox-field">
    <label class="ox-field__label" for="mt-${f}">${label}</label>
    <div class="fw-calc__monto">
      <span class="fw-calc__currency">$</span>
      <input class="ox-input ox-input--mono fw-calc__input" id="mt-${f}" data-f="${f}" value="${esc(valor)}"
             placeholder="0" inputmode="decimal" spellcheck="false" autocomplete="off">
    </div>
    <span class="ox-field__hint" data-hint="${f}"></span>
  </div>`;

/** Un monto positivo, o null si no se entiende. Marca el campo si no. */
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
    <div class="ox-field">
      <label class="ox-field__label" for="mt-nombre">Nombre</label>
      <input class="ox-input" id="mt-nombre" data-f="nombre" maxlength="60" value="${esc(meta?.nombre ?? '')}"
             placeholder="Por ejemplo: viaje a Chile" spellcheck="false" autocomplete="off">
    </div>
    ${campoMonto('objetivo', meta ? nfMonto.format(meta.objetivo) : '', 'Cuánto querés juntar')}
    <div class="ox-field">
      <span class="ox-field__label">Para cuándo</span>
      <div class="fw-mesfield">
        <button class="ox-iconbtn ox-iconbtn--sm" data-mes="-1" aria-label="Un mes antes"><i data-icon="chevronLeft"></i></button>
        <span class="fw-mesfield__valor"></span>
        <button class="ox-iconbtn ox-iconbtn--sm" data-mes="1" aria-label="Un mes después"><i data-icon="chevronRight"></i></button>
        <button class="ox-btn ox-btn--ghost ox-btn--sm fw-mesfield__quitar" data-mes="0">Sin fecha</button>
      </div>
      <span class="ox-field__hint">Opcional. Con fecha, te digo cuánto poner por mes.</span>
    </div>`;
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
    body.querySelector('.fw-mesfield__valor').textContent = fecha ? monthTitle(fecha) : 'Sin fecha';
    body.querySelector('.fw-mesfield__valor').classList.toggle('is-empty', !fecha);
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
  // El modal enfoca su primer botón, que es la X: acá se empieza escribiendo.
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
    const nuevaMeta = { id: nuevoId('m'), ...datos, aportes: [] };
    metas.push(nuevaMeta);
    if (!await guardar()) { metas.pop(); return; }
    Router.refresh();
    Toast.show({ title: 'Meta creada', text: nuevaMeta.nombre, icon: 'target' });
  }
}

/** Aportar (signo 1) o retirar (signo −1). Un retiro no puede dejar la meta
    en negativo: no se saca lo que no se puso. */
async function aportar(meta, signo) {
  const ahorrado = ahorradoDe(meta);
  const retiro = signo < 0;
  const balance = monthTotals(S.moves, currentMonth()).balance;

  const body = document.createElement('div');
  body.className = 'fw-form';
  body.innerHTML = `
    ${campoMonto('monto', '', retiro ? 'Cuánto sacás' : 'Cuánto ponés')}
    <div class="ox-field">
      <label class="ox-field__label" for="mt-nota">Nota</label>
      <input class="ox-input" id="mt-nota" data-f="nota" maxlength="80" placeholder="Opcional"
             spellcheck="false" autocomplete="off">
    </div>`;

  const esperando = Modal.show({
    title: retiro ? `Retirar de «${meta.nombre}»` : `Aportar a «${meta.nombre}»`,
    sub: retiro ? `Tenés ${fmtARS(ahorrado)} en esta meta` : `El balance de este mes va ${fmtARS(balance)}`,
    body,
    width: 400,
    actions: [
      { label: 'Cancelar', value: false },
      { label: retiro ? 'Retirar' : 'Aportar', value: true, variant: 'primary' },
    ],
  });

  const monto = body.querySelector('[data-f="monto"]');
  const hint = body.querySelector('[data-hint="monto"]');
  cablearForm(body, () => {
    const n = leerMontoCampo(monto);
    const pasado = retiro && n != null && n > ahorrado;
    monto.classList.toggle('is-invalid', pasado || monto.classList.contains('is-invalid'));
    hint.textContent = pasado ? `No podés sacar más de ${fmtARS(ahorrado)}` : '';
    hint.classList.toggle('ox-field__hint--error', pasado);
    return n != null && !pasado;
  });
  setTimeout(() => monto.focus(), 60);

  if (!await esperando) return;
  const n = leerMontoCampo(monto);
  if (n == null || (retiro && n > ahorrado)) return;

  const aporte = { id: nuevoId('a'), fecha: todayStr(), monto: signo * n, nota: body.querySelector('[data-f="nota"]').value.trim() };
  const estabaCumplida = estadoMeta(meta).cumplida;
  meta.aportes.push(aporte);
  if (!await guardar()) { meta.aportes.pop(); return; }
  repintarMeta(meta, { nuevos: [aporte.id] });
  const ahora = estadoMeta(meta);
  Toast.show(ahora.cumplida && !estabaCumplida
    ? { title: 'Meta cumplida', text: `${meta.nombre}: ${fmtARS(ahora.ahorrado)}`, icon: 'check' }
    : { title: retiro ? 'Retiro cargado' : 'Aporte cargado', text: `${retiro ? '−' : '+'}${fmtARS(n)} · ${meta.nombre}`, icon: retiro ? 'minus' : 'plus' });
}

async function borrarAporte(meta, id) {
  const a = meta.aportes.find((x) => x.id === id);
  if (!a) return;
  // Borrar un aporte puede dejar la meta en negativo si después hubo retiros.
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
  // Si era el único, se va el bloque entero con su rótulo, no solo la fila.
  const fila = viewEl().querySelector(`[data-aporte="${CSS.escape(id)}"]`);
  await exit(meta.aportes.length ? fila : fila?.closest('.fw-meta__aportes'), { fallback: 260 });
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
  const sub = root.querySelector('.ox-viewhead__sub');
  if (sub) sub.textContent = subDe();
  await exit(card, { fallback: 300 });
  if (!metas.length) Router.refresh();
  Toast.show({ title: 'Meta borrada', text: meta.nombre, icon: 'trash' });
}
