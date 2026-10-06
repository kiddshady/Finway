/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY · TERMINAL — arranque
   El motor (router, overlays, movimiento) es el de Onyx; la cara es Terminal.
   Acá adentro está lo que une las dos: qué pantallas hay y en qué tecla, qué
   dice el chrome (migas, cinta, estado), el teclado global y el booteo.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from './icons.js';
import { Menu, Modal, Tooltip } from './overlays.js';
import Router from './router.js';
import { frase, initClickFlash, initScrollFades, numero, raf2 } from './motion.js';
import { colorToken, paint } from './ui.js';
import { relTime } from './format.js';
import { catLabel } from './fin/categories.js';
import { currentMonth, monthLabel, shiftMonth } from './fin/format.js';
import { markSVG } from './fin/mark.js';
import { byCategory, monthTotals, movesOf } from './fin/stats.js';
import { loadAll, refresh, S, setOnChrome, setOnSaved } from './fin/state.js';
import { cifra, variacion } from './fin/term.js';
import { viewResumen } from './fin/resumen.js';
import { viewMovimientos } from './fin/movimientos.js';
import { viewAjustes } from './fin/ajustes.js';
import { cargarCalculadora, viewCalculadora } from './fin/calculadora.js';
import { cargarPresupuestos, viewPresupuestos } from './fin/presupuestos.js';
import { cargarMetas, viewMetas } from './fin/metas.js';
import { abrirFormulario } from './fin/formulario.js';
import { cablearLinea } from './fin/carga.js';
import { cargarPantalla } from './fin/pantalla.js';
import { cuerpos as cuerposPixel } from './fin/pixeles.js';
import { initUpdates } from './update.js';

const shell = window.onyx;

/* ══ Íconos ══════════════════════════════════════════════════════════════════
   Los de píxel (fin/pixeles.js) reemplazan a los del set base con el mismo
   nombre, y suman el `prompt` de la línea de carga. Con Icons.add(), no
   editando icons.js: así una versión nueva del set base se copia encima sin
   pisar los de acá. */
Icons.add(cuerposPixel(), { reemplaza: true });

/* ══ Las seis pantallas, una por tecla ═══════════════════════════════════════ */

const PANTALLAS = ['resumen', 'movimientos', 'presupuestos', 'metas', 'calculadora', 'ajustes'];
/* Las que hablan de un mes: en ellas ←/→ lo cambian y las migas lo muestran. */
const CON_MES = new Set(['resumen', 'movimientos', 'presupuestos']);

Router.define({
  resumen: { view: viewResumen },
  movimientos: { view: viewMovimientos },
  presupuestos: { view: viewPresupuestos },
  metas: { view: viewMetas },
  calculadora: { view: viewCalculadora },
  ajustes: { view: viewAjustes },
}, document.getElementById('view'));

/* ══ El chrome ═══════════════════════════════════════════════════════════════
   Todo lo que vive fuera de la vista y cambia con la app andando: las cifras
   destellan en su lugar y las frases hacen relevo (numero y frase). */

function updateChrome() {
  const nombre = Router.name || 'resumen';
  const conMes = CON_MES.has(nombre);
  frase(document.getElementById('crumb-view'), nombre.toUpperCase());
  document.getElementById('crumb').classList.toggle('is-sin-mes', !conMes);
  frase(document.getElementById('crumb-mes'), monthLabel(S.month));
  document.querySelectorAll('.fw-fk__b').forEach((b) => b.classList.toggle('is-active', b.dataset.view === nombre));

  const t = monthTotals(S.moves, S.month);
  numero(document.getElementById('fk-count'), t.count || '');
  frase(document.getElementById('st-saldo'), `BAL ${cifra(t.balance)}`);
  frase(document.getElementById('st-saved-v'), S.lastSaved ? `GUARDADO ${relTime(S.lastSaved).toUpperCase()}` : `${S.moves.length} MOV GUARDADOS`);
  pintarCinta();
}

/* La cinta: las cifras del mes con su variación contra el anterior. Se
   reescribe solo si cambió lo que dice (un relevo: se apaga, cambia, vuelve);
   escribirla igual reiniciaría el desplazamiento. */
let cintaDice = '';
function pintarCinta() {
  const ym = S.month;
  const ant = shiftMonth(ym, -1);
  const t = monthTotals(S.moves, ym);
  const p = monthTotals(S.moves, ant);
  const hayAnt = movesOf(S.moves, ant).length > 0;
  const prevCat = new Map(byCategory(S.moves, ant).map((c) => [c.cat, c.total]));
  const d = (a, b, o) => (hayAnt ? variacion(a, b, o) : '');
  const items = [
    ['BAL', cifra(t.balance), d(t.balance, p.balance, { subeBien: true })],
    ['ING', cifra(t.income), d(t.income, p.income, { subeBien: true })],
    ['GAS', cifra(t.expense), d(t.expense, p.expense)],
    ['DRENAJE/DÍA', cifra(Math.round(t.rate)), d(t.rate, p.rate)],
    ...byCategory(S.moves, ym).slice(0, 6).map((c) => [catLabel(c.cat).toUpperCase(), cifra(c.total), d(c.total, prevCat.get(c.cat) || 0)]),
    ['MOV', String(t.count), ''],
  ];
  const html = items.map(([k, v, dd]) =>
    `<span class="fw-tape__item"><span class="fw-tape__k">${k}</span><span class="fw-tape__v">${v}</span>${dd}</span>`).join('');
  if (html === cintaDice) return;
  const primera = !cintaDice;
  cintaDice = html;
  const pista = document.getElementById('tape');
  // Más contenido, más tiempo: la velocidad queda pareja (~60 px/s).
  const poner = () => {
    pista.innerHTML = html + html;
    pista.style.setProperty('--fw-tape-dur', `${Math.max(30, pista.scrollWidth / 2 / 60)}s`);
  };
  if (primera) { poner(); return; }
  pista.classList.add('is-out');
  setTimeout(() => { poner(); raf2(() => pista.classList.remove('is-out')); }, 170);
}

