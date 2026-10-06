/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY · TERMINAL — F6 Ajustes
   01 los datos (traerlos, llevárselos y saber dónde están), 02 el sistema
   (versión y actualizaciones), 03 la pantalla (el filtro CRT y la cinta: las
   dos únicas perillas que tiene sentido tocar), 04 los atajos —todo se hace
   desde el teclado— y 05 los documentos donde vive cada cosa.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from '../icons.js';
import { Modal, Toast } from '../overlays.js';
import Router from '../router.js';
import { frase, swap } from '../motion.js';
import { esc, paint, path as recortar, viewEl } from '../ui.js';
import { exportAll, importBackup, S } from './state.js';
import { resumenCalculadora } from './calculadora.js';
import { resumenMetas } from './metas.js';
import { resumenPresupuestos } from './presupuestos.js';
import { cambiarPantalla, P } from './pantalla.js';
import { cifra, entero, mesCorto, panel, tecla } from './term.js';
import * as Update from '../update.js';

const ATAJOS = [
  ['F1', 'RESUMEN'], ['F4', 'METAS'],
  ['F2', 'MOVIMIENTOS'], ['F5', 'CALCULADORA'],
  ['F3', 'PRESUPUESTOS'], ['F6', 'AJUSTES'],
  ['/', 'LÍNEA DE CARGA'], ['CTRL N', 'FORMULARIO DE CARGA'],
  ['<chevronLeft>', 'MES ANTERIOR'], ['<chevronRight>', 'MES SIGUIENTE'],
  ['INICIO', 'VOLVER AL MES DE HOY'], ['ESC', 'SALIR DE UN CAMPO'],
  ['<chevronUp>', 'LIBRO: SUBIR'], ['<chevronDown>', 'LIBRO: BAJAR'],
  ['E', 'EDITAR MOVIMIENTO'], ['SUPR', 'BORRAR MOVIMIENTO'],
  ['T G I', 'TODO · GASTOS · INGRESOS'], ['F', 'FILTRAR EL LIBRO'],
  ['C', 'CATEGORÍAS DEL LIBRO'], ['X', 'EXPORTAR'],
  ['N', 'NUEVA HOJA (CALCULADORA)'], ['ENTER', 'CAMPO SIGUIENTE'],
];

const seg = (id, opciones, actual) => `<div class="fw-seg" id="${id}">${opciones.map(([v, l]) =>
  `<button class="fw-seg__o${v === actual ? ' is-on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;

export function viewAjustes() {
  const meses = [...new Set(S.moves.map((m) => m.date.slice(0, 7)))].sort();
  const total = S.moves.reduce((acc, m) => acc + (m.type === 'income' ? m.amount : -m.amount), 0);
  const mt = resumenMetas();
  const ca = resumenCalculadora();
  const pr = resumenPresupuestos();

  paint(`
    <div class="fw-screen fw-aj">
      <div class="fw-aj__col">
        ${panel({ n: '01', t: 'Datos', m: 'MOVIMIENTOS.JSON', body: `
          <div class="fw-blk">
            <dl class="fw-kv ox-copyable">
              <dt>MOVIMIENTOS</dt><dd>${entero(S.moves.length)}</dd>
              <dt>MESES</dt><dd>${meses.length ? `${meses.length} · ${mesCorto(meses[0])} A ${mesCorto(meses.at(-1))}` : '—'}</dd>
              <dt>BALANCE HISTÓRICO</dt><dd class="${total < 0 ? 'fw-out' : 'fw-in'}">${cifra(total, { signo: true })}</dd>
              <dt>CARPETA</dt><dd data-tip="${esc(S.info?.dataDir || '')}">${recortar(S.info?.dataDir || '—')}</dd>
            </dl>
            <div class="fw-acts">
              <button class="fw-btn fw-btn--acc" id="aj-importar">${tecla('I')}IMPORTAR RESPALDO</button>
              <button class="fw-btn" id="aj-exportar"${S.moves.length ? '' : ' disabled'}>${tecla('X')}EXPORTAR TODO</button>
            </div>
            <p class="fw-blk__nota">Importar acepta respaldos de Finway y de FinWatch, y también el archivo de datos crudo de cualquiera de las dos. Los movimientos que ya estén no se duplican.</p>
          </div>` })}
        ${panel({ n: '02', t: 'Sistema', m: 'KIDD SHADY · UMBROVEX SYSTEMS', body: `
          <div class="fw-blk">
            <dl class="fw-kv ox-copyable">
              <dt>VERSIÓN</dt><dd>${esc(S.info?.version || '—')}</dd>
              <dt>ELECTRON</dt><dd>${esc(S.info?.electron || '—')}</dd>
              <dt>ACTUALIZACIONES</dt><dd id="aj-update-estado"></dd>
            </dl>
            <div class="fw-acts" id="aj-update-foot"></div>
          </div>` })}
        ${panel({ n: '03', t: 'Pantalla', m: 'SE APLICA AL TOQUE', body: `
          <div class="fw-blk">
            <div class="fw-set"><div class="fw-set__k">FILTRO CRT<small>scanlines, viñeta y el resplandor del ámbar</small></div>
              ${seg('aj-crt', [['no', 'NO'], ['suave', 'SUAVE'], ['fuerte', 'FUERTE']], P.crt)}</div>
            <div class="fw-set"><div class="fw-set__k">CINTA DE COTIZACIONES<small>la franja de arriba con las cifras del mes</small></div>
              ${seg('aj-cinta', [['mueve', 'SE MUEVE'], ['quieta', 'QUIETA']], P.cinta)}</div>
          </div>` })}
      </div>
      <div class="fw-aj__col fw-aj__col--b">
        ${panel({ n: '04', t: 'Atajos', m: 'TODO SE HACE DESDE EL TECLADO', body: `
          <div class="fw-blk"><div class="fw-keys">${ATAJOS.map(([k, l]) => `${tecla(k)}<span>${l}</span>`).join('')}</div></div>` })}
        ${panel({ n: '05', t: 'Documentos', m: 'DÓNDE VIVE CADA COSA', body: `
          <div class="ox-scroll ox-scroll--line-top ox-scroll--line-bottom fw-scroll">
            <ul class="fw-docs ox-copyable">
              <li><b>movimientos.json</b><span>${entero(S.moves.length)} movimientos</span><em>los gastos e ingresos: lo único que toca el balance</em></li>
              <li><b>presupuestos.json</b><span>${pr.topes} ${pr.topes === 1 ? 'tope' : 'topes'}</span><em>un tope mensual por categoría</em></li>
              <li><b>metas.json</b><span>${mt.metas} ${mt.metas === 1 ? 'meta' : 'metas'} · ${mt.aportes} ${mt.aportes === 1 ? 'aporte' : 'aportes'}</span><em>el ahorro aparte; no son movimientos</em></li>
              <li><b>calculadora.json</b><span>${ca.hojas} ${ca.hojas === 1 ? 'hoja' : 'hojas'} · ${ca.filas} ${ca.filas === 1 ? 'fila' : 'filas'}</span><em>las cuentas a mano; tampoco son movimientos</em></li>
              <li><b>pantalla.json</b><span>CRT ${P.crt.toUpperCase()} · CINTA ${P.cinta.toUpperCase()}</span><em>cómo se ve la app</em></li>
            </ul>
          </div>` })}
      </div>
    </div>`);

  const root = viewEl();
  root.querySelector('#aj-importar').addEventListener('click', importar);
  root.querySelector('#aj-exportar').addEventListener('click', exportar);

  const cablearSeg = (id, clave) => root.querySelector(`#${id}`).addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b || P[clave] === b.dataset.v) return;
    root.querySelectorAll(`#${id} .fw-seg__o`).forEach((x) => x.classList.toggle('is-on', x === b));
    cambiarPantalla({ [clave]: b.dataset.v });
    frase(root.querySelector('.fw-docs li:last-child span'), `CRT ${P.crt.toUpperCase()} · CINTA ${P.cinta.toUpperCase()}`);
  });
  cablearSeg('aj-crt', 'crt');
  cablearSeg('aj-cinta', 'cinta');

  const teclas = (e) => {
    if (Modal.isOpen || e.ctrlKey || e.altKey || e.metaKey) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (k === 'i') { e.preventDefault(); importar(); }
    else if (k === 'x' && S.moves.length) { e.preventDefault(); exportar(); }
    else if (k === 'u') { e.preventDefault(); root.querySelector('#aj-update-buscar:not(:disabled)')?.click(); }
  };
  document.addEventListener('keydown', teclas);
  Router.onLeave(() => document.removeEventListener('keydown', teclas));

  /* La fila de actualizaciones se repinta sola con cada estado que manda el
     main (buscando → bajando 40 % → lista). Se suelta al irse de la vista. */
  pintarUpdate(root, Update.estado);
  Router.onLeave(Update.onChange((e) => pintarUpdate(root, e)));
}

