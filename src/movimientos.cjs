'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — los movimientos
   El dominio de la app, apoyado en el store de Onyx: la escritura atómica, el
   flush explícito, el rename con reintentos y el "corrupto → se aparta" ya los
   resuelve `store.cjs` y no se reimplementan acá.

   SIN CACHE EN MEMORIA: cada operación relee el disco. No es descuido, es la
   lección de FinWatch — una instancia vieja viva en el tray, con su propia foto
   de los datos, puede pisar el archivo entero al guardar. Releyendo siempre,
   la mutación de una ventana dormida se integra en vez de borrar. Para miles de
   movimientos por año, leer el archivo cada vez es gratis.
   ═══════════════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');
const store = require('./store.cjs');

const SCHEMA = 1;
const BACKUP_FORMAT = 'finway/backup';
/* Un respaldo de FinWatch tiene la misma forma: es la app de la que salió esta,
   y rechazarlo sería cerrarle la puerta al único archivo que hay para importar. */
const FORMATOS = [BACKUP_FORMAT, 'finwatch/backup'];

const doc = () => store.doc('movimientos', { schema: SCHEMA, moves: [] });

/** Normaliza lo que llega de afuera. Tira si no se puede salvar. */
function sanitize(move) {
  const type = move.type === 'income' ? 'income' : 'expense';
  const amount = Math.round(Number(move.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Monto inválido');
  const date = String(move.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Fecha inválida');
  return {
    type,
    amount,
    date,
    category: String(move.category || 'otros').slice(0, 40),
    note: String(move.note || '').slice(0, 200),
  };
}

/** Más nuevos arriba; a igual fecha, el último cargado primero. */
const sortMoves = (moves) =>
  moves.sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : b.ts - a.ts));

async function leer() {
  const data = await doc().read();
  return Array.isArray(data?.moves) ? data.moves : [];
}

async function guardar(moves) {
  sortMoves(moves);
  await doc().write({ schema: SCHEMA, moves });
  return moves;
}

async function load() {
  return leer();
}

async function add(move) {
  const moves = await leer();
  moves.push({ id: crypto.randomUUID(), ts: Date.now(), ...sanitize(move) });
  return guardar(moves);
}

async function update(move) {
  const moves = await leer();
  const idx = moves.findIndex((m) => m.id === move.id);
  if (idx === -1) throw new Error('Movimiento no encontrado');
  moves[idx] = { ...moves[idx], ...sanitize(move) };
  return guardar(moves);
}

async function remove(id) {
  const moves = await leer();
  return guardar(moves.filter((m) => m.id !== id));
}

/* ── Respaldo ────────────────────────────────────────────────────────────────
   El CSV es para mirar un mes en Excel: pierde los ids y redondea a texto.
   Esto es lo otro: TODO, tal cual está en disco, en un archivo que otra app
   puede volver a leer sin perder nada.

   El envoltorio no es decoración: `format` deja que el importador sepa que el
   archivo es de acá antes de tocar nada —un JSON cualquiera también parsea— y
   `schema` es lo que va a permitir migrar el día que un movimiento cambie de
   forma. Sin esos dos campos, importar es adivinar. */

function toBackup(moves, appVersion = '') {
  return {
    format: BACKUP_FORMAT,
    schema: SCHEMA,
    exportedAt: new Date().toISOString(),
    app: `Finway ${appVersion}`.trim(),
    count: moves.length,
    moves,
  };
}

/**
 * Lee un respaldo y devuelve movimientos listos para guardar.
 *
 * Acepta el respaldo de Finway, el de FinWatch, y también el archivo de datos
 * crudo de cualquiera de las dos: es el mismo contenido sin envoltorio, y
 * negarse sería puro formalismo.
 *
 * Cada movimiento pasa por el MISMO `sanitize` que los que entran por la UI —
 * un archivo de afuera no es más confiable que el renderer— y los que no pasan
 * se descartan contándolos: un import que se aborta entero por una fila rota es
 * peor que uno que dice "entraron 118 de 119".
 */
function fromBackup(texto) {
  let data;
  try {
    data = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un JSON válido');
  }

  if (data && data.format && !FORMATOS.includes(data.format)) {
    throw new Error(`El archivo dice ser "${data.format}" y no un respaldo de Finway`);
  }
  const crudos = data && Array.isArray(data.moves) ? data.moves : null;
  if (!crudos) throw new Error('El archivo no tiene una lista de movimientos');

  const moves = [];
  const rechazados = [];
  for (const m of crudos) {
    try {
      moves.push({
        id: typeof m.id === 'string' && m.id ? m.id : crypto.randomUUID(),
        ts: Number.isFinite(m.ts) ? m.ts : Date.now(),
        ...sanitize(m),
      });
    } catch (err) {
      rechazados.push(err.message);
    }
  }
  return { moves, rechazados, origen: data.app || null, schema: data.schema ?? null };
}

/**
 * Importa un respaldo FUSIONANDO por id: agrega los que faltan y deja los que
 * ya están. Así importar dos veces el mismo archivo no duplica nada, y sobre
 * una app vacía —el caso real, migrar desde FinWatch— es lo mismo que
 * reemplazar. Reemplazar de una sería la única versión capaz de borrarle
 * meses de carga a alguien que se equivocó de archivo.
 */
async function importBackup(texto) {
  const { moves: entrantes, rechazados, origen } = fromBackup(texto);
  const actuales = await leer();
  const conocidos = new Set(actuales.map((m) => m.id));

  const nuevos = entrantes.filter((m) => !conocidos.has(m.id));
  await guardar([...actuales, ...nuevos]);

  return {
    leidos: entrantes.length + rechazados.length,
    importados: nuevos.length,
    repetidos: entrantes.length - nuevos.length,
    rechazados: rechazados.length,
    origen,
    total: actuales.length + nuevos.length,
  };
}

/** CSV es-AR friendly: separador ';' (el regional de Excel) y BOM por los acentos. */
function toCsv(moves) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ['fecha;tipo;categoria;monto;nota'];
  for (const m of moves) {
    lines.push([
      m.date,
      m.type === 'income' ? 'ingreso' : 'gasto',
      esc(m.category),
      String(m.amount).replace('.', ','),
      esc(m.note || ''),
    ].join(';'));
  }
  return '﻿' + lines.join('\r\n');
}

module.exports = {
  SCHEMA, BACKUP_FORMAT,
  load, add, update, remove,
  toCsv, toBackup, fromBackup, importBackup,
};
