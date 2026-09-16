# Finway

¿A dónde se fue la guita? Registro de gastos e ingresos con análisis de balances.
Sucesora de **FinWatch** (`C:\tools\FinWatch`), reconstruida desde la plantilla
[Onyx](C:\tools\Onyx) en septiembre de 2026.

```
npm start        # abre la app
npm run dev      # con la consola del renderer en la terminal
npm test         # 136 checks en node pelado
npm run smoke    # 98 checks montando el renderer en Electron
```

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
renderer/css/         tokens, base, shell, controles, superficies, overlays ← Onyx
renderer/css/finway.css   el par verde/rojo y lo del dominio
renderer/js/          icons, motion, overlays, router, ui, format          ← Onyx
renderer/js/fin/      format, categories, stats, charts, quickadd, views, ajustes, state, mark
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

El shell es acromático (el acento de Onyx es luz) y el color aparece solo donde
es un dato: **verde entra, rojo sale**, y el balance toma el color de su signo.

**El par es el protagonista de esta app.** Una primera versión lo tuvo bajo de
croma y corrido hacia el ladrillo para no chocar con el rojo de error de Onyx; el
resultado tiraba a naranja y no decía lo que tiene que decir. El criterio quedó
invertido: la ganancia y la pérdida mandan, y lo del sistema —`--ox-danger`
incluido— se queda como viene. El botón de borrar pasa a ser el rojo más pálido
de la pantalla y está bien: el error es del sistema, la pérdida es de la app.

Los dos están **emparejados**, y no por tener el mismo número de croma: en sRGB el
verde no llega tan lejos como el rojo (a L=58% el rojo aguanta 0.235 y el verde
0.150), así que igualar la cifra dejaría el verde apagado. Lo que se iguala es la
luminancia y el **porcentaje del techo de cada matiz**. Hay variantes `-text` un
escalón más claras para el texto de 11 px, donde el par pleno no llega a 4,5:1 —
mismo color, la luminancia justa para leerse. El humo mide las dos cosas.

La excepción son las **categorías**, que llevan un abanico: en un donut el color
no decora, es lo único que ata cada gajo con su renglón de la leyenda. Los once
salieron de maximizar la distancia perceptual mínima entre todos los pares, con
croma ≤ .14 y esquivando el verde y el rojo semánticos. El humo mide esa
distancia y falla si alguien aprieta el abanico.

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

## El ícono

Un **desvío**: entra un caudal y se parte, una rama sube en verde y la otra baja
en rojo. No tiene nada que ver con la F de barras de FinWatch, a propósito.

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

## Lo que falta

- **Empaquetado NSIS**: el `.ico` ya está listo para `build.win.icon`.
- **El tray**: FinWatch se esconde al tray al cerrar. Onyx no trae eso y acá
  todavía no está.
