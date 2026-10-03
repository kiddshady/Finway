/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — lo que cambia con la app andando
   Dos ayudas chicas para los textos que se actualizan SIN repintar la vista:
   un número y una frase. Antes todos eran un textContent a secas y cambiaban
   de un cuadro al otro (el contador del rail, el balance de la statusbar, el
   total de la calculadora, el «quedan $…» de un presupuesto).
   ═══════════════════════════════════════════════════════════════════════════ */

import { swap, tick } from '../motion.js';

/** Un número suelto (un contador, un monto): se reescribe en su lugar y
    destella en el acento. No se apaga: tipeando un tope cambia en cada tecla,
    y apagarse y prenderse en cada una se leería como un parpadeo. */
export function numero(el, valor) {
  if (!el) return;
  const texto = String(valor);
  if (el.textContent === texto) return;
  // El primer llenado (al montar la vista) no es un cambio: no destella.
  const primero = el.textContent === '';
  el.textContent = texto;
  if (!primero) tick(el);
}

const textoDe = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content.textContent.trim();
};
/** La frase con los números tapados: «3 movimientos» y «4 movimientos» son la
    misma frase; «1 movimiento» y «2 movimientos», no. */
const molde = (s) => s.replace(/\d[\d.,]*/g, '#');

/**
 * Una frase que se actualiza en vivo (`html` ya escapado). Si cambiaron solo
 * sus números, se reescribe en el lugar con un destello, como un número: un
 * relevo de la frase entera en cada tecla la apagaría y prendería sin parar.
 * Si cambió la frase, relevo (lo vacío entra o se va esfumándose).
 */
export function frase(el, html) {
  if (!el) return;
  // Durante un relevo el textContent junta lo que se va con lo que llega: por
  // eso se compara contra la última frase puesta, no contra el DOM.
  const viejo = el.__frase != null ? textoDe(el.__frase) : el.textContent.trim();
  const nuevo = textoDe(html);
  el.__frase = html;
  if (viejo === nuevo) return;
  const soloCifras = viejo !== '' && nuevo !== '' && molde(viejo) === molde(nuevo);
  swap(el, html, soloCifras ? {} : { relevo: true });
  if (soloCifras) tick(el);
}