/** El reloj de la titlebar: la terminal sabe qué hora es. */
function reloj() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  document.getElementById('clock').innerHTML = `${p(d.getHours())}:${p(d.getMinutes())}<span>:${p(d.getSeconds())}</span>`;
}

/** Cuando algo se guarda, la marca late y el punto de GUARDADO destella: el
    movimiento ES el acuse de recibo. */
function pulseMark() {
  const mark = document.querySelector('#brand-mark .fw-mark');
  const dot = document.getElementById('st-dot');
  for (const el of [mark, dot]) {
    if (!el) continue;
    el.classList.remove('is-active', 'is-pulse');
    void el.getBoundingClientRect();
    el.classList.add(el === dot ? 'is-pulse' : 'is-active');
  }
  setTimeout(() => mark?.classList.remove('is-active'), 1400);
}

/* ══ Cambiar de mes ══════════════════════════════════════════════════════════ */

function irAMes(ym) {
  if (!ym || ym === S.month) return;
  S.month = ym;
  updateChrome();
  Router.refresh();
}

/* ══ El teclado global ═══════════════════════════════════════════════════════
   F1–F6 cambian de pantalla siempre, aunque el foco esté en un campo. El resto
   solo cuando no se está escribiendo, no hay un modal abierto ni un menú. */

function wireTeclado(linea) {
  document.addEventListener('keydown', (e) => {
    const fk = /^F([1-6])$/.exec(e.key);
    if (fk && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (Modal.isOpen) return;
      Menu.close();
      document.activeElement?.blur?.();
      Router.go(PANTALLAS[Number(fk[1]) - 1]);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      if (!Modal.isOpen) abrirFormulario();
      return;
    }
    if (Modal.isOpen || e.ctrlKey || e.altKey || e.metaKey) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
    if (document.querySelector('.ox-menu')) return;
    if (e.key === '/') { e.preventDefault(); linea.enfocar(); return; }
    if (!CON_MES.has(Router.name)) return;
    if (e.key === 'ArrowLeft' || e.key === '<') { e.preventDefault(); irAMes(shiftMonth(S.month, -1)); }
    else if (e.key === 'ArrowRight' || e.key === '>') { e.preventDefault(); irAMes(shiftMonth(S.month, 1)); }
    else if (e.key === 'Home') { e.preventDefault(); irAMes(currentMonth()); }
  });
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

  document.querySelectorAll('.fw-fk__b').forEach((b) =>
    b.addEventListener('click', () => Router.go(b.dataset.view)));
  // Las flechas de la barra de estado también cambian el mes, con el mouse.
  const flechas = document.querySelectorAll('#st-mes .fw-key');
  flechas[0].addEventListener('click', () => CON_MES.has(Router.name) && irAMes(shiftMonth(S.month, -1)));
  flechas[1].addEventListener('click', () => CON_MES.has(Router.name) && irAMes(shiftMonth(S.month, 1)));

  /* Al recuperar el foco, releer del disco: una ventana que durmió en el tray
     se pone al día sola. Solo si algo cambió. */
  window.addEventListener('focus', async () => {
    if (!await refresh()) return;
    Router.refresh();
    updateChrome();
  });

  setInterval(reloj, 1000);
  // El "hace un rato" del estado tiene que envejecer solo.
  setInterval(() => {
    if (S.lastSaved) frase(document.getElementById('st-saved-v'), `GUARDADO ${relTime(S.lastSaved).toUpperCase()}`);
  }, 30_000);
}

/* ══ Color de la ventana ═════════════════════════════════════════════════════
   --ox-bg está en oklch y Electron solo entiende hex. Se resuelve con un
   canvas (colorToken) y se le manda al main: el frame fantasma que pinta
   Windows al restaurar queda del mismo negro. */
function syncWindowColor() {
  const hex = colorToken('--ox-bg');
  if (hex) shell.win.setBackground(hex);
}

/* ══ Arranque ════════════════════════════════════════════════════════════════ */

async function boot() {
  document.getElementById('brand-mark').innerHTML = markSVG({ size: 16 });
  Icons.mount(document);
  Tooltip.init();
  initClickFlash();
  initScrollFades();
  reloj();
  wireShell();
  syncWindowColor();
  setOnSaved(pulseMark);
  setOnChrome(updateChrome);
  initUpdates();
  const linea = cablearLinea();
  wireTeclado(linea);

  try {
    await Promise.all([loadAll(), cargarCalculadora(), cargarPresupuestos(), cargarMetas(), cargarPantalla()]);
  } catch (err) {
    // Si los datos no cargan, la app tiene que DECIRLO.
    paint(`<div class="fw-screen"><div class="fw-empty" style="grid-column:1/-1"><div><b>NO SE PUDO INICIAR</b><p>${err.message}</p></div></div></div>`);
    console.error(err);
    return;
  }

  Router.onChange(updateChrome);
  Router.onChange(() => Menu.close());
  Router.go('resumen');
  updateChrome();

  // El splash se va recién cuando ya hay algo pintado debajo.
  raf2(() => {
    const splash = document.getElementById('boot-splash');
    if (!splash) return;
    splash.style.opacity = '0';
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    setTimeout(() => splash.remove(), 600);
  });
}

boot();
