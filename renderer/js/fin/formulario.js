/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY · TERMINAL — el formulario de un movimiento
   Para editar uno (E, doble clic, el menú de la fila) y para cargar uno con
   todas sus partes a la vista (Ctrl+N): tipo, monto, categoría, nota y fecha
   con su calendario. Es el mismo formulario de carga rápida que tenía el
   inspector (quickadd.js), ahora adentro de un modal: la línea de carga es la
   vía rápida, esto es la vía completa.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Modal, Toast } from '../overlays.js';
import Router from '../router.js';
import { catLabel } from './categories.js';
import { fmtARS } from './format.js';
import { QuickAdd, quickAddHTML, syncQuickAdd, wireQuickAdd } from './quickadd.js';
import { saveMove } from './state.js';

let abierto = false;

/** `move`: el movimiento a editar, o null para uno nuevo. Resuelve cuando se
    cierra (guardado o cancelado). */
export async function abrirFormulario(move = null) {
  if (abierto) return;
  abierto = true;
  if (move) QuickAdd.edit(move);
  else QuickAdd.reset({ keepDate: true });

  const body = document.createElement('div');
  body.className = 'fw-formmov';
  body.innerHTML = quickAddHTML();

  const esperando = Modal.show({
    title: move ? 'Editar movimiento' : 'Nuevo movimiento',
    sub: move ? `${move.type === 'income' ? '+' : '−'}${fmtARS(move.amount)} · ${catLabel(move.category)}` : 'Tipo, monto, categoría y Enter',
    body,
    width: 460,
  });

  const soltar = wireQuickAdd(body, {
    onTypeChange: () => syncQuickAdd(body),
    onCancelEdit: () => Modal.close(null),
    onSubmit: async (m) => {
      const editando = !!m.id;
      if (!await saveMove(m)) return;
      Modal.close(true);
      Router.refresh();
      Toast.show({
        title: editando ? 'Movimiento editado' : 'Movimiento cargado',
        text: `${m.type === 'income' ? '+' : '−'}${fmtARS(m.amount)} · ${catLabel(m.category)}`,
        icon: 'check',
      });
    },
  });
  setTimeout(() => QuickAdd.focusAmount(body), 80);

  await esperando;
  soltar?.();
  // Cancelar una edición no puede dejar el formulario «editando» para la próxima.
  if (QuickAdd.editing) QuickAdd.reset();
  else QuickAdd.reset({ keepDate: true });
  abierto = false;
}
