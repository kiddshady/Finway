/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — carga rápida (el inspector de Movimientos)
   El corazón de la app: tipo → monto → categoría → Enter. Todo el flujo tiene
   que poder hacerse sin sacar las manos del teclado, y por eso el orden del
   DOM es exactamente el orden del tabulador.

   El estado vive acá adentro, NO en el DOM: la vista se repinta cuando cambia
   el mes o entra un movimiento, y un formulario que guarda su estado en sus
   propios inputs se vaciaría solo en cada repintado.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from '../icons.js';
import { exit } from '../motion.js';
import { esc } from '../ui.js';
import { catsFor } from './categories.js';
import { parseAmount, todayStr, shiftMonth, daysInMonth } from './format.js';

const DOW = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pad2 = (n) => String(n).padStart(2, '0');

const S = {
  type: 'expense',
  amount: '',
  category: 'comida',
  note: '',
  date: todayStr(),
  editing: null,
};

/* ══ Markup ══════════════════════════════════════════════════════════════════ */

const catsHTML = () => catsFor(S.type).map((c) => `
  <button class="fw-cat-btn${c.id === S.category ? ' is-on' : ''}" data-cat="${esc(c.id)}">${esc(c.label)}</button>`).join('');

export function quickAddHTML() {
  const isIncome = S.type === 'income';
  return `
    <div class="fw-qa" id="qa">

      <div class="fw-qa__banner${S.editing ? ' is-open' : ''}" id="qa-banner">
        <div>
          <div class="fw-qa__banner-inner">
            Editando movimiento
            <button class="ox-iconbtn ox-iconbtn--sm" id="qa-cancel"
                    data-tip="Cancelar" data-tip-key="Esc" tabindex="-1"><i data-icon="close"></i></button>
          </div>
        </div>
      </div>

      <div class="ox-segmented" id="qa-type" style="width:100%">
        <button class="ox-segmented__opt${isIncome ? '' : ' is-active'}" data-value="expense">Gasto</button>
        <button class="ox-segmented__opt${isIncome ? ' is-active' : ''}" data-value="income">Ingreso</button>
      </div>

      <div class="fw-amountfield fw-amountfield--${S.type}" id="qa-amountfield">
        <span class="fw-amountfield__currency">$</span>
        <input class="fw-amountfield__input" id="qa-amount" value="${esc(S.amount)}"
               placeholder="0,00" inputmode="decimal" spellcheck="false" aria-label="Monto">
      </div>

      <div class="fw-cats" id="qa-cats">${catsHTML()}</div>

      <div class="fw-qa__row">
        <input class="ox-input" id="qa-note" value="${esc(S.note)}"
               placeholder="nota (opcional)" spellcheck="false" aria-label="Nota">
        ${datePickerHTML()}
      </div>

      <!-- El atajo se anuncia en el tooltip y no adentro del botón: la tecla
           metida ahí lo desbalanceaba (el texto se iba a la izquierda) y sobre
           el primario, que es claro, se leía como un botón dentro del botón. -->
      <button class="ox-btn ox-btn--primary ox-flashable" id="qa-submit" style="width:100%"
              data-tip="${S.editing ? 'Guardar los cambios' : 'Registrar el movimiento'}" data-tip-key="Enter">
        ${S.editing ? `${Icons.svg('check', 'ox-icon--sm')} Guardar` : 'Registrar'}
      </button>
    </div>`;
}

function datePickerHTML() {
  return `
    <div class="fw-dp" id="qa-dp">
      <button class="fw-dp__field" id="qa-dp-field" data-tip="Elegir fecha">
        <span id="qa-dp-value">${S.date.split('-').reverse().join('/')}</span>
        ${Icons.svg('calendar', 'ox-icon--sm')}
      </button>
    </div>`;
}

/** La grilla es fija de 6×7, lunes primero, con las colas de los meses vecinos:
    un calendario que cambia de alto según el mes hace saltar todo lo de abajo. */
