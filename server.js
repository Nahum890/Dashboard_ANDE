// server.js - Versión Mejorada con Gestión de Cargas
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const XLSX = require("xlsx");
require("dotenv").config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// ========================
// 1. CONFIGURACIÓN SQLITE
// ========================
console.log("🚀 Inicializando servidor ANDE Dashboard...");

const dbPath = path.resolve(__dirname, "ANDE.db");
const adminMigrationToken = process.env.ADMIN_MIGRATION_TOKEN || "";

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error("❌ Error conectando a la base de datos:", err.message);
        console.error("   Asegúrate de que el archivo 'ANDE.db' esté en la carpeta raíz.");
    } else {
        console.log("✅ Conexión establecida con:", dbPath);
        verificarTablas();
    }
});

function verificarTablas() {
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='mediciones_completas'", (err, row) => {
        if (err) {
            console.error(err);
        } else if (row) {
            console.log("✅ Tabla 'mediciones_completas' encontrada y lista.");
            crearIndicesRendimiento();
            validarEsquemaMediciones().catch((schemaErr) => {
                console.error("❌ No se pudo validar el esquema de 'mediciones_completas':", schemaErr.message);
            });
        } else {
            console.warn("⚠️ ALERTA: No se encontró la tabla 'mediciones_completas'.");
            console.warn("   Es posible que el archivo ANDE.db esté vacío o tenga otro nombre de tabla.");
        }
    });
}

function crearIndicesRendimiento() {
    const indices = [
        // Composite index for the correlated MAX(id) subquery in handleDatosRequest
        `CREATE INDEX IF NOT EXISTS idx_mc_dedup 
         ON mediciones_completas(seccion COLLATE NOCASE, anio, mes, tipo_medicion COLLATE NOCASE, id DESC)`,
        // Individual indexes for common filter columns
        `CREATE INDEX IF NOT EXISTS idx_mc_seccion ON mediciones_completas(seccion COLLATE NOCASE)`,
        `CREATE INDEX IF NOT EXISTS idx_mc_anio ON mediciones_completas(anio)`,
        `CREATE INDEX IF NOT EXISTS idx_mc_tipo ON mediciones_completas(tipo_medicion COLLATE NOCASE)`,
        `CREATE INDEX IF NOT EXISTS idx_mc_mes ON mediciones_completas(mes)`
    ];

    console.log("📊 Verificando/creando índices de rendimiento...");
    let created = 0;
    indices.forEach(sql => {
        db.run(sql, (err) => {
            if (err) {
                console.warn("⚠️ No se pudo crear índice:", err.message);
            } else {
                created++;
                if (created === indices.length) {
                    console.log(`✅ ${created} índices de rendimiento verificados/creados`);
                }
            }
        });
    });
}

const COLUMNAS_ESPERADAS_MEDICIONES = [
    "id",
    "seccion",
    "anio",
    "mes",
    "departamento",
    "local",
    "tipo_medicion",
    "valor",
    "carga_id"
];

async function obtenerColumnasTabla(nombreTabla) {
    const estructura = await ejecutarConsulta(`PRAGMA table_info(${nombreTabla})`);
    return estructura.map((c) => c.name);
}

async function validarEsquemaMediciones() {
    const columnasActuales = await obtenerColumnasTabla("mediciones_completas");
    const faltantes = COLUMNAS_ESPERADAS_MEDICIONES.filter((col) => !columnasActuales.includes(col));
    const extras = columnasActuales.filter((col) => !COLUMNAS_ESPERADAS_MEDICIONES.includes(col));

    if (faltantes.length || extras.length) {
        console.error("❌ Desalineación detectada en esquema de 'mediciones_completas'.");
        if (faltantes.length) {
            console.error("   - Columnas faltantes:", faltantes.join(", "));
        }
        if (extras.length) {
            console.error("   - Columnas no esperadas:", extras.join(", "));
        }
        console.error("   - Columnas esperadas:", COLUMNAS_ESPERADAS_MEDICIONES.join(", "));
        console.error("   - Columnas actuales:", columnasActuales.join(", "));
    } else {
        console.log("✅ Esquema de 'mediciones_completas' validado correctamente.");
    }
}

async function ejecutarMigracionMedicionesV2() {
    const tablas = await ejecutarConsulta("SELECT name FROM sqlite_master WHERE type='table' AND name='mediciones_completas'");
    if (tablas.length === 0) {
        throw new Error("No existe la tabla 'mediciones_completas' para migrar");
    }

    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
    const tablaBackup = `mediciones_completas_backup_${timestamp}`;

    const columnasActuales = await obtenerColumnasTabla("mediciones_completas");
    const expresionLocal = columnasActuales.includes("local") ? "TRIM(local)" : "NULL";

    await ejecutarComando("BEGIN TRANSACTION");
    try {
        await ejecutarComando("DROP TABLE IF EXISTS mediciones_completas_v2");
        await ejecutarComando(`
            CREATE TABLE mediciones_completas_v2 (
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
            )
        `);

        await ejecutarComando(`
            INSERT INTO mediciones_completas_v2 (id, seccion, anio, mes, departamento, local, tipo_medicion, valor, carga_id)
            SELECT
                id,
                TRIM(seccion),
                anio,
                mes,
                departamento,
                ${expresionLocal},
                TRIM(tipo_medicion),
                valor,
                carga_id
            FROM mediciones_completas
        `);

        await ejecutarComando(`ALTER TABLE mediciones_completas RENAME TO ${tablaBackup}`);
        await ejecutarComando("ALTER TABLE mediciones_completas_v2 RENAME TO mediciones_completas");
        await ejecutarComando("COMMIT");

        return { tabla_backup: tablaBackup };
    } catch (error) {
        await ejecutarComando("ROLLBACK");
        throw error;
    }
}

function ejecutarConsulta(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error("❌ Error SQL:", err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

function ejecutarComando(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) {
                console.error("❌ Error SQL:", err.message);
                reject(err);
            } else {
                resolve({ id: this.lastID, changes: this.changes });
            }
        });
    });
}

function normalizarHeader(valor) {
    if (valor === undefined || valor === null) return "";
    return String(valor)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}

function normalizarTexto(valor) {
    if (valor === undefined || valor === null) return "";
    return String(valor).trim();
}

function normalizarSeccion(valor) {
    if (valor === undefined || valor === null) return "";
    let s = String(valor).trim().toUpperCase();
    // Eliminar espacios entre letras y números: "NAR 5" -> "NAR5"
    s = s.replace(/\b([A-Z]+)\s+(\d+[A-Z0-9]*)\b/g, '$1$2');
    return s;
}

