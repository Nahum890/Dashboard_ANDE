// script.js - VERSIÓN 3.4 COMPLETA
console.log("🚀 Dashboard ANDE v3.4 iniciando...");

class ANDEDashboard {
    constructor() {
        this.apiBaseUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:10000'
            : window.location.origin;
        this.data = [];
        this.filteredData = [];
        this.mainChart = null;
        this.rankingChart = null;
        this.scatterChart = null;
        this.sortConfig = { column: null, direction: 'asc' };
        
        this.chartPalette = [
            '#FF0000', '#FF4500', '#FF8C00', '#FFD700', '#ADFF2F', '#32CD32', 
            '#00FA9A', '#00CED1', '#1E90FF', '#4169E1', '#8A2BE2', '#DA70D6',
            '#FF1493', '#FF69B4', '#C71585', '#8B0000', '#B22222', '#DC143C',
            '#FF6347', '#FF7F50', '#FFA500', '#FFD700', '#FFFF00', '#9ACD32'
        ];
        
        this.allSecciones = [];
        this.estaciones = [];
        
        // Valores por defecto optimizados y SEGUROS
        this.defaultFilters = {
            tipoMedicion: ['ACCID.DEP'],
            transformador: ['ACY1'],
            year: ['2024'],
            month: [1,2,3,4,5,6,7,8,9,10,11,12],
            estacion: '',
            periodo: 'select_months'
        };
        
        this.filters = { ...this.defaultFilters };
        this.globalMode = 'unique';
        this.groupBy = 'alimentador';
        
        this.pagination = { currentPage: 1, rowsPerPage: 25, totalPages: 1 };
        this.selectedMonths = new Set([1,2,3,4,5,6,7,8,9,10,11,12]);
        this.isInitialLoad = true;
        this.serverConnected = false;
    }
    
    // ==================== MÉTODOS DE UTILIDAD ====================
    
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
    
