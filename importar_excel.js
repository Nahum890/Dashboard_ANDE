// import-excel.js
const xlsx = require('xlsx');
const sqlite3 = require('sqlite3').verbose();

// Configuración
const DB_PATH = './ANDE.db';
const EXCEL_PATH = 'datos.xlsx'; // Cambia esto

// Conectar a la base de datos
const db = new sqlite3.Database(DB_PATH);

async function importarExcel() {
    try {
        console.log('📂 Leyendo archivo Excel...');
        
        // 1. Leer el Excel
        const workbook = xlsx.readFile(EXCEL_PATH);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);
        
        console.log(`📊 Encontradas ${data.length} filas en el Excel`);
        
        // 2. Transformar los datos
        const mediciones = [];
        
        data.forEach((row, index) => {
            // Extraer datos base de cada fila
            const baseData = {
                ALIMENTADOR: row['ALIMENTADOR'] || row['SECCION'],
                SECCION: row['SECCION'] || row['ALIMENTADOR'],
                DEPARTAMENTO: row['DEPARTAMENTO'],
                MES: row['MES'],
                ANIO: row['año'] || row['AÑO'],
                PERIODO: row['PERIODO'],
                LOCAL: row['LOCAL']
            };
            
            // Lista de todas las columnas de medición
            const columnasMedicion = [
                'ACCID.DEP', 'PROG.DEP', 'PROD.DEP', 'TOTAL DEP',
                'ACCID.FEP', 'PROG.FEP', 'PROD.FEP', 'TOTAL FEP',
                'ACCID.PENF', 'PROG.PENF', 'PROD.PENF', 'TOTAL PENEF'
            ];
            
            // Para cada columna de medición, crear una fila en la base de datos
            columnasMedicion.forEach(columna => {
                if (row[columna] !== undefined && row[columna] !== null && row[columna] !== '') {
                    mediciones.push({
                        seccion: baseData.ALIMENTADOR || baseData.SECCION,
                        anio: baseData.ANIO,
                        mes: baseData.MES,
                        departamento: baseData.DEPARTAMENTO,
                        tipo_medicion: columna,
                        valor: parseFloat(row[columna]) || 0
                    });
                }
            });
        });
        
        console.log(`🔄 Transformando a ${mediciones.length} registros de mediciones...`);
        
        // 3. Insertar en la base de datos
        const insertQuery = `
            INSERT OR REPLACE INTO mediciones_completas 
            (seccion, anio, mes, departamento, tipo_medicion, valor)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        let contador = 0;
        const batchSize = 100;
        
        for (let i = 0; i < mediciones.length; i += batchSize) {
            const batch = mediciones.slice(i, i + batchSize);
            const promises = batch.map(med => {
                return new Promise((resolve, reject) => {
                    db.run(insertQuery, [
                        med.seccion,
                        med.anio,
                        med.mes,
                        med.departamento,
                        med.tipo_medicion,
                        med.valor
                    ], function(err) {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            });
            
            await Promise.all(promises);
            contador += batch.length;
            console.log(`✅ Insertados ${contador}/${mediciones.length} registros`);
        }
        
        console.log('🎉 Importación completada exitosamente!');
        
    } catch (error) {
        console.error('❌ Error durante la importación:', error);
    } finally {
        db.close();
    }
}

// Instrucciones de uso
console.log('=====================================');
console.log('IMPORTADOR DE EXCEL A BASE DE DATOS');
console.log('=====================================');
console.log('Instrucciones:');
console.log('1. Guarda tu archivo Excel como "datos.xlsx" en la misma carpeta');
console.log('2. Asegúrate que las columnas tengan los nombres correctos');
console.log('3. Ejecuta: npm install xlsx');
console.log('4. Ejecuta: node import-excel.js');
console.log('=====================================');

// Ejecutar la importación
importarExcel();