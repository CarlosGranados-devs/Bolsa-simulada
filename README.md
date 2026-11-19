# Bolsa Simulada SV

Simulador de bolsa de valores con empresas ficticias salvadoreñas. La aplicación se presenta como una terminal financiera: fondo oscuro, acentos rojos, tipografía monoespaciada, precios que cambian en vivo, noticias de mercado y un ticket de orden para comprar y vender acciones.

Todo el sistema funciona en el navegador. No hay backend ni servicios externos: la base de datos es SQLite compilado a WebAssembly mediante `sql.js`, se guarda como un binario en IndexedDB y se recupera automáticamente al volver a abrir la página.

> Simulador con datos ficticios. No es asesoría financiera.

## Características

- Terminal bursátil de una sola pantalla con empresas, gráfico de precios, noticias, ticket de orden, formulario de emisión, portafolio e historial de operaciones.
- CRUD completo de empresas: crear (IPO), listar, editar y sacar de bolsa.
- Compra y venta de acciones con validación de efectivo, cantidad y posición disponible.
- Motor de mercado activo cada 2 segundos con paseo aleatorio, volatilidad por empresa y reversión a la media.
- Noticias aleatorias con impacto en el precio y registro en el feed del mercado.
- Gráfico de área con el historial de precios de la empresa seleccionada.
- Persistencia automática en IndexedDB con respaldo en memoria si el almacenamiento no está disponible.
- Interfaz responsive: escritorio en tres columnas y móvil en una sola columna.
- Confirmaciones propias con `<dialog>` y avisos tipo toast, sin `alert`, `confirm` ni `prompt`.
- Intro de terminal de 1.85 segundos, saltable y visible una sola vez por sesión.
- Accesibilidad básica: `lang="es"`, etiquetas en formularios, foco visible, enlace de salto y regiones con `aria-live`.
- Sin emojis, sin fuentes externas y sin CDN.

## Tecnologías

| Tecnología | Uso |
| --- | --- |
| Vite | Servidor de desarrollo y empaquetado |
| TypeScript | Tipado estricto de modelos, vistas y controladores |
| sql.js | SQLite compilado a WebAssembly |
| IndexedDB | Persistencia del binario exportado de SQLite |
| lightweight-charts | Gráfico de precios |
| CSS | Diseño de terminal, animaciones y responsive |

## Estructura del proyecto

```text
bolsa-simulada-sv/
  index.html
  package.json
  vite.config.ts
  tsconfig.json
  README.md
  .gitignore
  public/
    favicon.ico
  src/
    main.ts
    db/
      database.ts
    models/
      types.ts
      validation.ts
      company.ts
      trading.ts
      market.ts
      news.ts
    views/
      format.ts
      chart.ts
      notifications.ts
      terminalView.ts
    controllers/
      terminalController.ts
    styles/
      styles.css
```

- `src/db/database.ts`: inicialización de sql.js, esquema, datos semilla, transacciones y persistencia en IndexedDB.
- `src/models/`: reglas de negocio de empresas, mercado, noticias, operaciones y validaciones.
- `src/views/`: construcción del DOM, formato de números, gráfico, diálogos, toasts e intro.
- `src/controllers/terminalController.ts`: coordinación entre los modelos y las vistas, intervalo del mercado y acciones del usuario.
- `src/styles/styles.css`: tema visual, animaciones, estados y puntos de quiebre.

## Requisitos

- Node.js 20 o superior.
- npm 10 o superior.
- Navegador moderno con WebAssembly e IndexedDB (Chrome, Edge, Firefox o Safari recientes).

## Instalación y uso

```bash
npm install
npm run dev
```

Vite publica el sitio en `http://localhost:5173`.

Para compilar y probar la versión de producción:

```bash
npm run build
npm run preview
```

La compilación genera la carpeta `dist/` con el HTML, los estilos, el JavaScript y el archivo `sql-wasm.wasm` necesarios para ejecutar la aplicación.

## Cómo se usa

1. La terminal abre con ocho empresas ficticias, un efectivo inicial de USD 10,000.00 y noticias de mercado.
2. Selecciona una empresa en la tabla para cargar su gráfico, su precio actual y su posición.
3. En el ticket de orden elige Comprar o Vender, escribe una cantidad entera y ejecuta la operación.
4. Usa el formulario de nueva emisión para registrar una empresa con ticker único, nombre, sector, precio inicial y volatilidad.
5. En cada fila de la tabla puedes Editar los datos de la empresa o Eliminar para sacarla de bolsa. Si tienes acciones de esa empresa, se liquidan al último precio y la venta queda registrada.
6. El botón Reiniciar simulación pide confirmación y devuelve el mercado, el efectivo, el portafolio y el historial a los datos iniciales.

## Base de datos

El esquema se crea automáticamente la primera vez que se abre la aplicación.

- `companies`: empresas que cotizan, con ticker único, nombre, sector, precio, cierre anterior y volatilidad.
- `price_history`: puntos de precio por empresa. Se conservan como máximo 500 por empresa.
- `holdings`: cantidad y costo promedio de las acciones que posee el usuario.
- `trades`: historial de compras y ventas. El ticker se conserva aunque la empresa se elimine.
- `account`: efectivo disponible y efectivo inicial. Solo existe una cuenta.
- `news`: noticias generadas con su impacto y fecha.

Las operaciones que tocan varias tablas se ejecutan dentro de transacciones de SQLite.

## Motor de mercado

- Cada 2 segundos se actualiza el precio de todas las empresas.
- El cambio combina un choque aleatorio proporcional a la volatilidad de la empresa con una fuerza de reversión hacia el precio de cierre anterior.
- El precio nunca baja de USD 0.50 y siempre se redondea a dos decimales.
- En cada tick hay un 5% de probabilidad de generar una noticia. La noticia mueve el precio de una empresa entre 3% y 8%, se guarda en la base y aparece en el feed.
- Cada actualización agrega un punto al historial y recorta los puntos antiguos para respetar el límite de 500 por empresa.
- La base se guarda cada 10 ticks y también al ocultar o cerrar la página.

## Persistencia

`database.ts` exporta la base con `db.export()` y guarda el binario en IndexedDB con un debounce de 700 ms después de cada escritura. En el arranque se intenta leer el registro guardado:

- Si existe, se carga con `new SQL.Database(bytes)`.
- Si no existe, se crea la base, se ejecutan el esquema y los datos semilla.
- Si IndexedDB no está disponible o falla, la aplicación continúa en memoria y no muestra errores en consola.

## Validaciones

- El ticker debe tener entre 2 y 5 letras mayúsculas, sin números ni símbolos, y no puede repetirse.
- El nombre de la empresa es obligatorio.
- El precio inicial debe ser mayor que cero.
- La volatilidad debe estar entre 0.1% y 8%.
- La cantidad de una orden debe ser un entero mayor o igual a 1.
- No se puede comprar sin efectivo suficiente ni vender más acciones de las que se poseen.

Los mensajes de error se muestran junto al formulario o al ticket y también como toast.

## Despliegue en Vercel

1. Importa el repositorio en Vercel.
2. Selecciona el framework Vite.
3. Usa `npm run build` como comando de compilación.
4. Usa `dist` como directorio de salida.
5. No se necesitan variables de entorno.

El sitio es completamente estático y no requiere funciones serverless.

## Datos ficticios

Las empresas, tickers, precios, noticias y movimientos de este simulador son inventados y se usan solo con fines académicos y demostrativos. No representan valores reales ni constituyen asesoría financiera.

## Autor

Carlos Josue Manajo Granados