    safeAddEventListener(elementId, eventType, callback) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(eventType, callback);
            return true;
        } else {
            console.warn(`⚠️ Elemento con ID '${elementId}' no encontrado`);
            return false;
        }
    }
    
    showNotification(message, type = "info") {
        const notification = document.getElementById('notification');
        const notificationText = notification.querySelector('.notification-text');
        const notificationIcon = notification.querySelector('i');
        
        if (!notification) {
            console.log(`[${type.toUpperCase()}] ${message}`);
            return;
        }
        
        // Configurar icono según tipo
        switch(type) {
            case 'success':
                notificationIcon.className = 'fas fa-check-circle';
                notification.style.backgroundColor = 'rgba(34, 197, 94, 0.9)';
                break;
            case 'error':
                notificationIcon.className = 'fas fa-exclamation-circle';
                notification.style.backgroundColor = 'rgba(239, 68, 68, 0.9)';
                break;
            case 'warning':
                notificationIcon.className = 'fas fa-exclamation-triangle';
                notification.style.backgroundColor = 'rgba(245, 158, 11, 0.9)';
                break;
            default:
                notificationIcon.className = 'fas fa-info-circle';
                notification.style.backgroundColor = 'rgba(59, 130, 246, 0.9)';
        }
        
        notificationText.textContent = message;
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 4000);
    }
    
    showLoading(show, text = "Cargando...") {
        const loadingOverlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');
        
        if (loadingOverlay) {
            if (show) {
                loadingOverlay.style.display = 'flex';
                if (loadingText) loadingText.textContent = text;
            } else {
                setTimeout(() => {
                    loadingOverlay.style.display = 'none';
                }, 300);
            }
        }
    }
    
    updateTime() {
        const updateTime = () => {
            const now = new Date();
            const timeString = now.toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            const elements = [
                'currentTime',
                'lastUpdate',
                'updateTime'
            ];
            
            elements.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.textContent = timeString;
                }
            });
            
            // Actualizar cada 10 segundos
            setTimeout(updateTime, 10000);
        };
        
        updateTime();
    }
    
    // ==================== VERIFICACIÓN DE SERVIDOR ====================
    
    async verificarServidor() {
        try {
            console.log("🔍 Verificando conexión con el servidor...");
            const response = await fetch(`${this.apiBaseUrl}/api/health`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log("✅ Servidor conectado:", data);
            this.serverConnected = true;
            return true;
            
        } catch (error) {
            console.error("❌ No se pudo conectar al servidor:", error.message);
            this.serverConnected = false;
            
            this.showNotification(
                "No se pudo conectar al servidor. Asegúrate de que el servidor esté ejecutándose en puerto 10000.",
                "error"
            );
            return false;
        }
    }
    
    async verificarEstadoBD() {
        try {
            console.log("🔍 Verificando estado de la base de datos...");
            const response = await fetch(`${this.apiBaseUrl}/api/verificar-datos`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log("📊 Estado de la base de datos:");
            console.log(`   - Tabla existe: ${data.tabla_existe}`);
            console.log(`   - Total registros: ${data.total_registros}`);
            console.log(`   - Tipos disponibles: ${data.tipos_disponibles?.join(', ') || 'Ninguno'}`);
            console.log(`   - Años disponibles: ${data.años_disponibles?.join(', ') || 'Ninguno'}`);
            console.log(`   - Secciones disponibles: ${data.secciones_disponibles?.slice(0, 5).join(', ') || 'Ninguno'}...`);
            
            if (!data.tabla_existe || data.total_registros === 0) {
                console.warn("⚠️ LA BASE DE DATOS ESTÁ VACÍA O NO EXISTE");
                this.showNotification(
                    "La base de datos está vacía. Sube un archivo Excel con datos para comenzar.",
                    "warning"
                );
                return false;
            }
            
            return true;
            
        } catch (error) {
            console.error("❌ Error verificando base de datos:", error);
            return false;
        }
    }
    
    // ==================== INICIALIZACIÓN ====================
    
    async initialize() {
        console.log("🔧 Inicializando dashboard...");
        
        try {
            // 1. Verificar conexión con el servidor
            const servidorOK = await this.verificarServidor();
            if (!servidorOK) {
                // Si no hay servidor, mostrar mensaje y detener
                this.showNotification(
                    "No se pudo conectar al servidor. Verifica que esté ejecutándose.",
                    "error"
                );
                return;
            }
            
            // 2. Verificar estado de la base de datos
            await this.verificarEstadoBD();
            
            // 3. Inicializar componentes básicos
            this.initCharts();
            
            // 4. Configurar event listeners
            this.setupEventListeners();
            
            // 5. Cargar metadatos
            await this.loadTiposMedicion();
            await this.loadSeccionesDisponibles();
            await this.loadYearsAvailable();
            
            // 6. Configurar valores por defecto SEGUROS
            this.setDefaultFilterValues();
            
            // 7. Cargar datos iniciales
            await this.loadData();
            
            // 8. Cargar historial de cargas en segundo plano
            setTimeout(() => this.loadCargas(), 1000);
            
            // 9. Iniciar servicios
            this.updateTime();
            this.startLiveUpdates();
            
            console.log("✅ Dashboard inicializado correctamente");
            this.showNotification("Dashboard cargado correctamente", "success");
            
        } catch (error) {
            console.error("❌ Error inicializando:", error);
            this.showNotification(`Error inicializando: ${error.message}`, "error");
        } finally {
            this.isInitialLoad = false;
        }
    }
    
    // ==================== INICIALIZACIÓN DE GRÁFICOS ====================
    
    initCharts() {
        console.log("📊 Inicializando gráficos...");
        
        // Configuración global de Chart.js
        Chart.defaults.font.family = "'Inter', 'Segoe UI', system-ui, sans-serif";
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.95)';
        Chart.defaults.animation.duration = 1000;
        Chart.defaults.responsive = true;
        Chart.defaults.maintainAspectRatio = false;
        
        // Inicializar canvases vacíos
        this.initMainChart();
        this.initRankingChart();
        this.initScatterChart();
    }
    
    initMainChart() {
        const ctx = document.getElementById('mainChart').getContext('2d');
        
        this.mainChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        display: false 
                    },
                    tooltip: { 
                        mode: 'index', 
                        intersect: false 
                    }
                },
                scales: { 
                    y: { 
                        beginAtZero: false,
                        grid: { 
                            color: 'rgba(148, 163, 184, 0.1)' 
                        },
                        ticks: { 
                            color: '#94a3b8' 
                        }
                    }, 
                    x: { 
                        grid: { 
                            color: 'rgba(148, 163, 184, 0.1)' 
                        },
                        ticks: { 
                            color: '#94a3b8' 
                        }
                    } 
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }
    
    initRankingChart() {
        const ctx = document.getElementById('rankingChart').getContext('2d');
        
        this.rankingChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Promedio',
                    data: [],
                    backgroundColor: [],
                    borderColor: [],
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        display: false 
                    }
                },
                scales: {
                    x: {
                        grid: { 
                            color: 'rgba(148, 163, 184, 0.1)' 
                        },
                        ticks: { 
                            color: '#94a3b8' 
                        }
                    },
                    y: {
                        grid: { 
                            color: 'rgba(148, 163, 184, 0.1)' 
                        },
                        ticks: { 
                            color: '#94a3b8' 
                        }
                    }
                }
            }
        });
    }
    
    initScatterChart() {
        const ctx = document.getElementById('scatterChart').getContext('2d');
        
        this.scatterChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        position: 'top' 
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: { 
                            color: 'rgba(148, 163, 184, 0.1)' 
                        },
                        ticks: { 
                            color: '#94a3b8' 
                        }
                    },
                    x: {
                        grid: { 
                            color: 'rgba(148, 163, 184, 0.1)' 
                        },
                        ticks: { 
                            color: '#94a3b8' 
                        }
                    }
                }
            }
        });
    }
    
    // ==================== CONFIGURACIÓN DE EVENT LISTENERS ====================
    
    setupEventListeners() {
        console.log("🔗 Configurando event listeners...");
        
        // Botón de aplicar filtros
        this.safeAddEventListener('applyFilters', 'click', () => this.loadData());
        
        // Botón de resetear filtros
        this.safeAddEventListener('resetFilters', 'click', () => this.resetFilters());
        
        // Botón de limpiar todo
        this.safeAddEventListener('clearAll', 'click', () => this.clearAllFilters());
        
        // Cambio de modo global
        this.safeAddEventListener('globalModeUnique', 'click', () => this.setGlobalMode('unique'));
        this.safeAddEventListener('globalModeMultiple', 'click', () => this.setGlobalMode('multiple'));
        
        // Selectores de filtros
        this.safeAddEventListener('filterTipoMedicion', 'change', () => this.onFilterChange());
        this.safeAddEventListener('filterTransformador', 'change', () => this.onFilterChange());
        this.safeAddEventListener('filterYear', 'change', () => this.onFilterChange());
        this.safeAddEventListener('filterEstacion', 'change', () => this.onFilterChange());
        this.safeAddEventListener('filterPeriodo', 'change', () => this.onPeriodoChange());
        
        // Botones de meses
        const monthButtons = document.querySelectorAll('.month-btn');
        monthButtons.forEach(btn => {
            btn.addEventListener('click', (e) => this.toggleMonthSelection(e));
        });
        
        // Botón de seleccionar todos los meses
        this.safeAddEventListener('selectAllMonths', 'click', () => this.selectAllMonths());
        this.safeAddEventListener('deselectAllMonths', 'click', () => this.deselectAllMonths());
        
        // Botones de acción rápida
        this.safeAddEventListener('loadAllFeeders', 'click', () => this.loadAllFeeders());
        this.safeAddEventListener('loadAllStation', 'click', () => this.loadAllFromStation());
        
        // Selector de agrupación
        this.safeAddEventListener('groupBy', 'change', () => this.onGroupByChange());
        
        // Controles de gráficos
        this.safeAddEventListener('chartType', 'change', () => this.onChartTypeChange());
        this.safeAddEventListener('togglePoints', 'click', () => this.toggleChartPoints());
        this.safeAddEventListener('zoomIn', 'click', () => this.zoomChart('in'));
        this.safeAddEventListener('zoomOut', 'click', () => this.zoomChart('out'));
        this.safeAddEventListener('resetZoom', 'click', () => this.resetChartZoom());
        
        // Botón de expandir gráfico
        this.safeAddEventListener('expandChartBtn', 'click', () => this.expandChart());
        
        // Controles de tabla
        this.safeAddEventListener('tableSearch', 'input', (e) => this.filterTable(e.target.value));
        this.safeAddEventListener('rowsPerPage', 'change', () => this.updateTable());
        this.safeAddEventListener('firstPage', 'click', () => this.goToPage(1));
        this.safeAddEventListener('prevPage', 'click', () => this.goToPage(this.pagination.currentPage - 1));
        this.safeAddEventListener('nextPage', 'click', () => this.goToPage(this.pagination.currentPage + 1));
        this.safeAddEventListener('lastPage', 'click', () => this.goToPage(this.pagination.totalPages));
        
        // Headers de tabla para ordenar
        const tableHeaders = document.querySelectorAll('th[data-sort]');
        tableHeaders.forEach(th => {
            th.addEventListener('click', () => this.sortTable(th.dataset.sort));
        });
        
        // Carga de Excel
        this.safeAddEventListener('uploadExcelBtn', 'click', () => this.uploadExcel());
        
        // Toggle sidebar
        this.safeAddEventListener('sidebarToggle', 'click', () => this.toggleSidebar());
        this.safeAddEventListener('sidebarClose', 'click', () => this.toggleSidebar());
        
        console.log("✅ Event listeners configurados");
    }
    
    // ==================== CARGA DE METADATOS ====================
    
    async loadTiposMedicion() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/tipos-medicion`);
            const tipos = await response.json();
            
            const select = document.getElementById('filterTipoMedicion');
            if (!select) return;
            
            select.innerHTML = '<option value="all">Todos los tipos</option>';
            
            tipos.forEach(tipo => {
                const option = document.createElement('option');
                option.value = tipo;
                option.textContent = tipo;
                select.appendChild(option);
            });
            
            console.log(`✅ Tipos de medición cargados: ${tipos.length} tipos`);
        } catch (error) {
            console.error("❌ Error cargando tipos de medición:", error);
        }
    }
    
    async loadSeccionesDisponibles() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/secciones`);
            const secciones = await response.json();
            
            this.allSecciones = secciones;
            
            // Extraer estaciones únicas (primeras 3 letras)
            const estacionesSet = new Set();
            secciones.forEach(seccion => {
                if (seccion && seccion.length >= 3) {
                    estacionesSet.add(seccion.substring(0, 3));
                }
            });
            
            this.estaciones = Array.from(estacionesSet).sort();
            
            // Llenar select de alimentadores
            const select = document.getElementById('filterTransformador');
            if (!select) return;
            
            select.innerHTML = `
                <option value="all">Todos los alimentadores</option>
                ${this.estaciones.map(e => `<option value="all_${e}">Todos de ${e}</option>`).join('')}
            `;
            
            secciones.forEach(seccion => {
                const option = document.createElement('option');
                option.value = seccion;
                option.textContent = seccion;
                select.appendChild(option);
            });
            
            // Llenar select de estaciones
            const estacionSelect = document.getElementById('filterEstacion');
            if (estacionSelect) {
                estacionSelect.innerHTML = '<option value="">Todas las estaciones</option>';
                this.estaciones.forEach(estacion => {
                    const option = document.createElement('option');
                    option.value = estacion;
                    option.textContent = estacion;
                    estacionSelect.appendChild(option);
                });
            }
            
            console.log(`✅ Secciones cargadas: ${secciones.length} secciones, ${this.estaciones.length} estaciones`);
        } catch (error) {
            console.error("❌ Error cargando secciones:", error);
        }
    }
    
    async loadYearsAvailable() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/anios`);
            const years = await response.json();
            
            const select = document.getElementById('filterYear');
            if (!select) return;
            
            select.innerHTML = '<option value="all">Todos los años</option>';
            
            years.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                select.appendChild(option);
            });
            
            console.log(`✅ Años cargados: ${years.length} años`);
        } catch (error) {
            console.error("❌ Error cargando años:", error);
        }
    }
    
    // ==================== CONFIGURACIÓN DE VALORES POR DEFECTO ====================
    
    setDefaultFilterValues() {
        console.log("⚙️ Configurando valores por defecto SEGUROS...");
        
        try {
            // Configurar modo global
            this.setGlobalMode('unique');
            
            // Seleccionar todos los meses por defecto
            this.selectedMonths.clear();
            for (let i = 1; i <= 12; i++) {
                this.selectedMonths.add(i);
            }
            this.updateMonthButtons();
            this.updateMonthSelect();
            
            // Configurar períodos
            const periodoSelect = document.getElementById('filterPeriodo');
            if (periodoSelect) {
                periodoSelect.value = 'select_months';
                this.filters.periodo = 'select_months';
            }
            
            // Mostrar selector de meses
            const monthGroup = document.getElementById('monthSelectorGroup');
            const monthModeGroup = document.getElementById('monthModeGroup');
            if (monthGroup) monthGroup.style.display = 'block';
            if (monthModeGroup) monthModeGroup.style.display = 'block';
            
            // Configurar valores por defecto SEGUROS después de cargar los selects
            setTimeout(() => {
                // Año - usar 2024 como seguro o el último disponible
                const yearSelect = document.getElementById('filterYear');
                if (yearSelect && yearSelect.options.length > 0) {
                    let defaultYear = '2024';
                    
                    // Buscar 2024
                    const year2024 = Array.from(yearSelect.options).find(opt => opt.value === '2024');
                    if (year2024) {
                        yearSelect.value = '2024';
                        this.filters.year = ['2024'];
                    } else if (yearSelect.options.length > 0) {
                        // Usar el primer año disponible
                        yearSelect.value = yearSelect.options[0].value;
                        this.filters.year = [yearSelect.options[0].value];
                        defaultYear = yearSelect.options[0].value;
                    }
                    
                    console.log(`📅 Año por defecto: ${defaultYear}`);
                }
                
                // Tipo de medición - usar 'ACCID.DEP' como seguro
                const tipoSelect = document.getElementById('filterTipoMedicion');
                if (tipoSelect && tipoSelect.options.length > 0) {
                    let defaultTipo = 'ACCID.DEP';
                    
                    // Buscar ACCID.DEP
                    const tipoAccidDep = Array.from(tipoSelect.options).find(opt => opt.value === 'ACCID.DEP');
                    if (tipoAccidDep) {
                        tipoSelect.value = 'ACCID.DEP';
                        this.filters.tipoMedicion = ['ACCID.DEP'];
                    } else if (tipoSelect.options.length > 0) {
                        // Usar el primer tipo disponible
                        tipoSelect.value = tipoSelect.options[0].value;
                        this.filters.tipoMedicion = [tipoSelect.options[0].value];
                        defaultTipo = tipoSelect.options[0].value;
                    }
                    
                    console.log(`📊 Tipo por defecto: ${defaultTipo}`);
                }
                
                // Alimentador - usar 'ACY1' como seguro
                const alimentadorSelect = document.getElementById('filterTransformador');
                if (alimentadorSelect && alimentadorSelect.options.length > 0) {
                    let defaultAlimentador = 'ACY1';
                    
                    // Buscar ACY1
                    const alimentadorACY1 = Array.from(alimentadorSelect.options).find(opt => opt.value === 'ACY1');
                    if (alimentadorACY1) {
                        alimentadorSelect.value = 'ACY1';
                        this.filters.transformador = ['ACY1'];
                    } else if (alimentadorSelect.options.length > 2) {
                        // Saltar opciones "todos" (índices 0 y 1)
                        alimentadorSelect.selectedIndex = 2;
                        this.filters.transformador = [alimentadorSelect.options[2].value];
                        defaultAlimentador = alimentadorSelect.options[2].value;
                    } else if (alimentadorSelect.options.length > 0) {
                        // Usar el primer alimentador disponible
                        alimentadorSelect.selectedIndex = 0;
                        this.filters.transformador = [alimentadorSelect.options[0].value];
                        defaultAlimentador = alimentadorSelect.options[0].value;
                    }
                    
                    console.log(`🔌 Alimentador por defecto: ${defaultAlimentador}`);
                }
                
                console.log("✅ Valores por defecto seguros configurados");
                
            }, 1000); // Esperar a que los selects se carguen
            
        } catch (error) {
            console.error("❌ Error configurando valores por defecto:", error);
        }
    }
    
    // ==================== MANEJO DE FILTROS ====================
    
    setGlobalMode(mode) {
        this.globalMode = mode;
        
        // Actualizar botones
        const uniqueBtn = document.getElementById('globalModeUnique');
        const multipleBtn = document.getElementById('globalModeMultiple');
        const hint = document.getElementById('globalModeHint');
        
        if (uniqueBtn && multipleBtn) {
            uniqueBtn.classList.toggle('active', mode === 'unique');
            multipleBtn.classList.toggle('active', mode === 'multiple');
        }
        
        // Actualizar hint
        if (hint) {
            hint.textContent = mode === 'unique' 
                ? 'Único: un valor por filtro | Múltiple: varios valores por filtro' 
                : 'Modo múltiple activado - Puedes seleccionar múltiples valores';
        }
        
        // Mostrar/ocultar guía de selección múltiple
        const monthModeGroup = document.getElementById('monthModeGroup');
        if (monthModeGroup) {
            monthModeGroup.style.display = mode === 'multiple' ? 'block' : 'none';
        }
        
        console.log(`🌐 Modo global cambiado a: ${mode}`);
    }
    
    resetFilters() {
        console.log("🔄 Restableciendo filtros...");
        
        this.filters = { ...this.defaultFilters };
        this.selectedMonths = new Set([1,2,3,4,5,6,7,8,9,10,11,12]);
        
        // Restablecer selects
        const yearSelect = document.getElementById('filterYear');
        const tipoSelect = document.getElementById('filterTipoMedicion');
        const alimentadorSelect = document.getElementById('filterTransformador');
        const estacionSelect = document.getElementById('filterEstacion');
        const periodoSelect = document.getElementById('filterPeriodo');
        
        if (yearSelect) yearSelect.value = '2024';
        if (tipoSelect) tipoSelect.value = 'ACCID.DEP';
        if (alimentadorSelect) alimentadorSelect.value = 'ACY1';
        if (estacionSelect) estacionSelect.value = '';
        if (periodoSelect) periodoSelect.value = 'select_months';
        
        // Actualizar botones de meses
        this.updateMonthButtons();
        this.updateMonthSelect();
        
        this.showNotification("Filtros restablecidos", "success");
        setTimeout(() => this.loadData(), 500);
    }
    
    clearAllFilters() {
        console.log("🧹 Limpiando todos los filtros...");
        
        // Limpiar selecciones múltiples
        const multiSelects = document.querySelectorAll('.multi-select');
        multiSelects.forEach(select => {
            Array.from(select.options).forEach(option => {
                option.selected = false;
            });
        });
        
        // Limpiar meses seleccionados
        this.selectedMonths.clear();
        this.updateMonthButtons();
        this.updateMonthSelect();
        
        // Limpiar otros selects
        const estacionSelect = document.getElementById('filterEstacion');
        if (estacionSelect) estacionSelect.value = '';
        
        this.filters = {
            tipoMedicion: [],
            transformador: [],
            year: [],
            month: [],
            estacion: '',
            periodo: 'select_months'
        };
        
        this.showNotification("Todos los filtros limpiados", "info");
    }
    
    onFilterChange() {
        if (this.globalMode === 'unique') {
            // En modo único, cargar datos inmediatamente
            setTimeout(() => this.loadData(), 300);
        }
        // En modo múltiple, esperar a que el usuario aplique manualmente
    }
    
    onPeriodoChange() {
        const periodoSelect = document.getElementById('filterPeriodo');
        if (!periodoSelect) return;
        
        const periodo = periodoSelect.value;
        this.filters.periodo = periodo;
        
        const monthGroup = document.getElementById('monthSelectorGroup');
        if (monthGroup) {
            monthGroup.style.display = periodo === 'select_months' ? 'block' : 'none';
        }
        
        if (periodo !== 'select_months') {
            // Calcular meses automáticamente
            const currentDate = new Date();
            const currentYear = currentDate.getFullYear();
            const currentMonth = currentDate.getMonth() + 1;
            
            this.selectedMonths.clear();
            
            if (periodo === 'last3') {
                for (let i = 0; i < 3; i++) {
                    let month = currentMonth - i;
                    let year = currentYear;
                    
                    if (month <= 0) {
                        month += 12;
                        year -= 1;
                    }
                    
                    this.selectedMonths.add(month);
                }
            } else if (periodo === 'last6') {
                for (let i = 0; i < 6; i++) {
                    let month = currentMonth - i;
                    let year = currentYear;
                    
                    if (month <= 0) {
                        month += 12;
                        year -= 1;
                    }
                    
                    this.selectedMonths.add(month);
                }
            } else if (periodo === 'last12' || periodo === 'currentYear') {
                for (let i = 1; i <= 12; i++) {
                    this.selectedMonths.add(i);
                }
            } else if (periodo === 'lastYear') {
                for (let i = 1; i <= 12; i++) {
                    this.selectedMonths.add(i);
                }
            }
            
            this.updateMonthButtons();
            this.updateMonthSelect();
        }
        
        // Cargar datos si no estamos en selección manual de meses
        if (periodo !== 'select_months') {
            setTimeout(() => this.loadData(), 300);
        }
    }
    
    // ==================== MANEJO DE MESES ====================
    
    toggleMonthSelection(event) {
        const month = parseInt(event.currentTarget.dataset.month);
        
        if (this.selectedMonths.has(month)) {
            this.selectedMonths.delete(month);
        } else {
            this.selectedMonths.add(month);
        }
        
        this.updateMonthButtons();
        this.updateMonthSelect();
        
        // Actualizar filtros
        this.filters.month = Array.from(this.selectedMonths);
        
        // En modo único, cargar datos automáticamente
        if (this.globalMode === 'unique') {
            setTimeout(() => this.loadData(), 300);
        }
    }
    
    updateMonthButtons() {
        const monthButtons = document.querySelectorAll('.month-btn');
        const monthHint = document.getElementById('monthHint');
        
        monthButtons.forEach(btn => {
            const month = parseInt(btn.dataset.month);
            if (this.selectedMonths.has(month)) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
        
        if (monthHint) {
            const count = this.selectedMonths.size;
            monthHint.innerHTML = `<i class="fas fa-info-circle"></i> ${count} mes${count !== 1 ? 'es' : ''} seleccionado${count !== 1 ? 's' : ''}`;
        }
    }
    
    updateMonthSelect() {
        const monthSelect = document.getElementById('filterMonth');
        if (!monthSelect) return;
        
        Array.from(monthSelect.options).forEach(option => {
            const month = parseInt(option.value);
            option.selected = this.selectedMonths.has(month);
        });
        
        this.filters.month = Array.from(this.selectedMonths);
    }
    
    selectAllMonths() {
        for (let i = 1; i <= 12; i++) {
            this.selectedMonths.add(i);
        }
        this.updateMonthButtons();
        this.updateMonthSelect();
        this.showNotification("Todos los meses seleccionados", "success");
    }
    
    deselectAllMonths() {
        this.selectedMonths.clear();
        this.updateMonthButtons();
        this.updateMonthSelect();
        this.showNotification("Todos los meses deseleccionados", "info");
    }
    
    // ==================== ACCIONES RÁPIDAS ====================
    
    loadAllFeeders() {
        const select = document.getElementById('filterTransformador');
        if (!select) return;
        
        // Seleccionar todos los alimentadores (excluyendo opciones "todos")
        Array.from(select.options).forEach((option, index) => {
            if (index > 1) { // Saltar "Todos los alimentadores" y "Todos de [estación]"
                option.selected = true;
            }
        });
        
        this.filters.transformador = Array.from(select.selectedOptions)
            .map(opt => opt.value)
            .filter(val => val && val !== 'all' && !val.startsWith('all_'));
        
        this.showNotification(`Cargando todos los alimentadores (${this.filters.transformador.length})`, "info");
        setTimeout(() => this.loadData(), 500);
    }
    
    loadAllFromStation() {
        const estacionSelect = document.getElementById('filterEstacion');
        const alimentadorSelect = document.getElementById('filterTransformador');
        
        if (!estacionSelect || !estacionSelect.value || !alimentadorSelect) return;
        
        const estacion = estacionSelect.value;
        
        // Seleccionar la opción "Todos de [estación]"
        Array.from(alimentadorSelect.options).forEach(option => {
            option.selected = option.value === `all_${estacion}`;
        });
        
        this.filters.transformador = [`all_${estacion}`];
        
        this.showNotification(`Cargando todos los alimentadores de ${estacion}`, "info");
        setTimeout(() => this.loadData(), 500);
    }
    
    // ==================== CARGA DE DATOS MEJORADA ====================
    
    async loadData() {
        this.showLoading(true, "Cargando datos...");
        
        try {
            // Construir parámetros EXACTAMENTE como espera la API
            const params = new URLSearchParams();
            
            // VALORES POR DEFECTO SEGUROS
            let seccionValue = 'ACY1';
            let anioValue = '2024';
            let tipoValue = 'ACCID.DEP';
            let mesesValue = Array.from(this.selectedMonths).join(',');
            
            // 1. Alimentadores (seccion en API)
            const alimentadorSelect = document.getElementById('filterTransformador');
            const selectedAlimentadores = this.getSelectedValues('filterTransformador');
            
            if (selectedAlimentadores.length > 0) {
                const alimentadoresReales = selectedAlimentadores.filter(t => 
                    t && t !== 'all' && !t.startsWith('all_')
                );
                
                if (alimentadoresReales.length > 0) {
                    seccionValue = alimentadoresReales.join(',');
                } else if (selectedAlimentadores.includes('all')) {
                    // "Todos los alimentadores" - no filtrar por sección
                    seccionValue = 'all';
                } else if (selectedAlimentadores.some(t => t.startsWith('all_'))) {
                    const estacion = selectedAlimentadores.find(t => t.startsWith('all_')).replace('all_', '');
                    seccionValue = estacion;
                }
            }
            
            params.append('seccion', seccionValue);
            
            // 2. Año (anio en API)
            const yearSelect = document.getElementById('filterYear');
            const selectedYears = this.getSelectedValues('filterYear');
            
            if (selectedYears.length > 0) {
                anioValue = selectedYears.join(',');
            } else if (yearSelect && yearSelect.value) {
                anioValue = yearSelect.value;
            }
            
            params.append('anio', anioValue);
            
            // 3. Meses (mes en API)
            if (this.selectedMonths.size > 0 && this.filters.periodo === 'select_months') {
                mesesValue = Array.from(this.selectedMonths).join(',');
                params.append('mes', mesesValue);
            } else if (this.filters.periodo && this.filters.periodo !== 'select_months') {
                params.append('periodo', this.filters.periodo);
            } else {
                params.append('mes', 'all');
            }
            
            // 4. Tipo de medición
            const tipoSelect = document.getElementById('filterTipoMedicion');
            const selectedTipos = this.getSelectedValues('filterTipoMedicion');
            
            if (selectedTipos.length > 0) {
                tipoValue = selectedTipos.join(',');
            } else if (tipoSelect && tipoSelect.value) {
                tipoValue = tipoSelect.value;
            }
            
            params.append('tipo_medicion', tipoValue);
            
            // 5. Estación (solo si hay valor)
            const estacionSelect = document.getElementById('filterEstacion');
            if (estacionSelect && estacionSelect.value && estacionSelect.value !== '') {
                params.append('estacion', estacionSelect.value);
            }
            
            const url = `${this.apiBaseUrl}/api/datos?${params.toString()}`;
            console.log("📥 URL de petición:", url);
            
            const startTime = performance.now();
            const res = await fetch(url);
            
            if (!res.ok) {
                const errorText = await res.text();
                console.error("❌ Error en la respuesta del servidor:", errorText);
                
                // Intentar parsear como JSON si es posible
                try {
                    const errorData = JSON.parse(errorText);
                    throw new Error(`HTTP ${res.status}: ${errorData.error || errorText}`);
                } catch (e) {
                    throw new Error(`HTTP ${res.status}: ${errorText}`);
                }
            }
            
            this.data = await res.json();
            this.filteredData = [...this.data];
            
            const endTime = performance.now();
            console.log(`✅ Datos REALES cargados en ${(endTime - startTime).toFixed(0)}ms: ${this.data.length} registros`);
            
            if (this.data.length === 0) {
                console.warn("⚠️ La API devolvió 0 registros. Verifica:");
                console.warn("   1. La base de datos tiene datos");
                console.warn("   2. Los filtros coinciden con datos existentes");
                console.warn("   3. La URL: " + url);
                
                // Verificar el estado de la base de datos
                await this.verificarEstadoBD();
                
                // Mostrar mensaje útil al usuario
                const message = "No hay datos con los filtros actuales. Prueba con: " +
                               "Alimentador: ACY1, Año: 2024, Tipo: ACCID.DEP";
                this.showNotification(message, "warning");
                
                // Sugerir valores por defecto
                this.suggestDefaultFilters();
                
            } else {
                // Actualizar UI
                this.updateStats();
                this.updateKPIs();
                this.updateCharts();
                this.updateScatterChart();
                this.pagination.currentPage = 1;
                this.updateTable();
                this.updateComparisonTags();
                
                this.showNotification(`Datos cargados: ${this.data.length} registros`, "success");
            }
            
        } catch (error) {
            console.error("❌ Error cargando datos:", error);
            
            // Mostrar error específico
            let errorMessage = error.message;
            if (error.message.includes('Failed to fetch')) {
                errorMessage = "No se pudo conectar al servidor. Asegúrate de que esté ejecutándose en localhost:10000";
            } else if (error.message.includes('404')) {
                errorMessage = "Endpoint no encontrado. Verifica que la API esté disponible";
            } else if (error.message.includes('500')) {
                errorMessage = "Error interno del servidor. Verifica los logs del servidor";
            }
            
            this.showNotification(`Error: ${errorMessage}`, "error");
            
            // Generar datos de ejemplo SOLO si es necesario para pruebas
            if (this.data.length === 0 && this.isInitialLoad) {
                console.log("⚠️ Generando datos de ejemplo para continuar con la demostración...");
                this.generateSampleData();
                this.showNotification(
                    "Usando datos de ejemplo. Sube un archivo Excel para datos reales.",
                    "info"
                );
            }
        } finally {
            this.showLoading(false);
        }
    }
    
    suggestDefaultFilters() {
        console.log("💡 Sugiriendo filtros por defecto...");
        
        // Sugerir cambios en los filtros
        const suggestions = [];
        
        // Verificar año
        const yearSelect = document.getElementById('filterYear');
        if (yearSelect && yearSelect.value === '2025') {
            suggestions.push("Cambiar año a 2024");
            yearSelect.value = '2024';
            this.filters.year = ['2024'];
        }
        
        // Verificar alimentador
        const alimentadorSelect = document.getElementById('filterTransformador');
        if (alimentadorSelect) {
            const currentValue = alimentadorSelect.value;
            if (currentValue === 'ACY' || currentValue === '' || currentValue === 'all') {
                suggestions.push("Cambiar alimentador a ACY1");
                alimentadorSelect.value = 'ACY1';
                this.filters.transformador = ['ACY1'];
            }
        }
        
        // Verificar tipo
        const tipoSelect = document.getElementById('filterTipoMedicion');
        if (tipoSelect) {
            const currentValue = tipoSelect.value;
            if (currentValue === 'TOTAL+FEP' || currentValue === '' || currentValue === 'all') {
                suggestions.push("Cambiar tipo a ACCID.DEP");
                tipoSelect.value = 'ACCID.DEP';
                this.filters.tipoMedicion = ['ACCID.DEP'];
            }
        }
        
        if (suggestions.length > 0) {
            console.log("💡 Sugerencias aplicadas:", suggestions);
            this.showNotification(
                `Ajustes aplicados: ${suggestions.join(', ')}. Intenta cargar datos de nuevo.`,
                "info"
            );
        }
    }
    
    // ==================== FUNCIONES AUXILIARES MEJORADAS ====================
    
    getSelectedValues(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return [];
        
        if (select.multiple) {
            return Array.from(select.selectedOptions)
                .map(option => option.value)
                .filter(val => val && val !== '');
        } else {
            return select.value ? [select.value] : [];
        }
    }
    
    generateSampleData() {
        console.log("⚠️ Generando datos de ejemplo REALISTAS...");
        
        // Usar filtros actuales o valores por defecto
        const secciones = this.filters.transformador && this.filters.transformador.length > 0 
            ? this.filters.transformador.filter(t => t !== 'all' && !t.startsWith('all_'))
            : ['ACY1', 'ACY2', 'ACY3'];
        
        const años = this.filters.year && this.filters.year.length > 0 
            ? this.filters.year.map(y => parseInt(y)).filter(y => !isNaN(y))
            : [2023, 2024];
        
        const tipos = this.filters.tipoMedicion && this.filters.tipoMedicion.length > 0 
            ? this.filters.tipoMedicion
            : ['ACCID.DEP', 'TOTAL FEP'];
        
        const meses = Array.from(this.selectedMonths).length > 0 
            ? Array.from(this.selectedMonths)
            : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        
        this.data = [];
        
        // Crear datos más realistas
        secciones.forEach((seccion, seccionIndex) => {
            años.forEach(anio => {
                meses.forEach(mes => {
                    tipos.forEach((tipo, tipoIndex) => {
                        // Crear valores que tengan sentido
                        let valorBase;
                        
                        if (tipo === 'ACCID.DEP') {
                            valorBase = 0.5 + (seccionIndex * 0.2) + (Math.random() * 0.3);
                        } else if (tipo.includes('TOTAL')) {
                            valorBase = 120 + (seccionIndex * 30) + (Math.random() * 80);
                        } else {
                            valorBase = 40 + (seccionIndex * 15) + (Math.random() * 30);
                        }
                        
                        // Variación por mes (estacionalidad)
                        const variacionMes = Math.sin(mes / 12 * Math.PI * 2) * 0.15;
                        // Variación por año (tendencia)
                        const variacionAnio = (anio - 2023) * 0.05;
                        
                        const valorFinal = valorBase * (1 + variacionMes + variacionAnio);
                        
                        this.data.push({
                            transformador: seccion,
                            frecuencia: parseFloat(valorFinal.toFixed(4)),
                            fecha: `${anio}-${mes.toString().padStart(2, '0')}-01`,
                            tipo: tipo,
                            departamento: 'Zona Este',
                            year: parseInt(anio),
                            month: mes,
                            combinationKey: `${seccion}-${anio}-${tipo}`,
                            combinationLabel: `${seccion} (${anio}, ${tipo})`
                        });
                    });
                });
            });
        });
        
        this.filteredData = [...this.data];
        this.updateStats();
        this.updateKPIs();
        this.updateCharts();
        this.updateScatterChart();
        this.updateTable();
        
        console.log(`✅ Datos de ejemplo generados: ${this.data.length} registros`);
        console.log(`   - Secciones: ${[...new Set(this.data.map(d => d.transformador))].join(', ')}`);
        console.log(`   - Años: ${[...new Set(this.data.map(d => d.year))].join(', ')}`);
        console.log(`   - Tipos: ${[...new Set(this.data.map(d => d.tipo))].join(', ')}`);
        console.log(`   - Meses: ${[...new Set(this.data.map(d => d.month))].join(', ')}`);
    }
    
    // ==================== ACTUALIZACIÓN DE UI ====================
    
    updateStats() {
        // Actualizar contador de datos
        const dataCount = document.getElementById('dataCount');
        const loadedSeries = document.getElementById('loadedSeries');
        const totalPoints = document.getElementById('totalPoints');
        
        if (dataCount) dataCount.textContent = this.data.length.toLocaleString();
        if (loadedSeries) {
            const uniqueSeries = new Set(this.data.map(d => d.combinationKey)).size;
            loadedSeries.textContent = uniqueSeries;
        }
        if (totalPoints) totalPoints.textContent = this.data.length.toLocaleString();
        
        // Actualizar contador de series
        const seriesCount = document.getElementById('seriesCount');
        const activeSeries = document.getElementById('activeSeries');
        
        if (seriesCount || activeSeries) {
            const uniqueCombinations = new Set(this.data.map(d => d.combinationKey));
            const count = uniqueCombinations.size;
            
            if (seriesCount) seriesCount.textContent = count;
            if (activeSeries) activeSeries.textContent = count;
        }
    }
    
    updateKPIs() {
        if (this.data.length === 0) return;
        
        // KPI 1: Rango de valores
        const rangeValue = document.getElementById('rangeValue');
        const rangeInfo = document.getElementById('rangeInfo');
        
        if (rangeValue || rangeInfo) {
            const values = this.data.map(d => d.frecuencia).filter(v => !isNaN(v));
            if (values.length > 0) {
                const min = Math.min(...values);
                const max = Math.max(...values);
                const range = max - min;
                
                if (rangeValue) rangeValue.textContent = range.toFixed(4);
                if (rangeInfo) rangeInfo.textContent = `${this.safeToFixed(min)}-${this.safeToFixed(max)}`;
            }
        }
        
        // KPI 2: Variabilidad
        const variabilityValue = document.getElementById('variabilityValue');
        const variabilityBadge = document.getElementById('variabilityBadge');
        
        if (variabilityValue || variabilityBadge) {
            const values = this.data.map(d => d.frecuencia).filter(v => !isNaN(v));
            if (values.length > 1) {
                const mean = values.reduce((a, b) => a + b, 0) / values.length;
                const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
                const stdDev = Math.sqrt(variance);
                const cv = (stdDev / mean) * 100;
                
                if (variabilityValue) variabilityValue.textContent = cv.toFixed(2) + '%';
                if (variabilityBadge) {
                    if (cv < 10) {
                        variabilityBadge.textContent = 'BAJA';
                        variabilityBadge.style.backgroundColor = '#10b981';
                    } else if (cv < 30) {
                        variabilityBadge.textContent = 'MEDIA';
                        variabilityBadge.style.backgroundColor = '#f59e0b';
                    } else {
                        variabilityBadge.textContent = 'ALTA';
                        variabilityBadge.style.backgroundColor = '#ef4444';
                    }
                }
            }
        }
        
        // KPI 3: Peor desempeño
        const worstSeries = document.getElementById('worstSeries');
        const worstValue = document.getElementById('worstValue');
        
        if (worstSeries || worstValue) {
            // Agrupar por serie y calcular promedio
            const seriesData = {};
            this.data.forEach(d => {
                const key = d.combinationKey;
                if (!seriesData[key]) {
                    seriesData[key] = {
                        label: d.combinationLabel,
                        values: []
                    };
                }
                seriesData[key].values.push(d.frecuencia);
            });
            
            // Encontrar la serie con el peor promedio (más alto para ACCID.DEP)
            let worstKey = null;
            let worstAvg = -Infinity;
            
            Object.entries(seriesData).forEach(([key, data]) => {
                const avg = data.values.reduce((a, b) => a + b, 0) / data.values.length;
                if (avg > worstAvg) {
                    worstAvg = avg;
                    worstKey = key;
                }
            });
            
            if (worstKey) {
                if (worstSeries) worstSeries.textContent = seriesData[worstKey].label;
                if (worstValue) worstValue.textContent = worstAvg.toFixed(4);
            }
        }
    }
    
    updateComparisonTags() {
        const container = document.getElementById('comparisonTags');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Obtener valores seleccionados
        const tipos = this.getSelectedValues('filterTipoMedicion');
        const alimentadores = this.getSelectedValues('filterTransformador');
        const años = this.getSelectedValues('filterYear');
        
        // Crear tags
        if (tipos.length > 0 && tipos[0] !== 'all') {
            tipos.forEach(tipo => {
                const tag = document.createElement('span');
                tag.className = 'tag tipo';
                tag.textContent = `Tipo: ${tipo}`;
                container.appendChild(tag);
            });
        }
        
        if (alimentadores.length > 0 && alimentadores[0] !== 'all') {
            alimentadores.forEach(alimentador => {
                const tag = document.createElement('span');
                tag.className = 'tag alimentador';
                tag.textContent = `Alimentador: ${alimentador}`;
                container.appendChild(tag);
            });
        }
        
        if (años.length > 0 && años[0] !== 'all') {
            años.forEach(año => {
                const tag = document.createElement('span');
                tag.className = 'tag año';
                tag.textContent = `Año: ${año}`;
                container.appendChild(tag);
            });
        }
        
        // Si no hay tags, mostrar mensaje
        if (container.children.length === 0) {
            const tag = document.createElement('span');
            tag.className = 'tag hint';
            tag.textContent = 'Selecciona filtros para comparar';
            container.appendChild(tag);
        }
    }
    
    // ==================== ACTUALIZACIÓN DE GRÁFICOS ====================
    
    updateCharts() {
        if (this.data.length === 0) return;
        
        this.updateMainChart();
        this.updateRankingChart();
    }
    
    updateMainChart() {
        if (!this.mainChart) return;
        
        // Agrupar datos según la configuración
        const groupedData = this.groupDataForChart();
        
        // Preparar datasets
        const datasets = [];
        const labels = new Set();
        
        Object.entries(groupedData).forEach(([key, data], index) => {
            // Ordenar por fecha
            data.sort((a, b) => {
                if (a.year !== b.year) return a.year - b.year;
                return a.month - b.month;
            });
            
            // Extraer labels (fechas)
            data.forEach(item => {
                labels.add(`${item.year}-${item.month.toString().padStart(2, '0')}`);
            });
            
            // Preparar dataset
            const dataset = {
                label: key,
                data: [],
                borderColor: this.chartPalette[index % this.chartPalette.length],
                backgroundColor: this.chartPalette[index % this.chartPalette.length] + '20',
                borderWidth: 2,
                tension: 0.2,
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 5
            };
            
            datasets.push(dataset);
        });
        
        // Ordenar labels
        const sortedLabels = Array.from(labels).sort();
        
        // Asignar datos a cada dataset
        datasets.forEach(dataset => {
            const key = dataset.label;
            const dataPoints = groupedData[key];
            
            sortedLabels.forEach(label => {
                const [year, month] = label.split('-').map(Number);
                const point = dataPoints.find(d => d.year === year && d.month === month);
                dataset.data.push(point ? point.frecuencia : null);
            });
        });
        
        // Actualizar gráfico
        this.mainChart.data.labels = sortedLabels;
        this.mainChart.data.datasets = datasets;
        
        // Aplicar tipo de gráfico seleccionado
        const chartTypeSelect = document.getElementById('chartType');
        if (chartTypeSelect) {
            this.mainChart.config.type = chartTypeSelect.value;
        }
        
        this.mainChart.update();
        
        // Actualizar leyenda
        this.updateChartLegend();
    }
    
    groupDataForChart() {
        const grouped = {};
        
        this.data.forEach(item => {
            let key;
            
            switch(this.groupBy) {
                case 'alimentador':
                    key = item.transformador;
                    break;
                case 'year':
                    key = item.year.toString();
                    break;
                case 'tipo':
                    key = item.tipo;
                    break;
                case 'combinado':
                    key = item.combinationLabel;
                    break;
                default:
                    key = item.combinationKey;
            }
            
            if (!grouped[key]) {
                grouped[key] = [];
            }
            
            grouped[key].push({
                year: item.year,
                month: item.month,
                frecuencia: item.frecuencia
            });
        });
        
        return grouped;
    }
    
    updateChartLegend() {
        const legendContainer = document.getElementById('mainChartLegend');
        if (!legendContainer) return;
        
        if (!this.mainChart || !this.mainChart.data.datasets || this.mainChart.data.datasets.length === 0) {
            legendContainer.innerHTML = '<div class="legend-empty">No hay datos para mostrar</div>';
            return;
        }
        
        let legendHTML = '<div class="legend-title">Series:</div>';
        
        this.mainChart.data.datasets.forEach((dataset, index) => {
            const meta = this.mainChart.getDatasetMeta(index);
            const isHidden = meta.hidden === true;
            
            legendHTML += `
                <div class="legend-item ${isHidden ? 'hidden' : ''}" data-index="${index}">
                    <span class="legend-color" style="background-color: ${dataset.borderColor}"></span>
                    <span class="legend-text">${dataset.label}</span>
                    <span class="legend-action" title="${isHidden ? 'Mostrar' : 'Ocultar'}">
                        <i class="fas fa-eye${isHidden ? '-slash' : ''}"></i>
                    </span>
                </div>
            `;
        });
        
        legendContainer.innerHTML = legendHTML;
        
        // Agregar event listeners para mostrar/ocultar series
        legendContainer.querySelectorAll('.legend-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.legend-action')) {
                    const index = parseInt(item.dataset.index);
                    const meta = this.mainChart.getDatasetMeta(index);
                    meta.hidden = meta.hidden === null ? true : null;
                    this.mainChart.update();
                    this.updateChartLegend();
                }
            });
        });
    }
    
    updateRankingChart() {
        if (!this.rankingChart) return;
        
        // Agrupar datos por serie y calcular promedio
        const seriesData = {};
        this.data.forEach(d => {
            const key = d.combinationLabel;
            if (!seriesData[key]) {
                seriesData[key] = [];
            }
            seriesData[key].push(d.frecuencia);
        });
        
        // Calcular promedios y preparar datos para ranking
        const rankingData = Object.entries(seriesData).map(([label, values]) => {
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            return { label, avg, count: values.length };
        });
        
        // Ordenar según criterio seleccionado
        const sortSelect = document.getElementById('rankingSort');
        const sortBy = sortSelect ? sortSelect.value : 'avg';
        
        rankingData.sort((a, b) => {
            switch(sortBy) {
                case 'stability':
                    // Calcular desviación estándar (simplificado)
                    const stdA = Math.abs(Math.max(...seriesData[a.label]) - Math.min(...seriesData[a.label]));
                    const stdB = Math.abs(Math.max(...seriesData[b.label]) - Math.min(...seriesData[b.label]));
                    return stdA - stdB; // Menor desviación primero
                case 'trend':
                    // Ordenar por tendencia (simplificado: último valor)
                    const lastValueA = seriesData[a.label][seriesData[a.label].length - 1];
                    const lastValueB = seriesData[b.label][seriesData[b.label].length - 1];
                    return lastValueB - lastValueA; // Mayor tendencia primero
                default: // 'avg'
                    return b.avg - a.avg; // Mayor promedio primero
            }
        });
        
        // Tomar solo los primeros 10 para el ranking
        const top10 = rankingData.slice(0, 10);
        
        // Actualizar gráfico
        this.rankingChart.data.labels = top10.map(d => d.label);
        this.rankingChart.data.datasets[0].data = top10.map(d => d.avg);
        this.rankingChart.data.datasets[0].backgroundColor = top10.map((_, i) => 
            this.chartPalette[i % this.chartPalette.length]
        );
        this.rankingChart.data.datasets[0].borderColor = top10.map((_, i) => 
            this.chartPalette[i % this.chartPalette.length] + 'CC'
        );
        
        this.rankingChart.update();
    }
    
    updateScatterChart() {
        if (!this.scatterChart || this.data.length === 0) return;
        
        // Preparar datos para scatter plot
        const datasets = [];
        const colorMap = {};
        
        // Agrupar por alimentador para colores
        const alimentadores = [...new Set(this.data.map(d => d.transformador))];
        alimentadores.forEach((alimentador, index) => {
            colorMap[alimentador] = this.chartPalette[index % this.chartPalette.length];
        });
        
        // Crear datasets por alimentador
        alimentadores.forEach(alimentador => {
            const puntos = this.data
                .filter(d => d.transformador === alimentador)
                .map(d => ({
                    x: new Date(d.fecha).getTime(),
                    y: d.frecuencia
                }));
            
            if (puntos.length > 0) {
                datasets.push({
                    label: alimentador,
                    data: puntos,
                    backgroundColor: colorMap[alimentador] + '80',
                    borderColor: colorMap[alimentador],
                    borderWidth: 1,
                    pointRadius: 4,
                    pointHoverRadius: 6
                });
            }
        });
        
        // Actualizar gráfico
        this.scatterChart.data.datasets = datasets;
        this.scatterChart.update();
    }
    
    // ==================== CONTROLES DE GRÁFICOS ====================
    
    onChartTypeChange() {
        const select = document.getElementById('chartType');
        if (!select || !this.mainChart) return;
        
        this.mainChart.config.type = select.value;
        
        // Ajustar configuración según tipo
        if (select.value === 'bar') {
            this.mainChart.data.datasets.forEach(dataset => {
                dataset.fill = false;
                dataset.borderWidth = 1;
            });
        } else if (select.value === 'scatter') {
            this.mainChart.data.datasets.forEach(dataset => {
                dataset.fill = false;
                dataset.showLine = false;
                dataset.pointRadius = 4;
            });
        } else { // line
            this.mainChart.data.datasets.forEach(dataset => {
                dataset.fill = false;
                dataset.borderWidth = 2;
                dataset.pointRadius = 0;
                dataset.showLine = true;
            });
        }
        
        this.mainChart.update();
    }
    
    toggleChartPoints() {
        if (!this.mainChart) return;
        
        const showPoints = this.mainChart.data.datasets[0]?.pointRadius === 0;
        const radius = showPoints ? 4 : 0;
        
        this.mainChart.data.datasets.forEach(dataset => {
            dataset.pointRadius = radius;
            dataset.pointHoverRadius = radius + 2;
        });
        
        this.mainChart.update();
    }
    
    zoomChart(direction) {
        if (!this.mainChart) return;
        
        const scale = direction === 'in' ? 0.8 : 1.2;
        
        if (this.mainChart.options.scales.x.min && this.mainChart.options.scales.x.max) {
            const range = this.mainChart.options.scales.x.max - this.mainChart.options.scales.x.min;
            const center = (this.mainChart.options.scales.x.min + this.mainChart.options.scales.x.max) / 2;
            
            this.mainChart.options.scales.x.min = center - (range * scale) / 2;
            this.mainChart.options.scales.x.max = center + (range * scale) / 2;
        }
        
        this.mainChart.update();
    }
    
    resetChartZoom() {
        if (!this.mainChart) return;
        
        this.mainChart.options.scales.x.min = undefined;
        this.mainChart.options.scales.x.max = undefined;
        this.mainChart.options.scales.y.min = undefined;
        this.mainChart.options.scales.y.max = undefined;
        
        this.mainChart.update();
    }
    
    onGroupByChange() {
        const select = document.getElementById('groupBy');
        if (!select) return;
        
        this.groupBy = select.value;
        this.updateCharts();
    }
    
    expandChart() {
        // Preparar datos para la vista ampliada
        const chartData = {
            mainChart: {
                labels: this.mainChart?.data?.labels || [],
                datasets: this.mainChart?.data?.datasets || []
            },
            rankingChart: {
                labels: this.rankingChart?.data?.labels || [],
                data: this.rankingChart?.data?.datasets[0]?.data || [],
                colors: this.rankingChart?.data?.datasets[0]?.backgroundColor || []
            },
            seriesCount: this.mainChart?.data?.datasets?.length || 0,
            dataPoints: this.data.length,
            periodRange: this.getPeriodRange()
        };
        
        // Guardar en localStorage
        localStorage.setItem('ande_chart_data', JSON.stringify(chartData));
        
        // Abrir nueva ventana
        window.open('chart.html', '_blank', 'width=1400,height=900,menubar=no,toolbar=no,location=no');
    }
    
    getPeriodRange() {
        if (this.data.length === 0) return 'N/A';
        
        const dates = this.data.map(d => new Date(d.fecha));
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        
        const formatDate = (date) => {
            return date.toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'short'
            });
        };
        
        return `${formatDate(minDate)} - ${formatDate(maxDate)}`;
    }
    
    // ==================== TABLA DE DATOS ====================
    
    updateTable() {
        const tableBody = document.getElementById('dataTable');
        if (!tableBody) return;
        
        // Calcular paginación
        const totalRows = this.filteredData.length;
        const rowsPerPage = parseInt(document.getElementById('rowsPerPage')?.value) || 25;
        const totalPages = Math.ceil(totalRows / rowsPerPage);
        
        this.pagination.totalPages = totalPages;
        this.pagination.rowsPerPage = rowsPerPage;
        
        // Asegurar que la página actual sea válida
        if (this.pagination.currentPage > totalPages) {
            this.pagination.currentPage = totalPages || 1;
        }
        
        // Calcular índices de filas a mostrar
        const startIndex = (this.pagination.currentPage - 1) * rowsPerPage;
        const endIndex = Math.min(startIndex + rowsPerPage, totalRows);
        const pageData = this.filteredData.slice(startIndex, endIndex);
        
        // Generar filas de la tabla
        let tableHTML = '';
        
        pageData.forEach((row, index) => {
            const globalIndex = startIndex + index + 1;
            
            tableHTML += `
                <tr>
                    <td>${globalIndex}</td>
                    <td>${row.transformador || 'N/A'}</td>
                    <td>${row.year || 'N/A'}</td>
                    <td>${row.tipo || 'N/A'}</td>
                    <td>${row.fecha || 'N/A'}</td>
                    <td>${this.safeToFixed(row.frecuencia)}</td>
                    <td>
                        <span class="status-badge ${this.getStatusClass(row.frecuencia)}">
                            ${this.getStatusText(row.frecuencia)}
                        </span>
                    </td>
                    <td>
                        <button class="btn-icon small" onclick="dashboard.viewDetails(${JSON.stringify(row).replace(/"/g, '&quot;')})" title="Ver detalles">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        // Si no hay datos
        if (tableHTML === '') {
            tableHTML = `
                <tr>
                    <td colspan="8" class="no-data">
                        <i class="fas fa-database"></i> No hay datos para mostrar
                    </td>
                </tr>
            `;
        }
        
        tableBody.innerHTML = tableHTML;
        
        // Actualizar controles de paginación
        this.updatePaginationControls(startIndex, endIndex, totalRows);
    }
    
    updatePaginationControls(start, end, total) {
        // Actualizar texto
        const rowsShownStart = document.getElementById('rowsShownStart');
        const rowsShownEnd = document.getElementById('rowsShownEnd');
        const rowsTotal = document.getElementById('rowsTotal');
        const currentPage = document.getElementById('currentPage');
        
        if (rowsShownStart) rowsShownStart.textContent = total > 0 ? start + 1 : 0;
        if (rowsShownEnd) rowsShownEnd.textContent = end;
        if (rowsTotal) rowsTotal.textContent = total;
        if (currentPage) currentPage.textContent = this.pagination.currentPage;
        
        // Habilitar/deshabilitar botones
        const firstPage = document.getElementById('firstPage');
        const prevPage = document.getElementById('prevPage');
        const nextPage = document.getElementById('nextPage');
        const lastPage = document.getElementById('lastPage');
        
        if (firstPage) firstPage.disabled = this.pagination.currentPage === 1;
        if (prevPage) prevPage.disabled = this.pagination.currentPage === 1;
        if (nextPage) nextPage.disabled = this.pagination.currentPage === this.pagination.totalPages;
        if (lastPage) lastPage.disabled = this.pagination.currentPage === this.pagination.totalPages;
    }
    
    goToPage(page) {
        if (page < 1 || page > this.pagination.totalPages) return;
        
        this.pagination.currentPage = page;
        this.updateTable();
        
        // Scroll suave a la tabla
        const tableCard = document.querySelector('.table-card');
        if (tableCard) {
            tableCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
    
    sortTable(column) {
        // Alternar dirección si es la misma columna
        if (this.sortConfig.column === column) {
            this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortConfig.column = column;
            this.sortConfig.direction = 'asc';
        }
        
        // Ordenar datos
        this.filteredData.sort((a, b) => {
            let aValue = a[column];
            let bValue = b[column];
            
            // Manejar casos especiales
            if (column === 'fecha') {
                aValue = new Date(aValue);
                bValue = new Date(bValue);
            } else if (column === 'valor') {
                aValue = parseFloat(aValue) || 0;
                bValue = parseFloat(bValue) || 0;
            }
            
            // Comparar
            if (aValue < bValue) return this.sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return this.sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        // Actualizar tabla
        this.updateTable();
        
        // Actualizar iconos de ordenamiento
        this.updateSortIcons(column);
    }
    
    updateSortIcons(activeColumn) {
        const headers = document.querySelectorAll('th[data-sort]');
        
        headers.forEach(header => {
            const icon = header.querySelector('i');
            if (!icon) return;
            
            if (header.dataset.sort === activeColumn) {
                icon.className = this.sortConfig.direction === 'asc' 
                    ? 'fas fa-sort-up' 
                    : 'fas fa-sort-down';
            } else {
                icon.className = 'fas fa-sort';
            }
        });
    }
    
    filterTable(searchTerm) {
        if (!searchTerm || searchTerm.trim() === '') {
            this.filteredData = [...this.data];
        } else {
            const term = searchTerm.toLowerCase().trim();
            this.filteredData = this.data.filter(row => {
                return Object.values(row).some(value => 
                    String(value).toLowerCase().includes(term)
                );
            });
        }
        
        this.pagination.currentPage = 1;
        this.updateTable();
    }
    
    getStatusClass(value) {
        if (value === null || value === undefined || isNaN(value)) return 'unknown';
        
        // Lógica de estado basada en el valor
        if (value < 0.5) return 'good';
        if (value < 1.0) return 'warning';
        return 'critical';
    }
    
    getStatusText(value) {
        if (value === null || value === undefined || isNaN(value)) return 'DESCONOCIDO';
        
        if (value < 0.5) return 'NORMAL';
        if (value < 1.0) return 'ALERTA';
        return 'CRÍTICO';
    }
    
    viewDetails(data) {
        const modalBody = document.getElementById('modalBody');
        if (!modalBody) return;
        
        const detailsHTML = `
            <div class="detail-row">
                <span class="detail-label">Alimentador:</span>
                <span class="detail-value">${data.transformador || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Fecha:</span>
                <span class="detail-value">${data.fecha || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Tipo:</span>
                <span class="detail-value">${data.tipo || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Departamento:</span>
                <span class="detail-value">${data.departamento || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Valor:</span>
                <span class="detail-value highlight">${this.safeToFixed(data.frecuencia)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Estado:</span>
                <span class="detail-value status-badge ${this.getStatusClass(data.frecuencia)}">
                    ${this.getStatusText(data.frecuencia)}
                </span>
            </div>
        `;
        
        modalBody.innerHTML = detailsHTML;
        
        // Mostrar modal
        const modal = document.getElementById('seriesModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }
    
    // ==================== CARGA DE EXCEL ====================
    
    async uploadExcel() {
        const fileInput = document.getElementById('excelFileInput');
        const statusElement = document.getElementById('excelUploadStatus');
        
        if (!fileInput.files.length) {
            this.showNotification("Por favor, selecciona un archivo Excel", "warning");
            return;
        }
        
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('archivo', file);
        
        this.showLoading(true, "Subiendo y procesando archivo Excel...");
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/subir-excel`, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showNotification(
                    `Archivo procesado: ${result.insertadas} filas insertadas, ${result.errores} errores`,
                    "success"
                );
                
                if (statusElement) {
                    statusElement.innerHTML = `
                        <span style="color: #10b981;">
                            <i class="fas fa-check-circle"></i> 
                            ${file.name} procesado correctamente
                        </span>
                        <br>
                        <small>Insertadas: ${result.insertadas} | Errores: ${result.errores}</small>
                    `;
                }
                
                // Recargar datos y metadatos
                setTimeout(async () => {
                    await this.loadTiposMedicion();
                    await this.loadSeccionesDisponibles();
                    await this.loadYearsAvailable();
                    await this.loadData();
                    await this.loadCargas();
                }, 1000);
                
            } else {
                throw new Error(result.error || 'Error desconocido');
            }
            
        } catch (error) {
            console.error("❌ Error subiendo archivo:", error);
            this.showNotification(`Error al subir archivo: ${error.message}`, "error");
            
            if (statusElement) {
                statusElement.innerHTML = `
                    <span style="color: #ef4444;">
                        <i class="fas fa-exclamation-circle"></i> 
                        Error al procesar ${file.name}
                    </span>
                    <br>
                    <small>${error.message}</small>
                `;
            }
        } finally {
            this.showLoading(false);
            fileInput.value = '';
        }
    }
    
    // ==================== CARGA DE HISTORIAL ====================
    
    async loadCargas() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/cargas`);
            const cargas = await response.json();
            
            this.renderCargas(cargas);
            
            // Cargar estadísticas globales
            await this.loadEstadisticas();
            
        } catch (error) {
            console.error("❌ Error cargando historial de cargas:", error);
        }
    }
    
    renderCargas(cargas) {
        const container = document.getElementById('cargasContainer');
        if (!container) return;
        
        if (cargas.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-inbox" style="font-size: 2rem;"></i>
                    <p>No hay cargas registradas</p>
                    <p style="font-size: 0.9rem;">Sube tu primer archivo Excel para comenzar</p>
                </div>
            `;
            return;
        }
        
        let html = `
            <div class="cargas-table">
                <table>
                    <thead>
                        <tr>
                            <th>Archivo</th>
                            <th>Fecha</th>
                            <th>Insertadas</th>
                            <th>Errores</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        cargas.forEach(carga => {
            const fecha = new Date(carga.fecha_carga).toLocaleString('es-ES');
            const estadoClass = carga.estado === 'completado' ? 'success' : 
                               carga.estado === 'procesando' ? 'warning' : 'error';
            
            html += `
                <tr>
                    <td>
                        <i class="fas fa-file-excel" style="color: #2e7d32;"></i>
                        ${carga.nombre_archivo}
                    </td>
                    <td>${fecha}</td>
                    <td>
                        <span class="badge ${carga.insertadas > 0 ? 'success' : 'secondary'}">
                            ${carga.insertadas}
                        </span>
                    </td>
                    <td>
                        <span class="badge ${carga.errores > 0 ? 'danger' : 'secondary'}">
                            ${carga.errores}
                        </span>
                    </td>
                    <td>
                        <span class="status ${estadoClass}">
                            <i class="fas fa-circle"></i> ${carga.estado}
                        </span>
                    </td>
                    <td>
                        <button class="btn-icon small" onclick="dashboard.eliminarCarga(${carga.id})" title="Eliminar carga">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Actualizar contadores
        const totalCargas = document.getElementById('totalCargas');
        const cargasCompletadas = document.getElementById('cargasCompletadas');
        const cargasConErrores = document.getElementById('cargasConErrores');
        
        if (totalCargas) totalCargas.textContent = cargas.length;
        if (cargasCompletadas) {
            const completadas = cargas.filter(c => c.estado === 'completado').length;
            cargasCompletadas.textContent = completadas;
        }
        if (cargasConErrores) {
            const conErrores = cargas.filter(c => c.errores > 0).length;
            cargasConErrores.textContent = conErrores;
        }
    }
    
    async eliminarCarga(id) {
        if (!confirm('¿Estás seguro de que quieres eliminar esta carga? Esto también eliminará los datos asociados.')) {
            return;
        }
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/cargas/${id}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showNotification(
                    `Carga eliminada: ${result.nombre_archivo} (${result.filas_eliminadas} filas eliminadas)`,
                    "success"
                );
                
                // Recargar historial y datos
                setTimeout(async () => {
                    await this.loadCargas();
                    await this.loadData();
                }, 1000);
            } else {
                throw new Error(result.error || 'Error desconocido');
            }
            
        } catch (error) {
            console.error("❌ Error eliminando carga:", error);
            this.showNotification(`Error al eliminar carga: ${error.message}`, "error");
        }
    }
    
    async loadEstadisticas() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/estadisticas`);
            const stats = await response.json();
            
            const totalDatosGlobal = document.getElementById('totalDatosGlobal');
            if (totalDatosGlobal) {
                totalDatosGlobal.textContent = stats.total_datos.toLocaleString();
            }
            
        } catch (error) {
            console.error("❌ Error cargando estadísticas:", error);
        }
    }
    
    // ==================== OTRAS FUNCIONALIDADES ====================
    
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.querySelector('.main-content');
        
        if (sidebar && mainContent) {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
            
            // Actualizar ícono del botón toggle
            const toggleBtn = document.getElementById('sidebarToggle');
            if (toggleBtn) {
                const icon = toggleBtn.querySelector('i');
                const text = toggleBtn.querySelector('.btn-text');
                
                if (sidebar.classList.contains('collapsed')) {
                    if (icon) icon.className = 'fas fa-filter';
                    if (text) text.textContent = 'Filtros';
                } else {
                    if (icon) icon.className = 'fas fa-times';
                    if (text) text.textContent = 'Cerrar';
                }
            }
        }
    }
    
    startLiveUpdates() {
        // Actualizar automáticamente cada 5 minutos
        setInterval(() => {
            if (this.serverConnected) {
                console.log("🔄 Actualización automática de datos...");
                this.loadData();
                this.loadCargas();
            }
        }, 5 * 60 * 1000); // 5 minutos
    }
}

// ==================== VERIFICACIÓN DE ELEMENTOS ====================

function checkRequiredElements() {
    const requiredElements = [
        'globalModeUnique',
        'globalModeMultiple',
        'filterPeriodo',
        'filterEstacion',
        'applyFilters',
        'filterTipoMedicion',
        'filterTransformador',
        'filterYear',
        'mainChart'
    ];
    
    const missingElements = [];
    
    requiredElements.forEach(id => {
        if (!document.getElementById(id)) {
            missingElements.push(id);
        }
    });
    
    return missingElements;
}

// ==================== INICIALIZACIÓN CUANDO EL DOM ESTÉ LISTO ====================

function initializeDashboard() {
    try {
        console.log("📄 DOM completamente cargado - Inicializando dashboard");
        
        // Crear instancia del dashboard
        window.dashboard = new ANDEDashboard();
        
        // Configurar cierre de modales
        const modalClose = document.getElementById('modalClose');
        const seriesModal = document.getElementById('seriesModal');
        
        if (modalClose && seriesModal) {
            modalClose.addEventListener('click', () => {
                seriesModal.style.display = 'none';
            });
            
            seriesModal.addEventListener('click', (e) => {
                if (e.target === seriesModal) {
                    seriesModal.style.display = 'none';
                }
            });
        }
        
        // Inicializar dashboard
        setTimeout(() => {
            if (window.dashboard && window.dashboard.initialize) {
                window.dashboard.initialize();
            } else {
                console.error("❌ Dashboard no se inicializó correctamente");
            }
        }, 500);
        
    } catch (error) {
        console.error("❌ Error crítico al inicializar dashboard:", error);
        alert("Error crítico al cargar el dashboard. Por favor, recarga la página.");
    }
}

// ==================== VERIFICACIÓN DE ELEMENTOS ====================

function checkRequiredElements() {
    const requiredElements = [
        'globalModeUnique',
        'globalModeMultiple',
        'filterPeriodo',
        'filterEstacion',
        'applyFilters',
        'filterTipoMedicion',
        'filterTransformador',
        'filterYear',
        'mainChart'
    ];
    
    const missingElements = [];
    
    requiredElements.forEach(id => {
        if (!document.getElementById(id)) {
            missingElements.push(id);
        }
    });
    
    return missingElements;
}

function initializeDashboard() {
    try {
        console.log("📄 DOM completamente cargado - Inicializando dashboard");
        
        // Crear instancia del dashboard
        window.dashboard = new ANDEDashboard();
        
        // Configurar cierre de modales
        const modalClose = document.getElementById('modalClose');
        const seriesModal = document.getElementById('seriesModal');
        
        if (modalClose && seriesModal) {
            modalClose.addEventListener('click', () => {
                seriesModal.style.display = 'none';
            });
            
            seriesModal.addEventListener('click', (e) => {
                if (e.target === seriesModal) {
                    seriesModal.style.display = 'none';
                }
            });
        }
        
        // Inicializar dashboard
        setTimeout(() => {
            if (window.dashboard && window.dashboard.initialize) {
                window.dashboard.initialize();
            } else {
                console.error("❌ Dashboard no se inicializó correctamente");
            }
        }, 500);
        
    } catch (error) {
        console.error("❌ Error crítico al inicializar dashboard:", error);
        alert("Error crítico al cargar el dashboard. Por favor, recarga la página.");
    }
}

// ==================== VERIFICACIÓN DE ELEMENTOS ====================

function checkRequiredElements() {
    const requiredElements = [
        'globalModeUnique',
        'globalModeMultiple',
        'filterPeriodo',
        'filterEstacion',
        'applyFilters',
        'filterTipoMedicion',
        'filterTransformador',
        'filterYear',
        'mainChart'
    ];
    
    const missingElements = [];
    
    requiredElements.forEach(id => {
        if (!document.getElementById(id)) {
            missingElements.push(id);
        }
    });
    
    return missingElements;
}

// ==================== INICIALIZACIÓN CUANDO EL DOM ESTÉ LISTO ====================

document.addEventListener('DOMContentLoaded', () => {
    console.log("📄 DOM completamente cargado");
    
    const missingElements = checkRequiredElements();
    if (missingElements.length > 0) {
        console.warn("⚠️ Elementos faltantes:", missingElements);
        console.log("🔄 Esperando 500ms y reintentando...");
        
        setTimeout(() => {
            const missingElements2 = checkRequiredElements();
            if (missingElements2.length > 0) {
                console.error("❌ No se pudieron cargar los elementos necesarios:", missingElements2);
                
                // Mostrar mensaje de error más amigable
                const loadingOverlay = document.getElementById('loadingOverlay');
                if (loadingOverlay) {
                    loadingOverlay.innerHTML = `
                        <div class="loader-content">
                            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #f59e0b; margin-bottom: 1rem;"></i>
                            <p style="color: #ef4444; font-weight: 600;">Error al cargar la aplicación</p>
                            <p style="font-size: 0.9rem; margin-top: 0.5rem;">Algunos elementos necesarios no se cargaron.</p>
                            <p style="font-size: 0.8rem; margin-top: 0.5rem;">Por favor, recarga la página.</p>
                            <button onclick="window.location.reload()" style="margin-top: 1rem; padding: 0.5rem 1.5rem; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer;">
                                <i class="fas fa-sync-alt"></i> Recargar Página
                            </button>
                        </div>
                    `;
                }
                return;
            }
            // Inicializar dashboard usando la función global
            initializeDashboard();
        }, 500);
    } else {
        // Inicializar dashboard usando la función global
        initializeDashboard();
    }
});

// También escuchar el evento load como respaldo
window.addEventListener('load', () => {
    console.log("🖼️ Página completamente cargada");
    
    if (!window.dashboard) {
        console.log("🔄 Intentando inicializar dashboard desde evento load...");
        setTimeout(() => {
            if (!window.dashboard) {
                initializeDashboard();
            }
        }, 1000);
    }
});

// Hacer dashboard accesible globalmente
if (typeof dashboard === 'undefined') {
    window.dashboard = null;
}