# Finway

¿A dónde se fue la guita? Registro de gastos e ingresos con análisis de balances.
Sucesora de **FinWatch** (`C:\tools\FinWatch`), nacida de la plantilla
[Onyx](C:\tools\Onyx) en septiembre de 2026 y rediseñada desde cero como
**Finway Terminal** en octubre de 2026: una terminal financiera oscura, con la
letra de las terminales DEC, un acento ámbar de fósforo y un filtro CRT.

```
npm start          # abre la app
npm run dev        # con la consola del renderer en la terminal
npm test           # 230 checks en node pelado
npm run smoke      # 88 checks montando el renderer en Electron y usándolo con el teclado
npm run dist       # arma el instalador: dist/Finway Setup X.Y.Z.exe
npm run check-dist # verifica que el paquete traiga todo lo que la app pide
npm run icons      # regenera los PNG, el .ico y la hoja de control
```

La app instalada no ve el repo: un cambio le llega por un **Release** (ver
[Actualizaciones](#actualizaciones)) o reinstalando lo que arma `npm run dist`.

Las maquetas que se aprobaron antes de implementar (el diseño y los íconos) viven
en `docs/maquetas/`, que **no se versiona**: la del diseño lleva datos reales
embebidos y el repo es público.

## Traer los datos de FinWatch

En **Ajustes → Importar un respaldo**. Acepta:

- el respaldo de FinWatch (`finwatch-respaldo-AAAA-MM-DD.json`, que se genera desde
  Movimientos → el botón de exportar → *Todo a un respaldo*);
- el respaldo de Finway;
- y el archivo de datos crudo de cualquiera de las dos, sin envoltorio.

Importar **fusiona por id**: agrega lo que falta y deja lo que ya está, así que
importar dos veces el mismo archivo no duplica nada. Las filas inválidas se
descartan contándolas — un import no se aborta entero por una fila rota, avisa
"entraron 118 de 119".

## Cómo está partido

```
src/store.cjs           escritura atómica, settings, docs y colecciones     ← Onyx
src/movimientos.cjs     el dominio: alta, edición, respaldo e importación
src/ipc.cjs             los canales, incluidos los de mov:*                 ← Onyx + dominio
src/updater.cjs         busca, baja y avisa de una versión nueva
renderer/css/tokens.css     la paleta Terminal (con los nombres --ox-* del motor)
renderer/css/shell.css      el chasis: titlebar, cinta, escenario, línea de carga, teclas, CRT
renderer/css/terminal.css   panel, tecla, botón, campo, medidor… y los overlays en idioma Terminal
renderer/css/finway.css     las seis pantallas
renderer/css/(base, motion, controls, surfaces, overlays)   ← el motor de Onyx
renderer/js/(icons, motion, overlays, router, ui, format)   ← el motor de Onyx
renderer/js/fin/term.js       piezas compartidas: rodar(), relevo(), panel, variación, medidor
renderer/js/fin/pixeles.js    los íconos de píxel (7×7) que reemplazan a los de Onyx
renderer/js/fin/mark.js       la F de píxel: titlebar, splash y masters del ícono
renderer/js/fin/linea.js      el intérprete de la línea de carga (puro, con su test)
renderer/js/fin/carga.js      la línea de carga cableada
renderer/js/fin/formulario.js el formulario de un movimiento, en un modal (Ctrl+N, editar)
renderer/js/fin/pantalla.js   las preferencias del CRT y de la cinta
renderer/js/fin/(resumen, movimientos, presupuestos, metas, calculadora, ajustes).js   las pantallas
renderer/js/fin/(state, stats, plan, format, categories, trend, quickadd, mark).js     el dominio
renderer/js/app.js      lo que une todo: pantallas por tecla, chrome, teclado global, arranque
```

El motor (router, modales, menús, toasts, tooltips, movimiento) sigue siendo el de
Onyx, y por eso las clases y los tokens del motor conservan el prefijo `ox-`. La
cara es propia (`fw-`). **No hay paleta de comandos** ni la va a haber: cada
acción está a la vista o en una tecla documentada.

Dos APIs en el renderer, a propósito: `window.onyx` es la del **framework** y
significa lo mismo en todas las apps de Onyx; `window.fw` es el **dominio** de
esta. Mezclarlas rompería esa garantía.

## Los datos

Un JSON en el directorio de datos (`FINWAY_DATA`, o `data/` al lado del código),
escrito por el store de Onyx: temporal de nombre único, `fsync` explícito antes
del rename, reintentos por el `EPERM` de Windows, y un archivo corrupto se aparta
en vez de pisarse.

**Sin cache en memoria**: cada operación relee el disco. No es descuido — una
instancia vieja viva en el tray, con su propia foto de los datos, puede pisar el
archivo entero al guardar. Releyendo siempre, la mutación de una ventana dormida
se integra en vez de borrar.

## Terminal

- **Sin rail.** La navegación son las teclas de función de abajo: **F1** Resumen,
  **F2** Movimientos, **F3** Presupuestos, **F4** Metas, **F5** Calculadora,
  **F6** Ajustes. La pantalla entera es para los datos.
- **Paneles numerados** (01, 02…) con la cifra como protagonista.
- **La cinta de cotizaciones** arriba: balance, ingresos, gastos, drenaje diario y
  las categorías top, con su variación contra el mes anterior. Se frena con el
  mouse encima; Ajustes la deja quieta.
- **Un solo acento: ámbar.** Marca lo activo y lo que se puede tocar. Verde y rojo
  quedan para lo que entra y lo que sale, y para las variaciones (gastar más es
  rojo, ganar más es verde). Las categorías tienen su color
  ([categories.js](renderer/js/fin/categories.js)) y aparecen solo donde
  identifican una categoría; nunca en una cifra.
- **Íconos de píxel**: los de adentro están dibujados en la grilla de la letra (7×7,
  a 14 px o a 7), en [fin/pixeles.js](renderer/js/fin/pixeles.js); reemplazan a los
  de Onyx con el mismo nombre. Un tamaño que no sea múltiplo de 7 los deja borrosos.
- **VT323 para todo**, empaquetada (con su licencia OFL en `renderer/fonts/`),
  escalada con `font-size-adjust` porque su x es baja.
- **Filtro CRT** (scanlines de 3 px calibradas a los pixeles reales de la
  pantalla, viñeta y resplandor de fósforo): no / suave / fuerte, en Ajustes.
- **Nada de vidrio.** Todo opaco; la profundidad la dan los paneles y las sombras.

El color base está duplicado en hex en `main.cjs` y en el splash del
`index.html` porque Electron no entiende oklch; `npm test` recalcula el hex con
las mismas matrices que Chromium y falla si divergieron.

## Uso

- **La línea de carga** (abajo de todo, `/` la enfoca): `gasto 4500 transporte uber`
  y Enter. Las palabras van en cualquier orden: el tipo (gasto, ingreso, g, i; un
  `+` delante del monto también es ingreso), el monto (`4.500`, `4500,50`, `12k`),
  la categoría por su nombre o el principio (`transp`, `educ`), la fecha (`ayer`,
  `12/9`) y el resto es la nota. Mientras se escribe se ve cómo se entendió cada
  parte. `↑` con la línea vacía trae la última que se guardó.
- **El formulario completo** (`Ctrl+N`): tipo, monto, categorías, nota y fecha con
  su calendario. Es el mismo que se abre al editar.
- **Movimientos** (F2): el libro del mes con el **saldo corrido**. `↑↓` elige,
  `E` / doble clic / clic derecho editan, `Supr` borra (con confirmación),
  `T`/`G`/`I` filtran por tipo, `C` por categoría, `F` escribe en el filtro de
  texto, `X` exporta (el CSV de lo filtrado, o el respaldo de todo).
- **Meses**: `←` `→` en Resumen, Movimientos y Presupuestos; `Inicio` vuelve al de
  hoy; un clic en una columna del panel 05 lleva a ese mes.
- **Tendencia por categoría**: el panel 03 del Resumen en modo TENDENCIA (6 o 12
  meses). Click en un chip prende o apaga su línea, doble click deja solo esa.
- **Presupuestos** (F3): el tope se escribe en la fila. El medidor de bloques
  muestra lo gastado, la proyección a este ritmo (bloques tenues) y una raya con
  cuánto del mes ya pasó. El panel *Lectura* lo dice en criollo.
- **Metas** (F4): aportar y retirar se hace en la ficha, en una línea (monto,
  nota, Enter). Los aportes **no son movimientos** y no tocan el balance.
- **Calculadora** (F5): hasta seis hojas de concepto y monto, como un `SUMA()` de
  planilla. Llenar la última fila abre otra; un monto que no se entiende queda
  marcado («1 NO SUMA»). `N` abre una hoja nueva. Se guardan en
  `calculadora.json`, aparte de los movimientos.

## El ícono

La **F de barras**, de píxel, en baldosa: el stem y tres brazos que se van
apagando, hechos de bloques de una grilla, con el stem bajando en cuatro
escalones de ámbar (`--fw-mark-*`: `#F8AC3D`, `#B97F2B`, `#805307`, `#5C3A02`).
Es la misma F de la titlebar y del splash. Antes fue de barras redondeadas
acromáticas (Onyx), y antes el "desvío" verde/rojo.

**Una sola fuente:** [renderer/js/fin/mark.js](renderer/js/fin/mark.js) define la
forma en dos grillas (11 y 16 celdas). De ahí salen la marca de la titlebar, el
splash del `index.html` (pegado a mano: `node tools/icono.mjs --splash`; `npm test`
avisa si divergió) y los masters del ícono.

```
npm run icono     # escribe los masters de assets/ desde mark.js (node pelado)
npm run icons     # los rasteriza: los PNG, el .ico y la hoja de control
```

**Un master por tamaño chico** (`icon-16.svg` … `icon-64.svg`) más `icon.svg` para
128/256/512: la F es pixel art y una celda que no cae en píxeles enteros se ve
borrosa, así que cada tamaño usa la grilla y la celda que le caen justas (la tabla
está en `tools/icono.mjs`). Los masters se generan: no se editan a mano.

**El CRT**, de 48 px para arriba, es la receta del ícono de NTX en ámbar: la
baldosa en degradé vertical apenas más claro arriba, scanlines que restan luz solo
sobre la baldosa, y la F nítida encima con un halo de fósforo. De 128 para arriba
cada celda va suelta, con una luz finita alrededor: la F se lee como una matriz de
puntos.

Los masters llevan un comentario adelante: un `--` adentro de un comentario es XML
inválido, el SVG no carga y `npm run icons` falla (antes se quedaba colgado).

`assets/contacto.png` es la hoja de control: cada tamaño chico ampliado por vecino
más cercano. **Es la única forma de decidir un ícono** — rasterizado a su tamaño
real el trazo se redondea a píxeles enteros, y ahí aparece la mancha que achicando
el de 256 no se ve nunca.

## El tray y la instancia única

**Cerrar la ventana la esconde al tray**, no mata la app. Se sale de verdad desde el
menú del tray (click derecho → *Salir*); un click simple sobre el ícono la vuelve a
mostrar. Al volver, el renderer relee el disco, así que lo que se haya escrito mientras
dormía aparece solo.

Por eso hay **una sola instancia**: con la app viva y escondida, un doble click en el
acceso directo levantaría una segunda, y serían dos procesos escribiendo el mismo
archivo. La segunda se va enseguida y la primera se muestra.

El ícono del tray se arma con las tres resoluciones (16, 24 y 32) y no con el `.ico`:
en Electron 40 `nativeImage` lee el `.ico` a 256 y Windows lo achicaría al tamaño del
tray — justo el escalado que el master chico existe para evitar.

## Actualizaciones

La app instalada **se actualiza sola** desde los Releases de
[github.com/kiddshady/Finway](https://github.com/kiddshady/Finway). A los 8 segundos
de arrancar mira si hay una versión más nueva, la baja en silencio, y recién cuando
está lista pregunta *¿Reiniciar ahora?*. Nunca reinicia sola. Si se elige *Más tarde*,
queda un botón en **Ajustes → Acerca de**, un ítem *Instalar la X.Y.Z* en el menú del
tray, y de todas formas se instala al salir desde el tray (o al apagar Windows).

Corriendo desde el repo no se actualiza: `electron-updater` se niega con la app sin
empaquetar, así que ni se le pide, y Ajustes lo dice.

Lo que lee es el `latest.yml` que electron-builder deja junto al instalador en cada
Release. **Publicar una versión** es bumpear y pushear el tag; el resto lo hace el
workflow de [.github/workflows/release.yml](.github/workflows/release.yml) en un
runner de Windows:

```
npm version minor -m "Finway %s: qué trae"   # (o patch / major) bumpea y crea el tag vX.Y.Z
git push --follow-tags                       # dispara el build; el Release aparece en unos minutos
```

El cuerpo del mensaje del tag (`git tag -a` con más de una línea, o editarlo
después) son las notas del Release. El workflow crea el borrador **antes** de
armar el instalador —si lo creara electron-builder, sus subidas en paralelo
harían un borrador cada una— y lo publica recién con los tres archivos arriba:
un borrador no cuenta como actualización, así nadie baja un release a medias.

El workflow se niega si el tag no coincide con el `version` de package.json: el
instalador y el `latest.yml` salen del package.json, y un tag desfasado publicaría
una versión con otro número del que dice. Un Release marcado como *pre-release* o
en borrador no cuenta como actualización.

El renderer no tiene red ni fs: el updater vive entero en el main
([src/updater.cjs](src/updater.cjs)) y le manda el estado por `update:status`;
[renderer/js/update.js](renderer/js/update.js) lo refleja. Los dos nacieron acá y son
candidatos a viajar a Onyx.

## Empaquetado

**Instalada, los datos van a `%APPDATA%Finwaydata`.** No es un detalle: la raíz de
desarrollo (`data/` al lado del código) cae adentro de `app.asar`, que es de solo
lectura, y como el store atrapa sus errores de escritura, cada guardado fallaría **en
silencio** — la app abre, se carga un movimiento, se ve en pantalla, y al reiniciar no
está. `src/store.cjs` detecta `app.isPackaged` y cambia de raíz.

**`build.files` es una lista blanca**: lo que no está nombrado no entra al paquete, y
eso no se nota nunca corriendo desde el repo. `npm run check-dist` no confía en una lista
escrita a mano: **descubre** lo necesario leyendo el código (los `<link>` y `<script>`
del index, los `import` en árbol, las fuentes de los CSS, los `require` del main y los
assets que lee en runtime) y lo compara contra el índice del `.asar`. Distingue dos
errores con arreglos distintos: un archivo que existe en el repo y no entró al paquete
(revisar `build.files`) y uno que el código pide y no existe en ningún lado (un typo).
