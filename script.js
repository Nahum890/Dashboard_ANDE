// script.js
console.log("🚀 Dashboard ANDE v3.1 iniciando...");

class ANDEDashboard {
    constructor() {
        this.apiBaseUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:10000'
            : window.location.origin;
        this.data = [];
        this.filteredData = [];
        this.mainChart = null;
        this.rankingChart = null;
        this.fullChart = null;
        this.sortConfig = { column: null, direction: 'asc' };
        
        this.chartPalette = [
            '#FF0000', '#FF4500', '#FF8C00', '#FFD700', '#ADFF2F', '#32CD32', 
            '#00FA9A', '#00CED1', '#1E90FF', '#4169E1', '#8A2BE2', '#DA70D6',
            '#FF1493', '#FF69B4', '#C71585', '#8B0000', '#B22222', '#DC143C',
            '#FF6347', '#FF7F50', '#FFA500', '#FFD700', '#FFFF00', '#9ACD32'
        ];
        this.activeColorMap = {};
        
        this.allSecciones = [];
        this.estaciones = [];
        
        this.filters = {
            tipoMedicion: 'all',
            transformador: 'all',
            year: 'all',
            month: 'all',
            estacion: '',
            periodo: 'all'
        };

        this.groupBy = 'alimentador';
        
        this.pagination = { currentPage: 1, rowsPerPage: 25, totalPages: 1 };
        
        this.initialize();
    }
    
    safeToFixed(value, decimals = 4) {
        if (value === null || value === undefined || isNaN(value)) {
            return 'N/A';
        }
        try {
            return Number(value).toFixed(decimals);
        } catch (error) {
            return String(value);
        }
    }

    async initialize() {
        this.showLoading(true, "Inicializando dashboard...");
        try {
            this.initCharts();
            await this.loadInitialData();
            this.setupEventListeners();
            this.updateTime();
            this.startLiveUpdates();
            this.showNotification("Dashboard cargado correctamente", "success");
            
        } catch (error) {
            console.error("Error inicializando:", error);
            this.showNotification("Error inicializando el sistema", "error");
        } finally {
            this.showLoading(false);
        }
    }

    async loadInitialData() {
        try {
            await Promise.all([
                this.loadTiposMedicion(),
                this.loadSeccionesDisponibles(),
                this.loadYearsAvailable(),
                this.loadCargas()
            ]);
            
            // Cargar datos iniciales
            await this.loadData();
            
        } catch (error) {
            console.error("Error cargando datos iniciales:", error);
            throw error;
        }
    }

    setupEventListeners() {
        // Filtros
        document.getElementById('applyFilters').addEventListener('click', () => this.applyFilters());
        document.getElementById('resetFilters').addEventListener('click', () => this.resetFilters());
        document.getElementById('refreshData').addEventListener('click', () => this.loadData());
        
        // Período
        document.getElementById('filterPeriodo').addEventListener('change', (e) => {
            const periodo = e.target.value;
            document.getElementById('specificMonthGroup').style.display = 
                periodo === 'specific' ? 'block' : 'none';
            if (periodo !== 'specific') {
                document.getElementById('filterMonth').value = 'all';
            }
        });
        
        // Estación
        document.getElementById('filterEstacion').addEventListener('change', (e) => {
            const estacion = e.target.value;
            this.filterAlimentadoresByEstacion(estacion);
        });
        
        // Excel
        document.getElementById('uploadExcelBtn').addEventListener('click', () => this.handleExcelUpload());
        
        // Gráficos
        document.getElementById('chartType').addEventListener('change', () => this.updateCharts());
        document.getElementById('rankingSort').addEventListener('change', () => this.updateCharts());
        document.getElementById('openFullChart').addEventListener('click', () => this.openFullChart());
        
        // Modal de cargas
        document.getElementById('openCargasModal').addEventListener('click', () => this.openCargasModal());
        document.getElementById('cargasModalClose').addEventListener('click', () => this.closeCargasModal());
        document.getElementById('closeCargasModal').addEventListener('click', () => this.closeCargasModal());
        
        // Modal de gráfico completo
        document.getElementById('fullChartModalClose').addEventListener('click', () => this.closeFullChart());
        
        // Sidebar
        document.getElementById('sidebarToggle').addEventListener('click', () => this.toggleSidebar());
        document.getElementById('sidebarClose').addEventListener('click', () => this.closeSidebar());
        
        // Exportar
        document.getElementById('exportData').addEventListener('click', () => this.exportData());
        
        // Buscar en tabla
        document.getElementById('tableSearch').addEventListener('keyup', (e) => this.searchTable(e.target.value));
        
        // Paginación
        document.getElementById('firstPage').addEventListener('click', () => this.goToPage(1));
        document.getElementById('prevPage').addEventListener('click', () => this.goToPage(this.pagination.currentPage - 1));
        document.getElementById('nextPage').addEventListener('click', () => this.goToPage(this.pagination.currentPage + 1));
        document.getElementById('lastPage').addEventListener('click', () => this.goToPage(this.pagination.totalPages));
        document.getElementById('rowsPerPage').addEventListener('change', (e) => {
            this.pagination.rowsPerPage = parseInt(e.target.value);
            this.pagination.currentPage = 1;
            this.updateTable();
        });
    }

