const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Conexión a la base de datos
const db = new sqlite3.Database("./ANDE.db");

// GET - Obtener datos con filtros mejorados
// GET - Obtener datos con filtros mejorados
app.get("/api/datos", (req, res) => {
    const { seccion, anio, mes, tipo_medicion, fecha_inicio, fecha_fin, periodo, departamento } = req.query;

    let sql = `
        SELECT seccion, anio, mes, departamento, tipo_medicion, valor
        FROM mediciones_completas
        WHERE 1 = 1
    `;

    const params = [];

    // Filtro por alimentadores (sección) - CORREGIDO
    if (seccion) {
        if (Array.isArray(seccion)) {
            const placeholders = seccion.map(() => '?').join(',');
            sql += ` AND seccion IN (${placeholders})`;
            params.push(...seccion);
        } else {
            sql += " AND seccion = ?";
            params.push(seccion);
        }
    }

    // Filtro por departamento
    if (departamento) {
        if (Array.isArray(departamento)) {
            const placeholders = departamento.map(() => '?').join(',');
            sql += ` AND departamento IN (${placeholders})`;
            params.push(...departamento);
        } else {
            sql += " AND departamento = ?";
            params.push(departamento);
        }
    }

    // Filtro por período predefinido
    if (periodo) {
        const fechaActual = new Date();
        let fechaInicio = new Date();
        
        switch(periodo) {
            case '6m':
                fechaInicio.setMonth(fechaActual.getMonth() - 6);
                break;
            case '3m':
                fechaInicio.setMonth(fechaActual.getMonth() - 3);
                break;
            case '12m':
                fechaInicio.setMonth(fechaActual.getMonth() - 12);
                break;
            case 'ytd':
                fechaInicio = new Date(fechaActual.getFullYear(), 0, 1);
                break;
            default:
                fechaInicio = new Date(fechaActual.getFullYear() - 1, fechaActual.getMonth(), fechaActual.getDate());
        }
        
        sql += " AND (anio > ? OR (anio = ? AND mes >= ?))";
        params.push(fechaInicio.getFullYear(), fechaInicio.getFullYear(), fechaInicio.getMonth() + 1);
    }

    // Filtro por rango de fechas personalizado
    if (fecha_inicio && fecha_fin) {
        const [inicioAnio, inicioMes] = fecha_inicio.split('-').map(Number);
        const [finAnio, finMes] = fecha_fin.split('-').map(Number);
        
        sql += " AND (anio > ? OR (anio = ? AND mes >= ?))";
        params.push(inicioAnio, inicioAnio, inicioMes);
        
        sql += " AND (anio < ? OR (anio = ? AND mes <= ?))";
        params.push(finAnio, finAnio, finMes);
    } else {
        // Filtros individuales (mantener compatibilidad)
        if (anio) {
            sql += " AND anio = ?";
            params.push(Number(anio));
        }

        if (mes) {
            sql += " AND mes = ?";
            params.push(Number(mes));
        }
    }

    if (tipo_medicion) {
        sql += " AND tipo_medicion = ?";
        params.push(tipo_medicion.trim()); // IMPORTANTE: trim() para quitar espacios
    }

    sql += " ORDER BY anio ASC, mes ASC, seccion ASC";

    console.log("🔍 SQL ejecutado:", sql);
    console.log("📌 Parámetros:", params);

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error("❌ Error SQL:", err);
            return res.status(500).json({ error: err.message });
        }

        console.log(`✅ Datos obtenidos: ${rows.length} registros`);

        // Procesar datos para asegurar formato consistente
        const datos = rows.map(r => ({
            transformador: r.seccion,
            frecuencia: parseFloat(r.valor) || 0, // Convertir a número
            fecha: `${r.anio}-${String(r.mes).padStart(2, "0")}-01`, // Fecha en formato YYYY-MM-DD
            tipo: r.tipo_medicion,
            departamento: r.departamento || 'N/A'
        }));

        res.json(datos);
    });
});
// GET - Estadísticas agregadas para KPIs
app.get("/api/estadisticas", (req, res) => {
    const { seccion, anio, mes, tipo_medicion } = req.query;

    let sql = `
        SELECT 
            COUNT(*) as total_registros,
            AVG(valor) as promedio,
            MIN(valor) as minimo,
            MAX(valor) as maximo,
            COUNT(DISTINCT seccion) as alimentadores,
            COUNT(DISTINCT departamento) as departamentos
        FROM mediciones_completas
        WHERE 1 = 1
    `;

    const params = [];

    if (seccion) {
        if (Array.isArray(seccion)) {
            const placeholders = seccion.map(() => '?').join(',');
            sql += ` AND seccion IN (${placeholders})`;
            params.push(...seccion);
        } else {
            sql += " AND seccion = ?";
            params.push(seccion);
        }
    }

    if (anio) {
        sql += " AND anio = ?";
        params.push(Number(anio));
    }

    if (mes) {
        sql += " AND mes = ?";
        params.push(Number(mes));
    }

    if (tipo_medicion) {
        sql += " AND tipo_medicion = ?";
        params.push(tipo_medicion);
    }

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error("❌ Error SQL estadísticas:", err);
            return res.status(500).json({ error: err.message });
        }

        res.json(rows[0] || {});
    });
});

