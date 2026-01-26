class ANDEDashboard {
    constructor() {
        this.data = [];
        this.filteredData = [];
        this.mainChart = null;
        this.rankingChart = null;
        this.previousData = null;
        this.sortConfig = { column: null, direction: 'asc' };

        // Paleta de colores mejorada
        this.chartPalette = [
            '#FF0000', // 1. Rojo
            '#FFD700', // 2. Amarillo
            '#2563eb', // 3. Azul
            '#10b981', // 4. Verde
            '#8b5cf6', // 5. Violeta
            '#f97316', // 6. Naranja
            '#06b6d4', // 7. Cyan
            '#ec4899'  // 8. Rosa
        ];
        this.activeColorMap = {};

        this.filters = {
            tipoMedicion: '',
            transformador: [],
            year: '',
            month: ''
        };

        this.pagination = { currentPage: 1, rowsPerPage: 10, totalPages: 1 };
        this.chartZoom = { min: null, max: null };
        
        this.initialize();
    }

    async initialize() {
        this.showLoading(true);
        try {
            this.initCharts();
            await Promise.all([
                this.loadTiposMedicion(),
                this.loadSeccionesDisponibles(),
                this.loadYearsAvailable()
            ]);
            this.setInitialDefaults();
            await this.loadData();
            this.initializeEvents();
            this.startLiveUpdates();
            this.updateTime();
        } catch (error) {
            console.error("Error inicializando:", error);
            this.showNotification("Error inicializando el sistema", "error");
        } finally {
            this.showLoading(false);
        }
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        overlay.style.display = show ? 'flex' : 'none';
        
        if (show) {
            let progress = 0;
            const progressBar = document.getElementById('loaderProgress');
            const interval = setInterval(() => {
                progress += 10;
                progressBar.style.width = `${progress}%`;
                if (progress >= 90) clearInterval(interval);
            }, 200);
        }
    }

    showNotification(message, type = "success") {
        const notification = document.getElementById('notification');
        const icon = notification.querySelector('i');
        const text = notification.querySelector('.notification-text');
        
        notification.style.background = type === "error" ? "var(--danger)" : 
                                      type === "warning" ? "var(--warning)" : "var(--success)";
        icon.className = type === "error" ? "fas fa-exclamation-circle" :
                        type === "warning" ? "fas fa-exclamation-triangle" : "fas fa-check-circle";
        
        text.textContent = message;
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    updateTime() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
        const dateStr = now.toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        document.getElementById('currentTime').textContent = `${dateStr} | ${timeStr}`;
        
        setTimeout(() => this.updateTime(), 1000);
    }

    // --- CARGA DE SELECTORES ---
    async loadTiposMedicion() {
        try {
            const res = await fetch('http://localhost:3000/api/tipos-medicion');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const tipos = await res.json();
            
            // Verificar si hay tipos disponibles
            if (tipos && tipos.length > 0) {
                console.log("✅ Tipos de medición cargados desde BD:", tipos);
                this.fillSelect('filterTipoMedicion', tipos);
            } else {
                throw new Error("No hay tipos de medición en la BD");
            }
        } catch (error) {
            console.warn("⚠️  Usando tipos de medición por defecto:", error.message);
            // Usar tipos EXISTENTES de tu BD (tomados de check_db.js)
            this.fillSelect('filterTipoMedicion', [
                'ACCID.DEP', 'ACCID.FEP', 'PROG.FEP', 'PROD.FEP', 'TOTAL FEP',
                'ACCID.PENF', 'PROG.PENF', 'PROD.PENF', 'TOTAL PENEF', 'PROG.DEP',
                'PROD.DEP', 'TOTAL DEP'
            ]);
        }
    }

    async loadSeccionesDisponibles() {
        try {
            const res = await fetch('http://localhost:3000/api/secciones');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const secciones = await res.json();
            
            if (secciones && secciones.length > 0) {
                console.log("✅ Secciones cargadas desde BD:", secciones.length, "total");
                this.fillSelect('filterTransformador', secciones);
            } else {
                throw new Error("No hay secciones en la BD");
            }
        } catch (error) {
            console.warn("⚠️  Usando secciones por defecto:", error.message);
            // Usar algunas secciones existentes
            this.fillSelect('filterTransformador', [
                'ACY1', 'ACY2', 'ACY3', 'ACY4', 'ACY5', 'ACY6'
            ]);
        }
    }

    async loadYearsAvailable() {
        try {
            const res = await fetch('http://localhost:3000/api/anios');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const years = await res.json();
            
            if (years && years.length > 0) {
                console.log("✅ Años cargados desde BD:", years);
                // Ordenar descendente (más reciente primero)
                years.sort((a, b) => b - a);
                this.fillSelect('filterYear', years);
            } else {
                throw new Error("No hay años en la BD");
            }
        } catch (error) {
            console.warn("⚠️  Usando años por defecto:", error.message);
            // Usar años basados en lo que tiene la BD
            const years = [2025, 2024, 2023, 2022, 2021, 2020, 2019];
            this.fillSelect('filterYear', years);
        }
    }

    fillSelect(id, data) {
        const select = document.getElementById(id);
        if (!select) return;
        
        select.innerHTML = '';
        
        // Si es un array de strings/números
        data.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item;
            opt.textContent = item;
            select.appendChild(opt);
        });
    }

    // --- LÓGICA DE FILTROS ---
    setInitialDefaults() {
        console.log("🔧 Configurando valores predeterminados...");
        
        // Seleccionar tipo de medición por defecto (usar uno que tenga datos)
        const tipoSel = document.getElementById('filterTipoMedicion');
        if (tipoSel.options.length > 0) {
            // Buscar 'TOTAL PENEF' o 'TOTAL DEP' que probablemente tengan datos
            const defaultTipos = ['TOTAL PENEF', 'TOTAL DEP', 'TOTAL FEP', 'ACCID.DEP'];
            let selectedIndex = 0;
            
            for (let i = 0; i < tipoSel.options.length; i++) {
                if (defaultTipos.includes(tipoSel.options[i].value)) {
                    selectedIndex = i;
                    break;
                }
            }
            
            tipoSel.selectedIndex = selectedIndex;
            console.log("✅ Tipo seleccionado:", tipoSel.value);
        }
        
        // Seleccionar año que SÍ tiene datos (2024 en lugar de 2026)
        const yearSelect = document.getElementById('filterYear');
        if (yearSelect.options.length > 0) {
            // Buscar 2024 (que sabemos tiene datos según check_db.js)
            let yearIndex = 0;
            for (let i = 0; i < yearSelect.options.length; i++) {
                if (yearSelect.options[i].value === '2024') {
                    yearIndex = i;
                    break;
                }
            }
            // Si no encuentra 2024, usar el primero (más reciente)
            yearSelect.selectedIndex = yearIndex;
            console.log("✅ Año seleccionado:", yearSelect.value);
        }
        
        // Seleccionar alimentador por defecto
        const transSel = document.getElementById('filterTransformador');
        if (transSel.options.length > 0) {
            // Seleccionar ACY1 (que sabemos existe)
            let transIndex = 0;
            for (let i = 0; i < transSel.options.length; i++) {
                if (transSel.options[i].value === 'ACY1') {
                    transIndex = i;
                    break;
                }
            }
            transSel.selectedIndex = transIndex;
            transSel.options[transIndex].selected = true;
            console.log("✅ Alimentador seleccionado:", transSel.value);
        }

        this.syncFilters();
    }

    syncFilters() {
        const selectedOpts = Array.from(document.getElementById('filterTransformador').selectedOptions);
        this.filters = {
            tipoMedicion: document.getElementById('filterTipoMedicion').value,
            transformador: selectedOpts.map(o => o.value),
            year: document.getElementById('filterYear').value,
            month: document.getElementById('filterMonth').value
        };
        
        console.log("📋 Filtros actualizados:", this.filters);
    }

    async loadData() {
        this.showLoading(true);
        try {
            // Guardar datos anteriores para cálculos de tendencia
            this.previousData = this.data.length > 0 ? [...this.data] : null;
            
            const params = new URLSearchParams();
            
            // Usar EXACTAMENTE los valores de la BD
            if(this.filters.tipoMedicion) {
                // Asegurar que el tipo de medición sea exactamente como está en la BD
                params.append('tipo_medicion', this.filters.tipoMedicion.trim());
            }
            
            if(this.filters.year) params.append('anio', this.filters.year);
            if(this.filters.month) params.append('mes', this.filters.month);
            
            // Agregar secciones (alimentadores)
            this.filters.transformador.forEach(t => {
                params.append('seccion', t.trim());
            });

            const url = `http://localhost:3000/api/datos?${params}`;
            console.log("🌐 Solicitando datos:", url);
            
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            this.data = await res.json();
            this.filteredData = [...this.data];

            console.log("✅ Datos recibidos:", this.data.length, "registros");
            
            // DEBUG: Mostrar primeros registros
            if (this.data.length > 0) {
                console.log("📝 Primer registro:", this.data[0]);
            }

            // Actualizar estadísticas del sidebar
            document.getElementById('dataCount').textContent = this.data.length.toLocaleString();
            document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });

            this.updateKPIs();
            this.updateCharts(); 
            this.pagination.currentPage = 1;
            this.updateTable();
            
            this.showNotification(`Datos cargados: ${this.data.length} registros`, "success");
            
        } catch (e) {
            console.error('❌ Error cargando datos:', e);
            this.showNotification("Error cargando datos del servidor", "error");
            
            // Intentar con datos de demostración adaptados a tu BD
            this.loadDemoDataAdapted();
        } finally { 
            this.showLoading(false);
        }
    }

    loadDemoDataAdapted() {
        console.log("📂 Cargando datos de demostración adaptados...");
        
        const demoData = [];
        const alimentadores = this.filters.transformador.length > 0 ? 
            this.filters.transformador : ['ACY1', 'ACY2', 'ACY3'];
        const departamentos = ['ALTO PARANÁ', 'CANINDEYU', ''];
        
        // Generar datos realistas basados en el tipo de medición
        const tipo = this.filters.tipoMedicion || 'TOTAL PENEF';
        
        for (let i = 0; i < 30; i++) {
            const year = this.filters.year || '2024';
            const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
            const day = '01'; // Solo primer día para simplificar
            
            demoData.push({
                transformador: alimentadores[Math.floor(Math.random() * alimentadores.length)],
                frecuencia: this.generateDemoValue(tipo),
                fecha: `${year}-${month}-${day}`,
                tipo: tipo,
                departamento: departamentos[Math.floor(Math.random() * departamentos.length)]
            });
        }
        
        this.data = demoData;
        this.filteredData = [...demoData];
        
        console.log("📊 Datos demo generados:", demoData.length, "registros");
        
        this.updateKPIs();
        this.updateCharts();
        this.updateTable();
        
        this.showNotification("Usando datos de demostración", "warning");
    }
    
    generateDemoValue(tipoMedicion) {
        // Generar valores realistas según el tipo de medición
        switch(tipoMedicion) {
            case 'TOTAL PENEF':
            case 'TOTAL DEP':
            case 'TOTAL FEP':
                return 50000 + Math.random() * 20000; // 50,000-70,000
            case 'ACCID.DEP':
            case 'ACCID.FEP':
            case 'ACCID.PENF':
                return Math.random() * 10; // 0-10 incidentes
            case 'PROG.DEP':
            case 'PROG.FEP':
            case 'PROG.PENF':
                return Math.random(); // 0-1 proporción
            case 'PROD.DEP':
            case 'PROD.FEP':
            case 'PROD.PENF':
                return Math.random() * 1000; // 0-1000 producción
            default:
                return 50 + Math.random() * 50; // Valores genéricos
        }
    }

    // --- GRÁFICOS ---
    initCharts() {
        Chart.defaults.font.family = "'Inter', 'Segoe UI', system-ui, sans-serif";
        Chart.defaults.color = '#64748b';
        Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.95)';
        Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 14 };
        Chart.defaults.plugins.tooltip.bodyFont = { size: 13 };
        Chart.defaults.plugins.legend.labels.font = { weight: '600', size: 12 };
        Chart.defaults.plugins.legend.labels.padding = 20;

        // 1. Gráfico de Líneas Principal
        const ctxMain = document.getElementById('mainChart').getContext('2d');
        this.mainChart = new Chart(ctxMain, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
                plugins: {
                    legend: { 
                        display: false
                    },
                    tooltip: { 
                        mode: 'index', 
                        intersect: false, 
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleFont: { weight: '600', size: 14 },
                        bodyFont: { size: 13 },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        callbacks: {
                            label: (context) => {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                // Mostrar valor sin unidad específica
                                return `${label}: ${value.toFixed(4)}`;
                            }
                        }
                    }
                },
                scales: { 
                    y: { 
    beginAtZero: false, 
    grid: { 
        color: 'rgba(226, 232, 240, 0.5)',
        drawBorder: false
    }, 
    title: {
        display: true, 
        text: 'Valor',
        font: { weight: '600', size: 13 }
    },
    ticks: {
        font: { size: 12 },
        callback: function(value) {
            // Formatear números grandes
            if (value >= 1000000) {
                return (value/1000000).toFixed(1) + 'M';
            }
            if (value >= 1000) {
                return (value/1000).toFixed(0) + 'k';
            }
            if (Math.abs(value) < 0.001) {
                return value.toExponential(1);
            }
            if (Math.abs(value) < 1) {
                return value.toFixed(3);
            }
            if (Math.abs(value) < 10) {
                return value.toFixed(2);
            }
            if (Math.abs(value) < 1000) {
                return value.toFixed(1);
            }
            return value.toFixed(0);
        }
    }
}, 
                    x: { 
                        grid: { 
                            display: false 
                        },
                        ticks: {
                            font: { size: 12 },
                            maxRotation: 45
                        }
                    } 
                },
                elements: {
                    point: {
                        radius: 0,
                        hoverRadius: 8,
                        hoverBorderWidth: 3,
                        hoverBackgroundColor: '#ffffff'
                    },
                    line: {
                        tension: 0.3
                    }
                },
                animations: {
                    tension: {
                        duration: 1000,
                        easing: 'linear'
                    }
                }
            }
        });

        // 2. Gráfico de Ranking
        const ctxRank = document.getElementById('rankingChart').getContext('2d');
        this.rankingChart = new Chart(ctxRank, {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleFont: { weight: '600', size: 14 },
                        bodyFont: { size: 13 },
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function(context) {
                                return `Promedio: ${context.parsed.x.toFixed(4)}`;
                            }
                        }
                    }
                },
                scales: { 
                    x: { 
                        grid: { 
                            color: 'rgba(226, 232, 240, 0.5)',
                            drawBorder: false
                        },
                        title: {
                            display: true,
                            text: 'Valor Promedio',
                            font: { weight: '600', size: 13 }
                        },
                        ticks: {
                            font: { size: 12 },
                            callback: function(value) {
                                if (value >= 10000) {
                                    return (value/1000).toFixed(0) + 'k';
                                }
                                return value.toFixed(2);
                            }
                        }
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            font: { size: 12, weight: '600' }
                        }
                    }
                },
                elements: {
                    bar: {
                        borderRadius: 6,
                        borderSkipped: false,
                    }
                },
                animations: {
                    x: {
                        duration: 1500,
                        easing: 'easeOutQuart'
                    }
                }
            }
        });
    }

    updateCharts() {
    if (!this.mainChart || this.data.length === 0) {
        console.warn("⚠️  No hay datos para mostrar en gráficos");
        return;
    }

    console.log("📈 Actualizando gráficos con", this.data.length, "registros");
    
    this.activeColorMap = {};
    
    // Obtener todas las fechas únicas y ordenarlas
    const uniqueDates = [...new Set(this.data.map(d => d.fecha))].sort((a, b) => {
        return new Date(a) - new Date(b);
    });
    
    console.log("📅 Fechas únicas:", uniqueDates.length);
    
    const grouped = {};
    const averages = {}; 
    const maxValues = {};
    const minValues = {};

    // Recorremos los filtros seleccionados para asignar color basado en su ORDEN
    this.filters.transformador.forEach((nombre, idx) => {
        // Asignación cíclica de colores
        const color = this.chartPalette[idx % this.chartPalette.length];
        this.activeColorMap[nombre] = color;
        
        // Filtrar datos para este alimentador
        const items = this.data.filter(d => d.transformador === nombre);
        console.log(`  📊 ${nombre}: ${items.length} registros`);
        
        const dateMap = {};
        items.forEach(i => dateMap[i.fecha] = i.frecuencia);
        
        // Crear array de valores para cada fecha, usando null para fechas faltantes
        grouped[nombre] = uniqueDates.map(date => {
            const val = dateMap[date];
            return val !== undefined ? val : null;
        });

        // Calcular estadísticas (ignorando nulls)
        const valores = items.map(i => i.frecuencia).filter(v => v !== null);
        if (valores.length > 0) {
            averages[nombre] = valores.reduce((a, b) => a + b, 0) / valores.length;
            maxValues[nombre] = Math.max(...valores);
            minValues[nombre] = Math.min(...valores);
            
            console.log(`    Promedio: ${averages[nombre].toFixed(2)}, Min: ${minValues[nombre].toFixed(2)}, Max: ${maxValues[nombre].toFixed(2)}`);
        } else {
            averages[nombre] = 0;
            maxValues[nombre] = 0;
            minValues[nombre] = 0;
            console.log(`    ⚠️ Sin valores válidos`);
        }
    });

    // --- ACTUALIZAR GRÁFICO DE LÍNEAS ---
    const datasetsMain = Object.keys(grouped).map(nombre => {
        const data = grouped[nombre];
        console.log(`  📈 Dataset ${nombre}:`, data.slice(0, 5), "...");
        
        return {
            label: nombre,
            data: data,
            borderColor: this.activeColorMap[nombre],
            backgroundColor: this.activeColorMap[nombre] + '20',
            borderWidth: 3,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 8,
            pointBackgroundColor: this.activeColorMap[nombre],
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            fill: true,
            pointHoverBackgroundColor: '#ffffff',
            pointHoverBorderColor: this.activeColorMap[nombre],
            pointHoverBorderWidth: 3
        };
    });

    // Formatear fechas para el eje X (solo mes y año)
    this.mainChart.data.labels = uniqueDates.map(d => {
        try {
            const [year, month] = d.split('-');
            const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
            const monthIndex = parseInt(month) - 1;
            if (monthIndex >= 0 && monthIndex < 12) {
                return `${months[monthIndex]} ${year}`;
            }
            return d;
        } catch (e) {
            return d;
        }
    });
    
    this.mainChart.data.datasets = datasetsMain;
    
    // Actualizar título del eje Y con el tipo de medición
    const tipo = this.filters.tipoMedicion || 'Valor';
    this.mainChart.options.scales.y.title.text = tipo;
    
    // Calcular rango de valores para ajustar escala
    const allValues = this.data.map(d => d.frecuencia).filter(v => v !== null);
    if (allValues.length > 0) {
        const minVal = Math.min(...allValues);
        const maxVal = Math.max(...allValues);
        const range = maxVal - minVal;
        
        console.log(`📏 Rango de valores: ${minVal.toFixed(2)} - ${maxVal.toFixed(2)}`);
        
        // Si todos los valores son iguales o muy cercanos, ajustar la escala
        if (range < 0.01) {
            this.mainChart.options.scales.y.min = minVal - 1;
            this.mainChart.options.scales.y.max = maxVal + 1;
        } else {
            // Dejar que Chart.js ajuste automáticamente
            this.mainChart.options.scales.y.min = null;
            this.mainChart.options.scales.y.max = null;
        }
    }
    
    try {
        this.mainChart.update();
        console.log("✅ Gráfico principal actualizado");
    } catch (error) {
        console.error("❌ Error al actualizar gráfico principal:", error);
    }

    // Actualizar leyenda personalizada
    this.updateChartLegend();

    // --- ACTUALIZAR GRÁFICO DE RANKING ---
    const sortOrder = document.getElementById('rankingSort').value;
    const sortedAlimentadores = Object.keys(averages).sort((a, b) => 
        sortOrder === 'desc' ? averages[b] - averages[a] : averages[a] - averages[b]
    );
    
    console.log("🏆 Ranking:", sortedAlimentadores);
    
    this.rankingChart.data.labels = sortedAlimentadores;
    this.rankingChart.data.datasets = [{
        label: 'Promedio',
        data: sortedAlimentadores.map(k => averages[k]),
        backgroundColor: sortedAlimentadores.map(k => this.activeColorMap[k]),
        borderRadius: 8,
        borderWidth: 2,
        borderColor: sortedAlimentadores.map(k => this.activeColorMap[k] + 'CC')
    }];
    
    // Ajustar escala automáticamente basado en datos
    const avgValues = Object.values(averages).filter(v => !isNaN(v) && v !== null);
    if (avgValues.length > 0) {
        const minAvg = Math.min(...avgValues);
        const maxAvg = Math.max(...avgValues);
        const rangeAvg = maxAvg - minAvg;
        
        console.log(`📊 Promedios: ${minAvg.toFixed(2)} - ${maxAvg.toFixed(2)}`);
        
        if (rangeAvg < 0.01) {
            // Si todos los promedios son iguales, ajustar la escala
            this.rankingChart.options.scales.x.min = Math.max(0, minAvg - 1);
            this.rankingChart.options.scales.x.max = maxAvg + 1;
        } else if (rangeAvg > 0) {
            // Añadir un 10% de margen
            this.rankingChart.options.scales.x.min = Math.max(0, minAvg - rangeAvg * 0.1);
            this.rankingChart.options.scales.x.max = maxAvg + rangeAvg * 0.1;
        }
    }
    
    try {
        this.rankingChart.update();
        console.log("✅ Gráfico de ranking actualizado");
    } catch (error) {
        console.error("❌ Error al actualizar gráfico de ranking:", error);
    }
}

    updateChartLegend() {
        const legendContainer = document.getElementById('mainChartLegend');
        if (!legendContainer) return;
        
        const datasets = this.mainChart.data.datasets;
        legendContainer.innerHTML = '';
        
        datasets.forEach((dataset, index) => {
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            legendItem.style.display = 'flex';
            legendItem.style.alignItems = 'center';
            legendItem.style.gap = '8px';
            legendItem.style.marginRight = '15px';
            legendItem.style.cursor = 'pointer';
            
            try {
                const meta = this.mainChart.getDatasetMeta(index);
                legendItem.style.opacity = meta.hidden ? '0.5' : '1';
            } catch (e) {
                legendItem.style.opacity = '1';
            }
            
            legendItem.innerHTML = `
                <span style="width:12px; height:12px; border-radius:2px; background:${dataset.borderColor};"></span>
                <span style="font-size:0.85rem; font-weight:600; color:#334155;">${dataset.label}</span>
            `;
            
            legendItem.addEventListener('click', () => {
                try {
                    const meta = this.mainChart.getDatasetMeta(index);
                    meta.hidden = meta.hidden === null ? true : null;
                    this.mainChart.update();
                    legendItem.style.opacity = meta.hidden ? '0.5' : '1';
                } catch (e) {
                    console.error("Error al ocultar dataset:", e);
                }
            });
            
            legendContainer.appendChild(legendItem);
        });
    }

    updateKPIs() {
        if(this.data.length === 0) {
            document.getElementById("avg-value").textContent = "0.0000";
            document.getElementById("max-value").textContent = "0.0000";
            document.getElementById("min-value").textContent = "0.0000";
            document.getElementById("stability-value").textContent = "0.0000";
            
            // Actualizar unidades
            const unit = this.filters.tipoMedicion || '';
            document.querySelectorAll(".kpi-unit").forEach(el => {
                if (el.id !== 'stability-unit') {
                    el.textContent = unit;
                }
            });
            return;
        }

        const vals = this.data.map(d => d.frecuencia);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const max = Math.max(...vals);
        const min = Math.min(...vals);

        // Encontrar fechas de valores máximos y mínimos
        const maxItem = this.data.find(d => d.frecuencia === max);
        const minItem = this.data.find(d => d.frecuencia === min);

        // Desviación Estándar para Estabilidad
        const variance = vals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / vals.length;
        const stdDev = Math.sqrt(variance);

        // Calcular tendencia si hay datos anteriores
        let trend = 0;
        if (this.previousData && this.previousData.length > 0) {
            const prevAvg = this.previousData.reduce((a, b) => a + b.frecuencia, 0) / this.previousData.length;
            trend = ((avg - prevAvg) / prevAvg) * 100;
        }

        // Actualizar elementos
        document.getElementById("avg-value").textContent = avg.toFixed(4);
        document.getElementById("max-value").textContent = max.toFixed(4);
        document.getElementById("min-value").textContent = min.toFixed(4);
        document.getElementById("stability-value").textContent = stdDev.toFixed(4);
        
        // Actualizar unidades basadas en el tipo de medición
        const unit = this.filters.tipoMedicion || '';
        document.querySelectorAll(".kpi-unit").forEach(el => {
            if (el.id !== 'stability-unit') {
                el.textContent = unit;
            }
        });
        
        // Actualizar tendencia
        const trendEl = document.getElementById("avg-trend");
        if (trendEl) {
            trendEl.innerHTML = `<i class="fas fa-arrow-${trend >= 0 ? 'up' : 'down'}"></i> ${Math.abs(trend).toFixed(2)}%`;
            trendEl.style.color = trend >= 0 ? 'var(--success)' : 'var(--danger)';
            trendEl.style.background = trend >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
        }

        // Actualizar fechas
        if (maxItem) {
            document.getElementById("max-date").textContent = maxItem.fecha;
        }
        if (minItem) {
            document.getElementById("min-date").textContent = minItem.fecha;
        }

        // Actualizar badge de estabilidad
        const badgeEl = document.getElementById("stability-badge");
        if (badgeEl) {
            // Umbrales adaptados a tus datos (puedes ajustarlos)
            if (stdDev < (avg * 0.01)) { // Menos del 1% de desviación
                badgeEl.textContent = "Excelente";
                badgeEl.style.background = "rgba(16, 185, 129, 0.1)";
                badgeEl.style.color = "var(--success)";
            } else if (stdDev < (avg * 0.05)) { // Menos del 5%
                badgeEl.textContent = "Buena";
                badgeEl.style.background = "rgba(245, 158, 11, 0.1)";
                badgeEl.style.color = "var(--warning)";
            } else {
                badgeEl.textContent = "Crítica";
                badgeEl.style.background = "rgba(239, 68, 68, 0.1)";
                badgeEl.style.color = "var(--danger)";
            }
        }
        
        console.log("📊 KPIs actualizados:", { avg, max, min, stdDev });
    }

    // --- TABLA Y PAGINACIÓN ---
    sortTable(column) {
        if (this.sortConfig.column === column) {
            this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortConfig.column = column;
            this.sortConfig.direction = 'asc';
        }

        this.filteredData.sort((a, b) => {
            let aValue = a[column];
            let bValue = b[column];

            // Manejar valores numéricos y de fecha
            if (column === 'frecuencia') {
                aValue = parseFloat(aValue);
                bValue = parseFloat(bValue);
            } else if (column === 'fecha') {
                aValue = new Date(aValue);
                bValue = new Date(bValue);
            }

            if (aValue < bValue) return this.sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return this.sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        this.pagination.currentPage = 1;
        this.updateTable();
        this.updateSortIndicators();
    }

    updateSortIndicators() {
        document.querySelectorAll('.data-table th').forEach(th => {
            const icon = th.querySelector('i');
            if (th.dataset.sort === this.sortConfig.column) {
                icon.className = this.sortConfig.direction === 'asc' ? 
                    'fas fa-sort-up' : 'fas fa-sort-down';
            } else {
                icon.className = 'fas fa-sort';
            }
        });
    }

    updateTable() {
        const tbody = document.getElementById('dataTable');
        tbody.innerHTML = '';
        const start = (this.pagination.currentPage - 1) * this.pagination.rowsPerPage;
        const end = start + this.pagination.rowsPerPage;
        const pageData = this.filteredData.slice(start, end);

        if(pageData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding:3rem; color:#94a3b8;">
                        <i class="fas fa-database" style="font-size:2rem; margin-bottom:1rem; display:block; opacity:0.5;"></i>
                        No hay datos disponibles con los filtros actuales<br>
                        <small>Intenta con diferentes filtros</small>
                    </td>
                </tr>`;
            this.updatePaginationInfo(0, 0, 0);
            return;
        }

        pageData.forEach(item => {
            const tr = document.createElement('tr');
            const color = this.activeColorMap[item.transformador] || '#94a3b8';
            
            // Estado basado en desviación del promedio
            const avg = this.data.reduce((a, b) => a + b.frecuencia, 0) / this.data.length;
            const diff = Math.abs(item.frecuencia - avg) / avg;
            let statusClass = 'status-optimal';
            let statusText = 'Óptimo';
            let statusIcon = 'fa-check-circle';
            
            if(diff >= 0.1 && diff < 0.3) {
                statusClass = 'status-regular';
                statusText = 'Regular';
                statusIcon = 'fa-exclamation-circle';
            }
            if(diff >= 0.3) {
                statusClass = 'status-critical';
                statusText = 'Crítico';
                statusIcon = 'fa-times-circle';
            }

            tr.innerHTML = `
                <td style="display:flex; align-items:center; gap:12px; font-weight:600;">
                    <span style="width:14px; height:14px; border-radius:50%; background:${color}; 
                        box-shadow:0 0 0 3px ${color}20, 0 2px 4px rgba(0,0,0,0.1);"></span>
                    ${item.transformador}
                </td>
                <td style="font-weight:500; color:#475569;">${item.fecha}</td>
                <td style="font-family:'Roboto Mono', monospace; font-size:1.05em; font-weight:700; color:#0f172a;">
                    ${item.frecuencia.toFixed(4)}
                </td>
                <td>
                    <span class="status-indicator ${statusClass}">
                        <i class="fas ${statusIcon}"></i>
                        ${statusText}
                    </span>
                </td>
                <td style="font-weight:500;">${item.departamento || 'N/A'}</td>
                <td>
                    <button class="btn-icon small" title="Ver detalles" onclick="dashboard.showDetails('${item.transformador}', '${item.fecha}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        this.updatePaginationInfo(start + 1, end, this.filteredData.length);
        this.updatePaginationButtons();
    }

    updatePaginationInfo(start, end, total) {
        document.getElementById('rowsShownStart').textContent = Math.min(start, total);
        document.getElementById('rowsShownEnd').textContent = Math.min(end, total);
        document.getElementById('rowsTotal').textContent = total;
        document.getElementById('currentPage').textContent = this.pagination.currentPage;
    }

    updatePaginationButtons() {
        const totalPages = Math.ceil(this.filteredData.length / this.pagination.rowsPerPage);
        
        document.getElementById('firstPage').disabled = this.pagination.currentPage === 1;
        document.getElementById('prevPage').disabled = this.pagination.currentPage === 1;
        document.getElementById('nextPage').disabled = this.pagination.currentPage === totalPages || totalPages === 0;
        document.getElementById('lastPage').disabled = this.pagination.currentPage === totalPages || totalPages === 0;
    }

    // --- FUNCIONES ADICIONALES ---
    showDetails(alimentador, fecha) {
        const detalles = this.data.find(d => d.transformador === alimentador && d.fecha === fecha);
        if (detalles) {
            alert(`📋 Detalles de ${alimentador} en ${fecha}\n\n` +
                  `• Tipo: ${detalles.tipo || 'N/A'}\n` +
                  `• Valor: ${detalles.frecuencia.toFixed(4)}\n` +
                  `• Departamento: ${detalles.departamento || 'N/A'}`);
        } else {
            alert(`No se encontraron detalles para ${alimentador} en ${fecha}`);
        }
    }

    exportData() {
        if (this.filteredData.length === 0) {
            this.showNotification("No hay datos para exportar", "warning");
            return;
        }
        
        const dataStr = JSON.stringify(this.filteredData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `ande-datos-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification("Datos exportados correctamente", "success");
    }

    toggleFullscreen() {
        const elem = document.documentElement;
        if (!document.fullscreenElement) {
            elem.requestFullscreen().catch(err => {
                console.error(`Error al activar pantalla completa: ${err.message}`);
            });
            document.getElementById('fullscreenToggle').innerHTML = '<i class="fas fa-compress"></i>';
        } else {
            document.exitFullscreen();
            document.getElementById('fullscreenToggle').innerHTML = '<i class="fas fa-expand"></i>';
        }
    }

    startLiveUpdates() {
        // Simular actualizaciones cada 30 segundos
        setInterval(() => {
            if (Math.random() > 0.7) { // 30% de probabilidad
                console.log("🔄 Actualización automática de datos...");
                this.loadData();
            }
        }, 30000);
    }

    initializeEvents() {
        // Aplicar filtros
        document.getElementById('applyFilters').addEventListener('click', () => {
            this.syncFilters();
            if(!this.filters.transformador.length) {
                this.showNotification("Selecciona al menos un alimentador", "warning");
                return;
            }
            if(window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('active');
            this.loadData();
        });

        // Restablecer filtros
        document.getElementById('resetFilters').addEventListener('click', () => {
            this.setInitialDefaults();
            this.loadData();
            this.showNotification("Filtros restablecidos", "success");
        });

        // Control del sidebar
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.add('active');
        });
        document.getElementById('sidebarClose').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('active');
        });

        // Paginación
        document.getElementById('firstPage').addEventListener('click', () => {
            this.pagination.currentPage = 1;
            this.updateTable();
        });
        document.getElementById('prevPage').addEventListener('click', () => {
            if(this.pagination.currentPage > 1) { 
                this.pagination.currentPage--; 
                this.updateTable(); 
            }
        });
        document.getElementById('nextPage').addEventListener('click', () => {
            const maxPage = Math.ceil(this.filteredData.length / this.pagination.rowsPerPage);
            if(this.pagination.currentPage < maxPage) { 
                this.pagination.currentPage++; 
                this.updateTable(); 
            }
        });
        document.getElementById('lastPage').addEventListener('click', () => {
            this.pagination.currentPage = Math.ceil(this.filteredData.length / this.pagination.rowsPerPage);
            this.updateTable();
        });

        // Filas por página
        document.getElementById('rowsPerPage').addEventListener('change', (e) => {
            this.pagination.rowsPerPage = parseInt(e.target.value);
            this.pagination.currentPage = 1;
            this.updateTable();
        });

        // Búsqueda en tabla
        document.getElementById('tableSearch').addEventListener('keyup', (e) => {
            const term = e.target.value.toLowerCase();
            this.filteredData = this.data.filter(d => 
                d.transformador.toLowerCase().includes(term) ||
                (d.departamento && d.departamento.toLowerCase().includes(term)) ||
                d.frecuencia.toString().includes(term)
            );
            this.pagination.currentPage = 1;
            this.updateTable();
        });

        // Ordenar tabla
        document.querySelectorAll('.data-table th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                this.sortTable(th.dataset.sort);
            });
        });

        // Ordenar ranking
        document.getElementById('rankingSort').addEventListener('change', () => {
            this.updateCharts();
        });

        // Control de zoom de gráficos
        document.getElementById('zoomIn').addEventListener('click', () => {
            if (this.mainChart.scales.y) {
                const currentMin = this.mainChart.scales.y.min;
                const currentMax = this.mainChart.scales.y.max;
                const range = currentMax - currentMin;
                this.mainChart.scales.y.min = currentMin + range * 0.1;
                this.mainChart.scales.y.max = currentMax - range * 0.1;
                this.mainChart.update();
            }
        });

        document.getElementById('zoomOut').addEventListener('click', () => {
            if (this.mainChart.scales.y) {
                const currentMin = this.mainChart.scales.y.min;
                const currentMax = this.mainChart.scales.y.max;
                const range = currentMax - currentMin;
                this.mainChart.scales.y.min = currentMin - range * 0.1;
                this.mainChart.scales.y.max = currentMax + range * 0.1;
                this.mainChart.update();
            }
        });

        document.getElementById('resetZoom').addEventListener('click', () => {
            if (this.mainChart.scales.y) {
                this.mainChart.scales.y.min = null;
                this.mainChart.scales.y.max = null;
                this.mainChart.update();
            }
        });

        // Exportar datos
        document.getElementById('exportData').addEventListener('click', () => {
            this.exportData();
        });

        // Pantalla completa
        document.getElementById('fullscreenToggle').addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Cerrar sidebar al hacer clic fuera (en móviles)
        document.addEventListener('click', (e) => {
            const sidebar = document.getElementById('sidebar');
            const sidebarToggle = document.getElementById('sidebarToggle');
            
            if (window.innerWidth <= 768 && 
                sidebar.classList.contains('active') && 
                !sidebar.contains(e.target) && 
                !sidebarToggle.contains(e.target) &&
                !e.target.closest('.sidebar-toggle-btn')) {
                sidebar.classList.remove('active');
            }
        });

        // Tecla Escape para cerrar sidebar
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('sidebar').classList.contains('active')) {
                document.getElementById('sidebar').classList.remove('active');
            }
        });
    }
}

// Inicializar dashboard cuando el DOM esté cargado
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new ANDEDashboard();
});