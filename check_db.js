const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./ANDE.db');

console.log("=== VERIFICANDO BASE DE DATOS ===");

// 1. Verificar tablas
db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
        console.error("❌ Error al verificar tablas:", err.message);
        return;
    }
    
    console.log("📊 Tablas disponibles:", tables.map(t => t.name));
    
    if (tables.length === 0) {
        console.log("⚠️  No hay tablas en la base de datos");
        db.close();
        return;
    }
    
    // 2. Verificar estructura de mediciones_completas
    db.all("PRAGMA table_info(mediciones_completas)", [], (err, columns) => {
        if (err) {
            console.log("La tabla mediciones_completas no existe o tiene otro nombre");
        } else {
            console.log("\n📋 Columnas de mediciones_completas:");
            columns.forEach(col => {
                console.log(`  - ${col.name} (${col.type})`);
            });
        }
        
        // 3. Verificar datos existentes
        console.log("\n🔍 Muestra de datos (primeros 5 registros):");
        db.all("SELECT * FROM mediciones_completas LIMIT 5", [], (err, rows) => {
            if (err) {
                console.error("❌ Error al leer datos:", err.message);
            } else if (rows.length === 0) {
                console.log("📭 La tabla está vacía");
            } else {
                rows.forEach((row, i) => {
                    console.log(`  Registro ${i+1}:`, row);
                });
            }
            
            // 4. Verificar valores únicos
            console.log("\n🎯 Valores únicos disponibles:");
            
            const queries = [
                { name: "tipo_medicion", sql: "SELECT DISTINCT tipo_medicion FROM mediciones_completas" },
                { name: "seccion", sql: "SELECT DISTINCT seccion FROM mediciones_completas" },
                { name: "anio", sql: "SELECT DISTINCT anio FROM mediciones_completas ORDER BY anio DESC" },
                { name: "departamento", sql: "SELECT DISTINCT departamento FROM mediciones_completas" }
            ];
            
            let completed = 0;
            queries.forEach(query => {
                db.all(query.sql, [], (err, results) => {
                    if (!err && results.length > 0) {
                        console.log(`  ${query.name}:`, results.map(r => Object.values(r)[0]));
                    }
                    completed++;
                    
                    if (completed === queries.length) {
                        db.close();
                        console.log("\n✅ Verificación completada");
                    }
                });
            });
        });
    });
});