const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");
const multer = require("multer");
const XLSX = require("xlsx");
require("dotenv").config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// ========================
// 1. CONFIGURACIÓN POSTGRESQL
// ========================
console.log("🚀 Inicializando servidor ANDE Dashboard...");

let pool = null;

try {
    const poolConfig = {
        user: process.env.PG_USER || 'postgres',
        host: process.env.PG_HOST || 'localhost',
        database: process.env.PG_DATABASE || 'ande_dashboard',
        password: process.env.PG_PASSWORD || '',
        port: process.env.PG_PORT || 5432,
        ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    };

    console.log("🔧 Configurando conexión PostgreSQL...");
    pool = new Pool(poolConfig);

    // Probar conexión y crear tablas si no existen
    pool.query('SELECT NOW()', async (err, res) => {
        if (err) {
            console.error("❌ Error conectando a PostgreSQL:", err.message);
            pool = null;
        } else {
            console.log("✅ Conexión a PostgreSQL establecida");
            
            // Crear tablas si no existen
            await createTablesIfNotExist();
        }
    });

    pool.on('error', (err) => {
        console.error('❌ Error inesperado en el pool de PostgreSQL:', err.message);
    });

} catch (error) {
    console.error("❌ Error crítico al inicializar:", error.message);
    pool = null;
}

// Función para crear tablas
async function createTablesIfNotExist() {
    try {
        // Tabla para cargas de Excel
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cargas_excel (
                id SERIAL PRIMARY KEY,
                nombre_archivo VARCHAR(255) NOT NULL,
                fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                usuario VARCHAR(100),
                insertadas INTEGER DEFAULT 0,
                actualizadas INTEGER DEFAULT 0,
                errores INTEGER DEFAULT 0,
                total_filas INTEGER DEFAULT 0,
                estado VARCHAR(50) DEFAULT 'completado'
            );
        `);
        console.log("✅ Tabla 'cargas_excel' creada/verificada");

        // Tabla principal de mediciones
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mediciones_completas (
                id SERIAL PRIMARY KEY,
                seccion VARCHAR(50) NOT NULL,
                anio INTEGER NOT NULL,
                mes INTEGER NOT NULL,
                departamento VARCHAR(100),
                tipo_medicion VARCHAR(100) NOT NULL,
                valor NUMERIC(15,6),
                fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                carga_id INTEGER REFERENCES cargas_excel(id) ON DELETE CASCADE,
                UNIQUE(seccion, anio, mes, tipo_medicion)
            );
        `);
        console.log("✅ Tabla 'mediciones_completas' creada/verificada");

    } catch (error) {
        console.error("❌ Error creando tablas:", error.message);
    }
}

// Función auxiliar para ejecutar consultas
async function ejecutarConsulta(sql, params = []) {
    if (!pool) {
        throw new Error("Base de datos no disponible");
    }

    try {
        const result = await pool.query(sql, params);
        return result.rows;
    } catch (err) {
        console.error("❌ Error en consulta PostgreSQL:", err.message);
        console.error("🔍 SQL:", sql);
        console.error("🔍 Parámetros:", params);
        throw err;
    }
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

// Health check
app.get("/api/health", async (req, res) => {
    const dbStatus = pool ? "Connected" : "Disconnected";
    
    const response = {
        status: "OK",
        timestamp: new Date().toISOString(),
        database: dbStatus,
        service: "ANDE Dashboard API",
        version: "3.1.0",
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

// ========================
// 4. ENDPOINTS DE GESTIÓN DE CARGAS
// ========================

// Obtener todas las cargas
app.get("/api/cargas", async (req, res) => {
    try {
        const cargas = await ejecutarConsulta(`
            SELECT * FROM cargas_excel 
            ORDER BY fecha_carga DESC
        `);
        res.json(cargas);
    } catch (error) {
        console.error("❌ Error obteniendo cargas:", error);
        res.status(500).json({ error: "Error al obtener cargas" });
    }
});

// Obtener detalles de una carga específica
app.get("/api/cargas/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const carga = await ejecutarConsulta(
            "SELECT * FROM cargas_excel WHERE id = $1",
            [id]
        );
        
        if (carga.length === 0) {
            return res.status(404).json({ error: "Carga no encontrada" });
        }
        
        // Obtener estadísticas de la carga
        const estadisticas = await ejecutarConsulta(`
            SELECT 
                COUNT(*) as total_registros,
                COUNT(DISTINCT seccion) as alimentadores_unicos,
                COUNT(DISTINCT tipo_medicion) as tipos_unicos,
                MIN(anio) as anio_minimo,
                MAX(anio) as anio_maximo
            FROM mediciones_completas 
            WHERE carga_id = $1
        `, [id]);
        
        res.json({
            ...carga[0],
            estadisticas: estadisticas[0] || {}
        });
    } catch (error) {
        console.error("❌ Error obteniendo carga:", error);
        res.status(500).json({ error: "Error al obtener carga" });
    }
});

// Eliminar una carga y sus datos
app.delete("/api/cargas/:id", async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { id } = req.params;
        
        await client.query("BEGIN");
        
        // Verificar que la carga existe
        const carga = await client.query(
            "SELECT * FROM cargas_excel WHERE id = $1",
            [id]
        );
        
        if (carga.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Carga no encontrada" });
        }
        
        // Eliminar los datos asociados
        await client.query(
            "DELETE FROM mediciones_completas WHERE carga_id = $1",
            [id]
        );
        
        // Eliminar la carga
        await client.query(
            "DELETE FROM cargas_excel WHERE id = $1",
            [id]
        );
        
        await client.query("COMMIT");
        
        res.json({
            message: "Carga eliminada correctamente",
            carga_id: id
        });
        
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("❌ Error eliminando carga:", error);
        res.status(500).json({ error: "Error al eliminar carga" });
    } finally {
        client.release();
    }
});

