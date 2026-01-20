const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database("./ANDE.db");

// GET - Obtener datos con filtros
app.get("/api/datos", (req, res) => {
    const { seccion, anio, mes, tipo_medicion } = req.query;

    let sql = `
        SELECT
            seccion,
            anio,
            mes,
            departamento,
            tipo_medicion,
            valor
        FROM mediciones_completas
        WHERE 1 = 1
    `;

    const params = [];

    if (seccion) {
        sql += " AND seccion = ?";
        params.push(seccion);
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

    sql += " ORDER BY anio DESC, mes DESC";

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error("❌ Error:", err);
            return res.status(500).json({ error: err.message });
        }

        // Convertir a formato frontend
        const datos = rows.map(r => ({
            transformador: r.seccion,
            frecuencia: r.valor,
            fecha: `${r.anio}-${String(r.mes).padStart(2, "0")}-01`,
            tipo: r.tipo_medicion,
            departamento: r.departamento
        }));

        res.json(datos);
    });
});

// GET - Obtener tipos de medición disponibles
app.get("/api/tipos-medicion", (req, res) => {
    const sql = `
        SELECT DISTINCT tipo_medicion 
        FROM mediciones_completas 
        ORDER BY tipo_medicion
    `;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows.map(r => r.tipo_medicion));
    });
});

// GET - Obtener secciones únicas
app.get("/api/secciones", (req, res) => {
    const sql = "SELECT DISTINCT seccion FROM mediciones_completas ORDER BY seccion";
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows.map(r => r.seccion));
    });
});

// POST - Agregar nueva medición
app.post("/api/datos", (req, res) => {
    const { transformador, frecuencia, fecha, tipo_medicion } = req.body;

    if (!transformador || !frecuencia || !fecha) {
        return res.status(400).json({ error: "Faltan datos requeridos" });
    }

    const [anio, mes] = fecha.split("-").map(Number);
    const tipo = tipo_medicion || "TOTAL FEP";

    const sql = `
        INSERT INTO mediciones_completas (seccion, anio, mes, tipo_medicion, valor)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.run(sql, [transformador, anio, mes, tipo, frecuencia], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, id: this.lastID });
    });
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor en http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
    db.close();
    console.log("\n✅ Servidor cerrado");
    process.exit(0);
});
// GET - Obtener resumen estadístico
app.get("/api/estadisticas", (req, res) => {
    const { seccion, anio, mes } = req.query;
    
    let sql = `
        SELECT 
            seccion,
            tipo_medicion,
            COUNT(*) as cantidad,
            AVG(valor) as promedio,
            MIN(valor) as minimo,
            MAX(valor) as maximo
        FROM mediciones_completas
        WHERE 1 = 1
    `;
    
    const params = [];
    
    if (seccion) {
        sql += " AND seccion = ?";
        params.push(seccion);
    }
    
    if (anio) {
        sql += " AND anio = ?";
        params.push(Number(anio));
    }
    
    if (mes) {
        sql += " AND mes = ?";
        params.push(Number(mes));
    }
    
    sql += " GROUP BY seccion, tipo_medicion ORDER BY seccion, tipo_medicion";
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});