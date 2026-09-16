/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — Ajustes
   Por ahora es la vista de los DATOS: traerlos, llevárselos, y saber dónde
   están. No hay preferencias que configurar todavía y no se inventan: una
   vista de ajustes con perillas de adorno es peor que no tenerla.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from '../icons.js';
import { Modal, Toast } from '../overlays.js';
import Router from '../router.js';
import { esc, head, paint, path as recortar, viewEl } from '../ui.js';
import { fmtARS } from './format.js';
import { exportAll, importBackup, S } from './state.js';
import { monthTotals } from './stats.js';

export function viewAjustes() {
  const meses = new Set(S.moves.map((m) => m.date.slice(0, 7)));
  const total = S.moves.reduce((acc, m) => acc + (m.type === 'income' ? m.amount : -m.amount), 0);

  paint(
    head({ title: 'Ajustes', sub: 'Los datos de la app: de dónde vienen y a dónde van' })
    + `<div class="ox-scroll ox-grow">

        <section class="ox-section">
          <div class="ox-section__head"><span class="ox-section__title">Datos</span></div>
          <div class="ox-card" style="max-width:620px">
            <div class="ox-card__body">
              <div class="ox-kv">
                <span class="ox-kv__k">Movimientos</span>
                <span class="ox-kv__v ox-num">${S.moves.length}</span>
              </div>
              <div class="ox-kv">
                <span class="ox-kv__k">Meses</span>
                <span class="ox-kv__v ox-num">${meses.size}</span>
              </div>
              <div class="ox-kv">
                <span class="ox-kv__k">Balance histórico</span>
                <span class="ox-kv__v ox-num" style="color:var(--fw-${total < 0 ? 'out' : 'in'})">${fmtARS(total)}</span>
              </div>
              <div class="ox-kv">
                <span class="ox-kv__k">Carpeta</span>
                <span class="ox-kv__v ox-mono" data-tip="${esc(S.info?.dataDir || '')}">${recortar(S.info?.dataDir || '—')}</span>
              </div>
            </div>
            <div class="ox-card__foot">
              <button class="ox-btn ox-btn--secondary ox-flashable" id="aj-importar">
                <i data-icon="upload"></i> Importar un respaldo
              </button>
              <button class="ox-btn ox-btn--ghost ox-flashable" id="aj-exportar"${S.moves.length ? '' : ' disabled'}>
                <i data-icon="save"></i> Exportar todo
              </button>
            </div>
          </div>
          <div class="ox-meta" style="margin-top:var(--ox-2)">
            Importar acepta respaldos de Finway y de FinWatch, y también el archivo
            de datos crudo de cualquiera de las dos. Los movimientos que ya estén
            no se duplican.
          </div>
        </section>

        <section class="ox-section">
          <div class="ox-section__head"><span class="ox-section__title">Acerca de</span></div>
          <div class="ox-card" style="max-width:620px">
            <div class="ox-card__body">
              <div class="ox-kv"><span class="ox-kv__k">Versión</span>
                <span class="ox-kv__v ox-mono">${esc(S.info?.version || '—')}</span></div>
              <div class="ox-kv"><span class="ox-kv__k">Electron</span>
                <span class="ox-kv__v ox-mono">${esc(S.info?.electron || '—')}</span></div>
            </div>
          </div>
        </section>
      </div>`,
  );

  const root = viewEl();
  root.querySelector('#aj-importar').addEventListener('click', importar);
  root.querySelector('#aj-exportar').addEventListener('click', exportar);
}

async function importar() {
  const r = await importBackup();
  if (!r) return;   // canceló el diálogo, o falló y ya se vio el error

  /* El resumen va en un modal y no en un toast: importar es de las pocas cosas
     que cambian TODO de una, y "entraron 118 de 119" es una frase que alguien
     puede querer leer dos veces antes de que se desvanezca sola. */
  const linea = (k, v, tone = '') =>
    `<div class="ox-kv"><span class="ox-kv__k">${k}</span><span class="ox-kv__v ox-num"${tone}>${v}</span></div>`;

  await Modal.show({
    title: r.importados ? 'Movimientos importados' : 'No entró nada nuevo',
    sub: r.origen ? `Desde ${esc(r.origen)} · ${esc(r.archivo)}` : esc(r.archivo),
    body: `<div>
      ${linea('Leídos del archivo', r.leidos)}
      ${linea('Importados', r.importados)}
      ${r.repetidos ? linea('Ya estaban', r.repetidos) : ''}
      ${r.rechazados ? linea('Descartados por inválidos', r.rechazados, ' style="color:var(--ox-danger)"') : ''}
      ${linea('Total en la app', r.total)}
    </div>`,
    actions: [{ label: 'Listo', value: true, variant: 'primary', autofocus: true }],
  });

  Router.refresh();
}

async function exportar() {
  const hecho = await exportAll();
  if (!hecho) return;
  Toast.show({
    title: `Respaldo de ${hecho.count} ${hecho.count === 1 ? 'movimiento' : 'movimientos'}`,
    text: hecho.path.split('\\').pop(),
    icon: 'save',
  });
}
