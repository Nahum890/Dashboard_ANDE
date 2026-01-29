const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");

const app = express();

// 1. Middlewares (Importante el orden)
app.use(cors());
app.use(express.json());

// 2. Conexión a la base de datos
const db = new sqlite3.Database("./ANDE.db");

// 3. Endpoints (Se mantienen igual que tu lógica original)
app.get("/api/datos", (req, res) => {
    const { seccion, anio, mes, tipo_medicion } = req.query;

    let sql = `
        SELECT seccion, anio, mes, departamento, tipo_medicion, valor
        FROM mediciones_completas
        WHERE 1 = 1
    `;

    const params = [];

    // Filtro por alimentadores (sección) - múltiple
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

    // Filtro por año - múltiple
    if (anio) {
        if (Array.isArray(anio)) {
            const placeholders = anio.map(() => '?').join(',');
            sql += ` AND anio IN (${placeholders})`;
            params.push(...anio.map(a => Number(a)));
        } else {
            sql += " AND anio = ?";
            params.push(Number(anio));
        }
    }

    // Filtro por mes
    if (mes) {
        sql += " AND mes = ?";
        params.push(Number(mes));
    }

    // Filtro por tipo de medición - múltiple
    if (tipo_medicion) {
        if (Array.isArray(tipo_medicion)) {
            const placeholders = tipo_medicion.map(() => '?').join(',');
            sql += ` AND tipo_medicion IN (${placeholders})`;
            params.push(...tipo_medicion.map(t => t.trim()));
        } else {
            sql += " AND tipo_medicion = ?";
            params.push(tipo_medicion.trim());
        }
    }

    sql += " ORDER BY anio ASC, mes ASC, seccion ASC, tipo_medicion ASC";

    console.log("🔍 SQL ejecutado para comparación:", sql);
    console.log("📌 Parámetros:", params);

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error("❌ Error SQL:", err);
            return res.status(500).json({ error: err.message });
        }

        console.log(`✅ Datos obtenidos para comparación: ${rows.length} registros`);

        // Procesar datos para asegurar formato consistente
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

// 4. Servir archivos estáticos (Frontend)
app.use(express.static(path.join(__dirname)));

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// 5. PUERTO DINÁMICO PARA RENDER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor ANDE Dashboard en puerto ${PORT}`);
});

process.on("SIGINT", () => {
    db.close();
    process.exit(0);
});