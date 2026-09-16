import { monthKey, shiftMonth, daysInMonth, currentMonth, todayStr } from './format.js';

/** Movimientos de un mes dado. */
export const movesOf = (moves, ym) => moves.filter((m) => monthKey(m.date) === ym);

/** Totales del mes: ingresos, gastos, balance, ritmo diario y proyección. */
export function monthTotals(moves, ym) {
  const ms = movesOf(moves, ym);
  let income = 0, expense = 0;
  for (const m of ms) (m.type === 'income' ? income += m.amount : expense += m.amount);

  const isCurrent = ym === currentMonth();
  const elapsed = isCurrent ? Number(todayStr().slice(8, 10)) : daysInMonth(ym);
  const rate = elapsed > 0 ? expense / elapsed : 0;
  const projection = isCurrent ? rate * daysInMonth(ym) : null;

  return { income, expense, balance: income - expense, rate, projection, count: ms.length };
}

/** Gasto por categoría, ordenado de mayor a menor. */
export function byCategory(moves, ym) {
  const acc = new Map();
  for (const m of movesOf(moves, ym)) {
    if (m.type !== 'expense') continue;
    acc.set(m.category, (acc.get(m.category) ?? 0) + m.amount);
  }
  return [...acc.entries()]
    .map(([cat, total]) => ({ cat, total }))
    .sort((a, b) => b.total - a.total);
}

/** Últimos n meses terminando en ym: [{ ym, income, expense }]. */
export function monthlyFlow(moves, ym, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = shiftMonth(ym, -i);
    const { income, expense } = monthTotals(moves, k);
    out.push({ ym: k, income, expense });
  }
  return out;
}

/** Gasto acumulado día a día del mes: array[daysInMonth] con el acumulado. */
export function cumulativeFlow(moves, ym) {
  const days = daysInMonth(ym);
  const perDay = new Array(days).fill(0);
  for (const m of movesOf(moves, ym)) {
    if (m.type !== 'expense') continue;
    perDay[Number(m.date.slice(8, 10)) - 1] += m.amount;
  }
  let acc = 0;
  return perDay.map((v) => (acc += v));
}
