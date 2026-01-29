const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();

// ========================
// 1. MIDDLEWARES
// ========================
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ========================
// 2. CONEXIÓN A SQLITE CON MANEJO DE ERRORES MEJORADO
// ========================
console.log("🚀 Inicializando servidor ANDE Dashboard...");
console.log("📁 Directorio actual:", __dirname);
console.log("🔍 Verificando archivos...");

// Listar archivos para debug
try {
    const files = fs.readdirSync(__dirname);
    console.log("📁 Archivos disponibles:");
    files.forEach(file => {
        const stats = fs.statSync(path.join(__dirname, file));
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`  - ${file} (${sizeMB} MB)`);
    });
} catch (err) {
    console.error("❌ Error leyendo directorio:", err.message);
}

let db = null;
let sqlite3 = null;

try {
    // Verificar si la base de datos existe
    const dbPath = "./ANDE.db";
    if (fs.existsSync(dbPath)) {
        console.log("✅ Base de datos ANDE.db encontrada");
        const dbStats = fs.statSync(dbPath);
        console.log(`📊 Tamaño de la base de datos: ${(dbStats.size / (1024 * 1024)).toFixed(2)} MB`);
        
        // Intentar cargar sqlite3
        console.log("🔧 Cargando módulo sqlite3...");
        sqlite3 = require("sqlite3").verbose();
        
        console.log("🔌 Conectando a la base de datos...");
        db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                console.error("❌ Error abriendo base de datos:", err.message);
                db = null;
            } else {
                console.log("✅ Conexión a SQLite establecida");
                
                // Verificar que podemos leer datos
                db.get("SELECT COUNT(*) as count FROM mediciones_completas", (err, row) => {
                    if (err) {
                        console.error("❌ Error consultando base de datos:", err.message);
                        console.error("🔍 Detalles del error:", err);
                    } else {
                        console.log(`📊 Total de registros en la base de datos: ${row.count}`);
                        
                        // Verificar estructura de la tabla
                        db.all("PRAGMA table_info(mediciones_completas)", (err, columns) => {
                            if (err) {
                                console.error("❌ Error obteniendo estructura de tabla:", err.message);
                            } else {
                                console.log("📋 Estructura de la tabla 'mediciones_completas':");
                                columns.forEach(col => {
                                    console.log(`  - ${col.name} (${col.type})`);
                                });
                            }
                        });
                    }
                });
            }
        });
    } else {
        console.error("❌ ERROR: No se encontró el archivo ANDE.db");
        console.log("🔍 Buscando archivos .db...");
        const allFiles = fs.readdirSync(__dirname);
        const dbFiles = allFiles.filter(f => f.endsWith('.db'));
        if (dbFiles.length > 0) {
            console.log("📁 Archivos .db encontrados:", dbFiles);
        } else {
            console.log("📁 No se encontraron archivos .db");
        }
    }
} catch (error) {
    console.error("❌ Error crítico al inicializar:", error.message);
    console.error("🔍 Stack trace:", error.stack);
    db = null;
}

// ========================
// 3. ENDPOINTS CON FALLBACK INTELIGENTE
// ========================

// Health check
app.get("/api/health", (req, res) => {
    const dbStatus = db ? "Connected" : "Disconnected";
    console.log(`🏥 Health check - Base de datos: ${dbStatus}`);
    
    res.json({ 
        status: "OK", 
        timestamp: new Date().toISOString(),
        database: dbStatus,
        service: "ANDE Dashboard API",
        version: "2.0.0"
    });
});

// Función auxiliar para ejecutar consultas SQL con error handling
function ejecutarConsulta(sql, params = [], callback) {
    if (!db) {
        console.error("❌ Base de datos no disponible para consulta");
        callback(new Error("Base de datos no disponible"), null);
        return;
    }
    
    console.log("🔍 Ejecutando SQL:", sql);
    console.log("📌 Parámetros:", params);
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error("❌ Error en consulta SQL:", err.message);
            console.error("🔍 SQL que causó el error:", sql);
            callback(err, null);
        } else {
            console.log(`✅ Consulta exitosa: ${rows.length} registros`);
            callback(null, rows);
        }
    });
}

// Tipos de medición
app.get("/api/tipos-medicion", (req, res) => {
    console.log("📋 Solicitud: /api/tipos-medicion");
    
    if (!db) {
        console.log("⚠️  Base de datos no disponible, usando datos por defecto");
        return res.json(['ACCID.DEP', 'ACCID.FEP', 'PROG.FEP', 'PROD.FEP', 'TOTAL FEP', 'ACCID.PENF', 'PROG.PENF', 'PROD.PENF', 'TOTAL PENEF', 'PROG.DEP', 'PROD.DEP', 'TOTAL DEP']);
    }
    
    ejecutarConsulta(
        "SELECT DISTINCT tipo_medicion FROM mediciones_completas WHERE tipo_medicion IS NOT NULL AND tipo_medicion != '' ORDER BY tipo_medicion",
        [],
        (err, rows) => {
            if (err) {
                console.error("❌ Error, usando datos por defecto");
                res.json(['ACCID.DEP', 'ACCID.FEP', 'PROG.FEP']);
            } else {
                const tipos = rows.map(r => r.tipo_medicion);
                console.log(`✅ Enviando ${tipos.length} tipos de medición`);
                res.json(tipos);
            }
        }
    );
});

