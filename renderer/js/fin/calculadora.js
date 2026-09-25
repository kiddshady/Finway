/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — Calculadora
   Filas a mano (concepto y monto) y un total que se recalcula al tipear. Es el
   SUMA() de una planilla, nada más: no son movimientos, no tienen fecha ni
   categoría, y no tocan el balance. Por eso vive en su propio documento
   (`calculadora.json`) y no en movimientos.json.

   Puede haber hasta MAX_CALCS abiertas a la vez, cada una con sus filas y su
   total: sirven para comparar dos cuentas lado a lado sin mezclarlas.

   El monto se guarda como TEXTO, tal cual se escribió. Igual que una celda:
   si se guardara el número, "1.500" volvería como "1500" y un monto que no se
   entendió desaparecería en vez de quedar marcado para corregirlo.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from '../icons.js';
import { Modal, Toast } from '../overlays.js';
import Router from '../router.js';
import { exit, stagger } from '../motion.js';
import { esc, head, paint, viewEl } from '../ui.js';
import { fmtARS, parseAmount } from './format.js';

const DOC = 'calculadora';
const FILAS_INICIALES = 3;
export const MAX_CALCS = 4;

let calcs = [];
let guardadoPendiente = null;

const nuevoId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const nuevaFila = () => ({ id: nuevoId('f'), concepto: '', monto: '' });
const vacias = (n) => Array.from({ length: n }, nuevaFila);
const nuevaCalc = () => ({ id: nuevoId('c'), titulo: '', filas: vacias(FILAS_INICIALES) });

/** El título es opcional: sin él, la calculadora se llama por su lugar. */
const nombreDe = (c) => c.titulo.trim() || `Calculadora ${calcs.indexOf(c) + 1}`;

function leerFilas(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((f) => f && typeof f.id === 'string')
    .map((f) => ({ id: f.id, concepto: String(f.concepto ?? ''), monto: String(f.monto ?? '') }));
}

/** Se llama en el arranque: así la vista pinta de una, sin estado de carga. */
export async function cargarCalculadora() {
  try {
    const doc = await window.onyx.doc.read(DOC, null);
    // schema 1 tenía una sola calculadora: `{ filas }`. Se lee como la primera.
    const crudas = Array.isArray(doc?.calculadoras) ? doc.calculadoras
      : Array.isArray(doc?.filas) ? [{ id: 'c1', filas: doc.filas }] : [];
    calcs = crudas
      .filter((c) => c && typeof c.id === 'string')
      .slice(0, MAX_CALCS)
      .map((c) => ({ id: c.id, titulo: String(c.titulo ?? ''), filas: leerFilas(c.filas) }));
  } catch (err) {
    console.warn('[calculadora] no se pudo leer, arranca vacía:', err.message);
    calcs = [];
  }
  if (!calcs.length) calcs = [nuevaCalc()];
  for (const c of calcs) if (!c.filas.length) c.filas = vacias(FILAS_INICIALES);
}

/* ── Guardado ────────────────────────────────────────────────────────────────
   Con demora: tipear un monto de seis cifras no son seis escrituras. Al
   salir de la vista se guarda lo pendiente de una, sin esperar. */

function guardarYa() {
  clearTimeout(guardadoPendiente);
  guardadoPendiente = null;
  return window.onyx.doc.write(DOC, { schema: 2, calculadoras: calcs }).catch((err) => {
    Toast.show({ title: 'No se pudo guardar la calculadora', text: err.message, icon: 'alert' });
  });
}

function guardarLuego() {
  clearTimeout(guardadoPendiente);
  guardadoPendiente = setTimeout(guardarYa, 400);
}

/* ── La cuenta ───────────────────────────────────────────────────────────── */

/** Un monto vacío no cuenta ni es error; uno que no se entiende es error. */
function leerMonto(texto) {
  if (!String(texto).trim()) return { vacio: true, valor: 0 };
  const n = parseAmount(texto);
  return Number.isFinite(n) ? { valor: n } : { invalido: true, valor: 0 };
}

export function sumar(lista) {
  let total = 0; let contadas = 0; let invalidas = 0;
  for (const f of lista) {
    const m = leerMonto(f.monto);
    if (m.invalido) invalidas++;
    else if (!m.vacio) { total += m.valor; contadas++; }
  }
  // Redondeo a centavos: 0,1 + 0,2 no puede dar 0,30000000000000004 en pantalla.
  return { total: Math.round(total * 100) / 100, contadas, invalidas };
}