/* El estado es una frase: un cambio de fase hace relevo. El botón no se
   rehace en cada aviso: si es el mismo, solo se prende o se apaga. */
function pintarUpdate(root, e) {
  const estado = root.querySelector('#aj-update-estado');
  const foot = root.querySelector('#aj-update-foot');
  if (!estado || !foot) return;
  frase(estado, esc(Update.describir(e).toUpperCase()));
  const ocupado = e.state === 'checking' || e.state === 'downloading';
  const boton = e.state === 'ready' ? `instalar:${e.version}` : 'buscar';
  if (foot.dataset.boton !== boton) {
    foot.dataset.boton = boton;
    swap(foot, e.state === 'ready'
      ? `<button class="fw-btn fw-btn--acc" id="aj-update-instalar">${tecla('U')}REINICIAR E INSTALAR LA ${esc(e.version)}</button>`
      : `<button class="fw-btn" id="aj-update-buscar">${tecla('U')}BUSCAR ACTUALIZACIONES</button>`, { relevo: true });
    Icons.mount(foot);
    foot.querySelector('#aj-update-instalar')?.addEventListener('click', Update.instalar);
    foot.querySelector('#aj-update-buscar')?.addEventListener('click', Update.buscar);
  }
  const buscar = foot.querySelector('#aj-update-buscar');
  if (buscar) buscar.disabled = ocupado || e.state === 'dev';
}

async function importar() {
  const r = await importBackup();
  if (!r) return;   // canceló el diálogo, o falló y ya se vio el error
  /* El resumen va en un modal y no en un toast: importar cambia TODO de una, y
     «entraron 118 de 119» es una frase que alguien puede querer leer dos veces. */
  const linea = (k, v, cls = '') => `<dt>${k}</dt><dd class="${cls}">${v}</dd>`;
  await Modal.show({
    title: r.importados ? 'Movimientos importados' : 'No entró nada nuevo',
    sub: r.origen ? `Desde ${esc(r.origen)} · ${esc(r.archivo)}` : esc(r.archivo),
    body: `<dl class="fw-kv">
      ${linea('LEÍDOS DEL ARCHIVO', r.leidos)}
      ${linea('IMPORTADOS', r.importados)}
      ${r.repetidos ? linea('YA ESTABAN', r.repetidos) : ''}
      ${r.rechazados ? linea('DESCARTADOS POR INVÁLIDOS', r.rechazados, 'fw-out') : ''}
      ${linea('TOTAL EN LA APP', r.total)}
    </dl>`,
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
