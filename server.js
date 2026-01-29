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
// 2. CONEXIÓN A BASE DE DATOS
// ========================
console.log("🔍 Verificando entorno...");
console.log("📁 Directorio actual:", __dirname);

let db = null;
let useMockData = true; // Por defecto usar datos mock

try {
    // Verificar si la base de datos existe
    if (fs.existsSync("./ANDE.db")) {
        console.log("✅ Base de datos ANDE.db encontrada");
        
        // Intentar cargar sqlite3
        try {
            const sqlite3 = require("sqlite3").verbose();
            db = new sqlite3.Database("./ANDE.db");
            
            // Probar la conexión
            db.get("SELECT 1 as test", (err, row) => {
                if (err) {
                    console.error("❌ Error probando SQLite:", err.message);
                    useMockData = true;
                } else {
                    console.log("✅ SQLite conectado correctamente");
                    useMockData = false;
                    
                    // Contar registros
                    db.get("SELECT COUNT(*) as count FROM mediciones_completas", (err, result) => {
                        if (!err && result) {
                            console.log(`📊 Total de registros en BD: ${result.count}`);
                        }
                    });
                }
            });
        } catch (sqliteError) {
            console.error("❌ Error al cargar sqlite3:", sqliteError.message);
            useMockData = true;
        }
    } else {
        console.log("⚠️  Base de datos ANDE.db no encontrada, usando datos mock");
        useMockData = true;
    }
} catch (error) {
    console.error("❌ Error general:", error.message);
    useMockData = true;
}

// ========================
// 3. DATOS MOCK (para cuando SQLite no está disponible)
// ========================
const MOCK_DATA = {
    tipos_medicion: ['ACCID.DEP', 'ACCID.FEP', 'PROG.FEP', 'PROD.FEP', 'TOTAL FEP', 'ACCID.PENF', 'PROG.PENF', 'PROD.PENF', 'TOTAL PENEF', 'PROG.DEP', 'PROD.DEP', 'TOTAL DEP'],
    secciones: ['ACY1', 'ACY2', 'ACY3', 'ACY4', 'ACY5', 'ACY6'],
    anios: [2025, 2024, 2023, 2022, 2021, 2020, 2019],
    
    // Generar datos mock para el endpoint de datos
    generarDatosMock: function(seccion = 'ACY1', anio = '2025', tipo_medicion = 'ACCID.DEP', mes = null) {
        const resultados = [];
        const meses = mes ? [parseInt(mes)] : Array.from({ length: 12 }, (_, i) => i + 1);
        
        meses.forEach(mesNum => {
            // Valor base con variación realista
            let baseValue;
            switch(tipo_medicion) {
                case 'TOTAL PENEF':
                case 'TOTAL DEP':
                case 'TOTAL FEP':
                    baseValue = 50000;
                    break;
                case 'ACCID.DEP':
                case 'ACCID.FEP':
                case 'ACCID.PENF':
                    baseValue = 5;
                    break;
                case 'PROG.DEP':
                case 'PROG.FEP':
                case 'PROG.PENF':
                    baseValue = 0.5;
                    break;
                default:
                    baseValue = 50;
            }
            
            // Variación por mes
            const monthFactor = Math.sin(mesNum * 0.5) * 0.3;
            // Variación aleatoria
            const randomFactor = (Math.random() - 0.5) * 0.2;
            
            const valor = baseValue * (1 + monthFactor) * (1 + randomFactor);
            
            resultados.push({
                transformador: seccion,
                frecuencia: parseFloat(valor.toFixed(4)),
                fecha: `${anio}-${String(mesNum).padStart(2, '0')}-01`,
                tipo: tipo_medicion,
                departamento: 'ALTO PARANÁ',
                year: parseInt(anio),
                combinationKey: `${seccion}-${anio}-${tipo_medicion}`,
                combinationLabel: `${seccion} (${anio}, ${tipo_medicion})`
            });
        });
        
        return resultados;
    }
};

