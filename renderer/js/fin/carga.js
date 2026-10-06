/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY · TERMINAL — la línea de carga
   Siempre a la vista, abajo de todo: se escribe el movimiento en una línea y
   Enter lo guarda. Mientras se escribe, al lado se ve cómo se entendió cada
   parte (TIPO · MONTO · CAT · NOTA · FECHA): lo que falta queda apagado.
   `/` la enfoca desde cualquier pantalla; Esc la suelta; ↑ con la línea vacía
   trae la última que se guardó, para cargar otra parecida.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Toast } from '../overlays.js';
import Router from '../router.js';
import { esc } from '../ui.js';
import { catLabel } from './categories.js';
import { fmtARS } from './format.js';
import { entender } from './linea.js';
import { saveMove } from './state.js';
import { cifra } from './term.js';

const fechaTexto = (d) => d.split('-').reverse().slice(0, 2).join('/');

export function cablearLinea() {
  const input = document.getElementById('cmd');
  const parse = document.getElementById('parse');
  let ultima = '';
  let guardando = false;

  const mostrar = () => {
    const v = input.value;
    if (!v.trim()) { parse.innerHTML = ''; return; }
    const r = entender(v);
    const tok = (k, val, ok) => `<span class="fw-tok ${ok ? 'is-ok' : 'is-miss'}"><b>${k}</b>${val}</span>`;
    /* Se reescribe en cada tecla, pero el fundido de entrada de cada ficha
       solo corre cuando cambia lo que dice: con el mismo texto, el nodo se
       deja como está. */
    const html = [
      tok('TIPO', r.tipo === 'income' ? 'ingreso' : 'gasto', true),
      tok('MONTO', r.monto != null ? `$ ${cifra(r.monto)}` : 'falta', r.monto != null),
      tok('CAT', r.categoria ? esc(catLabel(r.categoria).toLowerCase()) : 'falta', !!r.categoria),
      tok('NOTA', r.nota ? esc(r.nota) : '—', !!r.nota),
      tok('FECHA', r.fechaDicha ? fechaTexto(r.fecha) : 'hoy', true),
    ];
    const viejas = [...parse.children];
    html.forEach((h, i) => {
      if (viejas[i]?.outerHTML === h) return;
      const t = document.createElement('template');
      t.innerHTML = h;
      if (viejas[i]) viejas[i].replaceWith(t.content.firstChild);
      else parse.append(t.content.firstChild);
    });
  };

  const sacudir = () => {
    input.classList.remove('is-shaking');
    void input.offsetWidth;
    input.classList.add('is-shaking');
  };

  input.addEventListener('input', mostrar);
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); input.blur(); return; }
    if (e.key === 'ArrowUp' && !input.value && ultima) {
      e.preventDefault();
      input.value = ultima;
      mostrar();
      return;
    }
    if (e.key !== 'Enter' || guardando) return;
    e.preventDefault();
    const r = entender(input.value);
    if (!r.move) {
      sacudir();
      if (input.value.trim()) Toast.show({ title: `Falta ${r.falta.join(' y ')}`, text: 'Por ejemplo: gasto 4500 transporte uber', icon: 'alert' });
      return;
    }
    guardando = true;
    const ok = await saveMove(r.move);
    guardando = false;
    if (!ok) return;
    ultima = input.value.trim();
    input.value = '';
    mostrar();
    Router.refresh();
    Toast.show({
      title: r.move.type === 'income' ? 'Ingreso registrado' : 'Gasto registrado',
      text: `${r.move.type === 'income' ? '+' : '−'}${fmtARS(r.move.amount)} · ${catLabel(r.move.category)}${r.move.note ? ` · ${r.move.note}` : ''}`,
      icon: 'check',
    });
  });

  return {
    enfocar: () => { input.focus(); input.select(); },
  };
}