function convertirMesANumero(valor) {
    if (valor === undefined || valor === null) return null;

    if (typeof valor === "number" && Number.isFinite(valor)) {
        const entero = Math.trunc(valor);
        if (entero >= 1 && entero <= 12) return entero;
        if (entero >= 190001 && entero <= 299912) {
            const m = entero % 100;
            return m >= 1 && m <= 12 ? m : null;
        }
        return null;
    }

    const raw = String(valor).trim();
    if (!raw) return null;

    const directo = parseInt(raw, 10);
    if (!Number.isNaN(directo)) {
        if (directo >= 1 && directo <= 12) return directo;
        if (directo >= 190001 && directo <= 299912) {
            const m = directo % 100;
            return m >= 1 && m <= 12 ? m : null;
        }
    }

    const normalizado = normalizarHeader(raw);
    const meses = {
        enero: 1,
        febrero: 2,
        marzo: 3,
        abril: 4,
        mayo: 5,
        junio: 6,
        julio: 7,
        agosto: 8,
        septiembre: 9,
        setiembre: 9,
        octubre: 10,
        noviembre: 11,
        diciembre: 12,
        jan: 1,
        feb: 2,
        mar: 3,
        apr: 4,
        may: 5,
        jun: 6,
        jul: 7,
        aug: 8,
        sep: 9,
        oct: 10,
        nov: 11,
        dec: 12
    };

    return meses[normalizado] || null;
}

// Columns that are NOT measurement types — excluded from pivot expansion
const COLUMNAS_NO_MEDICION = new Set([
    "seccion", "alimentador", "anio", "ano", "mes",
    "departamento", "local", "axumes", "periodo",
    "tipo_medicion", "tipo", "valor", "seccion_ciudad"
]);

function mapearHeadersFila(row) {
    const filaMapeada = {};
    const columnasOriginales = {};

    // First pass: detect if both ALIMENTADOR and SECCION exist
    let tieneAlimentador = false;
    let tieneSeccion = false;
    const headersNorm = {};
    Object.keys(row).forEach((key) => {
        const norm = normalizarHeader(key);
        headersNorm[key] = norm;
        if (norm === "alimentador") tieneAlimentador = true;
        if (norm === "seccion") tieneSeccion = true;
    });

    // Second pass: map columns
    Object.keys(row).forEach((key) => {
        const normalizado = headersNorm[key];

        // ALIMENTADOR always maps to seccion (feeder identifier)
        if (normalizado === "alimentador") {
            filaMapeada.seccion = row[key];
            columnasOriginales.seccion = key;
            return;
        }

        // SECCION maps to seccion_ciudad (city) when ALIMENTADOR exists,
        // otherwise it maps to seccion
        if (normalizado === "seccion") {
            if (tieneAlimentador) {
                filaMapeada.seccion_ciudad = row[key];
                columnasOriginales.seccion_ciudad = key;
            } else {
                filaMapeada.seccion = row[key];
                columnasOriginales.seccion = key;
            }
            return;
        }

        // Standard aliases
        const aliasMap = {
            anio: "anio", ano: "anio", mes: "mes",
            tipo_medicion: "tipo_medicion", tipo: "tipo_medicion",
            valor: "valor", departamento: "departamento",
            local: "local", axumes: "axumes", periodo: "periodo"
        };
        const destino = aliasMap[normalizado] || normalizado;
        filaMapeada[destino] = row[key];
        columnasOriginales[destino] = key;
    });

    return { filaMapeada, columnasOriginales };
}

function analizarWorkbook(workbook) {
    const hojas = workbook.SheetNames || [];

    // 1. Detectar si es un "Informe Mensual" (Formato de estación por hoja)
    const estacionesConocidas = ["APR", "CAN", "CDE", "SRI", "HER", "SBT", "JLM", "SDG", "CUR", "CAT", "DES", "MINGA"];
    const hojasEstaciones = hojas.filter(h => estacionesConocidas.includes(h.trim().toUpperCase()));
    
    if (hojasEstaciones.length > 0) {
        return {
            tipo: 'informe_mensual',
            hojas: hojasEstaciones.map(h => ({
                nombreHoja: h,
                rows: XLSX.utils.sheet_to_json(workbook.Sheets[h], { header: 1, range: 0 })
            }))
        };
    }

    // 2. Detectar si es el formato antiguo "Pivote Histórico"
    const nombresObjetivo = ["FEP DEP PENF - Datos de Prueba", "FEP DEP", "mediciones"];
    for (const target of nombresObjetivo) {
        const match = hojas.find(name => name.toLowerCase().includes(target.toLowerCase()));
        if (match) {
            const hoja = workbook.Sheets[match];
            const rows = XLSX.utils.sheet_to_json(hoja, { defval: null });
            if (rows.length > 0) {
                return { 
                    tipo: 'pivote_historico', 
                    hojas: [{ nombreHoja: match, rows, headersOriginales: Object.keys(rows[0] || {}) }] 
                };
            }
        }
    }

    // Fallback: auto-detect a valid sheet para formato antiguo
    for (const nombreHoja of hojas) {
        const hoja = workbook.Sheets[nombreHoja];
        const rows = XLSX.utils.sheet_to_json(hoja, { defval: null });
        if (!rows.length) continue;

        const headersOriginales = Object.keys(rows[0] || {});
        const headersNormalizados = headersOriginales.map(normalizarHeader);
        const headersSet = new Set(headersNormalizados);

        const tieneBase = headersSet.has("mes") && (headersSet.has("seccion") || headersSet.has("alimentador")) && (headersSet.has("anio") || headersSet.has("ano"));
        const formatoLargo = headersSet.has("tipo_medicion") && headersSet.has("valor");
        const formatoPivote = headersOriginales.some((h) => !COLUMNAS_NO_MEDICION.has(normalizarHeader(h)));

        if (tieneBase && (formatoLargo || formatoPivote)) {
            return { 
                tipo: 'pivote_historico', 
                hojas: [{ nombreHoja, rows, headersOriginales }] 
            };
        }
    }

    return null;
}