// ========================
// 4. ENDPOINTS
// ========================

// Health check - CRÍTICO para Render
app.get("/api/health", (req, res) => {
    console.log("🏥 Health check recibido");
    res.json({ 
        status: "OK", 
        timestamp: new Date().toISOString(),
        service: "ANDE Dashboard API",
        version: "1.0.0",
        database: useMockData ? "Mock Data" : "SQLite Connected",
        mode: useMockData ? "DEMO" : "PRODUCTION"
    });
});

// Test endpoint
app.get("/api/test", (req, res) => {
    res.json({ 
        message: "API funcionando",
        timestamp: new Date().toISOString()
    });
});

// Tipos de medición
app.get("/api/tipos-medicion", (req, res) => {
    console.log("📋 /api/tipos-medicion llamado");
    
    if (useMockData) {
        console.log("✅ Devolviendo tipos mock");
        return res.json(MOCK_DATA.tipos_medicion);
    }
    
    if (!db) {
        return res.status(500).json({ error: "Base de datos no disponible" });
    }
    
    db.all("SELECT DISTINCT tipo_medicion FROM mediciones_completas ORDER BY tipo_medicion", [], (err, rows) => {
        if (err) {
            console.error("❌ Error SQL:", err.message);
            // Fallback a datos mock
            res.json(MOCK_DATA.tipos_medicion);
        } else {
            const tipos = rows.map(r => r.tipo_medicion).filter(t => t);
            console.log(`✅ Tipos encontrados: ${tipos.length}`);
            res.json(tipos);
        }
    });
});

// Secciones
app.get("/api/secciones", (req, res) => {
    console.log("📋 /api/secciones llamado");
    
    if (useMockData) {
        console.log("✅ Devolviendo secciones mock");
        return res.json(MOCK_DATA.secciones);
    }
    
    if (!db) {
        return res.status(500).json({ error: "Base de datos no disponible" });
    }
    
    db.all("SELECT DISTINCT seccion FROM mediciones_completas ORDER BY seccion", [], (err, rows) => {
        if (err) {
            console.error("❌ Error SQL:", err.message);
            // Fallback a datos mock
            res.json(MOCK_DATA.secciones);
        } else {
            const secciones = rows.map(r => r.seccion).filter(s => s);
            console.log(`✅ Secciones encontradas: ${secciones.length}`);
            
            // Extraer estaciones (primeras 3 letras)
            const estacionesSet = new Set();
            secciones.forEach(seccion => {
                if (seccion && seccion.length >= 3) {
                    estacionesSet.add(seccion.substring(0, 3));
                }
            });
            console.log("🏭 Estaciones extraídas:", Array.from(estacionesSet));
            
            res.json(secciones);
        }
    });
});

// Años
app.get("/api/anios", (req, res) => {
    console.log("📋 /api/anios llamado");
    
    if (useMockData) {
        console.log("✅ Devolviendo años mock");
        return res.json(MOCK_DATA.anios);
    }
    
    if (!db) {
        return res.status(500).json({ error: "Base de datos no disponible" });
    }
    
    db.all("SELECT DISTINCT anio FROM mediciones_completas ORDER BY anio DESC", [], (err, rows) => {
        if (err) {
            console.error("❌ Error SQL:", err.message);
            // Fallback a datos mock
            res.json(MOCK_DATA.anios);
        } else {
            const anios = rows.map(r => r.anio).filter(a => a);
            console.log(`✅ Años encontrados: ${anios.length}`);
            res.json(anios);
        }
    });
});

