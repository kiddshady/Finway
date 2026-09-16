/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — Calculadora
   Filas a mano (concepto y monto) y un total que se recalcula al tipear. Es el
   SUMA() de una planilla, nada más: no son movimientos, no tienen fecha ni
   categoría, y no tocan el balance. Por eso vive en su propio documento
   (`calculadora.json`) y no en movimientos.json.

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

let filas = [];
let guardadoPendiente = null;

const nuevaFila = () => ({
  id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  concepto: '',
  monto: '',
});

const vacias = (n) => Array.from({ length: n }, nuevaFila);

/** Se llama en el arranque: así la vista pinta de una, sin estado de carga. */
export async function cargarCalculadora() {
  try {
    const doc = await window.onyx.doc.read(DOC, null);
    const leidas = Array.isArray(doc?.filas) ? doc.filas : [];
    filas = leidas
      .filter((f) => f && typeof f.id === 'string')
      .map((f) => ({ id: f.id, concepto: String(f.concepto ?? ''), monto: String(f.monto ?? '') }));
  } catch (err) {
    console.warn('[calculadora] no se pudo leer, arranca vacía:', err.message);
    filas = [];
  }
  if (!filas.length) filas = vacias(FILAS_INICIALES);
}

/* ── Guardado ────────────────────────────────────────────────────────────────
   Con demora: tipear un monto de seis cifras no son seis escrituras. Al
   salir de la vista se guarda lo pendiente de una, sin esperar. */

function guardarYa() {
  clearTimeout(guardadoPendiente);
  guardadoPendiente = null;
  return window.onyx.doc.write(DOC, { schema: 1, filas }).catch((err) => {
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

export function viewCalculadora() {
  /* Un repintado (al volver el foco a la ventana, Router.refresh) no puede
     sacarle el cursor a quien está tipeando: se recuerda dónde estaba. */
  const activo = document.activeElement;
  const foco = activo?.closest?.('[data-fila]')
    ? { id: activo.closest('[data-fila]').dataset.fila, campo: activo.dataset.campo,
      desde: activo.selectionStart, hasta: activo.selectionEnd }
    : null;

  paint(
    head({
      title: 'Calculadora',
      sub: 'Filas sumadas a mano. No se mezclan con los movimientos',
      actions: `<button class="ox-btn ox-btn--ghost ox-btn--sm ox-flashable" id="calc-vaciar">
                  <i data-icon="close"></i> Vaciar</button>`,
    })
    + `<div class="ox-scroll ox-grow">
        <div class="ox-card fw-calc">
          <div class="fw-calc__cols ox-meta">
            <span>Concepto</span><span class="fw-calc__cols-monto">Monto</span><span></span>
          </div>
          <div class="fw-calc__rows" id="calc-filas">${filas.map(filaHTML).join('')}</div>
          <div class="fw-calc__add">
            <button class="ox-btn ox-btn--ghost ox-btn--sm ox-flashable" id="calc-agregar">
              <i data-icon="plus"></i> Agregar fila
            </button>
            <span class="ox-meta">Enter pasa al campo siguiente</span>
          </div>
          <div class="ox-card__foot fw-calc__foot">
            <div class="fw-calc__foot-text">
              <span class="fw-calc__label">Total</span>
              <span class="ox-meta" id="calc-detalle"></span>
            </div>
            <span class="fw-calc__total ox-num" id="calc-total"></span>
          </div>
        </div>
      </div>`,
  );

  const root = viewEl();
  const lista = root.querySelector('#calc-filas');
  stagger(lista);
  actualizarTotal(root);

  /* Todo va enganchado a nodos que mueren con el pintado, nunca a #view: ahí
     un listener sobrevive a la navegación y se duplica en cada visita. */
  lista.addEventListener('input', (e) => {
    const campo = e.target.dataset.campo;
    const fila = filas.find((f) => f.id === e.target.closest('[data-fila]')?.dataset.fila);
    if (!campo || !fila) return;
    fila[campo] = e.target.value;
    if (campo === 'monto') e.target.classList.toggle('is-invalid', !!leerMonto(e.target.value).invalido);
    actualizarTotal(root);
    guardarLuego();
  });

  lista.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.dataset.campo) return;
    e.preventDefault();
    const row = e.target.closest('[data-fila]');
    if (e.target.dataset.campo === 'concepto') {
      row.querySelector('[data-campo="monto"]').focus();
      return;
    }
    const siguiente = row.nextElementSibling;
    if (siguiente) siguiente.querySelector('[data-campo="concepto"]').focus();
    else agregarFila(root);
  });

  lista.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-borrar]');
    if (btn) borrarFila(root, btn.dataset.borrar);
  });

  root.querySelector('#calc-agregar').addEventListener('click', () => agregarFila(root));
  root.querySelector('#calc-vaciar').addEventListener('click', () => vaciar());

  Router.onLeave(() => { if (guardadoPendiente) guardarYa(); });

  if (foco) {
    const el = lista.querySelector(`[data-fila="${CSS.escape(foco.id)}"] [data-campo="${foco.campo}"]`);
    if (el) {
      el.focus();
      try { el.setSelectionRange(foco.desde, foco.hasta); } catch { /* no aplica */ }
    }
  }
}

function actualizarTotal(root) {
  const { total, contadas, invalidas } = sumar(filas);
  root.querySelector('#calc-total').textContent = fmtARS(total);
  const partes = [`${contadas} ${contadas === 1 ? 'monto' : 'montos'}`];
  if (invalidas) partes.push(`${invalidas} sin entender, no suman`);
  const detalle = root.querySelector('#calc-detalle');
  detalle.textContent = partes.join(' · ');
  detalle.classList.toggle('fw-calc__detalle--error', invalidas > 0);
}

function agregarFila(root) {
  const f = nuevaFila();
  filas.push(f);
  const lista = root.querySelector('#calc-filas');
  lista.insertAdjacentHTML('beforeend', filaHTML(f));
  const row = lista.lastElementChild;
  Icons.mount(row);
  row.querySelector('[data-campo="concepto"]').focus();
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  guardarLuego();
}

async function borrarFila(root, id) {
  const row = root.querySelector(`[data-fila="${CSS.escape(id)}"]`);
  filas = filas.filter((f) => f.id !== id);
  actualizarTotal(root);
  guardarLuego();
  await exit(row, { fallback: 260 });
  // Nunca queda la tabla sin filas: una calculadora vacía no tiene dónde escribir.
  if (!filas.length && root.isConnected) agregarFila(root);
}

async function vaciar() {
  const ok = await Modal.confirm({
    title: 'Vaciar la calculadora',
    sub: 'Se borran todas las filas. Los movimientos no se tocan.',
    confirmLabel: 'Vaciar',
    danger: true,
  });
  if (!ok) return;
  filas = vacias(FILAS_INICIALES);
  await guardarYa();
  Router.refresh();
}
