/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — ¿el instalador trae todo lo que la app pide?

       npm run dist && npm run check-dist

   El `files` de electron-builder es una LISTA BLANCA: lo que no está nombrado
   no entra al asar. Y eso no se nota nunca corriendo desde el repo, donde todo
   está al lado y cualquier `<link>` o `import` resuelve. Solo se rompe
   empaquetada, y el síntoma no señala al culpable: un CSS que falta no tira
   error, la app simplemente se ve mal. Pasó en Sonar.

   Por eso la lista de lo necesario NO se escribe a mano (se desactualizaría
   igual que el `files`): se DESCUBRE leyendo el código — los `<link>` y
   `<script>` del index.html, los `import` de cada módulo siguiendo el árbol, y
   los `require` del proceso principal. Después se compara contra el índice del
   asar, que es JSON al principio del archivo.
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASAR = path.join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar');

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };

if (!fs.existsSync(ASAR)) {
  console.log(`No hay paquete en ${path.relative(ROOT, ASAR)}. Corré primero: npm run dist`);
  process.exit(1);
}

/* ── El índice del asar ──────────────────────────────────────────────────────
   Cuatro uint32 de cabecera (pickle): el cuarto es el largo del JSON, que viene
   justo después. El JSON es un árbol { files: { nombre: { files: {...} } } }. */
function indiceAsar(archivo) {
  const fd = fs.openSync(archivo, 'r');
  const cab = Buffer.alloc(16);
  fs.readSync(fd, cab, 0, 16, 0);
  const largo = cab.readUInt32LE(12);
  const json = Buffer.alloc(largo);
  fs.readSync(fd, json, 0, largo, 16);
  fs.closeSync(fd);

  const rutas = new Set();
  (function caminar(nodo, base) {
    for (const [nombre, hijo] of Object.entries(nodo.files || {})) {
      const r = base ? `${base}/${nombre}` : nombre;
      if (hijo.files) caminar(hijo, r);
      else rutas.add(r);
    }
  }(JSON.parse(json.toString('utf8')), ''));
  return rutas;
}

/* ── Lo que el renderer pide ─────────────────────────────────────────────────
   Desde el index.html, siguiendo cada import relativo hasta agotar el árbol. */
function loQuePideElRenderer() {
  const necesarios = new Set(['renderer/index.html']);
  const html = fs.readFileSync(path.join(ROOT, 'renderer', 'index.html'), 'utf8');
  const pendientes = [];

  for (const [, ref] of html.matchAll(/<(?:link[^>]+href|script[^>]+src)="\.\/([^"]+)"/g)) {
    const r = `renderer/${ref}`;
    necesarios.add(r);
    if (r.endsWith('.js')) pendientes.push(r);
  }

  /* Un archivo pedido que no existe ni en el repo es otro error (un typo en un
     href) y no puede tumbar la verificación: se salta al recorrer su árbol, y
     el chequeo contra el asar lo reporta igual. */
  const existe = (r) => fs.existsSync(path.join(ROOT, r));

  // Las tipografías las pide el CSS, no el HTML.
  for (const css of [...necesarios].filter((r) => r.endsWith('.css'))) {
    if (!existe(css)) continue;
    const texto = fs.readFileSync(path.join(ROOT, css), 'utf8');
    for (const [, url] of texto.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) {
      if (url.startsWith('data:')) continue;
      necesarios.add(path.posix.normalize(path.posix.join(path.posix.dirname(css), url)));
    }
  }

  const vistos = new Set();
  while (pendientes.length) {
    const mod = pendientes.pop();
    if (vistos.has(mod) || !existe(mod)) continue;
    vistos.add(mod);
    const texto = fs.readFileSync(path.join(ROOT, mod), 'utf8');
    for (const [, spec] of texto.matchAll(/(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]/g)) {
      const dest = path.posix.normalize(path.posix.join(path.posix.dirname(mod), spec));
      necesarios.add(dest);
      pendientes.push(dest);
    }
  }
  return necesarios;
}

