# ⚡ Dashboard ANDE - Sistema de Monitoreo de Frecuencia Eléctrica

Bienvenido a la documentación oficial del **ANDE Dashboard**, una aplicación web integral para monitorear, comparar y analizar métricas eléctricas en tiempo real y datos históricos. Este documento detalla toda la arquitectura, el funcionamiento interno y los pasos necesarios para instalar, usar y modificar el sistema, ayudando a que cualquier desarrollador pueda tomar control del proyecto al instante.

---

## 🏗️ Arquitectura del Sistema

El proyecto opera como una aplicación monolítica compuesta por un Backend con **Node.js y Express** y un Frontend construido usando **HTML, CSS puro y Vanilla JavaScript**.
Es una aplicación rápida y ligera (sin bundlers pesados tipo Webpack o React), que prioriza el rendimiento al procesar y visualizar cientos de miles de registros desde el servidor web directamente al navegador.

### 📁 Estructura Principal (`/backend`)
*   **`server.js`**: El núcleo de la aplicación. Levanta el servidor Express, aloja todos los endpoints de la API (`/api/datos`, `/api/subir-excel`), maneja las consultas a la base de datos (SQLite) y procesa todo el formateo lógico de archivos subidos en Excel.
*   **`ANDE.db`**: Una base de datos integrada **SQLite** que almacena las mediciones de los alimentadores organizadas de tal manera de facilitar un rápido análisis mensual y anual.
*   **`index.html`**, **`comparacion.html`**, **`limpiar.html`**: Vistas frontend directas para los usuarios, que se comunican continuamente por AJAX vía JSON Fetch.
*   **`script.js`**: Manejador central del lado del cliente. Lee las variables del usuario, envía asincrónicamente los filtros al backend y utiliza la biblioteca **Chart.js** para renderizar gráficos reactivos. Controla las tablas paginadas, exportaciones a JSON/CSV y UI dinámica.
*   **`styles.css`**: Hoja de estilos principal, implementando un diseño moderno, tarjetas translúcidas, esquemas flexbox/CSS grid orientados hacia el diseño UI "glassmorphism"/"modern clean".
*   **`scripts/reimport_from_xlsx.js`**: Importante y crítico script CLI diseñado para realizar un vacío completo y reimportación cruda por terminal de millones de registros directamente al archivo `ANDE.db`. Útil en caso de corrupción severa en el dashboard.

---

## 🗃️ Base de Datos: Esquema y Diseño

El sistema opera bajo SQLite por simplicidad sin servidor (serverless db). Si se decide mover a render en el futuro, existe código residual de `pg` (PostgreSQL), pero actualmente la base primaria es `ANDE.db`.

1.  **Tabla Principal**: `mediciones_completas`
    *   `id` (INTEGER PK AUTOINCREMENT)
    *   `seccion` (TEXT) – **El identificador exacto del ALIMENTADOR** (ej. "ACY1"). ¡A pesar de cómo se llamaba en el excel, acá representa al alimentador!
    *   `anio` (INTEGER) – Año de la medición.
    *   `mes` (INTEGER) – Mes numérico (1-12).
    *   `departamento` (TEXT) – Provincia local.
    *   `local` (TEXT) - Ciudad de la sección general donde opera el alimentador (ej. CAACUPE / CIUDAD DEL ESTE).
    *   `tipo_medicion` (TEXT) – Parámetro técnico medido. Los típicos incluyen `ACCID.DEP`, `PROG.FEP`, `PROD.PENF`, `TOTAL DEP`, etc.
    *   `valor` (REAL) – El valor recolectado en dicho mes.

2.  **Manejo de Unicidad (`unique_medicion`)**:
    Existe un bloque `UNIQUE(seccion, anio, mes, tipo_medicion)`. La base de datos NO permite que el mismo parámetro técnico sea subido dos veces para un mismo alimentador en el mismo mes y año. Si ocurre un conflicto interno desde un Excel, el backend usa una función `INSERT OR REPLACE` u omitirá datos (esto mantiene los registros sanos y evita una inflación brutal o conteos falsos).

---

## 🧠 Funcionamiento Interno del Creador/Subidor de Excel (`/api/subir-excel`)

El dashboard expone un "Uploader" para que un operario mantenga la DB viva enviando archivos `.xlsx` actualizados.
Dado que los excels originales traían formatos complejos ("Pivotes"), así es cómo `server.js` maneja la lectura e interpretación:

1.  **Recepción (`multer`)**: Los archivos Excel se alojan momentáneamente en memoria para no desbordar el disco duro de producción.
2.  **Identificación de la Hoja (Sheet)**: `detectarHojaValida` intenta siempre buscar por nombre hojas como `"FEP DEP PENF - Datos de Prueba"`, ya que es el estándar pactado. Si no la encuentra, intenta evaluar la tabla inferida.
3.  **Mapeo Rígido (Normalización)**:
    *   El sistema automáticamente elimina acentos, unifica textos (mayúscula).
    *   Normaliza variantes raras en los alimentadores. Ejemplo: elimina espacios sueltos de tipeo humano, convirtiendo automáticamente `"NAR 5"` en `"NAR5"`, o `"sri5"` en `"SRI5"` antes de inyectarlos gracias a la función interna `normalizarSeccion`.
