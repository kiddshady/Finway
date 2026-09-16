/* ═══════════════════════════════════════════════════════════════════════════
   FINWAY — generador de íconos
   Rasteriza `assets/icon.svg` a todos los tamaños, arma el .ico de Windows y
   deja una hoja de control para mirar cómo quedó cada uno.

       npm run icons

   Por qué con Electron y no con una librería: el que va a dibujar el ícono en
   la barra de tareas es Chromium, así que lo rasterizamos con Chromium. Y cada
   tamaño se dibuja A SU TAMAÑO desde el SVG, no achicando el de 256: achicando,
   el navegador promedia y todo se ve suavecito; rasterizando al tamaño real, el
   trazo se redondea a píxeles enteros, que es lo que se va a ver de verdad.

   El .ico se arma a mano. No hace falta una dependencia para eso: un .ico no es
   más que un índice y los PNG pegados atrás.
   ═══════════════════════════════════════════════════════════════════════════ */

import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');
const MASTER = path.join(ASSETS, 'icon.svg');
/* Los tamaños chicos usan un master con el glifo agrandado dentro de la misma
   baldosa: a 16 px el dibujo del master grande queda en unos 10 píxeles y el
   trazo en poco más de uno. Es la misma idea que en Moji — a tamaño de tray la
   geometría se ajusta al píxel en vez de confiar en el escalado. */
const MASTER_CHICO = path.join(ASSETS, 'icon-small.svg');
const HASTA_CHICO = 24;

/* 16 y 32 son los que más se ven (tray y barra de tareas); 256 es el que lee
   Nexus y el que muestra Windows en la vista grande. */
const TAMANOS = [16, 24, 32, 48, 64, 128, 256, 512];
const EN_EL_ICO = [16, 24, 32, 48, 64, 128, 256];

/** Un .ico: cabecera, un índice de 16 bytes por imagen, y los PNG atrás. */
function armarIco(pngs) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0);            // reservado
  cabecera.writeUInt16LE(1, 2);            // 1 = ícono
  cabecera.writeUInt16LE(pngs.length, 4);

  const indice = Buffer.alloc(16 * pngs.length);
  let offset = cabecera.length + indice.length;

  pngs.forEach(({ lado, buf }, i) => {
    const p = i * 16;
    // 0 significa 256: el campo es de un byte y no llega a 256.
    indice.writeUInt8(lado >= 256 ? 0 : lado, p);
    indice.writeUInt8(lado >= 256 ? 0 : lado, p + 1);
    indice.writeUInt8(0, p + 2);           // colores de paleta (0 = sin paleta)
    indice.writeUInt8(0, p + 3);           // reservado
    indice.writeUInt16LE(1, p + 4);        // planos
    indice.writeUInt16LE(32, p + 6);       // bits por píxel
    indice.writeUInt32LE(buf.length, p + 8);
    indice.writeUInt32LE(offset, p + 12);
    offset += buf.length;
  });

  return Buffer.concat([cabecera, indice, ...pngs.map((p) => p.buf)]);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  if (!fs.existsSync(MASTER)) {
    console.error(`No encuentro el master: ${MASTER}`);
    app.exit(1);
    return;
  }
  const svg = fs.readFileSync(MASTER, 'utf8');
  const svgChico = fs.existsSync(MASTER_CHICO) ? fs.readFileSync(MASTER_CHICO, 'utf8') : svg;

  const win = new BrowserWindow({ width: 600, height: 400, show: false });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<meta charset="utf-8"><body>'));

  /* El rasterizado pasa en la página: se carga el SVG como imagen y se lo
     dibuja en un canvas del tamaño pedido. El dataURL vuelve por IPC. */
  const dataURLs = await win.webContents.executeJavaScript(`
    (async () => {
      const cargar = (texto) => new Promise((ok, mal) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = mal;
        i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(texto);
      });
      const grande = await cargar(${JSON.stringify(svg)});
      const chico  = await cargar(${JSON.stringify(svgChico)});
      const salida = {};
      for (const lado of ${JSON.stringify(TAMANOS)}) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = lado;
        const cx = cv.getContext('2d');
        cx.drawImage(lado <= ${HASTA_CHICO} ? chico : grande, 0, 0, lado, lado);
        salida[lado] = cv.toDataURL('image/png');
      }
      return salida;
    })()
  `);

  const pngs = [];
  for (const lado of TAMANOS) {
    const buf = Buffer.from(dataURLs[lado].split(',')[1], 'base64');
    fs.writeFileSync(path.join(ASSETS, `icon_${lado}.png`), buf);
    pngs.push({ lado, buf });
    console.log(`  icon_${lado}.png  ${String(buf.length).padStart(6)} bytes`);
  }

  const ico = armarIco(pngs.filter((p) => EN_EL_ICO.includes(p.lado)));
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), ico);
  console.log(`  icon.ico       ${String(ico.length).padStart(6)} bytes  (${EN_EL_ICO.join(', ')})`);

  /* La hoja de control: cada tamaño tal cual y ampliado por vecino más cercano.
     Es la única forma de ver si el glifo sobrevive chiquito, que es donde se
     decide un ícono. */
  const hoja = path.join(ASSETS, 'contacto.png');
  /* El alto lo manda la caja más alta: el zoom de 96, abajo el ícono a tamaño
     real (hasta 64) y el rótulo. Con un alto fijo, las cajas grandes se cortan
     por arriba y la hoja miente sobre el ícono. */
  const alto = 96 + 64 + 24 + 40;
  await win.webContents.executeJavaScript(`
    (async () => {
      const urls = ${JSON.stringify(dataURLs)};
      const lados = ${JSON.stringify([16, 24, 32, 48, 64])};
      document.body.style.cssText = 'margin:0;background:#17191d;display:flex;align-items:flex-end;gap:18px;padding:18px;font:11px system-ui;color:#8d939d';
      for (const lado of lados) {
        const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = urls[lado]; });
        const caja = document.createElement('div');
        caja.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px';
        const zoom = document.createElement('canvas');
        zoom.width = zoom.height = 96;
        const cz = zoom.getContext('2d');
        cz.imageSmoothingEnabled = false;
        cz.drawImage(img, 0, 0, 96, 96);
        zoom.style.imageRendering = 'pixelated';
        const real = document.createElement('img');
        real.src = urls[lado];
        caja.append(zoom, real, Object.assign(document.createElement('div'), { textContent: lado + ' px' }));
        document.body.appendChild(caja);
      }
      return true;
    })()
  `);
  win.setContentSize(5 * 114 + 36, alto);
  win.show();
  await new Promise((r) => setTimeout(r, 900));
  await win.webContents.capturePage();                 // la primera sale vacía
  await new Promise((r) => setTimeout(r, 300));
  const shot = await win.webContents.capturePage();
  fs.writeFileSync(hoja, shot.toPNG());
  console.log(`  contacto.png   hoja de control con los tamaños chicos`);

  app.exit(0);
});