// GET - Datos para gráfico de calor (heatmap)
app.get("/api/heatmap", (req, res) => {
    const { seccion, anio, tipo_medicion } = req.query;

    let sql = `
        SELECT 
            seccion,
            mes,
            AVG(valor) as promedio_mensual,
            COUNT(*) as total_mediciones
        FROM mediciones_completas
        WHERE 1 = 1
    `;

    const params = [];

    if (seccion) {
        if (Array.isArray(seccion)) {
            const placeholders = seccion.map(() => '?').join(',');
            sql += ` AND seccion IN (${placeholders})`;
            params.push(...seccion);
        } else {
            sql += " AND seccion = ?";
            params.push(seccion);
        }
    }

    if (anio) {
        sql += " AND anio = ?";
        params.push(Number(anio));
    }

    if (tipo_medicion) {
        sql += " AND tipo_medicion = ?";
        params.push(tipo_medicion);
    }

    sql += " GROUP BY seccion, mes ORDER BY mes ASC";

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error("❌ Error SQL heatmap:", err);
            return res.status(500).json({ error: err.message });
        }

        res.json(rows);
    });
});

// GET - Datos para gráfico de radar (rendimiento por departamento)
app.get("/api/radar", (req, res) => {
    const { anio, mes, tipo_medicion } = req.query;

    let sql = `
        SELECT 
            departamento,
            AVG(valor) as promedio,
            COUNT(*) as total,
            MIN(valor) as minimo,
            MAX(valor) as maximo,
            AVG(ABS(valor - 50)) as desviacion_promedio
        FROM mediciones_completas
        WHERE 1 = 1
    `;

    const params = [];

    if (anio) {
        sql += " AND anio = ?";
        params.push(Number(anio));
    }

    if (mes) {
        sql += " AND mes = ?";
        params.push(Number(mes));
    }

    if (tipo_medicion) {
        sql += " AND tipo_medicion = ?";
        params.push(tipo_medicion);
    }

    sql += " GROUP BY departamento ORDER BY promedio DESC";

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error("❌ Error SQL radar:", err);
            return res.status(500).json({ error: err.message });
        }

        res.json(rows);
    });
});

// GET - Datos para gráfico de cajas (boxplot)
app.get("/api/boxplot", (req, res) => {
    const { seccion, anio, tipo_medicion } = req.query;

    let sql = `
        SELECT 
            seccion,
            mes,
            valor,
            tipo_medicion
        FROM mediciones_completas
        WHERE 1 = 1
    `;

    const params = [];

    if (seccion) {
        if (Array.isArray(seccion)) {
            const placeholders = seccion.map(() => '?').join(',');
            sql += ` AND seccion IN (${placeholders})`;
            params.push(...seccion);
        } else {
            sql += " AND seccion = ?";
            params.push(seccion);
        }
    }

    if (anio) {
        sql += " AND anio = ?";
        params.push(Number(anio));
    }

    if (tipo_medicion) {
        sql += " AND tipo_medicion = ?";
        params.push(tipo_medicion);
    }

    sql += " ORDER BY seccion, mes";

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error("❌ Error SQL boxplot:", err);
            return res.status(500).json({ error: err.message });
        }

        // Agrupar por alimentador para el boxplot
        const grouped = {};
        rows.forEach(row => {
            if (!grouped[row.seccion]) {
                grouped[row.seccion] = [];
            }
            grouped[row.seccion].push(row.valor);
        });

        res.json(grouped);
    });
});

// GET - Listas auxiliares
app.get("/api/tipos-medicion", (req, res) => {
    db.all("SELECT DISTINCT tipo_medicion FROM mediciones_completas ORDER BY tipo_medicion DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.tipo_medicion));
    });
});

app.get("/api/secciones", (req, res) => {
    db.all("SELECT DISTINCT seccion FROM mediciones_completas ORDER BY seccion ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.seccion));
    });
});

app.get("/api/departamentos", (req, res) => {
    db.all("SELECT DISTINCT departamento FROM mediciones_completas ORDER BY departamento ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.departamento));
    });
});

app.get("/api/anios", (req, res) => {
    db.all("SELECT DISTINCT anio FROM mediciones_completas ORDER BY anio DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.anio));
    });
});

// GET - Resumen del sistema
app.get("/api/resumen", (req, res) => {
    db.all(`
        SELECT 
            (SELECT COUNT(DISTINCT seccion) FROM mediciones_completas) as total_alimentadores,
            (SELECT COUNT(*) FROM mediciones_completas) as total_registros,
            (SELECT MIN(anio) FROM mediciones_completas) as anio_inicio,
            (SELECT MAX(anio) FROM mediciones_completas) as anio_fin,
            (SELECT COUNT(DISTINCT departamento) FROM mediciones_completas) as total_departamentos,
            (SELECT AVG(valor) FROM mediciones_completas) as promedio_general,
            (SELECT MIN(valor) FROM mediciones_completas) as minimo_historico,
            (SELECT MAX(valor) FROM mediciones_completas) as maximo_historico
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows[0] || {});
    });
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor ANDE Dashboard en http://localhost:${PORT}`);
    console.log(`📊 Endpoints disponibles:`);
    console.log(`   GET /api/datos - Datos principales con filtros mejorados`);
    console.log(`   GET /api/estadisticas - Estadísticas agregadas`);
    console.log(`   GET /api/heatmap - Datos para heatmap`);
    console.log(`   GET /api/radar - Datos para gráfico radar`);
    console.log(`   GET /api/boxplot - Datos para boxplot`);
    console.log(`   GET /api/resumen - Resumen del sistema`);
    console.log(`   GET /api/secciones - Lista de alimentadores`);
    console.log(`   GET /api/departamentos - Lista de departamentos`);
    console.log(`   GET /api/anios - Lista de años disponibles`);
});

process.on("SIGINT", () => {
    db.close();
    process.exit(0);
});