function procesarInformeMensual(rows, nombreHoja) {
    let periodoVal = null;
    let anio = null, mes = null;

    for (let i = 0; i < Math.min(20, rows.length); i++) {
        const row = rows[i];
        if (row) {
            for (let j = 0; j < row.length; j++) {
                if (String(row[j] || '').toUpperCase().includes('PERÍODO:')) {
                    periodoVal = row[j+1] ?? row[j+2] ?? row[j+3];
                    break;
                }
            }
        }
        if (periodoVal) break;
    }

    if (periodoVal && !isNaN(periodoVal)) {
        const jsDate = new Date((periodoVal - (25567 + 2)) * 86400 * 1000);
        anio = jsDate.getUTCFullYear();
        mes = jsDate.getUTCMonth() + 1;
    } else {
        return { registros: [], rechazos: { error_fecha: 1 }, detalles: [`Hoja ${nombreHoja}: No se encontró un PERÍODO de fecha válido`] };
    }

    let startRow = -1;
    for (let i = 0; i < rows.length; i++) {
        if (rows[i] && String(rows[i][0] || '').includes('ALIM')) {
            startRow = i;
            break;
        }
    }

    if (startRow === -1) {
        return { registros: [], rechazos: { tabla_faltante: 1 }, detalles: [`Hoja ${nombreHoja}: No se encontró inicio de tabla (ALIM)`] };
    }

    const registros = [];
    const mappings = [
        { col: 1, tipo: 'ACCID. DEP' }, { col: 2, tipo: 'PROG. DEP' }, { col: 3, tipo: 'PROD. DEP' }, { col: 4, tipo: 'TOTAL DEP' },
        { col: 5, tipo: 'ACCID. FEP' }, { col: 6, tipo: 'PROG. FEP' }, { col: 7, tipo: 'PROD. FEP' }, { col: 8, tipo: 'TOTAL FEP' },
        { col: 9, tipo: 'ACCID. PENF' }, { col: 10, tipo: 'PROG. PENF' }, { col: 11, tipo: 'PROD. PENF' }, { col: 12, tipo: 'TOTAL PENF' }
    ];

    for (let i = startRow + 2; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;

        const alimentadorRaw = String(row[0]).trim();
        if (alimentadorRaw.toUpperCase().includes('TOTAL') || alimentadorRaw.length < 2) continue;

        const seccion = normalizarSeccion(alimentadorRaw);
        if (!seccion) continue;

        for (const map of mappings) {
            const valRaw = row[map.col];
            if (valRaw === undefined || valRaw === null || String(valRaw).trim() === '') continue;
            
            const val = parseFloat(valRaw);
            if (!isNaN(val)) {
                registros.push({
                    seccion: seccion,
                    anio: anio,
                    mes: mes,
                    departamento: null,
                    local: null,
                    tipo_medicion: map.tipo,
                    valor: val
                });
            }
        }
    }

    return { registros, rechazos: {}, detalles: [] };
}

function transformarFilas(rows) {
    const registros = [];
    const rechazos = {
        header_faltante: 0,
        seccion_faltante: 0,
        anio_invalido: 0,
        mes_invalido: 0,
        tipo_medicion_faltante: 0,
        valor_invalido: 0,
        error_fila: 0
    };
    const detalles = [];

    rows.forEach((row, index) => {
        const filaNumero = index + 2;
        try {
            const { filaMapeada } = mapearHeadersFila(row);

            const seccion = normalizarSeccion(filaMapeada.seccion);
            const anio = parseInt(filaMapeada.anio, 10);
            const mes =
                convertirMesANumero(filaMapeada.mes) ||
                convertirMesANumero(filaMapeada.axumes) ||
                convertirMesANumero(filaMapeada.periodo);
            const departamento = filaMapeada.departamento ? normalizarTexto(filaMapeada.departamento) : null;
            const local = filaMapeada.local ? normalizarTexto(filaMapeada.local) : null;

            if (!seccion) {
                rechazos.seccion_faltante++;
                detalles.push(`Fila ${filaNumero}: Falta 'seccion'`);
                return;
            }
            if (Number.isNaN(anio)) {
                rechazos.anio_invalido++;
                detalles.push(`Fila ${filaNumero}: 'anio' inválido: ${filaMapeada.anio}`);
                return;
            }
            if (!mes || mes < 1 || mes > 12) {
                rechazos.mes_invalido++;
                detalles.push(`Fila ${filaNumero}: 'mes' inválido: ${filaMapeada.mes ?? filaMapeada.axumes ?? filaMapeada.periodo}`);
                return;
            }

            const tipoDirecto = filaMapeada.tipo_medicion !== undefined && filaMapeada.valor !== undefined;

            if (tipoDirecto) {
                const tipoMedicion = normalizarTexto(filaMapeada.tipo_medicion);
                const valor = parseFloat(filaMapeada.valor);

                if (!tipoMedicion) {
                    rechazos.tipo_medicion_faltante++;
                    detalles.push(`Fila ${filaNumero}: Falta 'tipo_medicion'`);
                    return;
                }
                if (Number.isNaN(valor)) {
                    rechazos.valor_invalido++;
                    detalles.push(`Fila ${filaNumero}: 'valor' inválido: ${filaMapeada.valor}`);
                    return;
                }

                registros.push({ seccion, anio, mes, departamento, local, tipo_medicion: tipoMedicion, valor });
                return;
            }

            // Formato pivote: cada columna de medición se transforma a formato largo
            Object.keys(filaMapeada).forEach((key) => {
                if (COLUMNAS_NO_MEDICION.has(key)) return;
                const rawValor = filaMapeada[key];
                if (rawValor === undefined || rawValor === null || String(rawValor).trim() === "") return;

                const valor = parseFloat(rawValor);
                if (Number.isNaN(valor)) {
                    rechazos.valor_invalido++;
                    detalles.push(`Fila ${filaNumero}: valor inválido en '${key}': ${rawValor}`);
                    return;
                }

                const tipoMedicion = normalizarTexto(key).toUpperCase();
                if (!tipoMedicion) {
                    rechazos.tipo_medicion_faltante++;
                    detalles.push(`Fila ${filaNumero}: tipo de medición vacío en pivote`);
                    return;
                }

                registros.push({ seccion, anio, mes, departamento, local, tipo_medicion: tipoMedicion, valor });
            });
        } catch (e) {
            rechazos.error_fila++;
            detalles.push(`Fila ${filaNumero}: Error - ${e.message}`);
        }
    });

    return { registros, rechazos, detalles };
}

// ========================
// 2. MIDDLEWARES
// ========================
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    if (req.path.endsWith('.js') || req.path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});
app.use(express.static(__dirname));

// ========================
// 3. ENDPOINTS
// ========================