// ========================
// 5. ENDPOINTS DE DATOS
// ========================

// Tipos de medición
app.get("/api/tipos-medicion", async (req, res) => {
    try {
        const rows = await ejecutarConsulta(
            "SELECT DISTINCT tipo_medicion FROM mediciones_completas WHERE tipo_medicion IS NOT NULL AND tipo_medicion != '' ORDER BY tipo_medicion"
        );
        const tipos = rows.map(r => r.tipo_medicion);
        res.json(tipos);
    } catch (err) {
        console.error("❌ Error, usando datos por defecto:", err.message);
        res.json(['ACCID.DEP', 'ACCID.FEP', 'PROG.FEP', 'PROD.FEP', 'TOTAL FEP', 'ACCID.PENF', 'PROG.PENF', 'PROD.PENF', 'TOTAL PENEF', 'PROG.DEP', 'PROD.DEP', 'TOTAL DEP']);
    }
});

// Secciones (alimentadores)
app.get("/api/secciones", async (req, res) => {
    try {
        const rows = await ejecutarConsulta(
            "SELECT DISTINCT seccion FROM mediciones_completas WHERE seccion IS NOT NULL AND seccion != '' ORDER BY seccion"
        );
        const secciones = rows.map(r => r.seccion);
        res.json(secciones);
    } catch (err) {
        console.error("❌ Error, usando datos por defecto:", err.message);
        res.json(['ACY1', 'ACY2', 'ACY3', 'ACY4', 'ACY5', 'ACY6']);
    }
});

// Años
app.get("/api/anios", async (req, res) => {
    try {
        const rows = await ejecutarConsulta(
            "SELECT DISTINCT anio FROM mediciones_completas WHERE anio IS NOT NULL ORDER BY anio DESC"
        );
        const anios = rows.map(r => r.anio);
        res.json(anios);
    } catch (err) {
        console.error("❌ Error, usando datos por defecto:", err.message);
        res.json([2025, 2024, 2023, 2022, 2021, 2020, 2019]);
    }
});

