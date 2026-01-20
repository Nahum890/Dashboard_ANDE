// importar_excel_corregido_final_v2.js
const xlsx = require('xlsx');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./ANDE.db');

async function importarExcel() {
    try {
        console.log('📂 Leyendo archivo Excel...');
        const workbook = xlsx.readFile('datos.xlsx');
        
        console.log('📋 Hojas disponibles:', workbook.SheetNames);
        
        // Solo procesar la hoja que tiene los datos reales
        const targetSheet = 'FEP DEP PENF - Datos de Prueba ';
        
        if (!workbook.SheetNames.includes(targetSheet)) {
            console.log(`❌ Hoja "${targetSheet}" no encontrada`);
            return;
        }
        
        console.log(`\n=== PROCESANDO HOJA: "${targetSheet}" ===`);
        const worksheet = workbook.Sheets[targetSheet];
        
        // Leer los datos
        const data = xlsx.utils.sheet_to_json(worksheet);
        console.log(`📊 Encontradas ${data.length} filas en la hoja`);
        
        if (data.length === 0) {
            console.log('❌ No hay datos en la hoja');
            return;
        }
        
        // Mostrar las primeras columnas para verificar
        console.log('\n📋 Primer registro para verificar columnas:');
        const primerRegistro = data[0];
        Object.keys(primerRegistro).forEach((key, index) => {
            if (index < 10) { // Solo mostrar las primeras 10 columnas
                console.log(`   ${index + 1}. ${key} = ${primerRegistro[key]}`);
            }
        });
        
        console.log('\n🔄 Transformando datos...');
        const mediciones = [];
        let filasProcesadas = 0;
        let filasConError = 0;
        
        // Procesar cada fila
        data.forEach((row, index) => {
            filasProcesadas++;
            
            // Obtener valores con validación
            const seccion = row['ALIMENTADOR'] || row['SECCION'] || '';
            const departamento = row['DEPARTAMENTO'] || '';
            
            // Manejar el MES - convertirlo correctamente
            let mes = row['MES'];
            let mesNumero = null;
            
            if (mes !== undefined && mes !== null && mes !== '') {
                // Si es un número, usarlo directamente
                if (typeof mes === 'number') {
                    mesNumero = Math.round(mes);
                } 
                // Si es una fecha (objeto Date)
                else if (mes instanceof Date) {
                    mesNumero = mes.getMonth() + 1; // getMonth() devuelve 0-11
                }
                // Si es texto, intentar convertirlo
                else if (typeof mes === 'string') {
                    const mesTexto = mes.toString().trim();
                    // Mapear nombres de meses a números
                    const mesesMap = {
                        'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
                        'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
                        'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12,
                        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
                        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
                    };
                    
                    const mesLower = mesTexto.toLowerCase();
                    if (mesesMap[mesLower]) {
                        mesNumero = mesesMap[mesLower];
                    } else {
                        // Intentar extraer número del texto
                        const match = mesTexto.match(/\d+/);
                        if (match) {
                            mesNumero = parseInt(match[0]);
                        }
                    }
                }
            }
            
            // Manejar el AÑO
            let anio = row['año'] || row['AÑO'] || row['ANIO'];
            let anioNumero = null;
            
            if (anio !== undefined && anio !== null && anio !== '') {
                anioNumero = parseInt(anio);
                if (isNaN(anioNumero)) {
                    anioNumero = null;
                }
            }
            
            // Validar datos requeridos
            if (!seccion || mesNumero === null || anioNumero === null || 
                mesNumero < 1 || mesNumero > 12 || anioNumero < 2000 || anioNumero > 2100) {
                
                filasConError++;
                if (filasConError <= 5) { // Solo mostrar los primeros 5 errores
                    console.log(`⚠️ Fila ${index + 1} inválida: ALIMENTADOR="${seccion}", MES="${mes}"->${mesNumero}, AÑO="${anio}"->${anioNumero}`);
                }
                return; // Saltar esta fila
            }
            
            // Lista de columnas de medición
            const columnasMedicion = [
                'ACCID.DEP', 'PROG.DEP', 'PROD.DEP', 'TOTAL DEP',
                'ACCID.FEP', 'PROG.FEP', 'PROD.FEP', 'TOTAL FEP',
                'ACCID.PENF', 'PROG.PENF', 'PROD.PENF', 'TOTAL PENEF'
            ];
            
            // Para cada columna de medición, crear un registro
            columnasMedicion.forEach(columna => {
                const valor = row[columna];
                if (valor !== undefined && valor !== null && valor !== '') {
                    const valorNumero = parseFloat(valor);
                    if (!isNaN(valorNumero)) {
                        mediciones.push({
                            seccion: seccion.toString().trim(),
                            anio: anioNumero,
                            mes: mesNumero,
                            departamento: departamento.toString().trim(),
                            tipo_medicion: columna,
                            valor: valorNumero
                        });
                    }
                }
            });
        });
        
        console.log(`\n✅ Transformación completada:`);
        console.log(`   - Filas procesadas: ${filasProcesadas}`);
        console.log(`   - Filas con errores: ${filasConError}`);
        console.log(`   - Mediciones a importar: ${mediciones.length}`);
        
        if (mediciones.length === 0) {
            console.log('❌ No hay mediciones para importar.');
            return;
        }
        
        // Mostrar algunas muestras
        console.log('\n📝 Muestra de datos (primeras 5 mediciones):');
        mediciones.slice(0, 5).forEach((med, i) => {
            console.log(`   ${i + 1}. ${med.seccion} | ${med.anio}-${med.mes} | ${med.tipo_medicion}: ${med.valor}`);
        });
        
        // Insertar en la base de datos
        console.log('\n💾 Insertando en la base de datos...');
        
        // Primero, limpiar la tabla existente
        db.run('DELETE FROM mediciones_completas', async (err) => {
            if (err) {
                console.error('Error al limpiar tabla:', err.message);
                return;
            }
            
            console.log('🗑️ Tabla limpiada. Insertando nuevos datos...');
            
            const insertQuery = `
                INSERT INTO mediciones_completas 
                (seccion, anio, mes, departamento, tipo_medicion, valor)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            let insertadas = 0;
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
                            if (err) {
                                console.error(`Error insertando: ${med.seccion} - ${med.tipo_medicion}`, err.message);
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    });
                });
                
                try {
                    await Promise.all(promises);
                    insertadas += batch.length;
                    if (insertadas % 1000 === 0) {
                        console.log(`   Progreso: ${insertadas}/${mediciones.length} (${Math.round(insertadas/mediciones.length*100)}%)`);
                    }
                } catch (error) {
                    console.error('Error en batch:', error.message);
                    // Continuar con el siguiente batch
                }
            }
            
            console.log(`\n✅ ${insertadas} registros insertados exitosamente!`);
            
            // Verificar los datos
            console.log('\n📊 Verificando datos importados...');
            
            db.all('SELECT COUNT(*) as total FROM mediciones_completas', [], (err, rows) => {
                if (err) {
                    console.error('Error:', err.message);
                } else {
                    console.log(`   Total registros: ${rows[0].total}`);
                }
                
                db.all('SELECT tipo_medicion, COUNT(*) as cantidad FROM mediciones_completas GROUP BY tipo_medicion', [], (err, rows) => {
                    if (err) {
                        console.error('Error:', err.message);
                    } else {
                        console.log('\n📋 Distribución por tipo:');
                        rows.forEach(row => {
                            console.log(`   ${row.tipo_medicion}: ${row.cantidad}`);
                        });
                    }
                    
                    db.all('SELECT MIN(anio) as min_anio, MAX(anio) as max_anio, MIN(mes) as min_mes, MAX(mes) as max_mes FROM mediciones_completas', [], (err, rows) => {
                        if (err) {
                            console.error('Error:', err.message);
                        } else if (rows[0]) {
                            console.log(`\n📅 Rango de fechas:`);
                            console.log(`   Años: ${rows[0].min_anio} - ${rows[0].max_anio}`);
                            console.log(`   Meses: ${rows[0].min_mes} - ${rows[0].max_mes}`);
                        }
                        
                        db.close();
                        console.log('\n🎉 ¡Importación completada exitosamente!');
                        console.log('🚀 Ejecuta: node server.js');
                    });
                });
            });
        });
        
    } catch (error) {
        console.error('❌ Error crítico:', error.message);
        db.close();
    }
}

// Verificar que el archivo existe
const fs = require('fs');
if (!fs.existsSync('datos.xlsx')) {
    console.log('❌ Archivo "datos.xlsx" no encontrado.');
    console.log('   Por favor, coloca el archivo en la carpeta:');
    console.log('   ' + __dirname);
    process.exit(1);
}

console.log('=====================================');
console.log('IMPORTADOR CORREGIDO - VERSIÓN FINAL');
console.log('=====================================');
console.log('Este script maneja correctamente los valores de MES.');
console.log('=====================================\n');

importarExcel();