/* ── Lo que pide el proceso principal ────────────────────────────────────────
   Los require relativos, en árbol, y las rutas a `assets/` que se leen en
   runtime: el ícono de la ventana y los PNG del tray. Esos no los pide el
   renderer, así que ningún "anda en dev" los delata. */
function loQuePideElMain() {
  const necesarios = new Set(['main.cjs', 'preload.cjs']);
  const pendientes = ['main.cjs'];
  const vistos = new Set();

  while (pendientes.length) {
    const mod = pendientes.pop();
    if (vistos.has(mod) || !fs.existsSync(path.join(ROOT, mod))) continue;
    vistos.add(mod);
    const texto = fs.readFileSync(path.join(ROOT, mod), 'utf8');

    for (const [, spec] of texto.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const dest = path.posix.normalize(path.posix.join(path.posix.dirname(mod), spec));
      necesarios.add(dest);
      pendientes.push(dest);
    }
    // path.join(__dirname, 'assets', 'icon.ico') → assets/icon.ico
    for (const [, partes] of texto.matchAll(/path\.join\(\s*__dirname\s*,\s*((?:['"][^'"]+['"]\s*,?\s*)+)\)/g)) {
      const trozos = [...partes.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
      if (trozos[0] !== 'assets') continue;
      necesarios.add(path.posix.join(...trozos));
    }
    // El tray arma el nombre con un template: icon_${lado}.png para cada lado.
    const lados = texto.match(/for \(const \[lado, escala\] of (\[[^\n]+\])\)/);
    if (lados && texto.includes('icon_${lado}.png')) {
      for (const [lado] of JSON.parse(lados[1])) necesarios.add(`assets/icon_${lado}.png`);
    }
  }
  return necesarios;
}

const enElPaquete = indiceAsar(ASAR);
console.log(`\n${path.relative(ROOT, ASAR)} · ${enElPaquete.size} archivos\n`);

/* Dos errores distintos con dos arreglos distintos, así que se reportan por
   separado. Si el archivo EXISTE en el repo y falta en el paquete, es un olvido
   del `files` de package.json (el caso de Sonar). Si no existe ni en el repo,
   es un error del código: un href o un import que apunta a la nada. */
function revisar(titulo, pedidos) {
  const enRepo = (r) => fs.existsSync(path.join(ROOT, r));
  const olvidados = [...pedidos].filter((r) => enRepo(r) && !enElPaquete.has(r));
  const inexistentes = [...pedidos].filter((r) => !enRepo(r));
  ok(`están los ${pedidos.size} que pide ${titulo}`, olvidados.length === 0,
    `\n        existen en el repo pero NO entraron al paquete (revisá build.files):\n          ${olvidados.join('\n          ')}`);
  ok('y ninguno apunta a un archivo que no existe', inexistentes.length === 0,
    `\n        el código pide archivos que no existen (¿un typo?):\n          ${inexistentes.join('\n          ')}`);
}

console.log('1. Lo que carga el renderer');
revisar('(html, css, js, fuentes)', loQuePideElRenderer());

console.log('\n2. Lo que lee el proceso principal');
revisar('(módulos, ícono de ventana, tray)', loQuePideElMain());
ok('el tray tiene sus tres resoluciones', [16, 24, 32].every((l) => enElPaquete.has(`assets/icon_${l}.png`)));

console.log('\n3. Lo que NO tiene que viajar');
ok('ningún dato de desarrollo (data/)', ![...enElPaquete].some((r) => r.startsWith('data/')),
  [...enElPaquete].filter((r) => r.startsWith('data/')).join(', '));
ok('ningún test', ![...enElPaquete].some((r) => r.startsWith('test/')));
ok('ninguna herramienta de desarrollo', ![...enElPaquete].some((r) => r.startsWith('tools/')));

console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
process.exit(fail ? 1 : 0);
