#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const XLSX = require('xlsx');

function argValue(flag, def = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return def;
  return process.argv[idx + 1] || def;
}

const dryRun = process.argv.includes('--dry-run');
const truncate = process.argv.includes('--truncate');
const excelPath = path.resolve(argValue('--xlsx', 'datos.xlsx'));
const dbPath = path.resolve(argValue('--db', 'ANDE.db'));

function normalizeHeader(v) {
  if (v === undefined || v === null) return '';
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function normalizeText(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function normalizeSection(v) {
  if (v === undefined || v === null) return '';
  let s = String(v).trim().toUpperCase();
  // Remove spaces between letter groups and digit groups: "NAR 5" -> "NAR5", "PBU 01" -> "PBU01"
  s = s.replace(/\b([A-Z]+)\s+(\d+[A-Z0-9]*)\b/g, '$1$2');
  return s;
}

function monthToNumber(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = Math.trunc(v);
    if (n >= 1 && n <= 12) return n;
    if (n >= 190001 && n <= 299912) {
      const m = n % 100;
      return m >= 1 && m <= 12 ? m : null;
    }
    return null;
  }
  const raw = String(v).trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (!Number.isNaN(n)) {
    if (n >= 1 && n <= 12) return n;
    if (n >= 190001 && n <= 299912) {
      const m = n % 100;
      return m >= 1 && m <= 12 ? m : null;
    }
  }
  const mes = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
    noviembre: 11, diciembre: 12, jan: 1, feb: 2, mar: 3, apr: 4,
    may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  return mes[normalizeHeader(raw)] || null;
}

// Columns that are NOT measurement types and should be excluded from pivot expansion
const NON_MEASUREMENT_COLUMNS = new Set([
  'seccion', 'alimentador', 'anio', 'ano', 'mes',
  'departamento', 'local', 'axumes', 'periodo',
  'tipo_medicion', 'tipo', 'valor', 'seccion_ciudad'
]);

function isNonMeasurementColumn(headerNormalized) {
  return NON_MEASUREMENT_COLUMNS.has(headerNormalized);
}

function mapRow(row) {
  const out = {};
  const headersNormalized = {};

  // First pass: normalize all headers and detect if both ALIMENTADOR and SECCION exist
  let hasAlimentador = false;
  let hasSeccion = false;
  for (const key of Object.keys(row)) {
    const norm = normalizeHeader(key);
    headersNormalized[key] = norm;
    if (norm === 'alimentador') hasAlimentador = true;
    if (norm === 'seccion') hasSeccion = true;
  }

  for (const key of Object.keys(row)) {
    const norm = headersNormalized[key];

    // ALIMENTADOR always maps to seccion (feeder identifier)
    if (norm === 'alimentador') {
      out.seccion = row[key];
      continue;
    }

    // SECCION maps to seccion_ciudad (city name) when ALIMENTADOR exists,
    // otherwise it maps to seccion
    if (norm === 'seccion') {
      if (hasAlimentador) {
        out.seccion_ciudad = row[key];
      } else {
        out.seccion = row[key];
      }
      continue;
    }

    // Standard aliases
    if (norm === 'anio' || norm === 'ano') { out.anio = row[key]; continue; }
    if (norm === 'mes') { out.mes = row[key]; continue; }
    if (norm === 'axumes') { out.axumes = row[key]; continue; }
    if (norm === 'periodo') { out.periodo = row[key]; continue; }
    if (norm === 'tipo_medicion' || norm === 'tipo') { out.tipo_medicion = row[key]; continue; }
    if (norm === 'valor') { out.valor = row[key]; continue; }
    if (norm === 'departamento') { out.departamento = row[key]; continue; }
    if (norm === 'local') { out.local = row[key]; continue; }

    // Everything else is kept with its normalized key (potential measurement columns)
    out[norm] = row[key];
  }

  return out;
}

function escSql(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function transform(rows) {
  const rejects = { seccion_faltante: 0, anio_invalido: 0, mes_invalido: 0, tipo_medicion_faltante: 0, valor_invalido: 0, error_fila: 0 };
  const details = [];
  const records = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    try {
      const m = mapRow(row);
      const seccion = normalizeSection(m.seccion);
      const anio = parseInt(m.anio, 10);
      const mes = monthToNumber(m.mes) || monthToNumber(m.axumes) || monthToNumber(m.periodo);
      const departamento = normalizeText(m.departamento) || null;
      const local = normalizeText(m.local) || null;

      if (!seccion) { rejects.seccion_faltante++; details.push(`Fila ${rowNum}: sección/alimentador faltante`); return; }
      if (!Number.isInteger(anio)) { rejects.anio_invalido++; details.push(`Fila ${rowNum}: año inválido`); return; }
      if (!Number.isInteger(mes) || mes < 1 || mes > 12) { rejects.mes_invalido++; details.push(`Fila ${rowNum}: mes inválido`); return; }

      const longFmt = m.tipo_medicion !== undefined && m.valor !== undefined;
      if (longFmt) {
        const tipo = normalizeText(m.tipo_medicion);
        const valor = parseFloat(m.valor);
        if (!tipo) { rejects.tipo_medicion_faltante++; return; }
        if (!Number.isFinite(valor)) { rejects.valor_invalido++; return; }
        records.push({ seccion, anio, mes, departamento, local, tipo_medicion: tipo, valor });
        return;
      }

      // Pivot format: expand measurement columns to individual records
      Object.keys(m).forEach((key) => {
        // Skip all non-measurement columns
        if (isNonMeasurementColumn(key)) return;

        const rawVal = m[key];
        if (rawVal === null || rawVal === undefined || String(rawVal).trim() === '') return;
        const valor = parseFloat(rawVal);
        if (!Number.isFinite(valor)) { rejects.valor_invalido++; return; }
        const tipo = normalizeText(key).toUpperCase();
        if (!tipo) { rejects.tipo_medicion_faltante++; return; }
        records.push({ seccion, anio, mes, departamento, local, tipo_medicion: tipo, valor });
      });
    } catch (e) {
      rejects.error_fila++;
      details.push(`Fila ${rowNum}: ${e.message}`);
    }
  });

  return { records, rejects, details };
}

