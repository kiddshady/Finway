/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY · TERMINAL — piezas compartidas
   Lo que usan las seis pantallas: el panel numerado, la tecla dibujada, la
   variación con su triángulo, el medidor de bloques, las cifras sin el signo
   pesos y los dos movimientos propios del diseño: el número que RUEDA hasta
   su valor y el relevo de un bloque en su lugar.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from '../icons.js';
import { raf2 } from '../motion.js';
import { esc } from '../ui.js';

/* ── Cifras ────────────────────────────────────────────────────────────────
   En una terminal la cifra va pelada: el «$» ocupa una columna y no dice
   nada que la columna no diga. Solo lleva decimales si los tiene. */
const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const MENOS = '−';

export function cifra(n, { signo = false } = {}) {
  const a = Math.abs(n);
  const s = Math.round(a * 100) % 100 ? nf2.format(Math.round(a * 100) / 100) : nf0.format(Math.round(a));
  return (n < 0 ? MENOS : signo && n > 0 ? '+' : '') + s;
}
/** Para ejes y etiquetas chicas: «1,66 M», «832 k». */
export function corta(n) {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `${nf2.format(a / 1e6).replace(/,?0+$/, '')} M` : a >= 1e3 ? `${nf0.format(a / 1e3)} k` : nf0.format(a);
  return (n < 0 ? MENOS : '') + s;
}
export const pct = (x) => `${nf0.format(Math.round(x * 100))}%`;
export const entero = (n) => nf0.format(Math.round(n));

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
/** «2026-09» → «SEP 26» */
export const mesCorto = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
/** «2026-09» → «SEP» */
export const mesSigla = (ym) => MESES[Number(ym.slice(5, 7)) - 1];

/* ── La tecla ──────────────────────────────────────────────────────────────
   `tecla('E')`, `tecla('<chevronLeft>')` para un ícono adentro. */
export function tecla(t) {
  const m = /^<(\w+)>$/.exec(t);
  return `<span class="fw-key">${m ? Icons.svg(m[1]) : esc(t)}</span>`;
}

/** Un botón con su atajo: `[E] EDITAR`. */
export function boton({ tecla: t = '', label, cls = '', attrs = '' }) {
  return `<button class="fw-btn${t ? '' : ' fw-btn--sin-tecla'}${cls ? ` ${cls}` : ''}" ${attrs}>${t ? tecla(t) : ''}${label}</button>`;
}

/* ── El panel ──────────────────────────────────────────────────────────── */
export function panel({ n, t, m = '', head = '', body, cls = '', attrs = '' }) {
  return `
    <section class="fw-p${cls ? ` ${cls}` : ''}" ${attrs}>
      <div class="fw-p__h"><span class="fw-p__n">${n}</span><span class="fw-p__t">${t}</span><span class="fw-p__m">${m}</span>${head}</div>
      <div class="fw-p__b">${body}</div>
    </section>`;
}

/* ── La variación ──────────────────────────────────────────────────────────
   Contra el mes anterior. Para un gasto subir es malo (rojo) y bajar es
   bueno (verde); para un ingreso o un balance, al revés (`subeBien`). */
const TRI_ARRIBA = '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M4 1.2 7.2 6.8H.8z" fill="currentColor"/></svg>';
const TRI_ABAJO = '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M4 6.8 .8 1.2h6.4z" fill="currentColor"/></svg>';

export function variacion(actual, antes, { subeBien = false } = {}) {
  if (!antes) return '<span class="fw-d fw-d--eq">—</span>';
  const d = (actual - antes) / Math.abs(antes);
  if (Math.abs(d) < 0.005) return '<span class="fw-d fw-d--eq">=</span>';
  const sube = d > 0;
  const cls = sube ? (subeBien ? 'fw-d--good' : 'fw-d--up') : (subeBien ? 'fw-d--bad' : 'fw-d--dn');
  const p = Math.round(Math.abs(d) * 1000) / 10;
  return `<span class="fw-d ${cls}">${sube ? TRI_ARRIBA : TRI_ABAJO}${String(p).replace('.', ',')}%</span>`;
}

/* ── El medidor de bloques ─────────────────────────────────────────────────
   Nace vacío y se llena en el cuadro siguiente (llenarMedidores): así el
   relleno viaja con su transición en vez de aparecer lleno. */
export function medidor({ p = 0, q = 0, r = null, cls = '', big = false } = {}) {
  return `<div class="fw-meter${big ? ' fw-meter--big' : ''}${cls ? ` ${cls}` : ''}" style="--p:0;--q:0;${r != null ? `--r:${r}` : ''}" data-p="${p}" data-q="${q}">
    <i class="fw-meter__bg"></i><i class="fw-meter__proj"></i><i class="fw-meter__fill"></i>${r != null ? '<i class="fw-meter__now"></i>' : ''}</div>`;
}
export function llenarMedidores(root) {
  raf2(() => root.querySelectorAll('.fw-meter[data-p]').forEach((m) => {
    m.style.setProperty('--p', m.dataset.p);
    m.style.setProperty('--q', m.dataset.q);
  }));
}
/** Pone un medidor que ya está en pantalla en su valor nuevo: viaja desde donde estaba. */
export function medir(m, { p, q = 0, r = null, cls = '' }) {
  m.dataset.p = p; m.dataset.q = q;
  m.style.setProperty('--p', p);
  m.style.setProperty('--q', q);
  if (r != null) m.style.setProperty('--r', r);
  m.classList.toggle('is-over', cls === 'is-over');
  m.classList.toggle('is-ok', cls === 'is-ok');
}

/* ── El número que rueda ───────────────────────────────────────────────────
   Corre desde lo que mostraba hasta el valor nuevo (cúbica de salida). La
   primera vez arranca de 0: la cifra se «cuenta» al entrar.
   Con `clave`, recuerda el último valor aunque el nodo sea otro: cambiar de
   mes repinta la vista entera (un fundido), y sin esto cada cifra volvería a
   contar desde cero en vez de correr del mes viejo al nuevo. */
const ease = (t) => 1 - (1 - t) ** 3;
const memoria = new Map();
export function rodar(el, a, fmt = cifra, ms = 700, clave = null) {
  if (!el) return;
  const de = clave != null && memoria.has(clave) ? memoria.get(clave) : Number(el.dataset.v) || 0;
  if (clave != null) memoria.set(clave, a);
  el.dataset.v = a;
  cancelAnimationFrame(el._raf);
  if (de === a || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(a); return; }
  const t0 = performance.now();
  const paso = (ahora) => {
    const t = Math.min(1, (ahora - t0) / ms);
    el.textContent = fmt(de + (a - de) * ease(t));
    if (t < 1) el._raf = requestAnimationFrame(paso);
    else el.textContent = fmt(a);
  };
  el._raf = requestAnimationFrame(paso);
}

/* ── El relevo de un bloque en su lugar ────────────────────────────────────
   Lo viejo se desvanece (160 ms, in-out), se escribe lo nuevo con la caja ya
   apagada, y se vuelve a prender. Para lo que cambia entero (la tabla de un
   mes, la lectura de presupuestos). `primero` pinta directo: al montar no
   hay nada que relevar. */
export function relevo(el, poner, primero = false) {
  if (!el) return;
  el.classList.add('fw-swapzone');
  if (primero || !el.childNodes.length) { poner(); return; }
  clearTimeout(el._relevo);
  el.classList.add('is-out');
  el._relevo = setTimeout(() => {
    poner();
    Icons.mount(el);
    raf2(() => el.classList.remove('is-out'));
  }, 170);
}
