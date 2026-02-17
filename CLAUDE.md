# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ANDE Dashboard — a single-user web app for monitoring and analyzing electrical measurements (frequency/variables) by feeder, year, month, and measurement type for ANDE (Administración Nacional de Electricidad), Eastern Zone, Paraguay. Database is SQLite. The project is in Spanish.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Development server with nodemon auto-reload (port 10000)
npm start            # Production server (port 10000)
node -c server.js    # Syntax check backend
node -c script.js    # Syntax check frontend
```

No test framework is configured. Validate manually with syntax checks and `GET /api/health`.

## Architecture

This is a **monolithic full-stack app** with no build step or bundler. The frontend is vanilla HTML/CSS/JS served as static files by Express.

### Key Files (all at project root)

- **`server.js`** (~700 lines) — Express API server. SQLite3 for reads, multer+xlsx for Excel uploads. All API endpoints defined here.
- **`script.js`** (~2400 lines) — Single ES6 class `ANDEDashboard` containing all frontend logic: filtering, Chart.js rendering (5 charts), data table with pagination/sorting, Excel upload UI.
- **`index.html`** (~630 lines) — Dashboard layout: navbar, collapsible sidebar with filters, main content with charts and data table.
- **`styles.css`** (~1900 lines) — All styling including responsive breakpoints and animations.
- **`ANDE.db`** — SQLite database file (not in git).

### Backend (server.js)

Express app with these API endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/datos?seccion=&anio=&tipo_medicion=&mes=&periodo=` | Main data query (supports comma-separated multi-values) |
| `GET /api/tipos-medicion` | List measurement types |
| `GET /api/secciones` | List feeder sections |
| `GET /api/anios` | List available years |
| `GET /api/cargas` | List Excel upload history |
| `DELETE /api/cargas/:id` | Delete upload and cascade data |
| `POST /api/subir-excel` | Upload Excel file (field name: `archivo`) |
| `GET /api/estadisticas` | Global record counts |

Database helper: `ejecutarConsulta(sql, params)` returns a Promise wrapping `db.all()`.

Excel upload flow: multer memoryStorage → xlsx parse from buffer → SQLite transaction (BEGIN → INSERT OR REPLACE → COMMIT/ROLLBACK).

### Frontend (script.js)

The `ANDEDashboard` class manages everything:

- **State**: `this.filters`, `this.globalMode` ('unique'/'multiple'), `this.selectionMode` ('manual'/'station'/'all'), `this.groupBy`, `this.pagination`, `this.selectedMonths`
- **Data flow**: Filter change → 500ms debounce → `loadData()` fetch to `/api/datos` → `updateCharts()` + `updateTable()`
- **Charts** (Chart.js v4): mainChart (line), rankingChart (bar), scatterChart, pieChartByFeeder, pieChartByType, stationSummaryChart
- **Data transform**: API rows are mapped to `{transformador, frecuencia, fecha, tipo, departamento, year, month, combinationKey, combinationLabel}`

### Database Schema

Main table: `mediciones_completas`
```sql
(id INTEGER PRIMARY KEY, seccion TEXT, anio INTEGER, mes INTEGER,
 departamento TEXT, tipo_medicion TEXT, valor REAL, carga_id INTEGER,
 UNIQUE(seccion, anio, mes, tipo_medicion))
```

Supporting table: `cargas_excel` — tracks upload batches with status.

## Environment Variables

- `PORT` — Server port (default: 10000)

## Deployment

Render deployment uses `render-build.sh` to rebuild sqlite3 for Linux. Filesystem is ephemeral — uploads use memory storage only, no disk writes.
