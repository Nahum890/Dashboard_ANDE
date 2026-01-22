// test_db.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./ANDE.db');

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    console.log('📋 Tablas:', tables);
    
    db.get("SELECT COUNT(*) as total FROM mediciones_completas", (err, row) => {
        console.log(`📊 Total registros: ${row.total}`);
        
        db.all("SELECT * FROM mediciones_completas LIMIT 5", (err, rows) => {
            console.log('🔍 Primeros 5 registros:');
            rows.forEach(r => console.log(r));
            db.close();
        });
    });
});