const filaCargada = (f) => f.concepto.trim() || f.monto.trim();
const tieneDatos = (c) => c.filas.some(filaCargada);

/** La tabla como texto separado por tabs: pegada en una planilla, cada dato
    cae en su celda; pegada en un chat, se lee en columnas. Solo lo cargado. */
export function tablaTexto(lista, titulo = '') {
  const cargadas = lista.filter(filaCargada);
  if (!cargadas.length) return '';
  const linea = (a, b) => `${a}\t${b}`;
  // fmtARS separa el $ con un espacio fino: afuera de la app se pega uno común.
  const total = fmtARS(sumar(lista).total).replace(/\s/g, ' ');
  return [
    ...(titulo.trim() ? [titulo.trim()] : []),
    linea('Concepto', 'Monto'),
    ...cargadas.map((f) => linea(f.concepto.trim(), f.monto.trim())),
    linea('Total', total),
  ].join('\n');
}

async function copiarTabla(calc) {
  const texto = tablaTexto(calc.filas, calc.titulo);
  if (!texto) {
    Toast.show({ title: 'Nada para copiar', text: 'La calculadora no tiene filas cargadas.', icon: 'copy' });
    return;
  }
  const n = calc.filas.filter(filaCargada).length;
  try {
    await window.onyx.clipboard.writeText(texto);
    Toast.show({ title: 'Tabla copiada', text: `${n} ${n === 1 ? 'fila' : 'filas'} y el total, listas para pegar`, icon: 'copy' });
  } catch (err) {
    Toast.error('No se pudo copiar', err.message);
  }
}

/* ── Vista ───────────────────────────────────────────────────────────────── */

const filaHTML = (f) => `
  <div class="fw-calc__row ox-in-rise" data-fila="${esc(f.id)}">
    <input class="ox-input fw-calc__concepto" data-campo="concepto" value="${esc(f.concepto)}"
           placeholder="Concepto" spellcheck="false" autocomplete="off">
    <div class="fw-calc__monto">
      <span class="fw-calc__currency">$</span>
      <input class="ox-input ox-input--mono fw-calc__input${leerMonto(f.monto).invalido ? ' is-invalid' : ''}"
             data-campo="monto" value="${esc(f.monto)}" placeholder="0" inputmode="decimal"
             spellcheck="false" autocomplete="off">
    </div>
    <button class="ox-iconbtn ox-iconbtn--sm fw-calc__del" data-borrar="${esc(f.id)}" data-tip="Borrar fila"
            aria-label="Borrar fila"><i data-icon="trash"></i></button>
  </div>`;

const calcHTML = (c) => `
  <div class="ox-card fw-calc ox-in-rise" data-calc="${esc(c.id)}">
    <div class="fw-calc__head">
      <input class="fw-calc__titulo" data-titulo value="${esc(c.titulo)}" maxlength="60"
             aria-label="Título de la calculadora" spellcheck="false" autocomplete="off">
      <button class="ox-btn ox-btn--ghost ox-btn--sm ox-flashable fw-calc__copiar" data-accion="copiar">
        <i data-icon="copy"></i> Copiar</button>
      <button class="ox-btn ox-btn--ghost ox-btn--sm ox-flashable fw-calc__vaciar" data-accion="vaciar">
        <i data-icon="close"></i> Vaciar</button>
      <button class="ox-iconbtn ox-iconbtn--sm fw-calc__cerrar" data-accion="cerrar"
              data-tip="Cerrar calculadora" aria-label="Cerrar calculadora"><i data-icon="close"></i></button>
    </div>
    <div class="fw-calc__cols ox-meta">
      <span>Concepto</span><span class="fw-calc__cols-monto">Monto</span><span></span>
    </div>
    <div class="fw-calc__rows">${c.filas.map(filaHTML).join('')}</div>
    <div class="fw-calc__add">
      <button class="ox-btn ox-btn--ghost ox-btn--sm ox-flashable fw-calc__agregar" data-accion="agregar">
        <i data-icon="plus"></i> Agregar fila
      </button>
      <span class="ox-meta">Enter pasa al campo siguiente</span>
    </div>
    <div class="ox-card__foot fw-calc__foot">
      <div class="fw-calc__foot-text">
        <span class="fw-calc__label">Total</span>
        <span class="ox-meta fw-calc__detalle"></span>
      </div>
      <span class="fw-calc__total ox-num"></span>
    </div>
  </div>`;