function calendarHTML(viewYM, selected) {
  const [y, m] = viewYM.split('-').map(Number);
  const firstIdx = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const dimCur = daysInMonth(viewYM);
  const prevYM = shiftMonth(viewYM, -1);
  const nextYM = shiftMonth(viewYM, 1);
  const dimPrev = daysInMonth(prevYM);
  const today = todayStr();

  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = i - firstIdx + 1;
    const cell = d < 1 ? { ym: prevYM, day: dimPrev + d, out: true }
      : d > dimCur ? { ym: nextYM, day: d - dimCur, out: true }
        : { ym: viewYM, day: d, out: false };
    const ds = `${cell.ym}-${pad2(cell.day)}`;
    cells += `<button class="fw-dp__day${cell.out ? ' is-out' : ''}${ds === selected ? ' is-selected' : ''}${ds === today ? ' is-today' : ''}"
                data-date="${ds}">${cell.day}</button>`;
  }

  return `
    <div class="fw-dp__pop" id="qa-dp-pop">
      <div class="fw-dp__head">
        <span class="fw-dp__month">${MESES[m - 1]} ${y}</span>
        <button class="ox-iconbtn ox-iconbtn--sm" data-shift="-1" data-tip="Mes anterior"><i data-icon="chevronLeft"></i></button>
        <button class="ox-iconbtn ox-iconbtn--sm" data-shift="1" data-tip="Mes siguiente"><i data-icon="chevronRight"></i></button>
      </div>
      <div class="fw-dp__dow">${DOW.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="fw-dp__grid">${cells}</div>
      <div class="fw-dp__foot">
        <button class="ox-btn ox-btn--ghost ox-btn--sm" data-date="${today}">Hoy</button>
      </div>
    </div>`;
}

/* ══ Cableado ════════════════════════════════════════════════════════════════ */

/** Devuelve la función de limpieza: hay que llamarla ANTES de recablear, o el
    calendario deja listeners sueltos en el layer y en el documento. */
export function wireQuickAdd(root, { onSubmit, onCancelEdit, onTypeChange }) {
  const qa = root.querySelector('#qa');
  if (!qa) return () => {};

  const amount = qa.querySelector('#qa-amount');
  const note = qa.querySelector('#qa-note');
  const field = qa.querySelector('#qa-amountfield');

  /* Los inputs son la única parte del estado que el DOM sabe mejor que S:
     el usuario tipea ahí. Todo lo demás viaja al revés. */
  amount.addEventListener('input', () => { S.amount = amount.value; });
  note.addEventListener('input', () => { S.note = note.value; });

  // Segmentado de tipo. Repinta las categorías porque el catálogo cambia.
  qa.querySelectorAll('#qa-type .ox-segmented__opt').forEach((b) => {
    b.addEventListener('click', () => {
      if (S.type === b.dataset.value) return;
      S.type = b.dataset.value;
      const cats = catsFor(S.type);
      if (!cats.some((c) => c.id === S.category)) S.category = cats[0].id;
      onTypeChange();
    });
  });

  // Categorías: delegado en el contenedor, que sobrevive al cambio de tipo.
  qa.querySelector('#qa-cats').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    S.category = btn.dataset.cat;
    qa.querySelectorAll('#qa-cats .fw-cat-btn').forEach((b) =>
      b.classList.toggle('is-on', b.dataset.cat === S.category));
  });

  qa.querySelector('#qa-submit').addEventListener('click', () => submit(field, amount, onSubmit));
  qa.querySelector('#qa-cancel')?.addEventListener('click', onCancelEdit);

  /* Enter manda desde cualquier campo; Escape sale de la edición. Los dos van
     en el contenedor y no en cada input: un handler, y los campos que se
     agreguen mañana lo heredan. */
  qa.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.target.closest('.fw-dp')) submit(field, amount, onSubmit);
    if (e.key === 'Escape' && S.editing && !qa.querySelector('#qa-dp-pop')) onCancelEdit();
  });

  return wireDatePicker(qa);
}

function submit(field, input, onSubmit) {
  const n = parseAmount(S.amount);
  if (!Number.isFinite(n) || n <= 0 || !S.date) {
    // El rechazo se ve: sin esto, Enter sobre un monto vacío no hace nada y
    // parece que la app se colgó.
    field.classList.remove('is-shaking');
    void field.offsetWidth;                   // reinicia la animación
    field.classList.add('is-shaking');
    setTimeout(() => field.classList.remove('is-shaking'), 460);
    input.focus();
    return;
  }
  onSubmit({
    ...(S.editing ? { id: S.editing.id } : {}),
    type: S.type,
    amount: n,
    category: S.category,
    note: S.note.trim(),
    date: S.date,
  });
}

