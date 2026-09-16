/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — arranque
   El shell (titlebar, rail, statusbar, overlays, router) es Onyx tal cual; lo
   de esta app vive en js/fin/. Acá adentro está solo lo que une las dos
   mitades: qué vistas hay, qué dice el chrome, y el orden del booteo.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from './icons.js';
import { Menu, Tooltip } from './overlays.js';
import Router from './router.js';
import { initClickFlash, initScrollFades, raf2 } from './motion.js';
import { colorToken, empty, paint } from './ui.js';
import { relTime } from './format.js';
import { fmtARS, monthTitle } from './fin/format.js';
import { markSVG } from './fin/mark.js';
import { monthTotals } from './fin/stats.js';
import { loadAll, refresh, S, setOnChrome, setOnSaved } from './fin/state.js';
import { focusCarga, viewMovimientos, viewResumen } from './fin/views.js';
import { viewAjustes } from './fin/ajustes.js';
import { cargarCalculadora, viewCalculadora } from './fin/calculadora.js';

/* El shell es del framework: `window.onyx` significa lo mismo en todas las
   apps de Onyx. El dominio de esta vive en `window.fw` y lo usan los módulos
   de fin/, no este archivo. */
const shell = window.onyx;

/* ══ Íconos del dominio ══════════════════════════════════════════════════════
   Con Icons.add(), no editando icons.js: así una versión nueva del set base de
   Onyx se copia encima sin pisar los de acá. Misma receta que el resto —
   viewBox de 16, contenido entre 1.8 y 14.2, sin fill. */

Icons.add({
  chart: '<path d="M2.4 13.6h11.2"/><path d="M5 13.6V8.2"/><path d="M8 13.6V3.8"/><path d="M11 13.6V10"/>',
  scale: '<path d="M8 3.2v10.4"/><path d="M3.6 5.4h8.8"/><path d="M3.6 5.4 2 9.4h3.2z"/>'
       + '<path d="M12.4 5.4 10.8 9.4H14z"/><path d="M5.8 13.6h4.4"/>',
  calc: '<rect x="3.2" y="1.8" width="9.6" height="12.4" rx="1.8"/><path d="M5.6 4.8h4.8"/>'
      + '<path d="M5.6 8.2h.4M7.8 8.2h.4M10 8.2h.4M5.6 11.2h.4M7.8 11.2h.4M10 11.2h.4"/>',
});

/* ══ Router ══════════════════════════════════════════════════════════════════ */

Router.define({
  resumen: { view: viewResumen },
  movimientos: { view: viewMovimientos },
  calculadora: { view: viewCalculadora },
  ajustes: { view: viewAjustes },
}, document.getElementById('view'));

/* ══ El chrome: todo lo que vive fuera de la vista ═══════════════════════════ */

function updateChrome() {
  const t = monthTotals(S.moves, S.month);

  document.querySelector('[data-view="movimientos"] .ox-navitem__count').textContent = t.count;
  document.getElementById('stat-count').textContent = t.count;

  const balance = document.getElementById('stat-balance');
  balance.textContent = fmtARS(t.balance);
  balance.style.color = t.count === 0 ? '' : `var(--fw-${t.balance < 0 ? 'out' : 'bal'})`;

  const saved = document.querySelector('#stat-saved .ox-statusbar__value');
  if (saved) saved.textContent = S.lastSaved ? relTime(S.lastSaved) : '—';

  /* El mes en la titlebar: las dos vistas hablan del mismo mes, y tenerlo
     arriba evita la pregunta «¿esto de cuándo es?» al volver de otra ventana. */
  document.getElementById('titlebar-context').innerHTML =
    `${Icons.svg('calendar', 'ox-icon--sm')}<span>${monthTitle(S.month)}</span>`;
}

/** La marca late cuando algo se guardó: el movimiento ES el acuse de recibo,
    y no ocupa lugar en pantalla como lo ocuparía un cartel. */