// Endpoint principal de datos
app.get("/api/datos", async (req, res) => {
    const { seccion, anio, mes, tipo_medicion, periodo, estacion } = req.query;
    
    console.log("📥 Solicitud /api/datos con parámetros:", req.query);
    
    if (!pool) {
        console.error("❌ PostgreSQL no disponible");
        return res.status(500).json({ 
            error: "PostgreSQL no disponible",
            message: "El servidor no pudo conectar con la base de datos"
        });
    }
    
    try {
        let sql = `
            SELECT seccion, anio, mes, departamento, tipo_medicion, valor
            FROM mediciones_completas 
            WHERE 1=1
        `;
        
        const params = [];
        let paramCount = 1;
        
        if (seccion && seccion !== 'all') {
            if (seccion === 'all_station' && estacion) {
                sql += ` AND seccion LIKE $${paramCount}`;
                params.push(`${estacion}%`);
                paramCount++;
            } else if (seccion !== 'all_station') {
                sql += ` AND seccion = $${paramCount}`;
                params.push(seccion);
                paramCount++;
            }
        }
        
        if (anio && anio !== 'all') {
            sql += ` AND anio = $${paramCount}`;
            params.push(parseInt(anio));
            paramCount++;
        }
        
        if (tipo_medicion && tipo_medicion !== 'all') {
            sql += ` AND tipo_medicion = $${paramCount}`;
            params.push(tipo_medicion);
            paramCount++;
        }
        
        if (mes && mes !== 'all') {
            sql += ` AND mes = $${paramCount}`;
            params.push(parseInt(mes));
            paramCount++;
        } else if (periodo) {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1;
            
            switch(periodo) {
                case 'last6':
                    // Últimos 6 meses del año actual
                    const last6Months = [];
                    for (let i = 5; i >= 0; i--) {
                        let month = currentMonth - i;
                        let year = currentYear;
                        if (month < 1) {
                            month += 12;
                            year -= 1;
                        }
                        last6Months.push({ year, month });
                    }
                    
                    sql += ` AND (`;
                    last6Months.forEach((item, index) => {
                        if (index > 0) sql += ` OR `;
                        sql += `(anio = $${paramCount} AND mes = $${paramCount + 1})`;
                        params.push(item.year, item.month);
                        paramCount += 2;
                    });
                    sql += `)`;
                    break;
                    
                case 'currentYear':
                    // Año actual completo
                    sql += ` AND anio = $${paramCount}`;
                    params.push(currentYear);
                    paramCount++;
                    break;
            }
        }
        
        sql += " ORDER BY anio DESC, mes DESC, seccion ASC";
        
        console.log("🔍 Ejecutando consulta SQL completa...");
        
        const rows = await ejecutarConsulta(sql, params);
        console.log(`✅ Encontrados ${rows.length} registros`);
        
        const datos = rows.map(row => ({
            transformador: row.seccion,
            frecuencia: parseFloat(row.valor) || 0,
            fecha: `${row.anio}-${String(row.mes).padStart(2, "0")}-01`,
            tipo: row.tipo_medicion,
            departamento: row.departamento || 'N/A',
            year: row.anio,
            month: row.mes,
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
// 6. ENDPOINT DE SUBIDA EXCEL
// ========================
app.post("/api/subir-excel", upload.single("archivo"), async (req, res) => {
    if (!pool) {
        return res.status(500).json({
            error: "Conexión PostgreSQL no configurada",
            message: "La base de datos no está disponible"
        });
    }

    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ 
            error: "No se recibió ningún archivo",
            message: "Selecciona un archivo Excel (.xlsx) para subir"
        });
    }

    const client = await pool.connect();
    
    try {
        console.log("📤 Procesando archivo Excel...");
        
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const firstSheetName = workbook.SheetNames[0];

        if (!firstSheetName) {
            throw new Error("El archivo Excel no contiene hojas");
        }

        const worksheet = workbook.Sheets[firstSheetName];
        
        const rows = XLSX.utils.sheet_to_json(worksheet, { 
            defval: null,
            raw: false
        });

        if (!rows.length) {
            throw new Error("El archivo Excel no contiene datos");
        }

        console.log(`📊 Filas encontradas en Excel: ${rows.length}`);

        const requiredColumns = ['seccion', 'anio', 'mes', 'tipo_medicion', 'valor'];
        const firstRow = rows[0];
        const missingColumns = requiredColumns.filter(col => !firstRow.hasOwnProperty(col));
        
        if (missingColumns.length > 0) {
            throw new Error(`Faltan columnas requeridas: ${missingColumns.join(', ')}`);
        }

        // Registrar la carga
        const cargaResult = await client.query(
            `INSERT INTO cargas_excel 
                (nombre_archivo, total_filas, usuario, estado) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id`,
            [
                req.file.originalname,
                rows.length,
                req.body.usuario || 'admin',
                'procesando'
            ]
        );
        
        const cargaId = cargaResult.rows[0].id;
        console.log(`📝 Carga registrada con ID: ${cargaId}`);

        await client.query("BEGIN");

        const insertQuery = `
            INSERT INTO mediciones_completas 
                (seccion, anio, mes, departamento, tipo_medicion, valor, carga_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (seccion, anio, mes, tipo_medicion) 
            DO UPDATE SET 
                departamento = EXCLUDED.departamento,
                valor = EXCLUDED.valor,
                fecha_carga = CURRENT_TIMESTAMP,
                carga_id = EXCLUDED.carga_id
            RETURNING id
        `;

        let insertadas = 0;
        let actualizadas = 0;
        let errores = 0;
        const erroresDetalle = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            
            try {
                if (!row.seccion || !row.anio || !row.mes || !row.tipo_medicion || row.valor === undefined) {
                    throw new Error("Fila incompleta");
                }

                const valores = [
                    String(row.seccion).trim(),
                    parseInt(row.anio),
                    parseInt(row.mes),
                    row.departamento ? String(row.departamento).trim() : null,
                    String(row.tipo_medicion).trim(),
                    parseFloat(row.valor),
                    cargaId
                ];

                if (isNaN(valores[1]) || isNaN(valores[2]) || isNaN(valores[5])) {
                    throw new Error("Datos numéricos inválidos");
                }

                const result = await client.query(insertQuery, valores);
                
                if (result.rows[0]) {
                    if (result.rows[0].id) {
                        insertadas++;
                    } else {
                        actualizadas++;
                    }
                }
                
            } catch (error) {
                errores++;
                erroresDetalle.push({
                    fila: i + 2,
                    error: error.message,
                    datos: row
                });
            }
        }

        // Actualizar estadísticas de la carga
        await client.query(
            `UPDATE cargas_excel 
             SET insertadas = $1, actualizadas = $2, errores = $3, estado = 'completado'
             WHERE id = $4`,
            [insertadas, actualizadas, errores, cargaId]
        );

        await client.query("COMMIT");

        console.log(`✅ Proceso completado: ${insertadas} insertadas, ${actualizadas} actualizadas, ${errores} errores`);

        res.json({
            message: "Archivo Excel procesado correctamente",
            carga_id: cargaId,
            total_filas: rows.length,
            insertadas,
            actualizadas,
            errores,
            errores_detalle: errores > 0 ? erroresDetalle : undefined,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        
        console.error("❌ Error procesando Excel:", error.message);
        
        res.status(400).json({
            error: "Error procesando el archivo Excel",
            message: error.message,
            timestamp: new Date().toISOString()
        });
    } finally {
        client.release();
    }
});

// ========================
// 7. ENDPOINTS ADICIONALES
// ========================

// Obtener estadísticas generales
app.get("/api/estadisticas", async (req, res) => {
    try {
        const estadisticas = await ejecutarConsulta(`
            SELECT 
                COUNT(*) as total_registros,
                COUNT(DISTINCT seccion) as total_alimentadores,
                COUNT(DISTINCT tipo_medicion) as total_tipos,
                MIN(anio) as anio_minimo,
                MAX(anio) as anio_maximo,
                MIN(fecha_carga) as primera_carga,
                MAX(fecha_carga) as ultima_carga
            FROM mediciones_completas
        `);
        
        const cargas = await ejecutarConsulta(`
            SELECT COUNT(*) as total_cargas FROM cargas_excel
        `);
        
        res.json({
            ...estadisticas[0],
            ...cargas[0]
        });
    } catch (error) {
        console.error("❌ Error obteniendo estadísticas:", error);
        res.status(500).json({ error: "Error al obtener estadísticas" });
    }
});

// ========================
// 8. SERVIR FRONTEND
// ========================
app.get("*", (req, res) => {
    if (!req.path.startsWith("/api/")) {
        const filePath = path.join(__dirname, req.path === "/" ? "index.html" : req.path);
        const fs = require('fs');
        
        if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
            res.sendFile(filePath);
        } else {
            res.sendFile(path.join(__dirname, "index.html"));
        }
    }
});

// ========================
// 9. INICIAR SERVIDOR
// ========================
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
    console.log("=".repeat(70));
    console.log(`🚀 ANDE DASHBOARD - SERVIDOR INICIADO`);
    console.log(`🌐 URL: http://${HOST}:${PORT}`);
    console.log(`📊 Base de datos: ${pool ? "POSTGRESQL CONECTADA ✓" : "NO CONECTADA ✗"}`);
    console.log(`📤 Endpoint Excel: POST http://${HOST}:${PORT}/api/subir-excel`);
    console.log(`📋 Gestión de cargas: GET http://${HOST}:${PORT}/api/cargas`);
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