const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();

// 1. Middlewares mejorados
app.use(cors({
    origin: '*', // Permitir todos los orígenes en producción
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 2. Verificar que la base de datos existe
console.log("🔍 Verificando base de datos...");
const dbPath = "./ANDE.db";
if (!fs.existsSync(dbPath)) {
    console.error("❌ ERROR: No se encontró la base de datos ANDE.db");
    console.error("📁 Directorio actual:", __dirname);
    console.error("📁 Archivos en directorio:", fs.readdirSync(__dirname));
} else {
    console.log("✅ Base de datos encontrada:", dbPath);
}

// 3. Conexión a la base de datos con mejor manejo de errores
let db;
try {
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error("❌ Error conectando a SQLite:", err.message);
        } else {
            console.log("✅ Conectado a la base de datos SQLite");
            
            // Verificar que la tabla existe
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='mediciones_completas'", (err, row) => {
                if (err) {
                    console.error("❌ Error verificando tablas:", err.message);
                } else if (row) {
                    console.log("✅ Tabla 'mediciones_completas' encontrada");
                    
                    // Contar registros
                    db.get("SELECT COUNT(*) as count FROM mediciones_completas", (err, result) => {
                        if (err) {
                            console.error("❌ Error contando registros:", err.message);
                        } else {
                            console.log(`📊 Total de registros en BD: ${result.count}`);
                        }
                    });
                } else {
                    console.error("❌ ERROR: No se encontró la tabla 'mediciones_completas'");
                }
            });
        }
    });
} catch (error) {
    console.error("❌ Error inicializando SQLite:", error.message);
}

// 4. Endpoints básicos para verificar funcionamiento

// Endpoint de salud - IMPORTANTE para Render
app.get("/api/health", (req, res) => {
    console.log("🏥 Health check recibido");
    res.json({ 
        status: "OK", 
        timestamp: new Date().toISOString(),
        service: "ANDE Dashboard API",
        version: "1.0.0",
        database: db ? "Connected" : "Disconnected"
    });
});

// Endpoint simple de prueba
app.get("/api/test", (req, res) => {
    console.log("🧪 Test endpoint llamado");
    res.json({ 
        message: "El servidor está funcionando correctamente",
        timestamp: new Date().toISOString(),
        path: req.path
    });
});

// 5. Endpoint principal de datos (versión simplificada para debug)
app.get("/api/datos", (req, res) => {
    console.log("📥 /api/datos llamado con parámetros:", req.query);
    
    const { seccion, anio, mes, tipo_medicion } = req.query;
    
    // Validar parámetros requeridos
    if (!anio || !tipo_medicion || !seccion) {
        console.warn("⚠️ Faltan parámetros requeridos");
        return res.status(400).json({ 
            error: "Faltan parámetros requeridos: anio, tipo_medicion, seccion" 
        });
    }
    
    // SQL simplificado para debug
    let sql = `SELECT * FROM mediciones_completas WHERE 1=1`;
    const params = [];
    
    if (seccion) {
        sql += ` AND seccion = ?`;
        params.push(seccion);
    }
    
    if (anio) {
        sql += ` AND anio = ?`;
        params.push(Number(anio));
    }
    
    if (tipo_medicion) {
        sql += ` AND tipo_medicion = ?`;
        params.push(tipo_medicion.trim());
    }
    
    if (mes) {
        sql += ` AND mes = ?`;
        params.push(Number(mes));
    }
    
    sql += ` LIMIT 50`; // Limitar para pruebas
    
    console.log("🔍 SQL:", sql);
    console.log("📌 Parámetros:", params);
    
    if (!db) {
        return res.status(500).json({ error: "Base de datos no disponible" });
    }
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error("❌ Error SQL:", err);
            return res.status(500).json({ error: err.message });
        }
        
        console.log(`✅ Datos encontrados: ${rows.length} registros`);
        
        // Transformar datos
        const datos = rows.map(r => ({
            transformador: r.seccion,
            frecuencia: parseFloat(r.valor) || 0,
            fecha: `${r.anio}-${String(r.mes).padStart(2, "0")}-01`,
            tipo: r.tipo_medicion,
            departamento: r.departamento || 'N/A',
            year: r.anio
        }));
        
        res.json(datos);
    });
});

// 6. Endpoints auxiliares simplificados
app.get("/api/tipos-medicion", (req, res) => {
    console.log("📋 /api/tipos-medicion llamado");
    
    if (!db) return res.status(500).json({ error: "DB no disponible" });
    
    db.all("SELECT DISTINCT tipo_medicion FROM mediciones_completas ORDER BY tipo_medicion", [], (err, rows) => {
        if (err) {
            console.error("❌ Error:", err);
            return res.status(500).json({ error: err.message });
        }
        const tipos = rows.map(r => r.tipo_medicion).filter(t => t);
        console.log(`✅ Tipos encontrados: ${tipos.length}`);
        res.json(tipos);
    });
});

app.get("/api/secciones", (req, res) => {
    console.log("📋 /api/secciones llamado");
    
    if (!db) return res.status(500).json({ error: "DB no disponible" });
    
    db.all("SELECT DISTINCT seccion FROM mediciones_completas ORDER BY seccion", [], (err, rows) => {
        if (err) {
            console.error("❌ Error:", err);
            return res.status(500).json({ error: err.message });
        }
        const secciones = rows.map(r => r.seccion).filter(s => s);
        console.log(`✅ Secciones encontradas: ${secciones.length}`);
        res.json(secciones);
    });
});

app.get("/api/anios", (req, res) => {
    console.log("📋 /api/anios llamado");
    
    if (!db) return res.status(500).json({ error: "DB no disponible" });
    
    db.all("SELECT DISTINCT anio FROM mediciones_completas ORDER BY anio DESC", [], (err, rows) => {
        if (err) {
            console.error("❌ Error:", err);
            return res.status(500).json({ error: err.message });
        }
        const anios = rows.map(r => r.anio).filter(a => a);
        console.log(`✅ Años encontrados: ${anios.length}`);
        res.json(anios);
    });
});

// 7. Servir archivos estáticos
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// 8. Manejo de errores
app.use((err, req, res, next) => {
    console.error("❌ Error no manejado:", err);
    res.status(500).json({ error: "Error interno del servidor" });
});

// 9. Puerto dinámico para Render
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Importante para Render

app.listen(PORT, HOST, () => {
    console.log("=".repeat(50));
    console.log(`🚀 Servidor ANDE Dashboard iniciado`);
    console.log(`🌍 URL: http://${HOST}:${PORT}`);
    console.log(`📁 Directorio: ${__dirname}`);
    console.log(`⚙️  Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log("=".repeat(50));
    
    // Listar archivos para debug
    try {
        const files = fs.readdirSync(__dirname);
        console.log("📁 Archivos en directorio:");
        files.forEach(file => {
            console.log(`  - ${file}`);
        });
    } catch (err) {
        console.error("❌ Error leyendo directorio:", err.message);
    }
});

process.on("SIGINT", () => {
    if (db) {
        db.close();
        console.log("🔒 Base de datos cerrada");
    }
    process.exit(0);
});