/* El calendario se PORTALEA a #ox-layer, como todos los overlays de Onyx.
   Viviendo dentro del inspector quedaba atrapado en un contenedor con
   overflow-y:auto, que recorta cualquier cosa absoluta que se le salga. Para
   esquivar ese recorte había que abrirlo hacia arriba… y entonces tapaba el
   monto, las categorías y el banner de edición: el formulario entero quedaba
   atrás del calendario. Afuera del scroll no lo recorta nadie, y recién ahí se
   puede elegir el lado por el espacio que sobra. */
const GAP = 6;
const EDGE = 10;

function wireDatePicker(qa) {
  const dp = qa.querySelector('#qa-dp');
  const fieldBtn = qa.querySelector('#qa-dp-field');
  const layer = () => document.getElementById('ox-layer');
  let viewYM = S.date.slice(0, 7);
  let onDoc = null;
  let pop = null;

  const place = () => {
    if (!pop) return;
    const a = fieldBtn.getBoundingClientRect();
    const h = pop.offsetHeight;
    const w = pop.offsetWidth;
    // Abajo si entra; si no, arriba. Nunca a caballo del borde.
    const abajo = a.bottom + GAP + h <= window.innerHeight - EDGE;
    pop.style.top = `${abajo ? a.bottom + GAP : Math.max(EDGE, a.top - GAP - h)}px`;
    pop.style.left = `${Math.min(Math.max(EDGE, a.right - w), window.innerWidth - w - EDGE)}px`;
  };

  const close = () => {
    if (!pop) return;
    fieldBtn.classList.remove('is-on');
    document.removeEventListener('mousedown', onDoc);
    window.removeEventListener('resize', place);
    onDoc = null;
    exit(pop, { fallback: 260 });
    pop = null;
  };

  const render = () => {
    pop.innerHTML = calendarHTML(viewYM, S.date);
    Icons.mount(pop);
    place();
  };

  const open = () => {
    viewYM = S.date.slice(0, 7);
    pop = document.createElement('div');
    pop.className = 'fw-dp__portal';
    layer().appendChild(pop);
    render();
    fieldBtn.classList.add('is-on');

    onDoc = (e) => { if (!pop.contains(e.target) && !fieldBtn.contains(e.target)) close(); };
    // En el mismo tick, el click que abre llegaría al documento y cerraría.
    setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    window.addEventListener('resize', place);
  };

  fieldBtn.addEventListener('click', () => (pop ? close() : open()));

  /* El popover ya no es hijo del campo, así que sus clicks y su Escape se
     escuchan en el layer y en el documento — dos lugares que sobreviven a
     cualquier repintado. Por eso los dos se sueltan en destroy(): si no, cada
     vez que el inspector se repinta quedaría otro par escuchando. */
  const onLayerClick = (e) => {
    if (!pop || !pop.contains(e.target)) return;
    const shift = e.target.closest('[data-shift]');
    if (shift) { viewYM = shiftMonth(viewYM, Number(shift.dataset.shift)); render(); return; }
    const day = e.target.closest('[data-date]');
    if (day) {
      S.date = day.dataset.date;
      qa.querySelector('#qa-dp-value').textContent = S.date.split('-').reverse().join('/');
      close();
    }
  };
  const onEsc = (e) => {
    if (e.key === 'Escape' && pop) { e.stopPropagation(); close(); }
  };
  layer().addEventListener('click', onLayerClick);
  document.addEventListener('keydown', onEsc, true);

  /* Si el inspector se repinta con el calendario abierto (cambio de tipo,
     entrar o salir de edición), el popover quedaría huérfano en el layer:
     flotando sobre una app que ya no lo espera y sin nadie que lo cierre. */
  return () => {
    close();
    layer().removeEventListener('click', onLayerClick);
    document.removeEventListener('keydown', onEsc, true);
  };
}

/* ══ API para la vista ═══════════════════════════════════════════════════════ */

export const QuickAdd = {
  get editing() { return S.editing; },

  /** Entra en modo edición con un movimiento ya cargado. */
  edit(move) {
    S.editing = move;
    S.type = move.type;
    S.amount = String(move.amount).replace('.', ',');
    S.category = move.category;
    S.note = move.note || '';
    S.date = move.date;
  },

  /** Vuelve a modo carga. `keepDate` deja la fecha puesta: cargando el gasto
      de un día viejo, lo normal es que el siguiente sea del mismo día. */
  reset({ keepDate = false } = {}) {
    S.editing = null;
    S.amount = '';
    S.note = '';
    if (!keepDate) S.date = todayStr();
  },

  focusAmount(root = document) {
    const el = root.querySelector('#qa-amount');
    if (!el) return;
    el.focus();
    el.select();
  },
};
