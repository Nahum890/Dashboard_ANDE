// diagnostico_endpoints.js
const fetch = require('node-fetch');

async function testEndpoints() {
    const baseUrl = 'http://localhost:3000';
    
    console.log('🔍 Probando endpoints...\n');
    
    const endpoints = [
        '/api/tipos-medicion',
        '/api/secciones',
        '/api/anios',
        '/api/dashboard',
        '/api/tabla?page=1&limit=5'
    ];
    
    for (const endpoint of endpoints) {
        try {
            console.log(`📡 GET ${endpoint}`);
            const response = await fetch(baseUrl + endpoint);
            const data = await response.json();
            
            if (response.ok) {
                if (Array.isArray(data)) {
                    console.log(`✅ OK - ${data.length} items`);
                    if (data.length > 0) {
                        console.log(`   Muestra: ${JSON.stringify(data.slice(0, 3))}`);
                    }
                } else if (endpoint.includes('dashboard')) {
                    console.log(`✅ OK - Dashboard data`);
                    console.log(`   Gráfico: ${data.grafico?.length || 0} puntos`);
                    console.log(`   Estadísticas: ${Object.keys(data.estadisticas || {}).length} valores`);
                } else if (endpoint.includes('tabla')) {
                    console.log(`✅ OK - Tabla paginada`);
                    console.log(`   Datos: ${data.datos?.length || 0} registros`);
                    console.log(`   Total: ${data.paginacion?.total || 0} registros`);
                }
            } else {
                console.log(`❌ ERROR ${response.status}:`, data.error);
            }
        } catch (error) {
            console.log(`❌ ERROR: ${error.message}`);
        }
        console.log('---\n');
    }
}

testEndpoints();