/** Formato y fechas — todo es-AR, todo local (nada de UTC traicionero). */

const nfFull = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const nfCompact = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });

export function fmtARS(n) {
  const sign = n < 0 ? '−' : '';
  return `${sign}$ ${nfFull.format(Math.abs(n))}`;
}

/** Para ejes de gráficos: "$350 k", "$1,2 M". */
export function fmtCompact(n) {
  const sign = n < 0 ? '−' : '';
  return `${sign}$ ${nfCompact.format(Math.abs(n))}`;
}

/**
 * Parsea lo que tipee el usuario: "1.234,56" · "1234.56" · "1500" · "$ 2.000".
 * Si hay punto y coma, el último de los dos es el separador decimal.
 * Punto solo: decimal únicamente si parece centavos ("1500.50"), si no, miles.
 */
export function parseAmount(str) {
  let s = String(str ?? '').trim().replace(/[$\s]/g, '');
  if (!s) return NaN;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    const dec = Math.max(lastDot, lastComma) === lastDot ? '.' : ',';
    const mil = dec === '.' ? ',' : '.';
    s = s.split(mil).join('').replace(dec, '.');
  } else if (lastComma !== -1) {
    s = s.split(',').length > 2 ? s.split(',').join('') : s.replace(',', '.');
  } else if (lastDot !== -1) {
    const decimalish = /\.\d{1,2}$/.test(s) && s.split('.').length === 2;
    if (!decimalish) s = s.split('.').join('');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const pad2 = (n) => String(n).padStart(2, '0');

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "2026-06-12" → "2026-06" */
export const monthKey = (dateStr) => dateStr.slice(0, 7);

export const currentMonth = () => todayStr().slice(0, 7);

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const MESES_CORTO = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
  'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}

export function monthShort(ym) {
  const [, m] = ym.split('-').map(Number);
  return MESES_CORTO[m - 1];
}

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** "2026-06-12" → "12 JUN" */
export function dayLabel(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${pad2(d)} ${MESES_CORTO[m - 1]}`;
}

/**
 * "2026-09" → "Septiembre 2026", para el título de una vista.
 * monthLabel() sigue siendo el de versalitas, que es el que usan los gráficos:
 * en un encabezado de Onyx las mayúsculas sostenidas gritan.
 */
export function monthTitle(ym) {
  const [y, m] = ym.split('-').map(Number);
  const nombre = MESES[m - 1];
  return `${nombre[0]}${nombre.slice(1).toLowerCase()} ${y}`;
}