    async loadTiposMedicion() {
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/tipos-medicion`);
            const tipos = await res.json();
            
            const select = document.getElementById('filterTipoMedicion');
            tipos.forEach(tipo => {
                const option = document.createElement('option');
                option.value = tipo;
                option.textContent = tipo;
                select.appendChild(option);
            });
        } catch (error) {
            console.error("Error cargando tipos de medición:", error);
        }
    }

    async loadSeccionesDisponibles() {
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/secciones`);
            const secciones = await res.json();
            
            this.allSecciones = secciones;
            
            // Extraer estaciones
            const estacionesSet = new Set();
            secciones.forEach(seccion => {
                if (seccion && seccion.length >= 3) {
                    estacionesSet.add(seccion.substring(0, 3));
                }
            });
            this.estaciones = Array.from(estacionesSet).sort();
            
            // Llenar estaciones
            const estacionSelect = document.getElementById('filterEstacion');
            this.estaciones.forEach(estacion => {
                const option = document.createElement('option');
                option.value = estacion;
                option.textContent = estacion;
                estacionSelect.appendChild(option);
            });
            
            // Llenar alimentadores
            this.filterAlimentadoresByEstacion('');
            
        } catch (error) {
            console.error("Error cargando secciones:", error);
        }
    }

    filterAlimentadoresByEstacion(estacion) {
        const select = document.getElementById('filterTransformador');
        
        // Mantener opciones especiales
        const specialOptions = Array.from(select.querySelectorAll('option[value^="all"]'));
        select.innerHTML = '';
        specialOptions.forEach(opt => select.appendChild(opt.cloneNode(true)));
        
        // Agregar alimentadores filtrados
        const alimentadores = estacion 
            ? this.allSecciones.filter(s => s.startsWith(estacion))
            : this.allSecciones;
            
        alimentadores.forEach(alimentador => {
            const option = document.createElement('option');
            option.value = alimentador;
            option.textContent = alimentador;
            select.appendChild(option);
        });
    }

    async loadYearsAvailable() {
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/anios`);
            const years = await res.json();
            
            const select = document.getElementById('filterYear');
            years.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                select.appendChild(option);
            });
        } catch (error) {
            console.error("Error cargando años:", error);
        }
    }

    async loadCargas() {
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/cargas`);
            const cargas = await res.json();
            this.displayCargas(cargas);
        } catch (error) {
            console.error("Error cargando cargas:", error);
        }
    }

    displayCargas(cargas) {
        const tbody = document.getElementById('cargasTable');
        if (!tbody) return;
        
        if (cargas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No hay cargas registradas</td></tr>`;
            return;
        }
        
        tbody.innerHTML = cargas.map(carga => `
            <tr>
                <td>${carga.id}</td>
                <td>${carga.nombre_archivo}</td>
                <td>${new Date(carga.fecha_carga).toLocaleString()}</td>
                <td>${carga.total_filas}</td>
                <td>${carga.insertadas}</td>
                <td>${carga.actualizadas}</td>
                <td>${carga.errores}</td>
                <td><span class="status-indicator ${carga.estado === 'completado' ? 'status-optimal' : 'status-critical'}">
                    ${carga.estado}
                </span></td>
                <td>
                    <button class="btn-icon small" onclick="dashboard.verDetallesCarga(${carga.id})" title="Ver detalles">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon small" onclick="dashboard.eliminarCarga(${carga.id})" title="Eliminar carga">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async verDetallesCarga(id) {
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/cargas/${id}`);
            const carga = await res.json();
            
            const content = document.getElementById('cargaDetallesContent');
            content.innerHTML = `
                <div style="background: #f8fafc; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                    <h4>Información de la Carga</h4>
                    <p><strong>Archivo:</strong> ${carga.nombre_archivo}</p>
                    <p><strong>Fecha:</strong> ${new Date(carga.fecha_carga).toLocaleString()}</p>
                    <p><strong>Total filas:</strong> ${carga.total_filas}</p>
                    <p><strong>Insertadas:</strong> ${carga.insertadas}</p>
                    <p><strong>Actualizadas:</strong> ${carga.actualizadas}</p>
                    <p><strong>Errores:</strong> ${carga.errores}</p>
                    <p><strong>Estado:</strong> ${carga.estado}</p>
                </div>
                <div style="background: #f8fafc; padding: 1rem; border-radius: 8px;">
                    <h4>Estadísticas</h4>
                    <p><strong>Alimentadores únicos:</strong> ${carga.estadisticas.alimentadores_unicos || 0}</p>
                    <p><strong>Tipos únicos:</strong> ${carga.estadisticas.tipos_unicos || 0}</p>
                    <p><strong>Año mínimo:</strong> ${carga.estadisticas.anio_minimo || 'N/A'}</p>
                    <p><strong>Año máximo:</strong> ${carga.estadisticas.anio_maximo || 'N/A'}</p>
                </div>
            `;
            
            document.getElementById('cargaDetalles').style.display = 'block';
        } catch (error) {
            console.error("Error cargando detalles:", error);
            this.showNotification("Error al cargar detalles de la carga", "error");
        }
    }

    async eliminarCarga(id) {
        if (!confirm('¿Estás seguro de eliminar esta carga? Se eliminarán todos los datos asociados.')) {
            return;
        }
        
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/cargas/${id}`, {
                method: 'DELETE'
            });
            
            if (res.ok) {
                this.showNotification("Carga eliminada correctamente", "success");
                this.loadCargas();
                // Recargar datos si la carga eliminada afecta a los datos actuales
                this.loadData();
            } else {
                throw new Error("Error al eliminar carga");
            }
        } catch (error) {
            console.error("Error eliminando carga:", error);
            this.showNotification("Error al eliminar la carga", "error");
        }
    }

    openCargasModal() {
        document.getElementById('cargasModal').style.display = 'flex';
        this.loadCargas();
    }

    closeCargasModal() {
        document.getElementById('cargasModal').style.display = 'none';
        document.getElementById('cargaDetalles').style.display = 'none';
    }

    toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('active');
    }

    closeSidebar() {
        document.getElementById('sidebar').classList.remove('active');
    }

    applyFilters() {
        this.filters = {
            tipoMedicion: document.getElementById('filterTipoMedicion').value,
            transformador: document.getElementById('filterTransformador').value,
            year: document.getElementById('filterYear').value,
            month: document.getElementById('filterMonth').value,
            estacion: document.getElementById('filterEstacion').value,
            periodo: document.getElementById('filterPeriodo').value
        };
        
        this.groupBy = document.getElementById('groupBy').value;
        
        if (window.innerWidth <= 768) {
            this.closeSidebar();
        }
        
        this.loadData();
    }

    resetFilters() {
        document.getElementById('filterTipoMedicion').value = 'all';
        document.getElementById('filterTransformador').value = 'all';
        document.getElementById('filterYear').value = 'all';
        document.getElementById('filterEstacion').value = '';
        document.getElementById('filterPeriodo').value = 'all';
        document.getElementById('filterMonth').value = 'all';
        document.getElementById('specificMonthGroup').style.display = 'none';
        document.getElementById('groupBy').value = 'alimentador';
        
        this.filterAlimentadoresByEstacion('');
        
        this.showNotification("Filtros restablecidos", "success");
        this.applyFilters();
    }

    async loadData() {
        this.showLoading(true, "Cargando datos...");
        
        try {
            const params = new URLSearchParams();
            
            if (this.filters.tipoMedicion !== 'all') {
                params.append('tipo_medicion', this.filters.tipoMedicion);
            } else {
                params.append('tipo_medicion', 'all');
            }
            
            if (this.filters.transformador !== 'all') {
                params.append('seccion', this.filters.transformador);
            } else {
                params.append('seccion', 'all');
            }
            
            if (this.filters.year !== 'all') {
                params.append('anio', this.filters.year);
            } else {
                params.append('anio', 'all');
            }
            
            if (this.filters.month !== 'all' && this.filters.periodo === 'specific') {
                params.append('mes', this.filters.month);
            } else {
                params.append('mes', 'all');
            }
            
            if (this.filters.periodo !== 'all' && this.filters.periodo !== 'specific') {
                params.append('periodo', this.filters.periodo);
            }
            
            if (this.filters.estacion) {
                params.append('estacion', this.filters.estacion);
            }
            
            const url = `${this.apiBaseUrl}/api/datos?${params.toString()}`;
            console.log("📥 Cargando datos desde:", url);
            
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            this.data = await res.json();
            this.filteredData = [...this.data];
            
            console.log(`✅ Datos cargados: ${this.data.length} registros`);
            
            this.updateStats();
            this.updateKPIs();
            this.updateCharts();
            this.pagination.currentPage = 1;
            this.updateTable();
            
            this.showNotification(`Datos cargados: ${this.data.length} registros`, "success");
            
        } catch (error) {
            console.error("❌ Error cargando datos:", error);
            this.showNotification("Error cargando datos del servidor", "error");
        } finally {
            this.showLoading(false);
        }
    }

    updateStats() {
        const totalPoints = this.data.length;
        const uniqueCombinations = [...new Set(this.data.map(d => d.combinationKey))].length;
        
        // Actualizar contadores
        document.getElementById('dataCount').textContent = totalPoints.toLocaleString();
        document.getElementById('seriesCount').textContent = uniqueCombinations;
        document.getElementById('loadedSeries').textContent = uniqueCombinations;
        document.getElementById('totalPoints').textContent = totalPoints.toLocaleString();
        
        // Actualizar tiempo
        const timeStr = new Date().toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        document.getElementById('lastUpdate').textContent = timeStr;
        document.getElementById('updateTime').textContent = timeStr;
    }

    updateKPIs() {
        if (this.data.length === 0) {
            // Resetear KPIs si no hay datos
            document.getElementById('activeSeries').textContent = '0';
            document.getElementById('rangeValue').textContent = '0.0000';
            document.getElementById('rangeInfo').textContent = 'Sin datos';
            document.getElementById('variabilityValue').textContent = '0.00%';
            document.getElementById('variabilityBadge').textContent = '--';
            document.getElementById('worstSeries').textContent = '--';
            document.getElementById('worstValue').textContent = '0.0000';
            return;
        }
        
        // Calcular estadísticas
        const uniqueSeries = [...new Set(this.data.map(d => d.combinationKey))];
        document.getElementById('activeSeries').textContent = uniqueSeries.length;
        
        // Calcular rango global
        const valores = this.data.map(d => d.frecuencia).filter(v => !isNaN(v));
        if (valores.length > 0) {
            const min = Math.min(...valores);
            const max = Math.max(...valores);
            const range = max - min;
            
            document.getElementById('rangeValue').textContent = this.safeToFixed(range);
            document.getElementById('rangeInfo').textContent = `${this.safeToFixed(min)}-${this.safeToFixed(max)}`;
            
            // Calcular variabilidad (coeficiente de variación)
            const avg = valores.reduce((a, b) => a + b, 0) / valores.length;
            const std = Math.sqrt(valores.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / valores.length);
            const cv = avg !== 0 ? (std / avg) * 100 : 0;
            
            document.getElementById('variabilityValue').textContent = this.safeToFixed(cv, 2) + '%';
            
            const badge = document.getElementById('variabilityBadge');
            if (cv < 10) {
                badge.textContent = 'Baja';
                badge.className = 'kpi-badge';
                badge.style.background = 'rgba(16, 185, 129, 0.1)';
                badge.style.color = 'var(--success)';
            } else if (cv < 20) {
                badge.textContent = 'Media';
                badge.className = 'kpi-badge';
                badge.style.background = 'rgba(245, 158, 11, 0.1)';
                badge.style.color = 'var(--warning)';
            } else {
                badge.textContent = 'Alta';
                badge.className = 'kpi-badge';
                badge.style.background = 'rgba(239, 68, 68, 0.1)';
                badge.style.color = 'var(--danger)';
            }
            
            // CALCULAR PEOR DESEMPEÑO (CORREGIDO)
            // Agrupar por alimentador y calcular promedio
            const alimentadores = {};
            this.data.forEach(item => {
                if (!alimentadores[item.transformador]) {
                    alimentadores[item.transformador] = {
                        valores: [],
                        avg: 0
                    };
                }
                alimentadores[item.transformador].valores.push(item.frecuencia);
            });
            
            // Calcular promedio por alimentador
            Object.keys(alimentadores).forEach(key => {
                const vals = alimentadores[key].valores;
                alimentadores[key].avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            });
            
            // Encontrar el PEOR desempeño (MAYOR valor promedio)
            let worstAlimentador = null;
            let worstValue = -Infinity;
            
            Object.keys(alimentadores).forEach(key => {
                if (alimentadores[key].avg > worstValue) {
                    worstValue = alimentadores[key].avg;
                    worstAlimentador = key;
                }
            });
            
            if (worstAlimentador) {
                document.getElementById('worstSeries').textContent = worstAlimentador;
                document.getElementById('worstValue').textContent = this.safeToFixed(worstValue);
            }
        }
    }

    initCharts() {
        Chart.defaults.font.family = "'Inter', 'Segoe UI', system-ui, sans-serif";
        Chart.defaults.color = '#64748b';
        Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.95)';
        
        // Gráfico principal
        const ctxMain = document.getElementById('mainChart').getContext('2d');
        this.mainChart = new Chart(ctxMain, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { 
                        display: true,
                        position: 'top',
                        labels: { boxWidth: 12, padding: 15, font: { size: 11 } }
                    },
                    tooltip: { 
                        mode: 'index', 
                        intersect: false,
                        callbacks: {
                            title: (context) => context[0].dataset.label,
                            label: (context) => {
                                const value = context.parsed.y;
                                const date = context.label;
                                return `${date}: ${this.safeToFixed(value)}`;
                            }
                        }
                    }
                },
                scales: { 
                    y: { 
                        beginAtZero: false,
                        title: { display: true, text: 'Valor' },
                        ticks: { callback: this.formatValueCallback }
                    }, 
                    x: { 
                        ticks: {
                            callback: (value, index, values) => {
                                const label = this.mainChart.data.labels[index];
                                if (!label) return '';
                                
                                try {
                                    const [year, month] = label.split('-');
                                    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                                    return `${months[parseInt(month)-1]} ${year}`;
                                } catch (e) {
                                    return label;
                                }
                            }
                        }
                    } 
                }
            }
        });
        
        // Gráfico de ranking
        const ctxRank = document.getElementById('rankingChart').getContext('2d');
        this.rankingChart = new Chart(ctxRank, {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { 
                    x: { title: { display: true, text: 'Valor Promedio' } },
                    y: { ticks: { font: { size: 11 } } }
                }
            }
        });
        
        // Gráfico completo
        const ctxFull = document.getElementById('fullChart').getContext('2d');
        this.fullChart = new Chart(ctxFull, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true },
                    tooltip: { mode: 'index', intersect: false }
                }
            }
        });
    }

    updateCharts() {
        if (!this.mainChart || this.data.length === 0) {
            console.warn("⚠️ No hay datos para mostrar en gráficos");
            return;
        }
        
        // Preparar datos para gráficos
        const groupedData = this.groupDataForCharts();
        
        // Actualizar gráfico principal
        this.updateMainChart(groupedData);
        
        // Actualizar gráfico de ranking
        this.updateRankingChart(groupedData);
    }

    groupDataForCharts() {
        const grouped = {};
        
        this.data.forEach(item => {
            let key;
            
            switch(this.groupBy) {
                case 'alimentador':
                    key = item.transformador;
                    break;
                case 'year':
                    key = `${item.year}`;
                    break;
                case 'tipo':
                    key = item.tipo;
                    break;
                case 'month':
                    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                    key = `${months[item.month - 1]} ${item.year}`;
                    break;
                case 'combinado':
                default:
                    key = `${item.transformador}-${item.year}-${item.tipo}`;
            }
            
            if (!grouped[key]) {
                grouped[key] = {
                    label: key,
                    values: [],
                    dates: [],
                    avg: 0
                };
            }
            
            grouped[key].values.push(item.frecuencia);
            grouped[key].dates.push(item.fecha);
        });
        
        // Calcular promedios
        Object.keys(grouped).forEach(key => {
            const vals = grouped[key].values;
            grouped[key].avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        });
        
        return grouped;
    }

    updateMainChart(groupedData) {
        // Obtener todas las fechas únicas ordenadas
        const allDates = [...new Set(this.data.map(d => d.fecha))].sort();
        
        // Preparar datasets
        const datasets = Object.keys(groupedData).map((key, idx) => {
            const group = groupedData[key];
            const color = this.chartPalette[idx % this.chartPalette.length];
            
            // Crear array de valores para cada fecha
            const valuesByDate = {};
            this.data.forEach(item => {
                let itemKey;
                switch(this.groupBy) {
                    case 'alimentador':
                        itemKey = item.transformador;
                        break;
                    case 'year':
                        itemKey = `${item.year}`;
                        break;
                    case 'tipo':
                        itemKey = item.tipo;
                        break;
                    case 'month':
                        const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                        itemKey = `${months[item.month - 1]} ${item.year}`;
                        break;
                    default:
                        itemKey = `${item.transformador}-${item.year}-${item.tipo}`;
                }
                
                if (itemKey === key) {
                    valuesByDate[item.fecha] = item.frecuencia;
                }
            });
            
            const data = allDates.map(date => valuesByDate[date] !== undefined ? valuesByDate[date] : null);
            
            return {
                label: group.label,
                data: data,
                borderColor: color,
                backgroundColor: color + '20',
                borderWidth: 2,
                tension: 0.3,
                fill: false,
                pointRadius: 3,
                pointHoverRadius: 6
            };
        });
        
        // Actualizar gráfico
        this.mainChart.data.labels = allDates;
        this.mainChart.data.datasets = datasets;
        
        // Cambiar tipo de gráfico si es necesario
        const chartType = document.getElementById('chartType').value;
        this.mainChart.config.type = chartType;
        
        this.mainChart.update();
    }

    updateRankingChart(groupedData) {
        const sortMethod = document.getElementById('rankingSort').value;
        
        // Ordenar series según método seleccionado
        let sortedKeys = Object.keys(groupedData);
        
        switch(sortMethod) {
            case 'worst':
                // Peor primero (mayor valor promedio)
                sortedKeys.sort((a, b) => groupedData[b].avg - groupedData[a].avg);
                break;
            case 'best':
                // Mejor primero (menor valor promedio)
                sortedKeys.sort((a, b) => groupedData[a].avg - groupedData[b].avg);
                break;
            case 'variability':
                // Por variabilidad (coeficiente de variación)
                sortedKeys.sort((a, b) => {
                    const cvA = this.calculateCV(groupedData[a].values);
                    const cvB = this.calculateCV(groupedData[b].values);
                    return cvB - cvA; // Mayor variabilidad primero
                });
                break;
            case 'avg':
            default:
                // Por promedio (mayor primero)
                sortedKeys.sort((a, b) => groupedData[b].avg - groupedData[a].avg);
        }
        
        // Limitar a 15 series para mejor visualización
        if (sortedKeys.length > 15) {
            sortedKeys = sortedKeys.slice(0, 15);
        }
        
        const labels = sortedKeys.map(key => {
            const label = groupedData[key].label;
            return label.length > 30 ? label.substring(0, 30) + '...' : label;
        });
        
        const data = sortedKeys.map(key => groupedData[key].avg);
        const colors = sortedKeys.map((key, idx) => this.chartPalette[idx % this.chartPalette.length]);
        
        this.rankingChart.data.labels = labels;
        this.rankingChart.data.datasets = [{
            label: 'Promedio',
            data: data,
            backgroundColor: colors,
            borderColor: colors.map(c => c + 'CC'),
            borderWidth: 1
        }];
        
        this.rankingChart.update();
    }

    calculateCV(values) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const std = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / values.length);
        return avg !== 0 ? (std / avg) * 100 : 0;
    }

    openFullChart() {
        // Copiar datos del gráfico principal al gráfico completo
        this.fullChart.data = JSON.parse(JSON.stringify(this.mainChart.data));
        this.fullChart.options = JSON.parse(JSON.stringify(this.mainChart.options));
        
        // Ajustar opciones para pantalla completa
        this.fullChart.options.maintainAspectRatio = true;
        this.fullChart.options.plugins.legend.display = true;
        
        // Mostrar modal
        document.getElementById('fullChartModal').style.display = 'flex';
        this.fullChart.update();
    }

    closeFullChart() {
        document.getElementById('fullChartModal').style.display = 'none';
    }

    updateTable() {
        const tbody = document.getElementById('dataTable');
        if (!tbody) return;
        
        const start = (this.pagination.currentPage - 1) * this.pagination.rowsPerPage;
        const end = start + this.pagination.rowsPerPage;
        const pageData = this.filteredData.slice(start, end);
        
        this.pagination.totalPages = Math.ceil(this.filteredData.length / this.pagination.rowsPerPage);

        if (pageData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding:3rem; color:#94a3b8;">
                        <i class="fas fa-database" style="font-size:2rem; margin-bottom:1rem; display:block; opacity:0.5;"></i>
                        No hay datos para mostrar con los filtros actuales
                    </td>
                </tr>`;
        } else {
            tbody.innerHTML = pageData.map(item => {
                const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                const mesNombre = meses[item.month - 1] || 'Des';
                
                return `
                    <tr>
                        <td>${item.combinationLabel}</td>
                        <td>${item.transformador}</td>
                        <td>${item.year}</td>
                        <td>${mesNombre}</td>
                        <td>${item.tipo}</td>
                        <td>${this.safeToFixed(item.frecuencia)}</td>
                        <td>
                            <span class="status-indicator status-optimal">
                                <i class="fas fa-check-circle"></i> Normal
                            </span>
                        </td>
                        <td>
                            <button class="btn-icon small" title="Ver detalles" onclick="dashboard.showDetails('${item.transformador}', '${item.fecha}')">
                                <i class="fas fa-eye"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
        
        this.updatePaginationInfo();
    }

    updatePaginationInfo() {
        const start = (this.pagination.currentPage - 1) * this.pagination.rowsPerPage + 1;
        const end = Math.min(this.pagination.currentPage * this.pagination.rowsPerPage, this.filteredData.length);
        
        document.getElementById('rowsShownStart').textContent = this.filteredData.length > 0 ? start : 0;
        document.getElementById('rowsShownEnd').textContent = end;
        document.getElementById('rowsTotal').textContent = this.filteredData.length;
        document.getElementById('currentPage').textContent = this.pagination.currentPage;
        
        // Habilitar/deshabilitar botones
        document.getElementById('firstPage').disabled = this.pagination.currentPage === 1;
        document.getElementById('prevPage').disabled = this.pagination.currentPage === 1;
        document.getElementById('nextPage').disabled = this.pagination.currentPage === this.pagination.totalPages || this.filteredData.length === 0;
        document.getElementById('lastPage').disabled = this.pagination.currentPage === this.pagination.totalPages || this.filteredData.length === 0;
    }

    goToPage(page) {
        page = Math.max(1, Math.min(page, this.pagination.totalPages));
        this.pagination.currentPage = page;
        this.updateTable();
    }

    searchTable(term) {
        term = term.toLowerCase();
        
        if (!term) {
            this.filteredData = [...this.data];
        } else {
            this.filteredData = this.data.filter(item =>
                item.transformador.toLowerCase().includes(term) ||
                item.tipo.toLowerCase().includes(term) ||
                item.combinationLabel.toLowerCase().includes(term) ||
                item.frecuencia.toString().includes(term)
            );
        }
        
        this.pagination.currentPage = 1;
        this.updateTable();
    }

    async handleExcelUpload() {
        const fileInput = document.getElementById('excelFileInput');
        const uploadBtn = document.getElementById('uploadExcelBtn');
        const progressContainer = document.querySelector('.excel-upload-progress');
        const progressBar = document.getElementById('excelProgress');
        const statusText = document.getElementById('excelStatus');
        const percentText = document.getElementById('excelPercent');
        const resultContainer = document.getElementById('excelResult');

        const file = fileInput?.files?.[0];

        if (!file) {
            this.showNotification('Selecciona un archivo Excel antes de subir', 'warning');
            return;
        }

        // Validar extensión
        const validExtensions = ['.xlsx', '.xls'];
        const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        
        if (!validExtensions.includes(fileExtension)) {
            this.showNotification('Formato inválido. Solo se aceptan archivos .xlsx o .xls', 'error');
            return;
        }

        // Validar tamaño (máximo 10MB)
        if (file.size > 10 * 1024 * 1024) {
            this.showNotification('El archivo es demasiado grande (máximo 10MB)', 'error');
            return;
        }

        // Preparar FormData
        const formData = new FormData();
        formData.append('archivo', file);
        formData.append('usuario', 'admin');

        try {
            // Deshabilitar botón y mostrar progreso
            uploadBtn.disabled = true;
            uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
            progressContainer.style.display = 'block';
            progressBar.style.width = '0%';
            percentText.textContent = '0%';
            statusText.textContent = 'Iniciando carga...';
            resultContainer.style.display = 'none';
            resultContainer.innerHTML = '';

            // Enviar archivo al servidor
            const response = await fetch(`${this.apiBaseUrl}/api/subir-excel`, {
                method: 'POST',
                body: formData
            });

            // Actualizar progreso
            progressBar.style.width = '50%';
            percentText.textContent = '50%';
            statusText.textContent = 'Procesando datos...';

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || result.error || 'Error en el servidor');
            }

            // Completar progreso
            progressBar.style.width = '100%';
            percentText.textContent = '100%';
            statusText.textContent = '¡Completado!';
            
            // Mostrar resultados
            resultContainer.style.display = 'block';
            resultContainer.innerHTML = `
                <div style="background: #f0f9ff; border-left: 4px solid var(--primary); padding: 1rem; border-radius: 8px;">
                    <h4 style="margin-top: 0; color: var(--primary);">
                        <i class="fas fa-check-circle"></i> Importación exitosa
                    </h4>
                    <p><strong>Archivo:</strong> ${file.name}</p>
                    <p><strong>ID de carga:</strong> ${result.carga_id}</p>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-top: 0.5rem;">
                        <div style="text-align: center;">
                            <div style="font-size: 2rem; font-weight: 700; color: var(--success);">${result.insertadas}</div>
                            <div style="font-size: 0.85rem; color: var(--text-light);">Insertadas</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 2rem; font-weight: 700; color: var(--warning);">${result.actualizadas}</div>
                            <div style="font-size: 0.85rem; color: var(--text-light);">Actualizadas</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 2rem; font-weight: 700; color: ${result.errores > 0 ? 'var(--danger)' : 'var(--text-light)'};">${result.errores}</div>
                            <div style="font-size: 0.85rem; color: var(--text-light);">Errores</div>
                        </div>
                    </div>
                    ${result.errores_detalle ? `
                        <div style="margin-top: 1rem; font-size: 0.9rem;">
                            <details>
                                <summary style="cursor: pointer; color: var(--danger); font-weight: 600;">
                                    <i class="fas fa-exclamation-triangle"></i> Ver detalles de errores (${result.errores_detalle.length})
                                </summary>
                                <div style="margin-top: 0.5rem; max-height: 200px; overflow-y: auto; background: rgba(239, 68, 68, 0.05); padding: 0.5rem; border-radius: 4px;">
                                    ${result.errores_detalle.map(error => `
                                        <div style="padding: 0.25rem 0; border-bottom: 1px solid rgba(239, 68, 68, 0.1);">
                                            <strong>Fila ${error.fila}:</strong> ${error.error}
                                        </div>
                                    `).join('')}
                                </div>
                            </details>
                        </div>
                    ` : ''}
                    <div style="margin-top: 1rem; font-size: 0.85rem; color: var(--text-light); text-align: center;">
                        <i class="fas fa-clock"></i> ${new Date().toLocaleTimeString('es-ES')}
                    </div>
                </div>
            `;

            // Mostrar notificación
            this.showNotification(`Excel importado: ${result.insertadas} nuevas, ${result.actualizadas} actualizadas`, 'success');

            // Recargar datos y cargas
            setTimeout(() => {
                this.loadData();
                this.loadCargas();
            }, 1000);

        } catch (error) {
            console.error('❌ Error al subir Excel:', error);
            
            progressBar.style.width = '100%';
            percentText.textContent = '100%';
            statusText.textContent = 'Error';
            progressBar.style.background = 'var(--danger)';
            
            resultContainer.style.display = 'block';
            resultContainer.innerHTML = `
                <div style="background: #fef2f2; border-left: 4px solid var(--danger); padding: 1rem; border-radius: 8px;">
                    <h4 style="margin-top: 0; color: var(--danger);">
                        <i class="fas fa-times-circle"></i> Error en la importación
                    </h4>
                    <p style="margin: 0.5rem 0;">${error.message}</p>
                    <p style="font-size: 0.85rem; color: var(--text-light); margin: 0;">
                        Verifica que el archivo tenga el formato correcto y vuelve a intentar.
                    </p>
                </div>
            `;

            this.showNotification(`Error al importar Excel: ${error.message}`, 'error');
        } finally {
            // Restaurar botón y limpiar
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Subir Excel';
            fileInput.value = '';
            
            // Ocultar progreso después de 5 segundos
            setTimeout(() => {
                progressContainer.style.display = 'none';
                progressBar.style.background = 'var(--primary)';
                progressBar.style.width = '0%';
            }, 5000);
        }
    }

    showDetails(alimentador, fecha) {
        const detalles = this.data.find(d => d.transformador === alimentador && d.fecha === fecha);
        if (detalles) {
            alert(`📋 Detalles de ${alimentador} en ${fecha}\n\n` +
                  `• Tipo: ${detalles.tipo}\n` +
                  `• Valor: ${this.safeToFixed(detalles.frecuencia)}\n` +
                  `• Departamento: ${detalles.departamento || 'N/A'}\n` +
                  `• Año: ${detalles.year}\n` +
                  `• Mes: ${detalles.month}`);
        }
    }

    exportData() {
        if (this.filteredData.length === 0) {
            this.showNotification("No hay datos para exportar", "warning");
            return;
        }
        
        // Convertir a CSV
        const headers = ['Alimentador', 'Año', 'Mes', 'Tipo', 'Valor', 'Departamento', 'Fecha'];
        const csvRows = [
            headers.join(','),
            ...this.filteredData.map(item => [
                item.transformador,
                item.year,
                item.month,
                item.tipo,
                item.frecuencia,
                item.departamento || '',
                item.fecha
            ].join(','))
        ];
        
        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `ande-datos-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification("Datos exportados correctamente", "success");
    }

    formatValueCallback(value) {
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

    showLoading(show, text = "Procesando...") {
        const overlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');
        
        if (show) {
            loadingText.textContent = text;
            overlay.style.display = 'flex';
            
            let progress = 0;
            const progressBar = document.getElementById('loaderProgress');
            const interval = setInterval(() => {
                progress += 5;
                progressBar.style.width = `${progress}%`;
                if (progress >= 90) clearInterval(interval);
            }, 100);
        } else {
            overlay.style.display = 'none';
            document.getElementById('loaderProgress').style.width = '0%';
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

    startLiveUpdates() {
        // Actualizar cada 30 segundos
        setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.loadData();
            }
        }, 30000);
    }
}

// Inicializar dashboard
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new ANDEDashboard();
});