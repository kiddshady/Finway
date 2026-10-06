/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY · TERMINAL — el intérprete de la línea de carga
   `gasto 4500 transporte uber`, `ingreso 40000 regalo cumple ayer`,
   `+15000 freelance cliente 12/9`. Las palabras van en cualquier orden y se
   entienden por lo que son:

     tipo       gasto · g · ingreso · i · ing (sin tipo: gasto; un «+» delante
                del monto, o una categoría que solo existe en ingresos, lo
                vuelven ingreso)
     monto      4500 · 4.500 · 4500,50 · $4500 · 4,5k · 12k
     categoría  su nombre o el principio del nombre, desde 3 letras, sin
                importar acentos ni mayúsculas (transp, educ, subs)
     fecha      hoy · ayer · anteayer · 12/9 · 12/9/26 · 12/09/2026
     nota       todo lo demás, en el orden en que se escribió

   Puro: nada de DOM, así se prueba con node pelado (test/linea.test.mjs).
   ═══════════════════════════════════════════════════════════════════════════ */

import { EXPENSE_CATS, INCOME_CATS } from './categories.js';
import { parseAmount, todayStr } from './format.js';

const TIPOS = new Map([
  ['gasto', 'expense'], ['g', 'expense'], ['gas', 'expense'], ['gaste', 'expense'],
  ['ingreso', 'income'], ['i', 'income'], ['ing', 'income'], ['ingrese', 'income'], ['entro', 'income'],
]);

export const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const pad2 = (n) => String(n).padStart(2, '0');

/** «ayer», «12/9», «12/9/26» → 'YYYY-MM-DD', o null si no es una fecha. */
export function leerFecha(tok, hoy = todayStr()) {
  const t = normal(tok);
  const base = new Date(`${hoy}T12:00`);
  const corrido = (dias) => { const d = new Date(base); d.setDate(d.getDate() - dias); return d; };
  const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  if (t === 'hoy') return hoy;
  if (t === 'ayer') return iso(corrido(1));
  if (t === 'anteayer') return iso(corrido(2));
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(t);
  if (!m) return null;
  const dia = Number(m[1]); const mes = Number(m[2]);
  let anio = m[3] ? Number(m[3]) : base.getFullYear();
  if (anio < 100) anio += 2000;
  const d = new Date(anio, mes - 1, dia, 12);
  if (d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;   // 31/2 no existe
  return iso(d);
}

/** «4500», «4.500», «4,5k», «$12k» → número, o null si no es un monto. */
export function leerMonto(tok) {
  let t = String(tok).trim().replace(/^\$/, '');
  if (!/^[+-]?\$?\d[\d.,]*k?$/i.test(t)) return null;
  t = t.replace(/^[+-]/, '').replace(/^\$/, '');
  const mil = /k$/i.test(t);
  if (mil) t = t.slice(0, -1);
  const n = parseAmount(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((mil ? n * 1000 : n) * 100) / 100;
}

/** La categoría por su nombre o por el principio, primero entre las del tipo. */
function leerCategoria(tok, tipo) {
  const t = normal(tok);
  if (t.length < 3) return null;
  const busca = (lista) => lista.find((c) => normal(c.label) === t || normal(c.id) === t)
    || lista.find((c) => normal(c.label).startsWith(t) || normal(c.id).startsWith(t));
  if (tipo === 'income') return busca(INCOME_CATS) ? { id: busca(INCOME_CATS).id, tipo: 'income' } : null;
  if (tipo === 'expense') return busca(EXPENSE_CATS) ? { id: busca(EXPENSE_CATS).id, tipo: 'expense' } : null;
  const g = busca(EXPENSE_CATS);
  if (g) return { id: g.id, tipo: 'expense' };
  const i = busca(INCOME_CATS);
  return i ? { id: i.id, tipo: 'income' } : null;
}

/**
 * Lo que dice una línea. Devuelve
 *   { tipo, tipoDicho, monto, categoria, fecha, nota, falta: [...], move | null }
 * `move` está listo para guardar cuando no falta nada.
 */
export function entender(texto, hoy = todayStr()) {
  const toks = String(texto ?? '').trim().split(/\s+/).filter(Boolean);
  let tipo = null; let monto = null; let categoria = null; let fecha = null; let signoMas = false;
  const nota = [];
  const sueltas = [];

  // Primero lo que no depende del tipo: el tipo mismo, el monto y la fecha.
  for (const tok of toks) {
    const t = normal(tok);
    if (!tipo && TIPOS.has(t)) { tipo = TIPOS.get(t); continue; }
    if (monto == null) {
      const m = leerMonto(tok);
      if (m != null) { monto = m; signoMas = tok.trim().startsWith('+'); continue; }
    }
    if (!fecha) {
      const f = leerFecha(tok, hoy);
      if (f) { fecha = f; continue; }
    }
    sueltas.push(tok);
  }
  if (!tipo && signoMas) tipo = 'income';

  // Después la categoría, ya sabiendo el tipo (si se dijo).
  for (const tok of sueltas) {
    if (!categoria) {
      const c = leerCategoria(tok, tipo);
      if (c) { categoria = c.id; if (!tipo) tipo = c.tipo; continue; }
    }
    nota.push(tok);
  }

  const tipoDicho = !!tipo;
  tipo = tipo || 'expense';
  const falta = [];
  if (monto == null) falta.push('monto');
  if (!categoria) falta.push('categoría');
  const r = { tipo, tipoDicho, monto, categoria, fecha: fecha || hoy, fechaDicha: !!fecha, nota: nota.join(' '), falta };
  r.move = falta.length ? null : { type: tipo, amount: monto, category: categoria, note: r.nota, date: r.fecha };
  return r;
}