function detectValidSheet(wb) {
  // First, try to find the specific target sheet by name
  const targetNames = ['FEP DEP PENF - Datos de Prueba', 'FEP DEP'];
  for (const target of targetNames) {
    const match = wb.SheetNames.find(name =>
      name.toLowerCase().includes(target.toLowerCase())
    );
    if (match) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[match], { defval: null });
      if (rows.length > 0) {
        return { name: match, rows };
      }
    }
  }

  // Fallback: auto-detect a valid sheet
  for (const name of wb.SheetNames || []) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
    if (!rows.length) continue;
    const headers = Object.keys(rows[0] || {});
    const normalized = headers.map(normalizeHeader);
    const set = new Set(normalized);
    const hasBase = set.has('mes') && (set.has('seccion') || set.has('alimentador')) && (set.has('anio') || set.has('ano'));
    const longFmt = set.has('tipo_medicion') && set.has('valor');
    const pivotFmt = headers.some((h) => !NON_MEASUREMENT_COLUMNS.has(normalizeHeader(h)));
    if (hasBase && (longFmt || pivotFmt)) return { name, rows };
  }
  return null;
}


function querySqliteScalar(database, sql) {
  return execFileSync('sqlite3', [database, '-batch', '-noheader', sql], { encoding: 'utf8' }).trim();
}

function querySqliteList(database, sql) {
  const out = execFileSync('sqlite3', [database, '-batch', '-noheader', sql], { encoding: 'utf8' }).trim();
  if (!out) return [];
  return out.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
}

if (!fs.existsSync(excelPath)) {
  console.error(`No existe el Excel: ${excelPath}`);
  process.exit(1);
}
if (!dryRun && !fs.existsSync(dbPath)) {
  console.error(`No existe la base de datos: ${dbPath}`);
  process.exit(1);
}

const wb = XLSX.readFile(excelPath);
const valid = detectValidSheet(wb);
if (!valid) {
  console.error('No se encontró hoja válida con columnas mínimas.');
  process.exit(1);
}

