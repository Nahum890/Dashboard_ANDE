const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./ANDE.db');

console.log("🔧 Actualizando valores en la base de datos...");

// Función para generar valores realistas basados en el tipo de medición
function getRealisticValue(tipoMedicion) {
    switch(tipoMedicion) {
        case 'TOTAL PENEF':
        case 'TOTAL DEP':
        case 'TOTAL FEP':
            return 50000 + Math.random() * 20000; // 50,000-70,000
        case 'ACCID.DEP':
        case 'ACCID.FEP':
        case 'ACCID.PENF':
            return Math.floor(Math.random() * 10); // 0-10 incidentes
        case 'PROG.DEP':
        case 'PROG.FEP':
        case 'PROG.PENF':
            return 0.1 + Math.random() * 0.9; // 0.1-1.0 (10%-100%)
        case 'PROD.DEP':
        case 'PROD.FEP':
        case 'PROD.PENF':
            return 1000 + Math.random() * 4000; // 1,000-5,000
        default:
            return 100 + Math.random() * 900; // 100-1,000
    }
}

// 1. Primero, ver qué datos tenemos
db.all("SELECT COUNT(*) as total FROM mediciones_completas", (err, result) => {
    if (err) {
        console.error("❌ Error al contar:", err.message);
        db.close();
        return;
    }
    
    console.log(`📊 Total de registros: ${result[0].total}`);
    
    // 2. Actualizar TODOS los registros con valores realistas
    db.all("SELECT id, tipo_medicion FROM mediciones_completas", (err, rows) => {
        if (err) {
            console.error("❌ Error al leer registros:", err.message);
            db.close();
            return;
        }
        
        console.log(`🔄 Actualizando ${rows.length} registros...`);
        
        let updated = 0;
        rows.forEach(row => {
            const nuevoValor = getRealisticValue(row.tipo_medicion);
            
            db.run(
                "UPDATE mediciones_completas SET valor = ? WHERE id = ?",
                [nuevoValor, row.id],
                (err) => {
                    if (err) {
                        console.error(`❌ Error actualizando registro ${row.id}:`, err.message);
                    } else {
                        updated++;
                    }
                    
                    // Cuando todos estén actualizados
                    if (updated === rows.length) {
                        console.log(`✅ ${updated} registros actualizados con valores realistas`);
                        
                        // Verificar algunos registros actualizados
                        db.all("SELECT tipo_medicion, valor FROM mediciones_completas LIMIT 5", (err, sample) => {
                            if (err) {
                                console.error("❌ Error al verificar:", err.message);
                            } else {
                                console.log("\n📝 Muestra de datos actualizados:");
                                sample.forEach(r => {
                                    console.log(`  ${r.tipo_medicion}: ${r.valor}`);
                                });
                            }
                            db.close();
                            console.log("\n🎉 ¡Base de datos actualizada! Reinicia el servidor.");
                        });
                    }
                }
            );
        });
    });
});