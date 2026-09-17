/**
 * Categorías.
 *
 * SIN COLOR PROPIO. Hasta el 17 sep 2026 cada categoría tenía su tono (un
 * abanico optimizado por distancia perceptual); Fran quiso la app más fiel a
 * Onyx, que tiene un solo acento por pantalla, y el único color que queda en
 * Finway es el par verde/rojo de la plata.
 *
 * Ojo con lo que ya falló: antes del abanico hubo una rampa monocroma con un
 * gris FIJO por categoría, y dejó el donut ilegible — once grises casi iguales
 * no atan ningún gajo con su renglón. Lo que se hace ahora es otra cosa: el
 * gris lo decide el PUESTO en el ranking del mes (ver rankShade), no la
 * categoría. El gajo más grande es el más claro, la leyenda va en el mismo
 * orden que los gajos en sentido horario, y el hover los ata uno con otro.
 */

const cat = ([id, label]) => ({ id, label });

export const EXPENSE_CATS = [
  ['comida', 'Comida'], ['super', 'Súper'], ['transporte', 'Transporte'],
  ['salidas', 'Salidas'], ['servicios', 'Servicios'], ['hogar', 'Hogar'],
  ['salud', 'Salud'], ['subs', 'Subs'], ['ropa', 'Ropa'],
  ['educacion', 'Educación'], ['otros', 'Otros'],
].map(cat);

export const INCOME_CATS = [
  ['sueldo', 'Sueldo'], ['freelance', 'Freelance'], ['regalo', 'Regalo'], ['otros-in', 'Otros'],
].map(cat);

const ALL = new Map([...EXPENSE_CATS, ...INCOME_CATS].map((c) => [c.id, c]));

/** El gris del puesto i de n: de la luminancia del texto de Onyx (93%) a la
    del texto más apagado que todavía se separa de la card (38%), con el matiz
    y la temperatura de la app para que sea SU gris y no uno muerto. */
export function rankShade(i, n) {
  const t = n > 1 ? i / (n - 1) : 0;
  const L = (93 - t * 55).toFixed(1);
  return `oklch(${L}% calc(.012 * var(--ox-tint)) var(--ox-hue))`;
}

export const catLabel = (id) => ALL.get(id)?.label ?? id;
export const catsFor = (type) => (type === 'income' ? INCOME_CATS : EXPENSE_CATS);
