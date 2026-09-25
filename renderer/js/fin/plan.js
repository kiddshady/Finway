/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — las cuentas de Presupuestos y Metas
   Solo números: nada de DOM, así se prueban con node pelado. Las vistas
   (presupuestos.js, metas.js) leen de acá y nada más.
   ═══════════════════════════════════════════════════════════════════════════ */

import { EXPENSE_CATS } from './categories.js';
import { daysInMonth, monthKey, shiftMonth, todayStr } from './format.js';
import { byCategory, movesOf } from './stats.js';

const centavos = (n) => Math.round(n * 100) / 100;

/* ══ Presupuestos ════════════════════════════════════════════════════════════
   Un tope mensual por categoría de gasto. El mismo tope vale para todos los
   meses: lo que se presupuesta es un hábito, no un mes en particular.

   La proyección es la del drenaje diario (lo gastado / los días que pasaron,
   por los días del mes), pero por categoría es mucho más ruidosa: un alquiler
   pagado el día 1 "proyecta" treinta alquileres. Por eso solo se proyecta con
   un mínimo de días y de movimientos — con menos, el aviso sería más ruido que
   dato, y un aviso que miente dos veces deja de leerse. */

export const PROYECCION_MIN_DIAS = 5;
export const PROYECCION_MIN_MOVS = 3;

/** Un tope válido es un número positivo; cualquier otra cosa es "sin tope". */
export const topeDe = (topes, cat) => (Number.isFinite(topes?.[cat]) && topes[cat] > 0 ? topes[cat] : null);

/**
 * El presupuesto de un mes: una fila por categoría de gasto y los totales.
 * `hoy` se inyecta para poder probarlo; en la app es la fecha de hoy.
 */
export function estadoPresupuesto(moves, ym, topes, hoy = todayStr()) {
  const gastos = new Map(byCategory(moves, ym).map((c) => [c.cat, c.total]));
  const cuantos = new Map();
  for (const m of movesOf(moves, ym)) {
    if (m.type === 'expense') cuantos.set(m.category, (cuantos.get(m.category) ?? 0) + 1);
  }

  const mesHoy = monthKey(hoy);
  const actual = ym === mesHoy;
  const dias = daysInMonth(ym);
  const transcurridos = actual ? Number(hoy.slice(8, 10)) : ym < mesHoy ? dias : 0;
  // Hoy cuenta como día que queda: todavía se puede gastar.
  const restantes = actual ? dias - transcurridos + 1 : 0;

  const filas = EXPENSE_CATS.map(({ id }) => {
    const tope = topeDe(topes, id);
    const gastado = centavos(gastos.get(id) ?? 0);
    const fila = { cat: id, tope, gastado, queda: null, pct: null, excedido: false, proyeccion: null, diaExceso: null };
    if (tope == null) return fila;

    fila.queda = centavos(tope - gastado);
    fila.pct = gastado / tope;
    fila.excedido = gastado > tope;

    const proyectable = actual && transcurridos >= PROYECCION_MIN_DIAS
      && (cuantos.get(id) ?? 0) >= PROYECCION_MIN_MOVS && gastado > 0;
    if (proyectable) {
      const ritmo = gastado / transcurridos;
      fila.proyeccion = centavos(ritmo * dias);
      // El día en que el acumulado cruza el tope, si sigue así. Solo importa
      // mientras todavía no se pasó: después, el dato es cuánto se pasó.
      if (!fila.excedido && fila.proyeccion > tope) {
        fila.diaExceso = Math.min(dias, Math.max(transcurridos + 1, Math.ceil(tope / ritmo)));
      }
    }
    return fila;
  });

  const conTope = filas.filter((f) => f.tope != null);
  const presupuestado = centavos(conTope.reduce((a, f) => a + f.tope, 0));
  const gastado = centavos(conTope.reduce((a, f) => a + f.gastado, 0));
  const queda = centavos(presupuestado - gastado);
  return {
    filas,
    presupuestado,
    gastado,
    queda,
    // Lo que se puede gastar por día sin pasarse del total. Solo en el mes en
    // curso y solo si queda algo: un "por día" negativo no significa nada.
    porDia: actual && queda > 0 && restantes > 0 ? centavos(queda / restantes) : null,
    sinTope: centavos(filas.filter((f) => f.tope == null).reduce((a, f) => a + f.gastado, 0)),
    actual,
    ritmo: actual ? transcurridos / dias : null,
    restantes,
  };
}

/* ══ Metas ═══════════════════════════════════════════════════════════════════
   Una meta es un objetivo con nombre y un monto, y opcionalmente un mes límite.
   Se llena con aportes a mano (un retiro es un aporte negativo). Los aportes
   NO son movimientos: ahorrar no es gastar, la plata sigue siendo tuya. Por
   eso no tocan el balance, igual que la calculadora. */

/** Meses entre dos "YYYY-MM": de 2026-09 a 2026-12 hay 3. */
export function mesesEntre(desde, hasta) {
  const [y1, m1] = desde.split('-').map(Number);
  const [y2, m2] = hasta.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export const ahorradoDe = (meta) => centavos((meta.aportes ?? []).reduce((a, x) => a + x.monto, 0));

/**
 * Dónde está una meta. El "para llegar" cuenta el mes límite y el actual como
 * meses con aporte: una meta para diciembre, vista en septiembre, tiene
 * cuatro meses (sep, oct, nov, dic).
 */
export function estadoMeta(meta, hoy = todayStr()) {
  const ahorrado = ahorradoDe(meta);
  const objetivo = meta.objetivo;
  const falta = centavos(Math.max(0, objetivo - ahorrado));
  const cumplida = ahorrado >= objetivo;
  const mesHoy = monthKey(hoy);

  let meses = null; let porMes = null; let vencida = false;
  if (meta.fecha && !cumplida) {
    meses = mesesEntre(mesHoy, meta.fecha) + 1;
    if (meses <= 0) vencida = true;
    else porMes = centavos(falta / meses);
  }

  // A tu ritmo: lo ahorrado repartido desde el mes del primer aporte hasta
  // hoy. Sirve sobre todo para las metas sin fecha, que no tienen otro reloj.
  let ritmo = null; let llegada = null;
  const fechas = (meta.aportes ?? []).map((a) => a.fecha).sort();
  if (!cumplida && fechas.length && ahorrado > 0) {
    const mesesAhorrando = mesesEntre(monthKey(fechas[0]), mesHoy) + 1;
    ritmo = centavos(ahorrado / Math.max(1, mesesAhorrando));
    llegada = shiftMonth(mesHoy, Math.ceil(falta / ritmo));
  }

  return {
    ahorrado,
    objetivo,
    falta,
    pct: objetivo > 0 ? Math.min(1, Math.max(0, ahorrado / objetivo)) : 0,
    cumplida,
    meses,
    porMes,
    vencida,
    ritmo,
    llegada,
  };
}
