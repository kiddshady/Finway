# Finway

¿A dónde se fue la guita? Registro de gastos e ingresos con análisis de balances.
Sucesora de **FinWatch** (`C:\tools\FinWatch`), reconstruida desde la plantilla
[Onyx](C:\tools\Onyx) en septiembre de 2026.

```
npm start        # abre la app
npm run dev      # con la consola del renderer en la terminal
npm test         # 136 checks en node pelado
npm run smoke    # 92 checks montando el renderer en Electron
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
El rojo del gasto está corrido hacia el ladrillo para que `--ox-danger` siga
queriendo decir que algo se rompió.

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

## Lo que falta

- **La marca del sistema**: la "F" está en la titlebar y en el splash, pero la
  app todavía no tiene íconos propios (`assets/`) ni empaquetado NSIS. FinWatch
  los tiene en `scripts/make-icons.cjs` y son portables.
- **El tray**: FinWatch se esconde al tray al cerrar. Onyx no trae eso y acá
  todavía no está.