function pulseMark() {
  const mark = document.querySelector('#brand-mark .fw-mark');
  if (!mark) return;
  mark.classList.remove('is-active');
  void mark.offsetWidth;
  mark.classList.add('is-active');
  setTimeout(() => mark.classList.remove('is-active'), 1400);
}

function wireShell() {
  const w = shell.win;
  document.getElementById('win-min').addEventListener('click', () => w.minimize());
  document.getElementById('win-close').addEventListener('click', () => w.close());
  const maxBtn = document.getElementById('win-max');
  maxBtn.addEventListener('click', () => w.toggleMaximize());
  w.onMaximized((isMax) => {
    maxBtn.innerHTML = Icons.svg(isMax ? 'winRestore' : 'winMax');
    maxBtn.setAttribute('aria-label', isMax ? 'Restaurar' : 'Maximizar');
  });

  document.querySelectorAll('.ox-navitem').forEach((b) =>
    b.addEventListener('click', () => Router.go(b.dataset.view)));

  document.getElementById('btn-new').addEventListener('click', focusCarga);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); focusCarga(); }
  });

  /* Al recuperar el foco, releer del disco: una ventana que durmió en el tray
     se pone al día sola en vez de mostrar su foto vieja de los datos. */
  window.addEventListener('focus', async () => {
    await refresh();
    Router.refresh();
    updateChrome();
  });

  // El "hace un rato" de la statusbar tiene que envejecer solo.
  setInterval(() => {
    const saved = document.querySelector('#stat-saved .ox-statusbar__value');
    if (saved && S.lastSaved) saved.textContent = relTime(S.lastSaved);
  }, 30_000);
}

/* ══ Color de la ventana ═════════════════════════════════════════════════════
   --ox-bg está en oklch y Electron solo entiende hex. Se resuelve acá y se lo
   mandamos al main, así el frame fantasma que pinta el compositor de Windows
   al restaurar sigue camuflado aunque cambie el matiz en tokens.css.

   La traducción la hace colorToken() con un canvas, NO un regex: desde
   Chromium 144 el computado de una var en oklch vuelve sin convertir, y
   parseando el texto la app le manda verde a su propia ventana. */
function syncWindowColor() {
  const hex = colorToken('--ox-bg');
  if (hex) shell.win.setBackground(hex);
}

/* ══ Arranque ════════════════════════════════════════════════════════════════ */

async function boot() {
  document.getElementById('brand-mark').innerHTML = markSVG({ size: 17 });
  Icons.mount(document);
  Tooltip.init();
  initClickFlash();
  initScrollFades();
  wireShell();
  syncWindowColor();
  setOnSaved(pulseMark);
  setOnChrome(updateChrome);

  try {
    await Promise.all([loadAll(), cargarCalculadora()]);
  } catch (err) {
    // Si los datos no cargan, la app tiene que DECIRLO. Una pantalla vacía sin
    // explicación es peor que un error feo.
    paint(empty({ icon: 'alert', title: 'No se pudo iniciar', text: err.message }));
    console.error(err);
    return;
  }

  document.getElementById('brand-version').textContent = `v${S.info.version}`;
  document.getElementById('rail-foot').innerHTML =
    `<div class="ox-meta">${S.moves.length} movimientos guardados</div>`;

  updateChrome();
  Router.onChange(updateChrome);
  /* Un menú abierto no sobrevive a un cambio de vista: con el mouse se cierra
     solo, pero navegando por teclado quedaba flotando sobre una vista que ya
     no es la suya. */
  Router.onChange(() => Menu.close());
  Router.go('resumen');

  // El splash se va recién cuando ya hay algo pintado debajo. El doble rAF
  // garantiza que el navegador aplicó los estilos de la vista antes del fade.
  raf2(() => {
    const splash = document.getElementById('boot-splash');
    if (!splash) return;
    splash.style.opacity = '0';
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    setTimeout(() => splash.remove(), 600);
  });
}

boot();