// Secciones
app.get("/api/secciones", (req, res) => {
    console.log("📋 Solicitud: /api/secciones");
    
    if (!db) {
        console.log("⚠️  Base de datos no disponible, usando datos por defecto");
        return res.json(['ACY1', 'ACY2', 'ACY3', 'ACY4', 'ACY5', 'ACY6']);
    }
    
    ejecutarConsulta(
        "SELECT DISTINCT seccion FROM mediciones_completas WHERE seccion IS NOT NULL AND seccion != '' ORDER BY seccion",
        [],
        (err, rows) => {
            if (err) {
                console.error("❌ Error, usando datos por defecto");
                res.json(['ACY1', 'ACY2', 'ACY3']);
            } else {
                const secciones = rows.map(r => r.seccion);
                console.log(`✅ Enviando ${secciones.length} secciones`);
                res.json(secciones);
            }
        }
    );
});

// Años
app.get("/api/anios", (req, res) => {
    console.log("📋 Solicitud: /api/anios");
    
    if (!db) {
        console.log("⚠️  Base de datos no disponible, usando datos por defecto");
        return res.json([2025, 2024, 2023, 2022, 2021, 2020, 2019]);
    }
    
    ejecutarConsulta(
        "SELECT DISTINCT anio FROM mediciones_completas WHERE anio IS NOT NULL ORDER BY anio DESC",
        [],
        (err, rows) => {
            if (err) {
                console.error("❌ Error, usando datos por defecto");
                res.json([2025, 2024, 2023]);
            } else {
                const anios = rows.map(r => r.anio);
                console.log(`✅ Enviando ${anios.length} años`);
                res.json(anios);
            }
        }
    );
});

// Endpoint principal de datos
app.get("/api/datos", (req, res) => {
    const { seccion, anio, mes, tipo_medicion } = req.query;
    
    console.log("📥 Solicitud /api/datos con parámetros:", req.query);
    
    // Validar parámetros requeridos
    if (!seccion || !anio || !tipo_medicion) {
        console.warn("⚠️  Faltan parámetros requeridos");
        return res.status(400).json({ 
            error: "Se requieren parámetros: seccion, anio, tipo_medicion" 
        });
    }
    
    if (!db) {
        console.error("❌ Base de datos no disponible");
        return res.status(500).json({ 
            error: "Base de datos no disponible",
            message: "El servidor no pudo conectar con la base de datos"
        });
    }
    
    // Construir consulta SQL
    let sql = `
        SELECT seccion, anio, mes, departamento, tipo_medicion, valor
        FROM mediciones_completas 
        WHERE seccion = ? 
          AND anio = ? 
          AND tipo_medicion = ?
    `;
    
    const params = [seccion, parseInt(anio), tipo_medicion];
    
    if (mes) {
        sql += " AND mes = ?";
        params.push(parseInt(mes));
    }
    
    sql += " ORDER BY mes ASC";
    
    console.log("🔍 Ejecutando consulta SQL completa...");
    
    ejecutarConsulta(sql, params, (err, rows) => {
        if (err) {
            console.error("❌ Error en consulta de datos");
            return res.status(500).json({ 
                error: "Error en consulta de datos",
                message: err.message
            });
        }
        
        console.log(`✅ Encontrados ${rows.length} registros`);
        
        // Transformar datos para el frontend
        const datos = rows.map(row => ({
            transformador: row.seccion,
            frecuencia: parseFloat(row.valor) || 0,
            fecha: `${row.anio}-${String(row.mes).padStart(2, "0")}-01`,
            tipo: row.tipo_medicion,
            departamento: row.departamento || 'N/A',
            year: row.anio,
            combinationKey: `${row.seccion}-${row.anio}-${row.tipo_medicion}`,
            combinationLabel: `${row.seccion} (${row.anio}, ${row.tipo_medicion})`
        }));
        
        res.json(datos);
    });
});

// ========================
// 4. SERVIR FRONTEND
// ========================
app.get("*", (req, res) => {
    // Si no es una ruta de API, servir archivos estáticos
    if (!req.path.startsWith("/api/")) {
        const filePath = path.join(__dirname, req.path === "/" ? "index.html" : req.path);
        
        // Si el archivo existe, servirlo
        if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
            res.sendFile(filePath);
        } else {
            // Si no existe, servir index.html (SPA)
            res.sendFile(path.join(__dirname, "index.html"));
        }
    }
});

// ========================
// 5. INICIAR SERVIDOR
// ========================
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log("=".repeat(70));
    console.log(`🚀 ANDE DASHBOARD - SERVIDOR INICIADO`);
    console.log(`🌐 URL: http://${HOST}:${PORT}`);
    console.log(`📊 Base de datos: ${db ? "CONECTADA ✓" : "NO CONECTADA ✗"}`);
    console.log(`⚙️  Entorno: ${process.env.NODE_ENV || 'production'}`);
    console.log("=".repeat(70));
});

// Manejo de cierre limpio
process.on('SIGTERM', () => {
    console.log("🔻 Recibida señal SIGTERM, cerrando servidor...");
    if (db) {
        db.close((err) => {
            if (err) {
                console.error("❌ Error cerrando base de datos:", err.message);
            } else {
                console.log("✅ Base de datos cerrada correctamente");
            }
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});