export function viewCalculadora() {
  /* Un repintado (al volver el foco a la ventana, Router.refresh) no puede
     sacarle el cursor a quien está tipeando: se recuerda dónde estaba. */
  const activo = document.activeElement;
  const foco = activo?.closest?.('[data-calc]') && (activo.dataset.campo || 'titulo' in activo.dataset)
    ? { calc: activo.closest('[data-calc]').dataset.calc, id: activo.closest('[data-fila]')?.dataset.fila,
      campo: activo.dataset.campo, desde: activo.selectionStart, hasta: activo.selectionEnd }
    : null;

  paint(
    head({
      title: 'Calculadora',
      sub: 'Filas sumadas a mano. No se mezclan con los movimientos',
      actions: `<button class="ox-btn ox-btn--ghost ox-btn--sm ox-flashable" id="calc-nueva">
                  <i data-icon="plus"></i> Nueva calculadora</button>`,
      linea: true,
    })
    + `<div class="ox-scroll ox-grow">
        <div class="fw-calcs" id="calc-grilla">${calcs.map(calcHTML).join('')}</div>
      </div>`,
  );

  const root = viewEl();
  const grilla = root.querySelector('#calc-grilla');
  stagger(grilla);
  grilla.querySelectorAll('.fw-calc__rows').forEach((l) => stagger(l));
  for (const c of calcs) actualizarTotal(cardDe(grilla, c.id), c);
  actualizarCabeceras(root);

  /* Todo va enganchado a nodos que mueren con el pintado, nunca a #view: ahí
     un listener sobrevive a la navegación y se duplica en cada visita. Una
     sola delegación en la grilla atiende a todas las calculadoras. */
  const contexto = (e) => {
    const card = e.target.closest('[data-calc]');
    const calc = card && calcs.find((c) => c.id === card.dataset.calc);
    return calc ? { card, calc } : null;
  };

  grilla.addEventListener('input', (e) => {
    const campo = e.target.dataset.campo;
    const ctx = contexto(e);
    if (ctx && 'titulo' in e.target.dataset) {
      ctx.calc.titulo = e.target.value;
      guardarLuego();
      return;
    }
    const fila = ctx?.calc.filas.find((f) => f.id === e.target.closest('[data-fila]')?.dataset.fila);
    if (!campo || !fila) return;
    fila[campo] = e.target.value;
    if (campo === 'monto') e.target.classList.toggle('is-invalid', !!leerMonto(e.target.value).invalido);
    actualizarTotal(ctx.card, ctx.calc);
    guardarLuego();
  });

  grilla.addEventListener('keydown', (e) => {
    // Enter en el título baja a la primera fila, como en el resto de la tabla.
    if (e.key === 'Enter' && 'titulo' in e.target.dataset) {
      e.preventDefault();
      e.target.closest('[data-calc]').querySelector('[data-campo="concepto"]')?.focus();
      return;
    }
    if (e.key !== 'Enter' || !e.target.dataset.campo) return;
    e.preventDefault();
    const row = e.target.closest('[data-fila]');
    if (e.target.dataset.campo === 'concepto') {
      row.querySelector('[data-campo="monto"]').focus();
      return;
    }
    const siguiente = row.nextElementSibling;
    if (siguiente) siguiente.querySelector('[data-campo="concepto"]').focus();
    else { const ctx = contexto(e); if (ctx) agregarFila(ctx.card, ctx.calc); }
  });

  grilla.addEventListener('click', (e) => {
    const ctx = contexto(e);
    if (!ctx) return;
    const borrar = e.target.closest('[data-borrar]');
    if (borrar) { borrarFila(ctx.card, ctx.calc, borrar.dataset.borrar); return; }
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    if (accion === 'agregar') agregarFila(ctx.card, ctx.calc);
    else if (accion === 'copiar') copiarTabla(ctx.calc);
    else if (accion === 'vaciar') vaciar(ctx.calc);
    else if (accion === 'cerrar') cerrar(root, ctx.card, ctx.calc);
  });

  root.querySelector('#calc-nueva').addEventListener('click', () => abrirCalc(root));

  Router.onLeave(() => { if (guardadoPendiente) guardarYa(); });

  if (foco) {
    const card = `[data-calc="${CSS.escape(foco.calc)}"]`;
    const el = grilla.querySelector(foco.id
      ? `${card} [data-fila="${CSS.escape(foco.id)}"] [data-campo="${foco.campo}"]`
      : `${card} [data-titulo]`);
    if (el) {
      el.focus();
      try { el.setSelectionRange(foco.desde, foco.hasta); } catch { /* no aplica */ }
    }
  }
}