const { records, rejects, details } = transform(valid.rows);
const errores = Object.values(rejects).reduce((a, b) => a + b, 0);

console.log(`Hoja usada: ${valid.name}`);
console.log(`Filas origen: ${valid.rows.length}`);
console.log(`Registros largos: ${records.length}`);
console.log(`Errores/descartes: ${errores}`);
if (details.length) {
  console.log(`Detalle rechazos (primeros 10):`);
  details.slice(0, 10).forEach(d => console.log(`  - ${d}`));
}

// Show stats
const yearCounts = {};
const sectionSet = new Set();
const tipoCounts = {};
records.forEach(r => {
  yearCounts[r.anio] = (yearCounts[r.anio] || 0) + 1;
  sectionSet.add(r.seccion);
  tipoCounts[r.tipo_medicion] = (tipoCounts[r.tipo_medicion] || 0) + 1;
});
console.log(`\nRegistros por año:`);
Object.keys(yearCounts).sort().forEach(y => console.log(`  ${y}: ${yearCounts[y]}`));
console.log(`Alimentadores únicos: ${sectionSet.size}`);
console.log(`Tipos de medición: ${Object.keys(tipoCounts).sort().join(', ')}`);

if (dryRun) {
  console.log('\nDry-run finalizado, sin cambios en DB.');
  process.exit(0);
}

const sqlTmp = path.join(os.tmpdir(), `ande_reimport_${Date.now()}.sql`);
const lines = [];
const hasTable = querySqliteScalar(dbPath, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='mediciones_completas';") === '1';
const existingCols = hasTable ? querySqliteList(dbPath, "PRAGMA table_info(mediciones_completas);").map((line) => line.split('|')[1]) : [];

lines.push('PRAGMA synchronous=NORMAL;');
lines.push('BEGIN TRANSACTION;');
lines.push(`CREATE TABLE IF NOT EXISTS cargas_excel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre_archivo TEXT,
  fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  insertadas INTEGER DEFAULT 0,
  errores INTEGER DEFAULT 0,
  estado TEXT
);`);
lines.push(`CREATE TABLE IF NOT EXISTS mediciones_completas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seccion TEXT,
  anio INTEGER,
  mes INTEGER,
  departamento TEXT,
  local TEXT,
  tipo_medicion TEXT,
  valor REAL,
  carga_id INTEGER,
  UNIQUE(seccion, anio, mes, tipo_medicion)
);`);
if (hasTable && !existingCols.includes('local')) lines.push('ALTER TABLE mediciones_completas ADD COLUMN local TEXT;');
if (hasTable && !existingCols.includes('carga_id')) lines.push('ALTER TABLE mediciones_completas ADD COLUMN carga_id INTEGER;');
if (truncate) lines.push('DELETE FROM mediciones_completas;');
lines.push(`INSERT INTO cargas_excel(nombre_archivo,estado) VALUES (${escSql(path.basename(excelPath))}, 'procesando');`);

const cargaIdRef = '(SELECT MAX(id) FROM cargas_excel)';
for (const r of records) {
  lines.push(`INSERT OR REPLACE INTO mediciones_completas (seccion, anio, mes, departamento, local, tipo_medicion, valor, carga_id) VALUES (${escSql(r.seccion)}, ${escSql(r.anio)}, ${escSql(r.mes)}, ${escSql(r.departamento)}, ${escSql(r.local)}, ${escSql(r.tipo_medicion)}, ${escSql(r.valor)}, ${cargaIdRef});`);
}
lines.push(`UPDATE cargas_excel
  SET insertadas=${records.length}, errores=${errores}, estado='completado'
  WHERE id=${cargaIdRef};`);
lines.push('COMMIT;');

fs.writeFileSync(sqlTmp, lines.join('\n'));
try {
  execFileSync('sqlite3', [dbPath], { input: fs.readFileSync(sqlTmp), stdio: ['pipe', 'inherit', 'inherit'] });
  console.log('\nReimportación completada correctamente.');
} finally {
  fs.unlinkSync(sqlTmp);
}
