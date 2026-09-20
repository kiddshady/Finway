# Finway

¿A dónde se fue la guita? Registro de gastos e ingresos con análisis de balances.
Sucesora de **FinWatch** (`C:\tools\FinWatch`), reconstruida desde la plantilla
[Onyx](C:\tools\Onyx) en septiembre de 2026.

```
npm start          # abre la app
npm run dev        # con la consola del renderer en la terminal
npm test           # 136 checks en node pelado
npm run smoke      # 115 checks montando el renderer en Electron
npm run dist       # arma el instalador: dist/Finway Setup X.Y.Z.exe
npm run check-dist # verifica que el paquete traiga todo lo que la app pide
npm run icons      # regenera los PNG, el .ico y la hoja de control
```

La app instalada no ve el repo: un cambio le llega por un **Release** (ver
[Actualizaciones](#actualizaciones)) o reinstalando lo que arma `npm run dist`.

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
src/store.cjs         escritura atómica, settings, docs y colecciones      ← Onyx
src/movimientos.cjs   el dominio: alta, edición, respaldo e importación
src/ipc.cjs           los canales, incluidos los de mov:*                  ← Onyx + dominio
src/updater.cjs       busca, baja y avisa de una versión nueva             ← nació acá, no está en Onyx
renderer/css/         tokens, base, shell, controles, superficies, overlays ← Onyx
renderer/css/finway.css   el par verde/rojo y lo del dominio
renderer/js/          icons, motion, overlays, router, ui, format          ← Onyx
renderer/js/update.js el modal de "está lista" y el estado para Ajustes    ← nació acá, no está en Onyx
renderer/js/fin/      format, categories, stats, charts, quickadd, views, ajustes, calculadora, state, mark
renderer/js/app.js    lo que une las dos mitades
```

Un arreglo en Onyx se trae copiando el archivo de `renderer/js/`, `renderer/css/`
o `src/store.cjs`. Lo de `fin/` y `movimientos.cjs` es de esta app y no viaja.
**La paleta de comandos de Onyx no está**: se sacó entera.

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

## Color

Finway es Onyx con un solo agregado de color: **verde entra, rojo sale**, y el
balance toma el color de su signo. Todo lo demás —el shell, los chips, las
categorías— es acromático, como la plantilla.

**El rojo es `--ox-danger`.** Hubo una etapa con un rojo propio más saturado, para
que la pérdida "pegara"; desde el 17 sep 2026 la app se quiere más fiel a Onyx y
perder plata usa la misma tinta que un fallo del sistema. Si Onyx cambia su
danger, Finway lo sigue sola.

El verde está **emparejado** con ese rojo, y no por el número de croma: en sRGB el
verde no llega tan lejos como el rojo, así que se iguala la luminancia y el
**porcentaje del techo de cada matiz** (~57%). Si el danger cambia, la cuenta se
rehace; el humo mide que sigan pesando igual y que se lean a 11 px.

Las **categorías no tienen color.** En el donut cada gajo toma el gris de su
**puesto** en el mes (el más grande, el más claro) y la leyenda va en ese mismo
orden. Ojo: una rampa con un gris *fijo por categoría* ya se probó y dejó el donut
ilegible; lo que funciona es que el gris lo decida el ranking. El humo mide que la
escalera baje de a escalones visibles y que nada tenga croma.

Toda la escalera sale de dos perillas en
[renderer/css/tokens.css](renderer/css/tokens.css) (`--ox-hue` y `--ox-tint`),
que no se editan a mano:

```
node tools/retint.mjs --hue 285 --tint 1.6
```

El color base está duplicado en hex en `main.cjs` y en el splash del
`index.html` porque Electron no entiende oklch; `npm test` recalcula el hex con
las mismas matrices que Chromium y falla si divergieron.

## Uso

- **Carga rápida** (inspector de Movimientos): tipo → monto → categoría → Enter.
  La fecha default es hoy; si cargás en otro mes, salta a verlo. `Ctrl+N` lleva
  el cursor ahí.
- **Editar**: doble click en la fila, click derecho → Editar, o el lápiz al pasar
  el mouse (Esc cancela).
- **Borrar**: el tacho de la fila o click derecho → Borrar, con confirmación.
- **Meses**: flechas del encabezado o click en una barra del gráfico de flujo.
- **Exportar**: el botón de descarga en Movimientos ofrece el CSV del mes (para
  Excel) o el respaldo completo (para mudarse).
- **Calculadora**: filas de concepto y monto que se suman al tipear, como un
  `SUMA()` de planilla. Enter pasa al campo siguiente y, en el último monto, abre
  una fila nueva. Un monto que no se entiende queda marcado y no suma. Se guarda
  sola en `calculadora.json`, aparte: **no son movimientos** y no tocan el balance.

## El ícono

La **F de barras** de la titlebar y el splash, en baldosa: la versión acromática
de la marca de FinWatch, con la escalera de texto de Onyx resuelta a hex. Reemplazó
al "desvío" verde/rojo el 17 sep 2026. Su geometría es la de `fin/mark.js`: si se
toca una, se tocan los cuatro lugares (mark.js, el splash y los dos masters).

```
npm run icons     # regenera los PNG, el .ico y la hoja de control
```

Hay **dos masters** y los dos se mantienen juntos:

- [assets/icon.svg](assets/icon.svg) para 32 px y más arriba;
- [assets/icon-small.svg](assets/icon-small.svg) para 16 y 24, con el mismo dibujo
  agrandado un 30% dentro de la misma baldosa. La baldosa va al 100% del lienzo
  —es lo que evita que el ícono se vea más chico que el de al lado en la barra de
  tareas—, pero a 16 px eso dejaba el glifo en unos 10 píxeles y el tronco en poco
  más de uno.

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
