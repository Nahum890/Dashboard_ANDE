// dashboard.js - Dashboard Profesional ANDE
class DashboardANDE {
    constructor() {
        this.charts = {};
        this.filters = {
            tipo: '',
            transformador: '',
            anio: '',
            mes: ''
        };
        
        this.pagination = {
            currentPage: 1,
            pageSize: 25,
            totalPages: 1,
            totalItems: 0,
            sortBy: 'fecha',
            sortOrder: 'DESC'
        };
        
        this.data = {
            dashboard: null,
            tabla: null
        };
        
        this.init();
    }
    
    async init() {
        console.log('🚀 Inicializando Dashboard ANDE...');
        
        // Mostrar loading inicial
        this.showLoading(true);
        
        try {
            // Cargar opciones de filtros en paralelo
            await this.loadFilterOptions();
            
            // Cargar datos iniciales
            await this.loadDashboardData();
            await this.loadTableData();
            
            // Inicializar gráficos
            this.initCharts();
            
            // Configurar eventos
            this.setupEventListeners();
            
            console.log('✅ Dashboard inicializado correctamente');
            
        } catch (error) {
            console.error('❌ Error inicializando:', error);
            this.showError('Error inicializando el dashboard');
        } finally {
            this.showLoading(false);
        }
    }
    
    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    }
    
    async loadFilterOptions() {
        try {
            // Cargar en paralelo
            const [tipos, secciones, años] = await Promise.all([
                this.fetchData('/api/tipos-medicion'),
                this.fetchData('/api/secciones'),
                this.fetchData('/api/anios')
            ]);
            
            // Tipos de medición
            const tipoSelect = document.getElementById('filterTipo');
            if (tipoSelect && tipos) {
                tipoSelect.innerHTML = '<option value="">Todos los tipos</option>';
                tipos.forEach(tipo => {
                    const option = document.createElement('option');
                    option.value = tipo;
                    option.textContent = tipo;
                    tipoSelect.appendChild(option);
                });
                
                // Seleccionar "TOTAL FEP" por defecto si existe
                if (tipos.includes('TOTAL FEP')) {
                    tipoSelect.value = 'TOTAL FEP';
                    this.filters.tipo = 'TOTAL FEP';
                }
            }
            
            // Secciones/alimentadores
            const seccionSelect = document.getElementById('filterTransformador');
            if (seccionSelect && secciones) {
                seccionSelect.innerHTML = '<option value="">Todos los alimentadores</option>';
                secciones.forEach(seccion => {
                    const option = document.createElement('option');
                    option.value = seccion;
                    option.textContent = seccion;
                    seccionSelect.appendChild(option);
                });
            }
            
            // Años
            const anioSelect = document.getElementById('filterAnio');
            if (anioSelect && años) {
                anioSelect.innerHTML = '<option value="">Todos los años</option>';
                años.forEach(anio => {
                    const option = document.createElement('option');
                    option.value = anio;
                    option.textContent = anio;
                    anioSelect.appendChild(option);
                });
                
                // Seleccionar el año más reciente por defecto
                if (años.length > 0) {
                    anioSelect.value = años[0];
                    this.filters.anio = años[0];
                }
            }
            
        } catch (error) {
            console.error('❌ Error cargando opciones:', error);
        }
    }
    
    async loadDashboardData() {
        try {
            const params = new URLSearchParams();
            
            if (this.filters.tipo) params.append('tipo_medicion', this.filters.tipo);
            if (this.filters.transformador) params.append('seccion', this.filters.transformador);
            if (this.filters.anio) params.append('anio', this.filters.anio);
            
            console.log('📊 Cargando datos del dashboard...');
            const data = await this.fetchData(`/api/dashboard?${params}`);
            
            if (data) {
                this.data.dashboard = data;
                this.updateDashboardUI();
                this.updateCharts();
                this.updateLastUpdate();
            }
            
        } catch (error) {
            console.error('❌ Error cargando dashboard:', error);
        }
    }
    
    async loadTableData() {
        try {
            const params = new URLSearchParams({
                page: this.pagination.currentPage,
                limit: this.pagination.pageSize,
                sortBy: this.pagination.sortBy,
                sortOrder: this.pagination.sortOrder
            });
            
            if (this.filters.tipo) params.append('tipo_medicion', this.filters.tipo);
            if (this.filters.transformador) params.append('seccion', this.filters.transformador);
            if (this.filters.anio) params.append('anio', this.filters.anio);
            if (this.filters.mes) params.append('mes', this.filters.mes);
            
            console.log('📋 Cargando datos de tabla...');
            const data = await this.fetchData(`/api/tabla?${params}`);
            
            if (data) {
                this.data.tabla = data;
                this.updateTableUI();
                this.updatePaginationUI();
            }
            
        } catch (error) {
            console.error('❌ Error cargando tabla:', error);
        }
    }
    
    async fetchData(url) {
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.json();
            
        } catch (error) {
            console.error(`❌ Error fetch ${url}:`, error);
            return null;
        }
    }
    
    updateDashboardUI() {
        if (!this.data.dashboard?.estadisticas) return;
        
        const stats = this.data.dashboard.estadisticas;
        
        // Actualizar estadísticas en sidebar
        document.getElementById('statRegistros').textContent = 
            stats.total_registros?.toLocaleString() || '0';
        document.getElementById('statTransformadores').textContent = 
            stats.total_transformadores || '0';
        document.getElementById('statDepartamentos').textContent = 
            stats.total_departamentos || '0';
        document.getElementById('statPeriodo').textContent = 
            stats.anio_inicio && stats.anio_fin ? 
            `${stats.anio_inicio}-${stats.anio_fin}` : 'N/A';
        
        // Actualizar KPI cards
        document.getElementById('kpiPromedio').textContent = 
            stats.promedio_general?.toFixed(4) || '0.0000';
        document.getElementById('kpiMaximo').textContent = 
            stats.maximo_general?.toFixed(4) || '0.0000';
        document.getElementById('kpiMinimo').textContent = 
            stats.minimo_general?.toFixed(4) || '0.0000';
        
        // Calcular variación estándar aproximada si no está disponible
        if (stats.maximo_general && stats.minimo_general) {
            const variacion = (stats.maximo_general - stats.minimo_general) / 4;
            document.getElementById('kpiVariacion').textContent = variacion.toFixed(4);
        }
    }
    
    updateLastUpdate() {
        const updateElement = document.getElementById('lastUpdate');
        if (updateElement) {
            const now = new Date();
            updateElement.textContent = now.toLocaleTimeString();
        }
    }
    
    initCharts() {
        // Gráfico principal
        const ctxPrincipal = document.getElementById('chartPrincipal');
        if (ctxPrincipal) {
            this.charts.principal = new Chart(ctxPrincipal.getContext('2d'), {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Frecuencia Promedio',
                        data: [],
                        borderColor: '#00b0ff',
                        backgroundColor: 'rgba(0, 176, 255, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 4,
                        pointHoverRadius: 8,
                        pointBackgroundColor: '#00b0ff',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top'
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleFont: { size: 14 },
                            bodyFont: { size: 13 },
                            padding: 12,
                            cornerRadius: 6
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                color: 'rgba(0,0,0,0.05)'
                            },
                            ticks: {
                                font: {
                                    size: 12
                                }
                            }
                        },
                        y: {
                            beginAtZero: false,
                            grid: {
                                color: 'rgba(0,0,0,0.05)'
                            },
                            ticks: {
                                font: {
                                    size: 12
                                },
                                callback: function(value) {
                                    return value.toFixed(4);
                                }
                            }
                        }
                    },
                    animation: {
                        duration: 1000,
                        easing: 'easeOutQuart'
                    }
                }
            });
        }
        
        // Gráfico de distribución
        const ctxDistribucion = document.getElementById('chartDistribucion');
        if (ctxDistribucion) {
            this.charts.distribucion = new Chart(ctxDistribucion.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: [
                            '#1a237e', '#534bae', '#00b0ff', '#00e5ff',
                            '#00c853', '#ff9100', '#ff1744', '#757575'
                        ],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                font: {
                                    size: 11
                                },
                                padding: 15
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.raw || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = Math.round((value / total) * 100);
                                    return `${label}: ${value} (${percentage}%)`;
                                }
                            }
                        }
                    },
                    cutout: '65%'
                }
            });
        }
    }
    
    updateCharts() {
        if (!this.data.dashboard) return;
        
        // Actualizar gráfico principal
        if (this.charts.principal && this.data.dashboard.grafico) {
            const datos = this.data.dashboard.grafico;
            
            const labels = datos.map(item => 
                `${this.getMonthName(item.mes)} ${item.anio}`
            );
            
            const valores = datos.map(item => item.promedio);
            
            this.charts.principal.data.labels = labels;
            this.charts.principal.data.datasets[0].data = valores;
            this.charts.principal.data.datasets[0].label = 
                this.filters.tipo || 'Frecuencia Promedio';
            this.charts.principal.update();
        }
        
        // Actualizar gráfico de distribución
        if (this.charts.distribucion && this.data.dashboard.distribucion) {
            const distribucion = this.data.dashboard.distribucion;
            
            const labels = distribucion.map(item => item.tipo_medicion);
            const valores = distribucion.map(item => item.cantidad);
            
            this.charts.distribucion.data.labels = labels;
            this.charts.distribucion.data.datasets[0].data = valores;
            this.charts.distribucion.update();
        }
    }
    
    updateTableUI() {
        const tbody = document.getElementById('tableBody');
        if (!tbody || !this.data.tabla?.datos) return;
        
        // Usar DocumentFragment para mejor rendimiento
        const fragment = document.createDocumentFragment();
        
        if (this.data.tabla.datos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 3rem; color: #757575;">
                        <i class="fas fa-database" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                        No hay datos para mostrar con los filtros actuales
                    </td>
                </tr>
            `;
            return;
        }
        
        this.data.tabla.datos.forEach(item => {
            const row = document.createElement('tr');
            
            const valor = parseFloat(item.frecuencia);
            let estado = 'Normal';
            let estadoClase = 'status-ok';
            
            if (valor > 1.5) {
                estado = 'Crítico';
                estadoClase = 'status-critical';
            } else if (valor > 1.2) {
                estado = 'Alerta';
                estadoClase = 'status-warning';
            }
            
            row.innerHTML = `
                <td>${item.transformador || '—'}</td>
                <td>${item.departamento || '—'}</td>
                <td>${this.formatDate(item.fecha)}</td>
                <td>${item.tipo || '—'}</td>
                <td><strong>${valor.toFixed(4)}</strong></td>
                <td><span class="status-badge ${estadoClase}">${estado}</span></td>
            `;
            
            fragment.appendChild(row);
        });
        
        tbody.innerHTML = '';
        tbody.appendChild(fragment);
        
        // Actualizar búsqueda en tiempo real
        this.setupSearch();
    }
    
    updatePaginationUI() {
        if (!this.data.tabla?.paginacion) return;
        
        const pag = this.data.tabla.paginacion;
        
        // Actualizar información de página
        const start = ((pag.pagina - 1) * pag.limite) + 1;
        const end = Math.min(pag.pagina * pag.limite, pag.total);
        
        document.getElementById('pageStart').textContent = start;
        document.getElementById('pageEnd').textContent = end;
        document.getElementById('pageTotal').textContent = pag.total;
        document.getElementById('pageCurrent').textContent = pag.pagina;
        document.getElementById('pageTotalCount').textContent = pag.totalPaginas;
        
        // Actualizar estado de botones
        document.getElementById('pagePrev').disabled = pag.pagina <= 1;
        document.getElementById('pageNext').disabled = pag.pagina >= pag.totalPaginas;
        
        // Actualizar paginación interna
        this.pagination.currentPage = pag.pagina;
        this.pagination.totalPages = pag.totalPaginas;
        this.pagination.totalItems = pag.total;
    }
    
    setupEventListeners() {
        // Botón aplicar filtros
        document.getElementById('btnAplicar')?.addEventListener('click', () => {
            this.applyFilters();
        });
        
        // Botón limpiar filtros
        document.getElementById('btnLimpiar')?.addEventListener('click', () => {
            this.resetFilters();
        });
        
        // Cambios en filtros (con debounce)
        let debounceTimer;
        ['filterTipo', 'filterTransformador', 'filterAnio', 'filterMes'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', () => {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        this.updateFiltersFromUI();
                        this.applyFilters();
                    }, 500);
                });
            }
        });
        
        // Ordenar tabla
        document.getElementById('sortTable')?.addEventListener('change', (e) => {
            this.pagination.sortBy = e.target.value;
            this.loadTableData();
        });
        
        document.getElementById('orderTable')?.addEventListener('change', (e) => {
            this.pagination.sortOrder = e.target.value;
            this.loadTableData();
        });
        
        // Paginación
        document.getElementById('pagePrev')?.addEventListener('click', () => {
            if (this.pagination.currentPage > 1) {
                this.pagination.currentPage--;
                this.loadTableData();
            }
        });
        
        document.getElementById('pageNext')?.addEventListener('click', () => {
            if (this.pagination.currentPage < this.pagination.totalPages) {
                this.pagination.currentPage++;
                this.loadTableData();
            }
        });
        
        // Cambiar tipo de gráfico
        document.querySelectorAll('.chart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.chart-btn').forEach(b => 
                    b.classList.remove('active')
                );
                e.currentTarget.classList.add('active');
                
                const type = e.currentTarget.dataset.chart;
                if (this.charts.principal && type) {
                    this.charts.principal.config.type = type;
                    this.charts.principal.update();
                }
            });
        });
    }
    
    setupSearch() {
        const searchInput = document.getElementById('searchTable');
        if (!searchInput) return;
        
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#tableBody tr');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        });
    }
    
    updateFiltersFromUI() {
        this.filters = {
            tipo: document.getElementById('filterTipo')?.value || '',
            transformador: document.getElementById('filterTransformador')?.value || '',
            anio: document.getElementById('filterAnio')?.value || '',
            mes: document.getElementById('filterMes')?.value || ''
        };
    }
    
    async applyFilters() {
        this.showLoading(true);
        
        try {
            // Resetear paginación al aplicar nuevos filtros
            this.pagination.currentPage = 1;
            
            // Cargar datos en paralelo
            await Promise.all([
                this.loadDashboardData(),
                this.loadTableData()
            ]);
            
        } catch (error) {
            console.error('❌ Error aplicando filtros:', error);
        } finally {
            this.showLoading(false);
        }
    }
    
    async resetFilters() {
        // Resetear UI
        document.getElementById('filterTipo').value = '';
        document.getElementById('filterTransformador').value = '';
        document.getElementById('filterAnio').value = '';
        document.getElementById('filterMes').value = '';
        
        // Resetear filtros internos
        this.filters = {
            tipo: '',
            transformador: '',
            anio: '',
            mes: ''
        };
        
        // Resetear paginación
        this.pagination.currentPage = 1;
        
        // Aplicar cambios
        await this.applyFilters();
    }
    
    // Utilidades
    formatDate(dateString) {
        if (!dateString) return '—';
        try {
            const [year, month] = dateString.split('-');
            const meses = [
                'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
            ];
            return `${meses[parseInt(month) - 1]} ${year}`;
        } catch (error) {
            return dateString;
        }
    }
    
    getMonthName(monthNumber) {
        const meses = [
            'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
            'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
        ];
        return meses[parseInt(monthNumber) - 1] || '';
    }
    
    showError(message) {
        console.error('❌', message);
        // Podrías implementar notificaciones bonitas aquí
        alert(`Error: ${message}`);
    }
}

// Inicializar dashboard cuando se cargue la página
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new DashboardANDE();
});