// Health check mejorado
app.get("/api/health", async (req, res) => {
    try {
        const test = await ejecutarConsulta("SELECT 1 as test");
        res.json({ 
            status: "OK", 
            database: "SQLite", 
            file: "ANDE.db",
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            status: "ERROR", 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Nuevo: Verificar datos en la base de datos
app.get("/api/verificar-datos", async (req, res) => {
    try {
        // Verificar si la tabla existe
        const tablaExists = await ejecutarConsulta(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='mediciones_completas'"
        );
        
        if (tablaExists.length === 0) {
            return res.json({ 
                tabla_existe: false, 
                mensaje: "La tabla 'mediciones_completas' no existe. Sube un archivo Excel para crearla." 
            });
        }
        
        // Contar registros
        const count = await ejecutarConsulta("SELECT COUNT(*) as total FROM mediciones_completas");
        const total = count[0]?.total || 0;
        
        // Obtener muestras de datos
        const tipos = await ejecutarConsulta("SELECT DISTINCT tipo_medicion FROM mediciones_completas WHERE tipo_medicion IS NOT NULL LIMIT 10");
        const años = await ejecutarConsulta("SELECT DISTINCT anio FROM mediciones_completas WHERE anio IS NOT NULL ORDER BY anio DESC LIMIT 10");
        const secciones = await ejecutarConsulta("SELECT DISTINCT seccion FROM mediciones_completas WHERE seccion IS NOT NULL ORDER BY seccion LIMIT 10");
        
        // Muestra de datos
        let muestra = [];
        if (total > 0) {
            muestra = await ejecutarConsulta("SELECT seccion, anio, mes, tipo_medicion, valor FROM mediciones_completas LIMIT 5");
        }
        
        res.json({
            tabla_existe: true,
            total_registros: total,
            tipos_disponibles: tipos.map(t => t.tipo_medicion),
            años_disponibles: años.map(a => a.anio),
            secciones_disponibles: secciones.map(s => s.seccion),
            muestra: muestra,
            estructura_tabla: await ejecutarConsulta("PRAGMA table_info(mediciones_completas)")
        });
        
    } catch (error) {
        res.status(500).json({ 
            error: error.message 
        });
    }
});

// ==================== NUEVO: Estadísticas Globales ====================
app.get("/api/estadisticas", async (req, res) => {
    try {
        const totalDatos = await ejecutarConsulta("SELECT COUNT(*) as total FROM mediciones_completas");
        const totalCargas = await ejecutarConsulta("SELECT COUNT(*) as total FROM cargas_excel WHERE 1=1");
        
        res.json({
            total_datos: totalDatos[0]?.total || 0,
            total_cargas: totalCargas[0]?.total || 0,
            ultima_actualizacion: new Date().toISOString()
        });
    } catch (error) {
        res.json({ 
            total_datos: 0, 
            total_cargas: 0,
            ultima_actualizacion: new Date().toISOString()
        });
    }
});

// ==================== MEJORADO: Obtener cargas con más detalles ====================
app.get("/api/cargas", async (req, res) => {
    try {
        // Verificar si la tabla existe
        const check = await ejecutarConsulta("SELECT name FROM sqlite_master WHERE type='table' AND name='cargas_excel'");
        if (check.length === 0) {
            // Crear tabla si no existe
            await ejecutarComando(`
                CREATE TABLE IF NOT EXISTS cargas_excel (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre_archivo TEXT,
                    fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    insertadas INTEGER DEFAULT 0,
                    errores INTEGER DEFAULT 0,
                    estado TEXT
                )
            `);
            return res.json([]);
        }
        
        const cargas = await ejecutarConsulta(`
            SELECT 
                id,
                nombre_archivo,
                fecha_carga,
                insertadas,
                errores,
                estado,
                (SELECT COUNT(*) FROM mediciones_completas WHERE carga_id = cargas_excel.id) as filas_asociadas
            FROM cargas_excel 
            ORDER BY fecha_carga DESC
        `);
        res.json(cargas);
    } catch (error) {
        console.error("Error obteniendo cargas:", error);
        res.json([]);
    }
});

// ==================== NUEVO: Eliminar carga en cascada ====================
app.delete("/api/cargas/:id", async (req, res) => {
    const { id } = req.params;
    
    try {
        // Primero verificar que la carga existe
        const carga = await ejecutarConsulta("SELECT * FROM cargas_excel WHERE id = ?", [id]);
        
        if (carga.length === 0) {
            return res.status(404).json({ error: "Carga no encontrada" });
        }
        
        // Contar cuántas filas se eliminarán
        const count = await ejecutarConsulta(
            "SELECT COUNT(*) as total FROM mediciones_completas WHERE carga_id = ?", 
            [id]
        );
        
        const filasEliminadas = count[0]?.total || 0;
        
        // Eliminar los datos asociados
        await ejecutarComando("DELETE FROM mediciones_completas WHERE carga_id = ?", [id]);
        
        // Eliminar el registro de carga
        await ejecutarComando("DELETE FROM cargas_excel WHERE id = ?", [id]);
        
        res.json({ 
            success: true, 
            mensaje: `Carga eliminada exitosamente`,
            filas_eliminadas: filasEliminadas,
            nombre_archivo: carga[0].nombre_archivo
        });
        
    } catch (error) {
        console.error("Error eliminando carga:", error);
        res.status(500).json({ error: "Error al eliminar la carga" });
    }
});

// Tipos de medición - MEJORADO para manejar casos vacíos
app.get("/api/tipos-medicion", async (req, res) => {
    try {
        const rows = await ejecutarConsulta(
            "SELECT DISTINCT tipo_medicion FROM mediciones_completas WHERE tipo_medicion IS NOT NULL AND tipo_medicion != '' ORDER BY tipo_medicion"
        );
        
        if (rows.length === 0) {
            // Si no hay tipos, devolver algunos por defecto
            res.json(['ACCID.DEP', 'TOTAL FEP', 'ENERGIA', 'POTENCIA']);
        } else {
            res.json(rows.map(r => r.tipo_medicion));
        }
    } catch (err) {
        console.error("Error obteniendo tipos:", err.message);
        // Devolver valores por defecto en caso de error
        res.json(['ACCID.DEP', 'TOTAL FEP', 'ENERGIA', 'POTENCIA']);
    }
});

// Secciones - MEJORADO
app.get("/api/secciones", async (req, res) => {
    try {
        const rows = await ejecutarConsulta(
            "SELECT DISTINCT seccion FROM mediciones_completas WHERE seccion IS NOT NULL AND TRIM(seccion) != ''"
        );

        const canon = new Map();
        for (const r of rows) {
            const raw = String(r.seccion || '').trim().toUpperCase();
            if (!raw) continue;

            // Normalizar espacios intermedios y formato tipo "NAR 5" -> "NAR5"
            let normalized = raw.replace(/\s+/g, ' ');
            normalized = normalized.replace(/\b([A-Z]{2,})\s+(\d+[A-Z0-9]*)\b/g, '$1$2');

            // Mantener solo alimentadores reales (deben contener al menos un dígito)
            if (!/\d/.test(normalized)) continue;

            // Validar patrón de alimentador: letras + dígitos (+ sufijos alfanuméricos)
            if (!/^[A-Z]{2,}\d+[A-Z0-9]*$/.test(normalized)) continue;

            canon.set(normalized, normalized);
        }

        const secciones = Array.from(canon.values()).sort((a, b) => a.localeCompare(b, 'es'));

        if (secciones.length === 0) {
            res.json(['ACY1', 'ACY2', 'ACY3', 'ACY4']);
            return;
        }

        res.json(secciones);
    } catch (err) {
        console.error("Error obteniendo secciones:", err);
        res.json(['ACY1', 'ACY2', 'ACY3', 'ACY4']);
    }
});

// Años - MEJORADO
app.get("/api/anios", async (req, res) => {
    try {
        const rows = await ejecutarConsulta(
            "SELECT DISTINCT anio FROM mediciones_completas WHERE anio IS NOT NULL ORDER BY anio DESC"
        );
        
        if (rows.length === 0) {
            // Si no hay años, devolver los últimos 5 años
            const currentYear = new Date().getFullYear();
            const years = [];
            for (let i = 4; i >= 0; i--) {
                years.push(currentYear - i);
            }
            res.json(years);
        } else {
            res.json(rows.map(r => r.anio));
        }
    } catch (err) {
        console.error("Error obteniendo años:", err);
        // Devolver años por defecto
        const currentYear = new Date().getFullYear();
        res.json([currentYear, currentYear - 1, currentYear - 2]);
    }
});

function construirFiltroMetrica(metrica) {
    const valor = String(metrica || "").toLowerCase();
    switch (valor) {
        case "dep_total":
            return { sql: "UPPER(tipo_medicion) LIKE '%DEP%' AND UPPER(tipo_medicion) LIKE '%TOTAL%'" };
        case "dep_componentes":
            return { sql: "UPPER(tipo_medicion) LIKE '%DEP%' AND UPPER(tipo_medicion) NOT LIKE '%TOTAL%'" };
        case "dep_todos":
            return { sql: "UPPER(tipo_medicion) LIKE '%DEP%'" };
        case "fep_total":
            return { sql: "UPPER(tipo_medicion) LIKE '%FEP%' AND UPPER(tipo_medicion) LIKE '%TOTAL%'" };
        case "fep_componentes":
            return { sql: "UPPER(tipo_medicion) LIKE '%FEP%' AND UPPER(tipo_medicion) NOT LIKE '%TOTAL%'" };
        case "fep_todos":
            return { sql: "UPPER(tipo_medicion) LIKE '%FEP%'" };
        default:
            return null;
    }
}

function parseLista(valor) {
    if (Array.isArray(valor)) return valor.map((v) => String(v || '').trim()).filter(Boolean);
    if (valor === undefined || valor === null) return [];
    return String(valor).split(',').map((v) => v.trim()).filter(Boolean);
}

function generarMesesDesdeScope(scope, month, startMonth, endMonth, months) {
    const meses = parseLista(months).map((m) => parseInt(m, 10)).filter((m) => m >= 1 && m <= 12);
    if (scope === 'month') {
        if (meses.length) return [...new Set(meses)];
        const m = parseInt(month, 10);
        return (m >= 1 && m <= 12) ? [m] : [];
    }

    if (scope === 'range') {
        const inicio = parseInt(startMonth, 10);
        const fin = parseInt(endMonth, 10);
        if (Number.isInteger(inicio) && Number.isInteger(fin)) {
            const desde = Math.min(inicio, fin);
            const hasta = Math.max(inicio, fin);
            const rango = [];
            for (let m = desde; m <= hasta; m++) if (m >= 1 && m <= 12) rango.push(m);
            return rango;
        }
    }

    return Array.from({ length: 12 }, (_, i) => i + 1);
}

function resumirPeriodo(rows) {
    const valores = rows.map((r) => parseFloat(r.valor)).filter((v) => Number.isFinite(v));
    if (!valores.length) return { suma: 0, promedio: 0, min: 0, max: 0, cantidad: 0 };

    const suma = valores.reduce((acc, v) => acc + v, 0);
    return {
        suma,
        promedio: suma / valores.length,
        min: Math.min(...valores),
        max: Math.max(...valores),
        cantidad: valores.length
    };
}

async function obtenerDatosPeriodo(periodo) {
    const where = ['valor IS NOT NULL'];
    const params = [];

    const years = parseLista(periodo.years).map((y) => parseInt(y, 10)).filter(Number.isInteger);
    const singleYear = parseInt(periodo.year, 10);
    const anios = years.length ? years : (Number.isInteger(singleYear) ? [singleYear] : []);
    if (!anios.length) throw new Error('Debe seleccionar al menos un año en cada período');

    const meses = generarMesesDesdeScope(periodo.scope, periodo.month, periodo.startMonth, periodo.endMonth, periodo.months);
    if (!meses.length) throw new Error('Debe seleccionar al menos un mes válido');

    where.push(`anio IN (${anios.map(() => '?').join(',')})`);
    params.push(...anios);
    where.push(`mes IN (${meses.map(() => '?').join(',')})`);
    params.push(...meses);

    const metrica = construirFiltroMetrica(periodo.metric);
    if (metrica) where.push(metrica.sql);

    const tipos = parseLista(periodo.metricTypes);
    if (tipos.length) {
        where.push(`tipo_medicion IN (${tipos.map(() => '?').join(',')})`);
        params.push(...tipos);
    }

    const secciones = parseLista(periodo.secciones || periodo.seccion);
    const estaciones = parseLista(periodo.estaciones || periodo.estacion);
    const filtrosSeccion = [];
    if (secciones.length) {
        filtrosSeccion.push(`seccion IN (${secciones.map(() => '?').join(',')})`);
        params.push(...secciones);
    }
    if (estaciones.length) {
        filtrosSeccion.push(`(${estaciones.map(() => 'seccion LIKE ?').join(' OR ')})`);
        params.push(...estaciones.map((est) => `${est}%`));
    }
    if (filtrosSeccion.length) where.push(`(${filtrosSeccion.join(' OR ')})`);

    const departamentos = parseLista(periodo.departamentos || periodo.departamento);
    if (departamentos.length) {
        where.push(`departamento IN (${departamentos.map(() => '?').join(',')})`);
        params.push(...departamentos);
    }

    const locales = parseLista(periodo.locales || periodo.local);
    if (locales.length) {
        where.push(`local IN (${locales.map(() => '?').join(',')})`);
        params.push(...locales);
    }

    const sql = `
        SELECT anio, mes, tipo_medicion, seccion, departamento, local, valor
        FROM mediciones_completas
        WHERE ${where.join(' AND ')}
        ORDER BY anio ASC, mes ASC
    `;

    const rows = await ejecutarConsulta(sql, params);
    return { rows, anios, meses };
}

function agregarSeries(rows) {
    const continuo = new Map();
    const porMes = new Map();

    rows.forEach((row) => {
        const valor = parseFloat(row.valor) || 0;
        const key = `${row.anio}-${String(row.mes).padStart(2, '0')}`;
        continuo.set(key, (continuo.get(key) || 0) + valor);
        porMes.set(row.mes, (porMes.get(row.mes) || 0) + valor);
    });

    const labelsContinuo = Array.from(continuo.keys()).sort();
    return {
        continuo: {
            labels: labelsContinuo,
            valores: labelsContinuo.map((k) => continuo.get(k) || 0)
        },
        superpuesto: {
            labels: Array.from({ length: 12 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`),
            valores: Array.from({ length: 12 }, (_, i) => porMes.get(i + 1) || 0)
        }
    };
}

app.get('/api/comparacion-opciones', async (req, res) => {
    try {
        const [secciones, departamentos, locales, tipos, anios] = await Promise.all([
            ejecutarConsulta("SELECT DISTINCT seccion FROM mediciones_completas WHERE seccion IS NOT NULL AND TRIM(seccion) != '' ORDER BY seccion"),
            ejecutarConsulta("SELECT DISTINCT departamento FROM mediciones_completas WHERE departamento IS NOT NULL AND TRIM(departamento) != '' ORDER BY departamento"),
            ejecutarConsulta("SELECT DISTINCT local FROM mediciones_completas WHERE local IS NOT NULL AND TRIM(local) != '' ORDER BY local"),
            ejecutarConsulta("SELECT DISTINCT tipo_medicion FROM mediciones_completas WHERE tipo_medicion IS NOT NULL AND TRIM(tipo_medicion) != '' ORDER BY tipo_medicion"),
            ejecutarConsulta('SELECT DISTINCT anio FROM mediciones_completas WHERE anio IS NOT NULL ORDER BY anio DESC')
        ]);

        res.json({
            secciones: secciones.map((r) => r.seccion),
            departamentos: departamentos.map((r) => r.departamento),
            locales: locales.map((r) => r.local),
            tipos_medicion: tipos.map((r) => r.tipo_medicion),
            anios: anios.map((r) => r.anio)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/comparar-periodos', async (req, res) => {
    try {
        const { periodoA, periodoB } = req.body || {};
        if (!periodoA || !periodoB) return res.status(400).json({ error: 'Debe enviar periodoA y periodoB' });

        const [datosA, datosB] = await Promise.all([obtenerDatosPeriodo(periodoA), obtenerDatosPeriodo(periodoB)]);
        const resumenA = resumirPeriodo(datosA.rows);
        const resumenB = resumirPeriodo(datosB.rows);

        const serieA = agregarSeries(datosA.rows);
        const serieB = agregarSeries(datosB.rows);

        const labelsContinuos = Array.from(new Set([...serieA.continuo.labels, ...serieB.continuo.labels])).sort();
        const mapA = new Map(serieA.continuo.labels.map((l, i) => [l, serieA.continuo.valores[i]]));
        const mapB = new Map(serieB.continuo.labels.map((l, i) => [l, serieB.continuo.valores[i]]));

        const detalle = labelsContinuos.map((label) => {
            const a = mapA.get(label) || 0;
            const b = mapB.get(label) || 0;
            const diff = b - a;
            return {
                periodo: label,
                valorA: a,
                valorB: b,
                diferencia: diff,
                diferencia_pct: a !== 0 ? (diff / a) * 100 : null
            };
        });

        const deltaSuma = resumenB.suma - resumenA.suma;
        const deltaPct = resumenA.suma !== 0 ? (deltaSuma / resumenA.suma) * 100 : null;

        res.json({
            periodoA: resumenA,
            periodoB: resumenB,
            diferencias: { absoluta: deltaSuma, porcentual: deltaPct },
            series_mensuales: {
                continuo: {
                    labels: labelsContinuos,
                    periodoA: labelsContinuos.map((l) => mapA.get(l) || 0),
                    periodoB: labelsContinuos.map((l) => mapB.get(l) || 0)
                },
                superpuesto: {
                    labels: serieA.superpuesto.labels,
                    periodoA: serieA.superpuesto.valores,
                    periodoB: serieB.superpuesto.valores
                }
            },
            detalle
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== CORREGIDO: Endpoint de datos con manejo de errores ====================
async function handleDatosRequest(req, res, source = {}) {
    console.log("📥 Petición a /api/datos recibida con parámetros:", source);
    
    let { seccion, anio, mes, tipo_medicion, estacion, periodo } = source;

    // Si no se reciben filtros explícitos, tratar como "sin filtro"
    if (!seccion || seccion === '') seccion = 'all';
    if (!anio || anio === '') anio = 'all';
    if (!tipo_medicion || tipo_medicion === '') tipo_medicion = 'all';
    
    // Log de parámetros ajustados
    console.log("📊 Parámetros ajustados:", { seccion, anio, mes, tipo_medicion, estacion, periodo });
    
    let sql = `SELECT mc.seccion, mc.anio, mc.mes, mc.departamento, mc.tipo_medicion, mc.valor
               FROM mediciones_completas mc
               WHERE 1=1`;
    const params = [];

    // 1. Filtrar por Secciones - CORREGIDO
    if (seccion && seccion !== 'all') {
        // Manejar diferentes formatos de sección
        if (seccion.includes(',')) {
            const seccionesArray = seccion.split(',').map(s => s.trim());
            const placeholders = seccionesArray.map(() => '?').join(',');
            sql += ` AND UPPER(TRIM(mc.seccion)) IN (${placeholders})`;
            params.push(...seccionesArray.map(s => s.toUpperCase()));
        } else {
            sql += " AND UPPER(TRIM(mc.seccion)) = ?";
            params.push(seccion.toUpperCase());
        }
    }

    // 2. Filtrar por Estación (si se proporciona y es diferente de seccion)
    if (estacion && estacion !== '' && estacion !== seccion) {
        sql += " AND UPPER(TRIM(mc.seccion)) LIKE ?";
        params.push(`${estacion.toUpperCase()}%`);
    }

    // 3. Filtrar por Años - CORREGIDO
    if (anio && anio !== 'all') {
        if (anio.includes(',')) {
            const aniosArray = anio.split(',').map(a => a.trim());
            const placeholders = aniosArray.map(() => '?').join(',');
            sql += ` AND anio IN (${placeholders})`;
            params.push(...aniosArray);
        } else {
            sql += " AND mc.anio = ?";
            params.push(anio);
        }
    }

    // 4. Filtrar por Meses - CORREGIDO
    if (mes && mes !== 'all' && mes !== '') {
        if (mes.includes(',')) {
            const mesesArray = mes.split(',').map(m => m.trim());
            const placeholders = mesesArray.map(() => '?').join(',');
            sql += ` AND mc.mes IN (${placeholders})`;
            params.push(...mesesArray);
        } else {
            sql += " AND mc.mes = ?";
            params.push(mes);
        }
    } else if (periodo && periodo !== 'select_months') {
        // Si hay período dinámico, manejarlo
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        
        let mesesArray = [];
        
        if (periodo === 'last3') {
            // Últimos 3 meses
            for (let i = 0; i < 3; i++) {
                let targetMonth = currentMonth - i;
                let targetYear = currentYear;
                
                if (targetMonth <= 0) {
                    targetMonth += 12;
                    targetYear -= 1;
                }
                
                mesesArray.push(targetMonth);
            }
        } else if (periodo === 'last6') {
            // Últimos 6 meses
            for (let i = 0; i < 6; i++) {
                let targetMonth = currentMonth - i;
                let targetYear = currentYear;
                
                if (targetMonth <= 0) {
                    targetMonth += 12;
                    targetYear -= 1;
                }
                
                mesesArray.push(targetMonth);
            }
        } else if (periodo === 'last12' || periodo === 'currentYear') {
            // Últimos 12 meses o año actual
            for (let i = 1; i <= 12; i++) {
                mesesArray.push(i);
            }
        } else if (periodo === 'lastYear') {
            // Año pasado
            for (let i = 1; i <= 12; i++) {
                mesesArray.push(i);
            }
            sql += " AND mc.anio = ?";
            params.push(currentYear - 1);
        }
        
        if (mesesArray.length > 0 && periodo !== 'lastYear') {
            const placeholders = mesesArray.map(() => '?').join(',');
            sql += ` AND mc.mes IN (${placeholders})`;
            params.push(...mesesArray);
        }
    }

    // 5. Tipo de medición - CORREGIDO
    if (tipo_medicion && tipo_medicion !== 'all') {
        if (tipo_medicion.includes(',')) {
            const tiposArray = tipo_medicion.split(',').map(t => t.trim());
            const placeholders = tiposArray.map(() => '?').join(',');
            sql += ` AND UPPER(TRIM(mc.tipo_medicion)) IN (${placeholders})`;
            params.push(...tiposArray.map(t => t.toUpperCase()));
        } else {
            sql += " AND UPPER(TRIM(mc.tipo_medicion)) = ?";
            params.push(tipo_medicion.toUpperCase());
        }
    }

    sql += " ORDER BY mc.anio DESC, mc.mes ASC, mc.seccion ASC";
    
    console.log("🔧 SQL final:", sql);
    console.log("📊 Parámetros:", params);

    try {
        // Verificar si hay datos en la tabla primero
        const tablaCheck = await ejecutarConsulta("SELECT COUNT(*) as total FROM mediciones_completas");
        const totalRegistros = tablaCheck[0]?.total || 0;
        
        if (totalRegistros === 0) {
            console.log("📭 Tabla 'mediciones_completas' está vacía");
            return res.json([]);
        }
        
        const rows = await ejecutarConsulta(sql, params);
        console.log(`📈 Registros encontrados: ${rows.length}`);
        
        if (rows.length === 0) {
            console.log("⚠️ No se encontraron registros con los filtros proporcionados");
            return res.json([]);
        }
        
        const datos = rows.map(row => ({
            transformador: row.seccion,
            frecuencia: parseFloat(row.valor) || 0,
            fecha: `${row.anio}-${String(row.mes).padStart(2, "0")}-01`,
            tipo: row.tipo_medicion,
            departamento: row.departamento || 'N/A',
            year: row.anio,
            month: row.mes,
            combinationKey: `${row.seccion}-${row.anio}-${row.tipo_medicion}`,
            combinationLabel: `${row.seccion} (${row.anio})`
        }));
        
        res.json(datos);
        
    } catch (err) {
        console.error("❌ Error en consulta SQL:", err.message);
        console.error("❌ Stack trace:", err.stack);
        
        // Enviar error detallado
        res.status(500).json({ 
            error: err.message,
            sql: sql,
            params: params,
            timestamp: new Date().toISOString()
        });
    }
}

app.get("/api/datos", async (req, res) => handleDatosRequest(req, res, req.query || {}));
app.post("/api/datos", async (req, res) => handleDatosRequest(req, res, req.body || {}));

// ==================== RUTA NUEVA: Vista ampliada de gráficos ====================
app.get('/chart.html', (req, res) => {
    const filePath = path.join(__dirname, 'chart.html');
    res.sendFile(filePath);
});

// Subida de Excel - MEJORADO con más validaciones
app.post("/api/subir-excel", upload.single("archivo"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No se seleccionó ningún archivo" });
    }

    try {
        // Validar tipo de archivo
        const validExtensions = ['.xlsx', '.xls'];
        const fileExtension = req.file.originalname.substring(req.file.originalname.lastIndexOf('.')).toLowerCase();
        
        if (!validExtensions.includes(fileExtension)) {
            return res.status(400).json({ error: "Formato inválido. Solo se aceptan archivos .xlsx o .xls" });
        }

        // Aseguramos que la tabla de cargas exista
        await ejecutarComando(`
            CREATE TABLE IF NOT EXISTS cargas_excel (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre_archivo TEXT,
                fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                insertadas INTEGER DEFAULT 0,
                errores INTEGER DEFAULT 0,
                estado TEXT
            )
        `);

        // Aseguramos que la tabla principal exista
        await ejecutarComando(`
            CREATE TABLE IF NOT EXISTS mediciones_completas (
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
            )
        `);

        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const analisisDb = analizarWorkbook(workbook);

        if (!analisisDb) {
            return res.status(400).json({
                error: "No se encontró estructura reconocible de datos en el archivo Excel.",
                resumen_rechazos: { formato_desconocido: 1 },
                total_procesado: 0
            });
        }

        console.log(`📄 Archivo '${req.file.originalname}' tipo detectado: ${analisisDb.tipo} (${analisisDb.hojas.length} hojas validas)`);

        // Insertar registro de carga
        const carga = await ejecutarComando(
            "INSERT INTO cargas_excel (nombre_archivo, estado) VALUES (?, 'procesando')",
            [req.file.originalname]
        );

        let insertadas = 0;
        let errores = 0;
        const totalRegistros = [];
        const consolidadRechazos = {};
        const consolidadDetalles = [];

        // Extraer y transformar de todas las hojas válidas
        for (const hoja of analisisDb.hojas) {
            let resultado;
            if (analisisDb.tipo === 'informe_mensual') {
                resultado = procesarInformeMensual(hoja.rows, hoja.nombreHoja);
            } else {
                resultado = transformarFilas(hoja.rows);
            }

            if (resultado && resultado.registros) {
                totalRegistros.push(...resultado.registros);
                
                for (const key in resultado.rechazos) {
                    consolidadRechazos[key] = (consolidadRechazos[key] || 0) + resultado.rechazos[key];
                }
                if (resultado.detalles) {
                    consolidadDetalles.push(...resultado.detalles);
                }
            }
        }
        
        errores = Object.values(consolidadRechazos).reduce((acc, n) => acc + n, 0);

        // Preparar statement para inserción
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO mediciones_completas 
            (seccion, anio, mes, departamento, local, tipo_medicion, valor, carga_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Procesar filas válidas
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            
            totalRegistros.forEach((row) => {
                try {
                    stmt.run(
                        String(row.seccion).trim(),
                        parseInt(row.anio),
                        parseInt(row.mes),
                        row.departamento ? String(row.departamento).trim() : null,
                        row.local ? String(row.local).trim() : null,
                        String(row.tipo_medicion).trim(),
                        parseFloat(row.valor),
                        carga.id
                    );
                    insertadas++;
                    
                } catch (e) {
                    errores++;
                    consolidadRechazos.error_fila = (consolidadRechazos.error_fila || 0) + 1;
                    consolidadDetalles.push(`Error al insertar registro ${row.seccion}-${row.tipo_medicion}: ${e.message}`);
                }
            });
            
            db.run("COMMIT");
        });
        stmt.finalize();

        // Actualizar estado de la carga
        await ejecutarComando(
            "UPDATE cargas_excel SET insertadas=?, errores=?, estado='completado' WHERE id=?",
            [insertadas, errores, carga.id]
        );

        console.log(`✅ Procesamiento completado: ${insertadas} insertadas, ${errores} errores`);

        const hojasUsadas = analisisDb.hojas.map(h => h.nombreHoja).join(', ');

        res.json({ 
            success: true,
            message: "Archivo procesado correctamente", 
            carga_id: carga.id, 
            insertadas: insertadas,
            errores: errores,
            hojas_procesadas: hojasUsadas,
            formato_detectado: analisisDb.tipo,
            total_procesado: totalRegistros.length,
            resumen_rechazos: consolidadRechazos,
            detalles_errores: consolidadDetalles.slice(0, 20) // Mostrar primeros 20 errores
        });

    } catch (error) {
        console.error("❌ Error procesando Excel:", error);
        res.status(500).json({ 
            error: "Error procesando el archivo Excel",
            detalles: error.message 
        });
    }
});

// ==================== ADMIN: Migración controlada a esquema v2 ====================
app.post("/api/admin/migrar-mediciones-v2", async (req, res) => {
    const tokenHeader = req.headers["x-admin-token"];

    if (!adminMigrationToken || tokenHeader !== adminMigrationToken) {
        return res.status(403).json({ error: "No autorizado para ejecutar migraciones" });
    }

    try {
        const resultado = await ejecutarMigracionMedicionesV2();
        await validarEsquemaMediciones();
        res.json({
            success: true,
            mensaje: "Migración completada",
            tabla_backup: resultado.tabla_backup
        });
    } catch (error) {
        console.error("❌ Error en migración v2:", error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Servir Frontend para cualquier otra ruta
app.get("*", (req, res) => {
    if (!req.path.startsWith("/api/")) {
        const filePath = path.join(__dirname, "index.html");
        res.sendFile(filePath);
    }
});

// ==========================================
// HERRAMIENTAS DE DIAGNÓSTICO (NUEVO)
// ==========================================

// 1. Ver lista de todos los alimentadores únicos (para encontrar los 10 extra)
app.get("/api/admin/alimentadores-lista", async (req, res) => {
    try {
        const sql = "SELECT DISTINCT seccion FROM mediciones_completas ORDER BY seccion";
        const rows = await ejecutarConsulta(sql);
        res.json({
            total: rows.length,
            alimentadores: rows.map(r => r.seccion)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Detectar duplicados exactos (misma fecha, sección y tipo)
app.get("/api/admin/ver-duplicados", async (req, res) => {
    try {
        const sql = `
            SELECT UPPER(TRIM(seccion)) as seccion, anio, mes, UPPER(TRIM(tipo_medicion)) as tipo_medicion, COUNT(*) as cantidad
            FROM mediciones_completas
            GROUP BY UPPER(TRIM(seccion)), anio, mes, UPPER(TRIM(tipo_medicion))
            HAVING COUNT(*) > 1
            ORDER BY cantidad DESC
        `;
        const rows = await ejecutarConsulta(sql);
        res.json({
            mensaje: rows.length > 0 ? "⚠️ Se encontraron duplicados" : "✅ No hay duplicados exactos",
            total_casos: rows.length,
            detalle: rows
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. LIMPIEZA DE DUPLICADOS (Deja solo el registro más reciente ingresado)
app.post("/api/admin/eliminar-duplicados", async (req, res) => {
    try {
        // Esta consulta mantiene el ID más alto (el último insertado) y borra el resto
        const sql = `
            DELETE FROM mediciones_completas
            WHERE id NOT IN (
                SELECT MAX(id)
                FROM mediciones_completas
                GROUP BY UPPER(TRIM(seccion)), anio, mes, UPPER(TRIM(tipo_medicion))
            )
        `;
        const resultado = await ejecutarComando(sql);
        
        // También hacemos un TRIM para quitar espacios en blanco de los nombres
        await ejecutarComando("UPDATE mediciones_completas SET seccion = TRIM(seccion)");

        res.json({
            success: true,
            filas_eliminadas: resultado.changes,
            mensaje: "Base de datos optimizada y espacios en blanco eliminados."
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📁 Base de datos: ANDE.db`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`📊 API disponible en: http://localhost:${PORT}/api/`);
});