// Endpoint principal de datos
app.get("/api/datos", (req, res) => {
    console.log("📥 /api/datos llamado con parámetros:", req.query);
    
    const { seccion, anio, mes, tipo_medicion } = req.query;
    
    // Validar parámetros mínimos
    if (!seccion || !anio || !tipo_medicion) {
        console.warn("⚠️ Faltan parámetros requeridos");
        return res.status(400).json({ 
            error: "Faltan parámetros: seccion, anio, tipo_medicion" 
        });
    }
    
    // ============================
    // MODO MOCK
    // ============================
    if (useMockData) {
        console.log("📊 Generando datos mock");
        const datos = MOCK_DATA.generarDatosMock(seccion, anio, tipo_medicion, mes);
        console.log(`✅ Devolviendo ${datos.length} registros mock`);
        return res.json(datos);
    }
    
    // ============================
    // MODO SQLITE
    // ============================
    if (!db) {
        return res.status(500).json({ error: "Base de datos no disponible" });
    }
    
    // Construir SQL
    let sql = `SELECT * FROM mediciones_completas WHERE seccion = ? AND anio = ? AND tipo_medicion = ?`;
    const params = [seccion, Number(anio), tipo_medicion.trim()];
    
    if (mes) {
        sql += ` AND mes = ?`;
        params.push(Number(mes));
    }
    
    sql += ` ORDER BY mes ASC`;
    
    console.log("🔍 SQL:", sql);
    console.log("📌 Parámetros:", params);
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error("❌ Error SQL:", err.message);
            // Fallback a datos mock
            console.log("🔄 Fallback a datos mock debido a error SQL");
            const datos = MOCK_DATA.generarDatosMock(seccion, anio, tipo_medicion, mes);
            res.json(datos);
            return;
        }
        
        console.log(`✅ Datos SQLite encontrados: ${rows.length} registros`);
        
        // Transformar datos
        const datos = rows.map(r => ({
            transformador: r.seccion,
            frecuencia: parseFloat(r.valor) || 0,
            fecha: `${r.anio}-${String(r.mes).padStart(2, "0")}-01`,
            tipo: r.tipo_medicion,
            departamento: r.departamento || 'N/A',
            year: r.anio,
            combinationKey: `${r.seccion}-${r.anio}-${r.tipo_medicion}`,
            combinationLabel: `${r.seccion} (${r.anio}, ${r.tipo_medicion})`
        }));
        
        res.json(datos);
    });
});

// ========================
// 5. SERVIR FRONTEND
// ========================
app.get("*", (req, res) => {
    // Si es una ruta de API, ya fue manejada
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "Endpoint no encontrado" });
    }
    
    // Si es un archivo estático, servirlo
    if (req.path.includes(".")) {
        return res.sendFile(path.join(__dirname, req.path));
    }
    
    // Si no, servir index.html (SPA)
    res.sendFile(path.join(__dirname, "index.html"));
});

// ========================
// 6. MANEJO DE ERRORES
// ========================
app.use((err, req, res, next) => {
    console.error("❌ Error no manejado:", err);
    res.status(500).json({ 
        error: "Error interno del servidor",
        message: process.env.NODE_ENV === "development" ? err.message : undefined
    });
});

// ========================
// 7. INICIAR SERVIDOR
// ========================
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log("=".repeat(60));
    console.log(`🚀 SERVICIO ANDE DASHBOARD INICIADO`);
    console.log(`🌐 URL: http://${HOST}:${PORT}`);
    console.log(`📊 Modo: ${useMockData ? "DEMO (datos mock)" : "PRODUCCIÓN (SQLite)"}`);
    console.log(`📁 Directorio: ${__dirname}`);
    console.log(`⚙️  Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log("=".repeat(60));
    
    // Listar algunos archivos para debug
    try {
        const files = fs.readdirSync(__dirname).slice(0, 10);
        console.log("📁 Primeros 10 archivos en directorio:");
        files.forEach(file => {
            const stats = fs.statSync(path.join(__dirname, file));
            console.log(`  - ${file} (${stats.size} bytes)`);
        });
    } catch (err) {
        console.error("❌ Error leyendo directorio:", err.message);
    }
});