4.  **Expansión del Formato Pivote**:
    En el Excel humano hay múltiples columnas de medición alineadas juntas. Sin embargo, en el backend existen las columnas exclusivas. Al encontrar este formato y realizar la expansión pivote, `transformarFilas` filtra ciertas meta-columnas estáticas (como `"SECCION"`, `"PERIODO"`, `"axuMES"`, `"LOCAL"`) por medio del hash set en Javascript (`COLUMNAS_NO_MEDICION_PIVOTE`), impidiendo que por accidente se intenten inyectar en la base de datos como tipos de mediciones validas y corrompiendo el código. Además, prioriza la columna Excel llamada `ALIMENTADOR` para guardarla en el campo SQLite `seccion`. **Esta fue la parte más sensible del parseo.**
5.  **Detección de Duplicados Directos vía Endpoints (Admin)**: Además existe un endpoint `/api/admin/eliminar-duplicados` extra en caso de emergencias por si datos fantasma hubiesen esquivado las protecciones primarias.

---

## 📈 Trazado del Lado Cliente (Visualizando y Entendiendo los Gráficos)

En `script.js` reside un motor enorme de filtros interconectados.

1.  **El Fetch de Datos (`loadData`)**: El selector (por ej. los checkbox) y las cajas de dropdown envían sus `values` crudos como query params HTTP Get a `/api/datos?seccion=ACY1...`.
2.  **Preparación del Request**: El backend genera parámetros SQL eficientes, omitiendo el uso de lentas "SubConsultas Correlacionadas" asegurando que 120,000 registros respondan consistentemente en `< 100ms`.
3.  **Renderizado Global Chart.js (`processChartData`)**:
    *   Si los datos recibidos detectan Multi-Selecciones en la UI (ejemplo, se pidieron múltiples "Años" o múltiples "Alimentadores"), el script interviene creando múltiples *datasets* (series) con colores individualizados proceduralmente gracias a `generateColors()`.
    *   A esto le sumamos el "Tooltip" enriquecido de Chart.js customizado bajo la variable de configuración `plugins`, donde se suma al valor bruto la unidad visual del param.
4.  **Generación de KPIs & Tabla Operativa**: De esos arrays se genera matemática del Total Acumulativo (Suma General), los Máximos, y en el footer un volcado HTML `populateTable(data, currentPage)` manejando los 20 registros max paginados.

---

## 🛠️ Cómo Iniciar y Configurar el Sistema para Colaborar Locales

Cualquier persona del equipo puede agarrar el repositorio e inicializarlo siguiendo cinco pasos base:

### 1. Iniciar Prerrequisitos de Versiones
Para que corra el ecosistema necesitas de forma excluyente mínimo **Node.js (v18+)** que viene con `npm`. SQLite3 viene alojado precompiladamente en dependencias genéricas por lo tanto no requieres bajar bases locales de Windows extra.

### 2. Clonado y Paqueteria
Al estar dentro de la capeta `backend/` deberás ejecutar:
```bash
npm install
```
El `package.json` ya lista todas nuestras librerías (`express`, `cors`, `sqlite3`, `xlsx`, `multer`).

### 3. Encender el Servidor
```bash
npm run dev
# Alternativamente, si hay problemas en un server headless:
node server.js
```
Esto encenderá inmediatamente la API REST y creara el listener en el puerto estipulado o predeterminado (`PORT 10000`). Se imprimirá por consola  un ASCII mostrando el estado sano.

### 4. Ingresar al Panel Principal
Abre en tu navegador la dirección correspondiente al LocalHost predeterminado en `10000` o estipulado con IP. No necesitas acceder a IPs como `index.html` puesto que la carpeta entera es servida con middleware estático (`express.static`).
* Ejemplo: 👉 `http://localhost:10000`

---

## 🧰 Guía de Modificaciones Comunes para Desarrolladores (CheatSheet)

*   **"Deseo habilitar una medición o filtro que no sale desplegado":** En el archivo `script.js`, el inicio de la app dispara `fetchFilters()`. Dicha función lee un Hard-Codificado que arma selectores. Alternativamente debes fijarte en  el backend `server.js` -> `/api/tipos-medicion` ya que extrae dinámicamente un `SELECT DISTINCT tipo_medicion`. Si en el excel la columna tiene nombre distinto o no califica, hay que ajustarlo en `server.js` al subirlo.
*   **"Deseo cambiar las paletas de Colores de los Series de la Grafica":** Ubícate en `script.js` en las funciones `getColorByTipo`, `getColorBySeccion` o el método nativo fallback `generateColors()`. ChartJs las absorbe.
*   **"Deseo editar el diseño responsivo o GlassMorphism":** Los fondos, la distorsión, sombras translúcidas y layout "CSS Grid" para el Dashboard principal están integrados uniformemente en `styles.css`. Fíjate de modificar variables root como `:root` y clases como `.glass-card` y el `backdrop-filter: blur(10px)`.
*   **"El Backend sufre lentitud grave de Timeout":** Previa advertencia revisa que no se haya activado una query de subconsulta como la antigua `WHERE MAX(id)` en tu SQLite de forma inútil. Mantener simple la selectiva y no saturar `unique_medicion` resolverá el 99% de los embudos de hardware. Adicionalmente cerciórate de que SQLite no se corrompió ejecutando por última vez la herramienta oficial `node scripts/reimport_from_xlsx.js --xlsx datos.xlsx --db ANDE.db --truncate`.

---

## 🔒 Variables y Entorno (`.env`)
No es completamente obligatorio, pero se sugiere tener configuradas variables de proceso por si esto despliega a Render/AWS/Cloud:
*   `PORT=10000` (puerto estándar dev)
*   `NODE_ENV=development`
(Aplica Postgres `DATABASE_URL` solo si requieres un uso extendido exterior al `sqlite3`).

¡Gracias por leer y mantener viva esta arquitectura! Cualquier gran bug o pull a resolver comiencen por rastrear `server.js` y todo caerá en su lugar.🚀
