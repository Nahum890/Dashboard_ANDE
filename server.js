// server.js - Versión Mejorada con Gestión de Cargas
const express = require("express");
const cors = require("cors");
const path = require("path");
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
        } else {
            console.warn("⚠️ ALERTA: No se encontró la tabla 'mediciones_completas'.");
            console.warn("   Es posible que el archivo ANDE.db esté vacío o tenga otro nombre de tabla.");
        }
    });
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

// ========================
// 2. MIDDLEWARES
// ========================
app.use(cors());
app.use(express.json());
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
            "SELECT DISTINCT seccion FROM mediciones_completas WHERE seccion IS NOT NULL AND seccion != '' ORDER BY seccion"
        );
        
        if (rows.length === 0) {
            // Si no hay secciones, devolver algunas por defecto
            res.json(['ACY1', 'ACY2', 'ACY3', 'ACY4']);
        } else {
            res.json(rows.map(r => r.seccion));
        }
    } catch (err) {
        console.error("Error obteniendo secciones:", err);
        // Devolver valores por defecto en caso de error
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

// ==================== CORREGIDO: Endpoint de datos con manejo de errores ====================
app.get("/api/datos", async (req, res) => {
    console.log("📥 Petición a /api/datos recibida con parámetros:", req.query);
    
    let { seccion, anio, mes, tipo_medicion, estacion, periodo } = req.query;

    // Si no se reciben filtros explícitos, tratar como "sin filtro"
    if (!seccion || seccion === '') seccion = 'all';
    if (!anio || anio === '') anio = 'all';
    if (!tipo_medicion || tipo_medicion === '') tipo_medicion = 'all';
    
    // Log de parámetros ajustados
    console.log("📊 Parámetros ajustados:", { seccion, anio, mes, tipo_medicion, estacion, periodo });
    
    let sql = `SELECT seccion, anio, mes, departamento, tipo_medicion, valor 
               FROM mediciones_completas WHERE 1=1`;
    const params = [];

    // 1. Filtrar por Secciones - CORREGIDO
    if (seccion && seccion !== 'all') {
        // Manejar diferentes formatos de sección
        if (seccion.includes(',')) {
            const seccionesArray = seccion.split(',').map(s => s.trim());
            const placeholders = seccionesArray.map(() => '?').join(',');
            sql += ` AND seccion IN (${placeholders})`;
            params.push(...seccionesArray);
        } else {
            sql += " AND seccion = ?";
            params.push(seccion);
        }
    }

    // 2. Filtrar por Estación (si se proporciona y es diferente de seccion)
    if (estacion && estacion !== '' && estacion !== seccion) {
        sql += " AND seccion LIKE ?";
        params.push(`${estacion}%`);
    }

    // 3. Filtrar por Años - CORREGIDO
    if (anio && anio !== 'all') {
        if (anio.includes(',')) {
            const aniosArray = anio.split(',').map(a => a.trim());
            const placeholders = aniosArray.map(() => '?').join(',');
            sql += ` AND anio IN (${placeholders})`;
            params.push(...aniosArray);
        } else {
            sql += " AND anio = ?";
            params.push(anio);
        }
    }

    // 4. Filtrar por Meses - CORREGIDO
    if (mes && mes !== 'all' && mes !== '') {
        if (mes.includes(',')) {
            const mesesArray = mes.split(',').map(m => m.trim());
            const placeholders = mesesArray.map(() => '?').join(',');
            sql += ` AND mes IN (${placeholders})`;
            params.push(...mesesArray);
        } else {
            sql += " AND mes = ?";
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
            sql += " AND anio = ?";
            params.push(currentYear - 1);
        }
        
        if (mesesArray.length > 0 && periodo !== 'lastYear') {
            const placeholders = mesesArray.map(() => '?').join(',');
            sql += ` AND mes IN (${placeholders})`;
            params.push(...mesesArray);
        }
    }

    // 5. Tipo de medición - CORREGIDO
    if (tipo_medicion && tipo_medicion !== 'all') {
        if (tipo_medicion.includes(',')) {
            const tiposArray = tipo_medicion.split(',').map(t => t.trim());
            const placeholders = tiposArray.map(() => '?').join(',');
            sql += ` AND tipo_medicion IN (${placeholders})`;
            params.push(...tiposArray);
        } else {
            sql += " AND tipo_medicion = ?";
            params.push(tipo_medicion);
        }
    }

    sql += " ORDER BY anio DESC, mes ASC, seccion ASC";
    
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
});

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
                tipo_medicion TEXT,
                valor REAL,
                carga_id INTEGER,
                UNIQUE(seccion, anio, mes, tipo_medicion)
            )
        `);

        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);

        console.log(`📄 Archivo '${req.file.originalname}' cargado: ${rows.length} filas`);

        // Insertar registro de carga
        const carga = await ejecutarComando(
            "INSERT INTO cargas_excel (nombre_archivo, estado) VALUES (?, 'procesando')",
            [req.file.originalname]
        );

        let insertadas = 0;
        let errores = 0;
        const erroresDetalle = [];

        // Preparar statement para inserción
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO mediciones_completas 
            (seccion, anio, mes, departamento, tipo_medicion, valor, carga_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        // Procesar filas
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            
            rows.forEach((row, index) => {
                try {
                    // Validar datos mínimos
                    if (!row.seccion || row.seccion === '') {
                        errores++;
                        erroresDetalle.push(`Fila ${index + 2}: Falta 'seccion'`);
                        return;
                    }
                    
                    if (!row.anio || isNaN(row.anio)) {
                        errores++;
                        erroresDetalle.push(`Fila ${index + 2}: 'anio' inválido: ${row.anio}`);
                        return;
                    }
                    
                    if (!row.mes || isNaN(row.mes) || row.mes < 1 || row.mes > 12) {
                        errores++;
                        erroresDetalle.push(`Fila ${index + 2}: 'mes' inválido: ${row.mes}`);
                        return;
                    }
                    
                    if (!row.tipo_medicion || row.tipo_medicion === '') {
                        errores++;
                        erroresDetalle.push(`Fila ${index + 2}: Falta 'tipo_medicion'`);
                        return;
                    }
                    
                    if (row.valor === undefined || row.valor === null || isNaN(row.valor)) {
                        errores++;
                        erroresDetalle.push(`Fila ${index + 2}: 'valor' inválido: ${row.valor}`);
                        return;
                    }
                    
                    // Insertar datos
                    stmt.run(
                        String(row.seccion).trim(),
                        parseInt(row.anio),
                        parseInt(row.mes),
                        row.departamento ? String(row.departamento).trim() : null,
                        String(row.tipo_medicion).trim(),
                        parseFloat(row.valor),
                        carga.id
                    );
                    insertadas++;
                    
                } catch (e) {
                    errores++;
                    erroresDetalle.push(`Fila ${index + 2}: Error - ${e.message}`);
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

        res.json({ 
            success: true,
            message: "Archivo procesado correctamente", 
            carga_id: carga.id, 
            insertadas: insertadas,
            errores: errores,
            total_filas: rows.length,
            detalles_errores: erroresDetalle.slice(0, 10) // Mostrar solo primeros 10 errores
        });

    } catch (error) {
        console.error("❌ Error procesando Excel:", error);
        res.status(500).json({ 
            error: "Error procesando el archivo Excel",
            detalles: error.message 
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
            SELECT seccion, anio, mes, tipo_medicion, COUNT(*) as cantidad
            FROM mediciones_completas
            GROUP BY seccion, anio, mes, tipo_medicion
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
                GROUP BY seccion, anio, mes, tipo_medicion
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
