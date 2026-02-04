const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

// ========================
// 1. MIDDLEWARES
// ========================
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ========================
// 2. CONEXIÓN A POSTGRESQL
// ========================
console.log("🚀 Inicializando servidor ANDE Dashboard...");
console.log("📁 Directorio actual:", __dirname);

let pool = null;

try {
    // Configuración de conexión PostgreSQL
    const poolConfig = {
        user: process.env.PG_USER || 'postgres',
        host: process.env.PG_HOST || 'localhost',
        database: process.env.PG_DATABASE || 'ande_dashboard',
        password: process.env.PG_PASSWORD || 'whysoshy777',
        port: process.env.PG_PORT || 5432,
        ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: 20, // máximo de clientes en el pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    };

    console.log("🔧 Configurando conexión PostgreSQL...");
    console.log("📊 Configuración:", {
        host: poolConfig.host,
        database: poolConfig.database,
        port: poolConfig.port,
        ssl: poolConfig.ssl ? 'activado' : 'desactivado'
    });

    pool = new Pool(poolConfig);

    // Probar conexión
    pool.query('SELECT NOW()', (err, res) => {
        if (err) {
            console.error("❌ Error conectando a PostgreSQL:", err.message);
            console.error("🔍 Detalles:", err);
            pool = null;
        } else {
            console.log("✅ Conexión a PostgreSQL establecida");
            console.log("🕐 Hora del servidor:", res.rows[0].now);
            
            // Verificar estructura de la tabla
            pool.query(`
                SELECT table_name, column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'mediciones_completas'
                ORDER BY ordinal_position
            `, (err, result) => {
                if (err) {
                    console.error("❌ Error obteniendo estructura de tabla:", err.message);
                } else if (result.rows.length > 0) {
                    console.log("📋 Estructura de la tabla 'mediciones_completas':");
                    result.rows.forEach(col => {
                        console.log(`  - ${col.column_name} (${col.data_type})`);
                    });
                    
                    // Contar registros
                    pool.query('SELECT COUNT(*) FROM mediciones_completas', (err, countRes) => {
                        if (!err && countRes.rows[0]) {
                            console.log(`📊 Total de registros: ${parseInt(countRes.rows[0].count).toLocaleString()}`);
                        }
                    });
                } else {
                    console.log("⚠️  La tabla 'mediciones_completas' no existe o está vacía");
                }
            });
        }
    });

    // Manejar errores del pool
    pool.on('error', (err) => {
        console.error('❌ Error inesperado en el pool de PostgreSQL:', err.message);
        console.error('🔍 Stack:', err.stack);
    });

} catch (error) {
    console.error("❌ Error crítico al inicializar:", error.message);
    console.error("🔍 Stack trace:", error.stack);
    pool = null;
}

// Función auxiliar para ejecutar consultas PostgreSQL
async function ejecutarConsulta(sql, params = []) {
    if (!pool) {
        console.error("❌ Pool de PostgreSQL no disponible");
        throw new Error("Base de datos no disponible");
    }

    console.log("🔍 Ejecutando SQL:", sql);
    if (params.length > 0) {
        console.log("📌 Parámetros:", params);
    }

    try {
        const result = await pool.query(sql, params);
        console.log(`✅ Consulta exitosa: ${result.rows.length} registros`);
        return result.rows;
    } catch (err) {
        console.error("❌ Error en consulta PostgreSQL:", err.message);
        console.error("🔍 SQL que causó el error:", sql);
        console.error("🔍 Parámetros:", params);
        throw err;
    }
}

// ========================
// 3. ENDPOINTS
// ========================

// Health check
app.get("/api/health", async (req, res) => {
    const dbStatus = pool ? "Connected" : "Disconnected";
    console.log(`🏥 Health check - PostgreSQL: ${dbStatus}`);
    
    const response = {
        status: "OK",
        timestamp: new Date().toISOString(),
        database: dbStatus,
        service: "ANDE Dashboard API",
        version: "3.0.0",
        database_type: "PostgreSQL"
    };
    
    if (pool) {
        try {
            const result = await pool.query('SELECT version()');
            response.db_version = result.rows[0].version.split(' ')[1];
        } catch (err) {
            response.db_version = "Error obteniendo versión";
        }
    }
    
    res.json(response);
});

// Test endpoint
app.get("/api/test", async (req, res) => {
    try {
        if (!pool) {
            return res.json({ 
                message: "Servidor activo pero PostgreSQL no disponible",
                timestamp: new Date().toISOString()
            });
        }
        
        const result = await pool.query('SELECT 1 + 1 as test');
        res.json({
            message: "Conexión PostgreSQL funcionando",
            test_result: result.rows[0].test,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: "Error en PostgreSQL",
            message: error.message
        });
    }
});

// Tipos de medición
app.get("/api/tipos-medicion", async (req, res) => {
    console.log("📋 Solicitud: /api/tipos-medicion");
    
    if (!pool) {
        console.log("⚠️  PostgreSQL no disponible, usando datos por defecto");
        return res.json(['ACCID.DEP', 'ACCID.FEP', 'PROG.FEP', 'PROD.FEP', 'TOTAL FEP', 'ACCID.PENF', 'PROG.PENF', 'PROD.PENF', 'TOTAL PENEF', 'PROG.DEP', 'PROD.DEP', 'TOTAL DEP']);
    }
    
    try {
        const rows = await ejecutarConsulta(
            "SELECT DISTINCT tipo_medicion FROM mediciones_completas WHERE tipo_medicion IS NOT NULL AND tipo_medicion != '' ORDER BY tipo_medicion"
        );
        const tipos = rows.map(r => r.tipo_medicion);
        console.log(`✅ Enviando ${tipos.length} tipos de medición`);
        res.json(tipos);
    } catch (err) {
        console.error("❌ Error, usando datos por defecto:", err.message);
        res.json(['ACCID.DEP', 'ACCID.FEP', 'PROG.FEP', 'PROD.FEP', 'TOTAL FEP', 'ACCID.PENF', 'PROG.PENF', 'PROD.PENF', 'TOTAL PENEF', 'PROG.DEP', 'PROD.DEP', 'TOTAL DEP']);
    }
});

// Secciones
app.get("/api/secciones", async (req, res) => {
    console.log("📋 Solicitud: /api/secciones");
    
    if (!pool) {
        console.log("⚠️  PostgreSQL no disponible, usando datos por defecto");
        return res.json(['ACY1', 'ACY2', 'ACY3', 'ACY4', 'ACY5', 'ACY6']);
    }
    
    try {
        const rows = await ejecutarConsulta(
            "SELECT DISTINCT seccion FROM mediciones_completas WHERE seccion IS NOT NULL AND seccion != '' ORDER BY seccion"
        );
        const secciones = rows.map(r => r.seccion);
        console.log(`✅ Enviando ${secciones.length} secciones`);
        res.json(secciones);
    } catch (err) {
        console.error("❌ Error, usando datos por defecto:", err.message);
        res.json(['ACY1', 'ACY2', 'ACY3', 'ACY4', 'ACY5', 'ACY6']);
    }
});

// Años
app.get("/api/anios", async (req, res) => {
    console.log("📋 Solicitud: /api/anios");
    
    if (!pool) {
        console.log("⚠️  PostgreSQL no disponible, usando datos por defecto");
        return res.json([2025, 2024, 2023, 2022, 2021, 2020, 2019]);
    }
    
    try {
        const rows = await ejecutarConsulta(
            "SELECT DISTINCT anio FROM mediciones_completas WHERE anio IS NOT NULL ORDER BY anio DESC"
        );
        const anios = rows.map(r => r.anio);
        console.log(`✅ Enviando ${anios.length} años`);
        res.json(anios);
    } catch (err) {
        console.error("❌ Error, usando datos por defecto:", err.message);
        res.json([2025, 2024, 2023, 2022, 2021, 2020, 2019]);
    }
});

// Endpoint principal de datos
app.get("/api/datos", async (req, res) => {
    const { seccion, anio, mes, tipo_medicion } = req.query;
    
    console.log("📥 Solicitud /api/datos con parámetros:", req.query);
    
    // Validar parámetros requeridos
    if (!seccion || !anio || !tipo_medicion) {
        console.warn("⚠️  Faltan parámetros requeridos");
        return res.status(400).json({ 
            error: "Se requieren parámetros: seccion, anio, tipo_medicion" 
        });
    }
    
    if (!pool) {
        console.error("❌ PostgreSQL no disponible");
        return res.status(500).json({ 
            error: "PostgreSQL no disponible",
            message: "El servidor no pudo conectar con la base de datos"
        });
    }
    
    try {
        // Construir consulta SQL
        let sql = `
            SELECT seccion, anio, mes, departamento, tipo_medicion, valor
            FROM mediciones_completas 
            WHERE seccion = $1 
              AND anio = $2 
              AND tipo_medicion = $3
        `;
        
        const params = [seccion, parseInt(anio), tipo_medicion];
        
        if (mes) {
            sql += " AND mes = $4";
            params.push(parseInt(mes));
        }
        
        sql += " ORDER BY mes ASC";
        
        console.log("🔍 Ejecutando consulta SQL completa...");
        
        const rows = await ejecutarConsulta(sql, params);
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
    } catch (err) {
        console.error("❌ Error en consulta de datos:", err.message);
        res.status(500).json({ 
            error: "Error en consulta de datos",
            message: err.message
        });
    }
});

// ========================
// 4. SERVIR FRONTEND
// ========================
app.get("*", (req, res) => {
    // Si no es una ruta de API, servir archivos estáticos
    if (!req.path.startsWith("/api/")) {
        const filePath = path.join(__dirname, req.path === "/" ? "index.html" : req.path);
        
        // Servir archivo si existe
        const fs = require('fs');
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

const server = app.listen(PORT, HOST, () => {
    console.log("=".repeat(70));
    console.log(`🚀 ANDE DASHBOARD - SERVIDOR INICIADO`);
    console.log(`🌐 URL: http://${HOST}:${PORT}`);
    console.log(`📊 Base de datos: ${pool ? "POSTGRESQL CONECTADA ✓" : "NO CONECTADA ✗"}`);
    console.log(`⚙️  Entorno: ${process.env.NODE_ENV || 'production'}`);
    console.log("=".repeat(70));
});

// Manejo de cierre limpio
process.on('SIGTERM', () => {
    console.log("🔻 Recibida señal SIGTERM, cerrando servidor...");
    
    server.close(() => {
        console.log("✅ Servidor HTTP cerrado");
        
        if (pool) {
            pool.end(() => {
                console.log("✅ Pool de PostgreSQL cerrado");
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });
});

process.on('SIGINT', () => {
    console.log("🔻 Recibida señal SIGINT, cerrando servidor...");
    
    server.close(() => {
        console.log("✅ Servidor HTTP cerrado");
        
        if (pool) {
            pool.end(() => {
                console.log("✅ Pool de PostgreSQL cerrado");
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });
});