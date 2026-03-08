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

function detectValidSheet(wb) {
  for (const name of wb.SheetNames || []) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
    if (!rows.length) continue;
    const headers = Object.keys(rows[0] || {});
    const normalized = headers.map(normalizeHeader);
    const set = new Set(normalized);
    const hasBase = set.has('mes') && (set.has('seccion') || set.has('alimentador')) && (set.has('anio') || set.has('ano'));
    const longFmt = set.has('tipo_medicion') && set.has('valor');
    const pivotFmt = headers.some((h) => !['seccion', 'alimentador', 'anio', 'ano', 'mes', 'departamento', 'local', 'axumes', 'periodo'].includes(normalizeHeader(h)));
    if (hasBase && (longFmt || pivotFmt)) return { name, rows };
  }
  return null;
}

function mapRow(row) {
  const alias = {
    seccion: 'seccion',
    alimentador: 'seccion',
    anio: 'anio',
    ano: 'anio',
    mes: 'mes',
    axumes: 'axumes',
    periodo: 'periodo',
    tipo_medicion: 'tipo_medicion',
    tipo: 'tipo_medicion',
    valor: 'valor',
    departamento: 'departamento',
    local: 'local'
  };
  const out = {};
  for (const key of Object.keys(row)) {
    const norm = normalizeHeader(key);
    out[alias[norm] || norm] = row[key];
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
      const seccion = normalizeText(m.seccion);
      const anio = parseInt(m.anio, 10);
      const mes = monthToNumber(m.mes) || monthToNumber(m.axumes) || monthToNumber(m.periodo);
      const departamento = normalizeText(m.departamento) || null;
      const local = normalizeText(m.local) || null;

      if (!seccion) { rejects.seccion_faltante++; details.push(`Fila ${rowNum}: sección faltante`); return; }
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

      Object.keys(m).forEach((key) => {
        if (['seccion', 'anio', 'mes', 'departamento', 'local', 'axumes', 'periodo'].includes(key)) return;
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

if (dryRun) {
  console.log('Dry-run finalizado, sin cambios en DB.');
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
  console.log('Reimportación completada correctamente.');
  if (details.length) console.log(`Detalle rechazos (primeros 10):\n- ${details.slice(0, 10).join('\n- ')}`);
} finally {
  fs.unlinkSync(sqlTmp);
}
