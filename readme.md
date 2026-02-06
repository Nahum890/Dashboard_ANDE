# Dashboard ANDE - Sistema de Monitoreo de Frecuencia Eléctrica

## 📋 Descripción General
**ANDE Dashboard** es una aplicación web para monitorear, comparar y analizar mediciones eléctricas (frecuencia/variables asociadas) por alimentador, año, mes y tipo de medición.

La plataforma está orientada a análisis operativo con visualización avanzada, filtros múltiples, KPIs, tablas paginadas y carga de datos desde Excel.

---

## ✨ Funcionalidades Principales

### 1) Panel de análisis y comparación
- Comparación de series por:
  - **Alimentador (sección)**
  - **Año**
  - **Tipo de medición**
  - **Mes/período**
- Modo de comparación:
  - **Único** (un valor por filtro)
  - **Múltiple** (varios valores por filtro)
- Etiquetas dinámicas que muestran la comparación activa.

### 2) Filtros avanzados
- Selección de:
  - Año (multiselección)
  - Variable / tipo de medición
  - Estación
  - Alimentadores
  - Meses o períodos predefinidos (últimos 3, 6, 12, año actual, año pasado)
- Agrupación de datos por:
  - Alimentador
  - Año
  - Tipo
  - Combinación completa

### 3) Visualizaciones y analítica
- Gráficos interactivos con **Chart.js**.
- KPIs de resumen (series activas, rango, variabilidad, etc.).
- Ranking y visualizaciones comparativas.
- Controles de visualización:
  - Zoom
  - Pantalla completa
  - Mostrar/ocultar leyenda
  - Alternar puntos

### 4) Tabla de datos operativa
- Tabla con:
  - Ordenamiento por columnas
  - Búsqueda
  - Paginación
  - Navegación por páginas
- Indicadores de cantidad de registros mostrados/total.

### 5) Exportación de datos
- Exportación de la vista filtrada en formato **JSON**.

### 6) Carga de Excel integrada
- Sección en el frontend para subir archivos **`.xlsx`** (card visible en el contenido principal) y acceso rápido con botón de ícono Excel en la cabecera.
- Subida al endpoint `POST /api/subir-excel`.
- Validación de archivo y feedback visual de estado (éxito/error/progreso).
- Al terminar una carga exitosa, el dashboard recarga datos automáticamente.
- Incluye apartado de **borrado por rango de fechas** con vista previa de cuántos registros serán eliminados.

---

## 🧠 Flujo de Carga de Excel (Backend)

La carga está diseñada para entornos como Render (filesystem efímero):

- Uso de `multer.memoryStorage()` (RAM, sin guardar en disco).
- Lectura del archivo con `xlsx` desde `req.file.buffer`.
- Inserción en PostgreSQL con transacción:
  - `BEGIN`
  - `INSERT INTO ... ON CONFLICT ON CONSTRAINT unique_medicion DO NOTHING`
  - `COMMIT`
  - `ROLLBACK` en error

Esto garantiza:
- **Atomicidad**: no quedan inserciones parciales si falla una fila.
- **Idempotencia parcial por conflicto**: duplicados se ignoran sin romper el proceso.

---

## 🗃️ Estructura de datos

Tabla objetivo: `mediciones_completas`

Columnas esperadas en Excel (cabeceras):
- `seccion`
- `anio`
- `mes`
- `departamento`
- `tipo_medicion`
- `valor`

Restricción de unicidad:
- `unique_medicion (seccion, anio, mes, tipo_medicion)`

---

## 🔌 Endpoints API

### Estado
- `GET /api/health`  
  Estado del servicio.

### Catálogos/filtros
- `GET /api/tipos-medicion`
- `GET /api/secciones`
- `GET /api/anios`

### Datos principales
- `GET /api/datos?seccion=...&anio=...&tipo_medicion=...&mes=...`

### Carga de archivos
- `POST /api/subir-excel`
  - `multipart/form-data`
  - campo de archivo: `archivo`
- `POST /api/borrar-excel-por-fecha`
  - `application/json`
  - body: `fromDate`, `toDate`, `seccion?`, `tipo_medicion?`, `previewOnly?`

---

## 🛠️ Tecnologías

### Frontend
- HTML5
- CSS3
- JavaScript (Vanilla)
- Chart.js
- Font Awesome

### Backend
- Node.js
- Express
- CORS
- SQLite (lecturas en endpoints actuales)
- PostgreSQL (`pg`) para carga de Excel
- `multer` para upload en memoria
- `xlsx` para parseo de Excel

---

## 📦 Instalación y ejecución

### Prerrequisitos
- Node.js `>=16`
- npm

### Instalar dependencias
```bash
npm install
```

> Si agregas o actualizas la funcionalidad de carga Excel, verifica que estén disponibles:
```bash
npm install multer xlsx pg
```

### Ejecutar en desarrollo
```bash
npm run dev
```

### Ejecutar en producción
```bash
npm start
```

---

## ⚙️ Variables de entorno

Para habilitar la carga a PostgreSQL:

- `DATABASE_URL`: cadena de conexión PostgreSQL.
- `NODE_ENV=production` para usar SSL en la conexión (configurado automáticamente en el pool).

Ejemplo:
```env
DATABASE_URL=postgres://usuario:password@host:5432/base
NODE_ENV=production
PORT=10000
```

---

## 📁 Estructura del proyecto (resumen)

- `server.js` → API Express, conexión DB, endpoints, carga Excel.
- `index.html` → UI principal del dashboard.
- `script.js` → lógica de filtros, gráficos, tabla, exportación y upload.
- `styles.css` → estilos del panel.
- `ANDE.db` → base de datos SQLite local de lectura.

---

## 🧪 Validaciones recomendadas

- Verificar sintaxis:
```bash
node -c server.js
node -c script.js
```

- Probar health check:
```bash
curl http://localhost:10000/api/health
```

---

## 📌 Notas operativas

- En Render, el filesystem es efímero: **no usar almacenamiento en disco para uploads**.
- La carga Excel fue implementada con memoria RAM para cumplir ese requisito.
- Los endpoints existentes de lectura (`/api/datos`, etc.) se mantienen sin cambios funcionales críticos.

---

## 📄 Licencia
MIT
