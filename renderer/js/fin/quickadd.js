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
import { bindSwitcher, exit, frase, swap } from '../motion.js';
import { esc } from '../ui.js';
import { catColor, catsFor } from './categories.js';
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

/** La cápsula del tipo y el cierre del calendario: los deja el cableado y los
    usa syncQuickAdd() para poner el formulario al día en el lugar. */
let syncTipo = null;
let cerrarCalendario = null;

/* ══ Markup ══════════════════════════════════════════════════════════════════ */

const catsHTML = () => catsFor(S.type).map((c) => `
  <button class="fw-cat-btn${c.id === S.category ? ' is-on' : ''}" data-cat="${esc(c.id)}" style="--fw-cat:${catColor(c.id)}">
    <span class="fw-dot"></span>${esc(c.label)}
  </button>`).join('');

const fechaTexto = () => S.date.split('-').reverse().join('/');
const submitHTML = () => (S.editing ? `${Icons.svg('check', 'ox-icon--sm')} Guardar` : 'Registrar');
const modo = () => (S.editing ? 'editar' : 'cargar');

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

      <div class="fw-cats" id="qa-cats" data-tipo="${S.type}">${catsHTML()}</div>

      <div class="fw-qa__row">
        <input class="ox-input" id="qa-note" value="${esc(S.note)}"
               placeholder="nota (opcional)" spellcheck="false" aria-label="Nota">
        ${datePickerHTML()}
      </div>

      <!-- El atajo se anuncia en el tooltip y no adentro del botón: la tecla
           metida ahí lo desbalanceaba (el texto se iba a la izquierda) y sobre
           el primario, que es claro, se leía como un botón dentro del botón. -->
      <button class="ox-btn ox-btn--primary ox-flashable" id="qa-submit" style="width:100%" data-modo="${modo()}"
              data-tip="${S.editing ? 'Guardar los cambios' : 'Registrar el movimiento'}" data-tip-key="Enter">${submitHTML()}</button>
    </div>`;
}

function datePickerHTML() {
  return `
    <div class="fw-dp" id="qa-dp">
      <button class="fw-dp__field" id="qa-dp-field" data-tip="Elegir fecha">
        <span id="qa-dp-value">${fechaTexto()}</span>
        ${Icons.svg('calendar', 'ox-icon--sm')}
      </button>
    </div>`;
}

const mesHTML = (viewYM) => {
  const [y, m] = viewYM.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
};

/** La grilla es fija de 6×7, lunes primero, con las colas de los meses vecinos:
    un calendario que cambia de alto según el mes hace saltar todo lo de abajo. */
function diasHTML(viewYM, selected) {
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
  return cells;
}

function calendarHTML(viewYM, selected) {
  const today = todayStr();
  return `
    <div class="fw-dp__pop" id="qa-dp-pop">
      <div class="fw-dp__head">
        <span class="fw-dp__month">${mesHTML(viewYM)}</span>
        <button class="ox-iconbtn ox-iconbtn--sm" data-shift="-1" data-tip="Mes anterior"><i data-icon="chevronLeft"></i></button>
        <button class="ox-iconbtn ox-iconbtn--sm" data-shift="1" data-tip="Mes siguiente"><i data-icon="chevronRight"></i></button>
      </div>
      <div class="fw-dp__dow">${DOW.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="fw-dp__grid">${diasHTML(viewYM, selected)}</div>
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

  /* Segmentado de tipo. Cambia las categorías porque el catálogo cambia. Con
     bindSwitcher, como todo segmentado de Onyx: antes no lo tenía, y sin él la
     cápsula quedaba en ancho 0 y el tipo elegido solo se distinguía por el
     color del texto. */
  syncTipo = bindSwitcher(qa.querySelector('#qa-type'), (value) => {
    if (S.type === value) return;
    S.type = value;
    const cats = catsFor(S.type);
    if (!cats.some((c) => c.id === S.category)) S.category = cats[0].id;
    onTypeChange();
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

  /* Cambiar de mes con el calendario abierto: el nombre hace relevo y los días
     un fundido, en el lugar. Antes se rehacía el popover entero con innerHTML
     y los 42 días cambiaban de golpe. */
  const mover = () => {
    swap(pop.querySelector('.fw-dp__month'), mesHTML(viewYM), { relevo: true });
    swap(pop.querySelector('.fw-dp__grid'), diasHTML(viewYM, S.date), { fundido: true });
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
    if (shift) { viewYM = shiftMonth(viewYM, Number(shift.dataset.shift)); mover(); return; }
    const day = e.target.closest('[data-date]');
    if (day) {
      S.date = day.dataset.date;
      frase(qa.querySelector('#qa-dp-value'), fechaTexto());
      close();
    }
  };
  /* En la ventana y en captura, antes que nadie: el formulario puede vivir
     adentro de un modal, y el modal también escucha Esc (en el documento).
     Con el calendario abierto, Esc cierra el calendario y nada más. */
  const onEsc = (e) => {
    if (e.key === 'Escape' && pop) { e.stopImmediatePropagation(); e.preventDefault(); close(); }
  };
  layer().addEventListener('click', onLayerClick);
  window.addEventListener('keydown', onEsc, true);
  cerrarCalendario = close;

  /* Si el inspector se repinta con el calendario abierto (cambio de tipo,
     entrar o salir de edición), el popover quedaría huérfano en el layer:
     flotando sobre una app que ya no lo espera y sin nadie que lo cierre. */
  return () => {
    close();
    layer().removeEventListener('click', onLayerClick);
    window.removeEventListener('keydown', onEsc, true);
  };
}

/* ══ Poner al día en el lugar ════════════════════════════════════════════════
   Cambiar de tipo, entrar o salir de edición: el formulario es el MISMO, solo
   cambia lo que dice. Antes se rehacía entero con innerHTML y todo cambiaba de
   golpe; y el banner de edición nacía ya abierto, así que su despliegue
   (0fr → 1fr) nunca corría. Lo que no cambió no se toca: un relevo de algo
   idéntico igual se apaga y se prende. */

export function syncQuickAdd(root) {
  const qa = root.querySelector('#qa');
  if (!qa) return;
  cerrarCalendario?.();   // un calendario abierto no sobrevive al cambio

  qa.querySelector('#qa-banner').classList.toggle('is-open', !!S.editing);

  qa.querySelectorAll('#qa-type .ox-segmented__opt').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.value === S.type));
  syncTipo?.();           // la cápsula viaja a su opción

  const field = qa.querySelector('#qa-amountfield');
  field.classList.toggle('fw-amountfield--expense', S.type === 'expense');
  field.classList.toggle('fw-amountfield--income', S.type === 'income');
  const amount = qa.querySelector('#qa-amount');
  if (amount.value !== S.amount) amount.value = S.amount;
  const note = qa.querySelector('#qa-note');
  if (note.value !== S.note) note.value = S.note;

  // Otro tipo es otro catálogo: relevo. El mismo, solo se mueve la elegida.
  const cats = qa.querySelector('#qa-cats');
  if (cats.dataset.tipo !== S.type) {
    cats.dataset.tipo = S.type;
    swap(cats, catsHTML(), { relevo: true });
  } else {
    cats.querySelectorAll(':scope > .fw-cat-btn').forEach((b) =>
      b.classList.toggle('is-on', b.dataset.cat === S.category));
  }

  frase(qa.querySelector('#qa-dp-value'), fechaTexto());

  const submit = qa.querySelector('#qa-submit');
  submit.dataset.tip = S.editing ? 'Guardar los cambios' : 'Registrar el movimiento';
  if (submit.dataset.modo !== modo()) {
    submit.dataset.modo = modo();
    swap(submit, submitHTML(), { relevo: true });
  }
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