const cardDe = (grilla, id) => grilla.querySelector(`[data-calc="${CSS.escape(id)}"]`);

/** Sin título, el placeholder la nombra por su lugar; la X solo si hay más de
    una, y el tope en el botón. */
function actualizarCabeceras(root) {
  const grilla = root.querySelector('#calc-grilla');
  const vivas = [...grilla.querySelectorAll('[data-calc]:not([data-state="closing"])')];
  vivas.forEach((card, i) => { card.querySelector('[data-titulo]').placeholder = `Calculadora ${i + 1}`; });
  grilla.classList.toggle('is-single', calcs.length <= 1);
  const nueva = root.querySelector('#calc-nueva');
  nueva.disabled = calcs.length >= MAX_CALCS;
  if (nueva.disabled) nueva.dataset.tip = `Hasta ${MAX_CALCS} calculadoras`;
  else delete nueva.dataset.tip;
}

function actualizarTotal(card, calc) {
  const { total, contadas, invalidas } = sumar(calc.filas);
  card.querySelector('.fw-calc__total').textContent = fmtARS(total);
  const partes = [`${contadas} ${contadas === 1 ? 'monto' : 'montos'}`];
  if (invalidas) partes.push(`${invalidas} sin entender, no suman`);
  const detalle = card.querySelector('.fw-calc__detalle');
  detalle.textContent = partes.join(' · ');
  detalle.classList.toggle('fw-calc__detalle--error', invalidas > 0);
}

function agregarFila(card, calc) {
  const f = nuevaFila();
  calc.filas.push(f);
  const lista = card.querySelector('.fw-calc__rows');
  lista.insertAdjacentHTML('beforeend', filaHTML(f));
  const row = lista.lastElementChild;
  Icons.mount(row);
  row.querySelector('[data-campo="concepto"]').focus();
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  guardarLuego();
}

async function borrarFila(card, calc, id) {
  const row = card.querySelector(`[data-fila="${CSS.escape(id)}"]`);
  calc.filas = calc.filas.filter((f) => f.id !== id);
  actualizarTotal(card, calc);
  guardarLuego();
  await exit(row, { fallback: 260 });
  // Nunca queda la tabla sin filas: una calculadora vacía no tiene dónde escribir.
  if (!calc.filas.length && card.isConnected) agregarFila(card, calc);
}

function abrirCalc(root) {
  if (calcs.length >= MAX_CALCS) return;
  const c = nuevaCalc();
  calcs.push(c);
  const grilla = root.querySelector('#calc-grilla');
  grilla.insertAdjacentHTML('beforeend', calcHTML(c));
  const card = grilla.lastElementChild;
  Icons.mount(card);
  actualizarTotal(card, c);
  actualizarCabeceras(root);
  card.querySelector('[data-campo="concepto"]').focus();
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  guardarLuego();
}

async function cerrar(root, card, calc) {
  if (calcs.length <= 1) return;
  if (tieneDatos(calc) || calc.titulo.trim()) {
    const ok = await Modal.confirm({
      title: `Cerrar «${nombreDe(calc)}»`,
      sub: 'Se borran sus filas. Las otras calculadoras y los movimientos no se tocan.',
      confirmLabel: 'Cerrar',
      danger: true,
    });
    if (!ok || !card.isConnected) return;
  }
  calcs = calcs.filter((c) => c !== calc);
  guardarLuego();
  const salida = exit(card, { fallback: 260 });
  actualizarCabeceras(root);
  await salida;
}

async function vaciar(calc) {
  const nombre = calcs.length > 1 || calc.titulo.trim() ? `«${nombreDe(calc)}»` : 'la calculadora';
  const ok = await Modal.confirm({
    title: `Vaciar ${nombre}`,
    sub: 'Se borran todas sus filas; el título queda. Los movimientos no se tocan.',
    confirmLabel: 'Vaciar',
    danger: true,
  });
  if (!ok || !calcs.includes(calc)) return;
  calc.filas = vacias(FILAS_INICIALES);
  await guardarYa();
  Router.refresh();
}
