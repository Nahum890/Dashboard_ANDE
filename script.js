// script.js - VERSIÓN 4.8 - FILTRO INTELIGENTE DE ALIMENTADORES + TODAS LAS FUNCIONALIDADES
console.log("🚀 Dashboard ANDE v4.8 iniciando...");

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
        this.pieChartByFeeder = null;
        this.pieChartByType = null;
        this.stationSummaryChart = null;
        this.sortConfig = { column: null, direction: 'asc' };
        
        this.chartPalette = [
            '#FF6B6B', '#4ECDC4', '#FFD166', '#06D6A0', '#118AB2', 
            '#EF476F', '#7B68EE', '#20B2AA', '#FF8C00', '#9ACD32',
            '#DA70D6', '#00CED1', '#FF6347', '#4682B4', '#DAA520',
            '#CD5C5C', '#40E0D0', '#EE82EE', '#F4A460', '#5F9EA0'
        ];
        
        this.allSecciones = [];
        this.estaciones = [];
        
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
        this.currentStationGroup = null;
        
        // ---------- NUEVAS PROPIEDADES PARA FILTRO INTELIGENTE ----------
        this.selectionMode = 'manual'; // manual, station, all
        this.currentStationFilter = ''; // estación seleccionada para filtrar
        
        // ---------- DEBOUNCE ----------
        this.loadDataDebounced = this.debounce(this.loadData.bind(this), 500);
    }
    
    // ========== DEBOUNCE ==========
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // ========== MÉTODOS DE UTILIDAD ==========
    safeToFixed(value, decimals = 4) {
        if (value === null || value === undefined || isNaN(value)) return 'N/A';
        try { return Number(value).toFixed(decimals); } catch { return String(value); }
    }
    
    safeAddEventListener(elementId, eventType, callback) {
        const el = document.getElementById(elementId);
        if (el) { el.addEventListener(eventType, callback); return true; }
        console.warn(`⚠️ Elemento '${elementId}' no encontrado`);
        return false;
    }
    
    showNotification(message, type = "info") {
        const notification = document.getElementById('notification');
        if (!notification) { console.log(`[${type}] ${message}`); return; }
        const text = notification.querySelector('.notification-text');
        const icon = notification.querySelector('i');
        const config = {
            success: { icon: 'fa-check-circle', bg: 'rgba(34,197,94,0.95)' },
            error:   { icon: 'fa-exclamation-circle', bg: 'rgba(239,68,68,0.95)' },
            warning: { icon: 'fa-exclamation-triangle', bg: 'rgba(245,158,11,0.95)' },
            info:    { icon: 'fa-info-circle', bg: 'rgba(59,130,246,0.95)' }
        };
        const cfg = config[type] || config.info;
        icon.className = `fas ${cfg.icon}`;
        notification.style.backgroundColor = cfg.bg;
        text.textContent = message;
        notification.classList.add('show');
        setTimeout(() => notification.classList.remove('show'), 4000);
    }
    
    // Pantalla de carga profesional
    showLoading(show, text = "Cargando datos...", progress = null) {
        const overlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');
        const progressBar = document.getElementById('loaderProgress');
        if (!overlay) return;
        if (show) {
            overlay.style.display = 'flex';
            if (loadingText) loadingText.textContent = text;
            if (progressBar) {
                if (progress !== null) {
                    progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
                    progressBar.style.opacity = '1';
                } else {
                    progressBar.style.width = '50%';
                    progressBar.style.opacity = '0.7';
                }
            }
        } else {
            setTimeout(() => {
                overlay.style.display = 'none';
                if (progressBar) progressBar.style.width = '0%';
            }, 300);
        }
    }
    
    // Overlay de error con botón reintentar
    showErrorInOverlay(message, retryCallback) {
        const overlay = document.getElementById('loadingOverlay');
        const loaderCard = document.getElementById('loaderCard');
        if (!overlay || !loaderCard) return;
        
        loaderCard.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="font-size: 3.8rem; color: #f59e0b; margin-bottom: 1.2rem; filter: drop-shadow(0 8px 16px rgba(245,158,11,0.3));"></i>
            <p class="loading-text" style="color: white; margin-bottom: 0.5rem;">Oops, algo salió mal</p>
            <p style="color: #cbd5e1; font-size: 1rem; margin-bottom: 1.8rem; max-width: 350px;">${message}</p>
            <button id="retryButton" class="btn-retry">
                <i class="fas fa-sync-alt"></i> Reintentar
            </button>
        `;
        const retryBtn = document.getElementById('retryButton');
        if (retryBtn && retryCallback) {
            retryBtn.addEventListener('click', () => {
                overlay.style.display = 'flex';
                loaderCard.innerHTML = `
                    <div class="spinner-ring"></div>
                    <p id="loadingText" class="loading-text">Reintentando...</p>
                    <div class="progress-track">
                        <div id="loaderProgress" class="progress-fill" style="width: 10%;"></div>
                    </div>
                    <p style="color: #94a3b8; font-size: 0.85rem; margin-top: 1rem;">
                        <i class="fas fa-bolt"></i> ANDE · Zona Este
                    </p>
                `;
                retryCallback();
            });
        }
    }
    
    updateTime() {
        const update = () => {
            const now = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            ['currentTime', 'lastUpdate', 'updateTime'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = now;
            });
            setTimeout(update, 10000);
        };
        update();
    }
    
    // ========== VERIFICACIÓN SERVIDOR ==========
    async verificarServidor() {
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/health`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.serverConnected = true;
            console.log("✅ Servidor conectado");
            return true;
        } catch (e) {
            this.serverConnected = false;
            this.showErrorInOverlay(
                "No se pudo conectar al servidor. Verifica que esté ejecutándose en el puerto 10000.",
                () => this.initialize()
            );
            return false;
        }
    }
    
    async verificarEstadoBD() {
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/verificar-datos`);
            const data = await res.json();
            if (!data.tabla_existe || data.total_registros === 0) {
                this.showNotification("Base de datos vacía. Sube un archivo Excel para comenzar.", "warning");
                return true;
            }
            return true;
        } catch {
            return true;
        }
    }
    
    // ========== INICIALIZACIÓN ==========
    async initialize() {
        console.log("🔧 Inicializando dashboard...");
        try {
            this.showLoading(true, "Conectando con el servidor...", 10);
            if (!await this.verificarServidor()) return;
            this.showLoading(true, "Verificando base de datos...", 30);
            await this.verificarEstadoBD();
            this.showLoading(true, "Inicializando gráficos...", 50);
            this.initCharts();
            this.showLoading(true, "Configurando filtros...", 60);
            this.setupEventListeners();
            this.showLoading(true, "Cargando metadatos...", 70);
            await this.loadTiposMedicion();
            await this.loadSeccionesDisponibles();
            await this.loadYearsAvailable();
            this.showLoading(true, "Aplicando valores por defecto...", 80);
            this.setDefaultFilterValues();
            this.showLoading(true, "Cargando datos...", 90);
            await this.loadData();
            this.showLoading(true, "Cargando historial...", 95);
            setTimeout(() => this.loadCargas(), 1000);
            this.updateTime();
            this.startLiveUpdates();
            this.showLoading(false);
            this.showNotification("Dashboard cargado correctamente", "success");
        } catch (error) {
            console.error("❌ Error inicializando:", error);
            this.showErrorInOverlay(
                `Error al cargar el dashboard: ${error.message || 'Error desconocido'}`,
                () => this.initialize()
            );
        } finally {
            this.isInitialLoad = false;
        }
    }
    
    // ========== INICIALIZACIÓN DE GRÁFICOS ==========
    initCharts() {
        Chart.defaults.font.family = "'Inter', 'Segoe UI', system-ui, sans-serif";
        Chart.defaults.font.size = 12;
        Chart.defaults.color = '#e2e8f0';
        Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15,23,42,0.98)';
        Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
        Chart.defaults.plugins.tooltip.bodyColor = '#cbd5e1';
        Chart.defaults.plugins.tooltip.borderColor = '#60a5fa';
        Chart.defaults.plugins.tooltip.borderWidth = 2;
        Chart.defaults.plugins.tooltip.padding = 12;
        Chart.defaults.plugins.tooltip.cornerRadius = 8;
        Chart.defaults.responsive = true;
        Chart.defaults.maintainAspectRatio = false;
        Chart.defaults.devicePixelRatio = window.devicePixelRatio || 2;
        Chart.defaults.animation = { duration: 800, easing: 'easeOutQuart' };
        
        this.initMainChart();
        this.initRankingChart();
        this.initScatterChart();
        this.initPieCharts();
        this.initStationSummaryChart();
    }
    
    initMainChart() {
        const ctx = document.getElementById('mainChart')?.getContext('2d');
        if (!ctx) return;
        this.mainChart = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                devicePixelRatio: window.devicePixelRatio || 2,
                animation: { duration: 800, easing: 'easeOutQuart' },
                plugins: {
                    legend: { display: false },
                    tooltip: { 
                        mode: 'index', intersect: false,
                        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${this.formatValue(ctx.parsed.y)}` }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: { color: 'rgba(148,163,184,0.15)' },
                        ticks: { color: '#94a3b8', font: { size: 11 }, callback: (v) => this.formatValue(v) }
                    },
                    x: {
                        grid: { color: 'rgba(148,163,184,0.15)' },
                        ticks: { color: '#94a3b8', font: { size: 11 }, maxRotation: 45, minRotation: 30 }
                    }
                },
                interaction: { mode: 'index', intersect: false }
            }
        });
        this.showNoDataMessage(this.mainChart, 'mainChart');
    }
    
    initRankingChart() {
        const ctx = document.getElementById('rankingChart')?.getContext('2d');
        if (!ctx) return;
        this.rankingChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: [], datasets: [{
                label: 'Promedio', data: [], backgroundColor: [], borderColor: [], borderWidth: 1, borderRadius: 4
            }] },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                devicePixelRatio: window.devicePixelRatio || 2,
                animation: { duration: 600 },
                plugins: { 
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => `Promedio: ${this.formatValue(ctx.raw)}` } }
                },
                scales: {
                    x: { 
                        grid: { color: 'rgba(148,163,184,0.15)' },
                        ticks: { color: '#94a3b8', font: { size: 11 }, callback: (v) => this.formatValue(v) }
                    },
                    y: { 
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { size: 11, weight: '500' } }
                    }
                }
            }
        });
        this.showNoDataMessage(this.rankingChart, 'rankingChart');
    }
    
    initScatterChart() {
        const ctx = document.getElementById('scatterChart')?.getContext('2d');
        if (!ctx) return;
        this.scatterChart = new Chart(ctx, {
            type: 'scatter',
            data: { datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                devicePixelRatio: window.devicePixelRatio || 2,
                plugins: { 
                    legend: { position: 'top', labels: { color: '#cbd5e1', font: { size: 12 } } },
                    tooltip: { 
                        callbacks: { 
                            label: (ctx) => {
                                const date = new Date(ctx.raw.x).toLocaleDateString('es-ES', { year: 'numeric', month: 'short' });
                                return `${ctx.dataset.label}: ${date} → ${this.formatValue(ctx.raw.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { 
                        type: 'time',
                        time: { unit: 'month', tooltipFormat: 'MMM yyyy', displayFormats: { month: 'MMM yyyy' } },
                        grid: { color: 'rgba(148,163,184,0.15)' },
                        ticks: { color: '#94a3b8', font: { size: 11 }, maxRotation: 45, minRotation: 30 }
                    },
                    y: { 
                        grid: { color: 'rgba(148,163,184,0.15)' },
                        ticks: { color: '#94a3b8', font: { size: 11 }, callback: (v) => this.formatValue(v) }
                    }
                }
            }
        });
        this.showNoDataMessage(this.scatterChart, 'scatterChart');
    }
    
    initPieCharts() {
        const ctx1 = document.getElementById('pieChartFeeder')?.getContext('2d');
        if (ctx1) {
            this.pieChartByFeeder = new Chart(ctx1, {
                type: 'doughnut',
                data: { labels: [], datasets: [{ data: [], backgroundColor: this.chartPalette, borderWidth: 2, borderColor: 'rgba(15,23,42,0.5)' }] },
                options: {
                    responsive: true, maintainAspectRatio: false, devicePixelRatio: window.devicePixelRatio || 2, cutout: '65%',
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 11 }, padding: 15 } },
                        tooltip: { callbacks: { label: (ctx) => {
                            const total = ctx.dataset.data.reduce((a,b) => a + b, 0);
                            const percent = ((ctx.raw / total) * 100).toFixed(1);
                            return `${ctx.label}: ${this.formatValue(ctx.raw)} (${percent}%)`;
                        }}}
                    }
                }
            });
            this.showNoDataMessage(this.pieChartByFeeder, 'pieChartFeeder');
        }
        const ctx2 = document.getElementById('pieChartType')?.getContext('2d');
        if (ctx2) {
            this.pieChartByType = new Chart(ctx2, {
                type: 'doughnut',
                data: { labels: [], datasets: [{ data: [], backgroundColor: this.chartPalette.slice(5), borderWidth: 2, borderColor: 'rgba(15,23,42,0.5)' }] },
                options: {
                    responsive: true, maintainAspectRatio: false, devicePixelRatio: window.devicePixelRatio || 2, cutout: '65%',
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 11 }, padding: 15 } },
                        tooltip: { callbacks: { label: (ctx) => {
                            const total = ctx.dataset.data.reduce((a,b) => a + b, 0);
                            const percent = ((ctx.raw / total) * 100).toFixed(1);
                            return `${ctx.label}: ${this.formatValue(ctx.raw)} (${percent}%)`;
                        }}}
                    }
                }
            });
            this.showNoDataMessage(this.pieChartByType, 'pieChartType');
        }
    }
    
    initStationSummaryChart() {
        const ctx = document.getElementById('stationSummaryChart')?.getContext('2d');
        if (!ctx) return;
        this.stationSummaryChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: [], datasets: [{
                label: 'Promedio', data: [], backgroundColor: this.chartPalette, borderWidth: 1, borderRadius: 4
            }] },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                devicePixelRatio: window.devicePixelRatio || 2,
                plugins: { 
                    legend: { display: false },
                    title: { display: true, text: 'Resumen de alimentadores en la estación', color: '#f1f5f9', font: { size: 14, weight: 'bold' }, padding: { bottom: 20 } },
                    tooltip: { callbacks: { label: (ctx) => `Promedio: ${this.formatValue(ctx.raw)}` } }
                },
                scales: {
                    x: { 
                        grid: { color: 'rgba(148,163,184,0.15)' },
                        ticks: { color: '#94a3b8', font: { size: 11 }, callback: (v) => this.formatValue(v) }
                    },
                    y: { 
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { size: 11, weight: '500' } }
                    }
                }
            }
        });
        this.showNoDataMessage(this.stationSummaryChart, 'stationSummaryChart');
    }
    
    showNoDataMessage(chart, canvasId) {
        if (!chart) return;
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width, height = canvas.height;
        ctx.save();
        ctx.clearRect(0, 0, width, height);
        ctx.font = '14px "Inter", sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📊 No hay datos para mostrar', width/2, height/2);
        ctx.restore();
    }
    
    // ========== EVENT LISTENERS PRINCIPALES ==========
    setupEventListeners() {
        this.safeAddEventListener('applyFilters', 'click', () => this.loadData());
        this.safeAddEventListener('resetFilters', 'click', () => this.resetFilters());
        this.safeAddEventListener('clearAll', 'click', () => this.clearAllFilters());
        this.safeAddEventListener('globalModeUnique', 'click', () => this.setGlobalMode('unique'));
        this.safeAddEventListener('globalModeMultiple', 'click', () => this.setGlobalMode('multiple'));
        this.safeAddEventListener('filterTipoMedicion', 'change', () => this.onFilterChange());
        this.safeAddEventListener('filterYear', 'change', () => this.onFilterChange());
        this.safeAddEventListener('filterPeriodo', 'change', () => this.onPeriodoChange());
        
        document.querySelectorAll('.month-btn').forEach(btn => btn.addEventListener('click', (e) => this.toggleMonthSelection(e)));
        this.safeAddEventListener('selectAllMonths', 'click', () => this.selectAllMonths());
        this.safeAddEventListener('deselectAllMonths', 'click', () => this.deselectAllMonths());
        
        this.safeAddEventListener('groupBy', 'change', () => this.onGroupByChange());
        this.safeAddEventListener('chartType', 'change', () => this.onChartTypeChange());
        this.safeAddEventListener('togglePoints', 'click', () => this.toggleChartPoints());
        this.safeAddEventListener('zoomIn', 'click', () => this.zoomChart('in'));
        this.safeAddEventListener('zoomOut', 'click', () => this.zoomChart('out'));
        this.safeAddEventListener('resetZoom', 'click', () => this.resetChartZoom());
        this.safeAddEventListener('expandChartBtn', 'click', () => this.expandChart());
        this.safeAddEventListener('rankingSort', 'change', () => this.updateRankingChart());
        
        this.safeAddEventListener('tableSearch', 'input', (e) => this.filterTable(e.target.value));
        this.safeAddEventListener('rowsPerPage', 'change', () => this.updateTable());
        this.safeAddEventListener('firstPage', 'click', () => this.goToPage(1));
        this.safeAddEventListener('prevPage', 'click', () => this.goToPage(this.pagination.currentPage - 1));
        this.safeAddEventListener('nextPage', 'click', () => this.goToPage(this.pagination.currentPage + 1));
        this.safeAddEventListener('lastPage', 'click', () => this.goToPage(this.pagination.totalPages));
        document.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => this.sortTable(th.dataset.sort)));
        
        this.safeAddEventListener('uploadExcelBtn', 'click', () => this.uploadExcel());
        this.safeAddEventListener('sidebarToggle', 'click', () => this.toggleSidebar());
        this.safeAddEventListener('sidebarClose', 'click', () => this.toggleSidebar());
        
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                if (this.mainChart) this.mainChart.resize();
                if (this.rankingChart) this.rankingChart.resize();
                if (this.scatterChart) this.scatterChart.resize();
                if (this.pieChartByFeeder) this.pieChartByFeeder.resize();
                if (this.pieChartByType) this.pieChartByType.resize();
                if (this.stationSummaryChart) this.stationSummaryChart.resize();
            }, 250);
        });
        
        // NOTA: Los event listeners del filtro de alimentadores se configuran en initFeederFilter()
    }
    
    // ========== FILTROS (incluye debounce) ==========
    onFilterChange() {
        // Actualizar estación actual para el resumen por estación (si se selecciona "Todos de estación")
        // Pero ahora la selección de estación se maneja por separado, así que no hacemos nada especial aquí.
        if (this.globalMode === 'unique') this.loadDataDebounced();
    }
    
    // ========== CARGA DE METADATOS ==========
    async loadTiposMedicion() {
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/tipos-medicion`);
            const tipos = await res.json();
            const select = document.getElementById('filterTipoMedicion');
            if (select) select.innerHTML = '<option value="all">Todos los tipos</option>' + tipos.map(t => `<option value="${t}">${t}</option>`).join('');
        } catch (e) { console.error("Error cargando tipos:", e); }
    }
    
    async loadSeccionesDisponibles() {
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/secciones`);
            const secciones = await res.json();
            this.allSecciones = secciones;
            
            // Extraer estaciones únicas (primeras 3 letras)
            const estacionesSet = new Set(secciones.map(s => s.substring(0,3)).filter(s => s.length === 3));
            this.estaciones = Array.from(estacionesSet).sort();
    
            // Poblar selector de estación
            const estSel = document.getElementById('filterEstacion');
            if (estSel) {
                estSel.innerHTML = '<option value="">Todas las estaciones</option>' + 
                    this.estaciones.map(e => `<option value="${e}">${e}</option>`).join('');
            }
    
            // Poblar selector de alimentadores (inicialmente con todos)
            const feedSel = document.getElementById('filterTransformador');
            if (feedSel) {
                feedSel.innerHTML = secciones.map(s => `<option value="${s}">${s}</option>`).join('');
            }
    
            // Inicializar el sistema de filtro inteligente
            this.initFeederFilter();
            
            console.log(`✅ Secciones cargadas: ${secciones.length} secciones, ${this.estaciones.length} estaciones`);
        } catch (e) { 
            console.error("Error cargando secciones:", e); 
        }
    }
    
    async loadYearsAvailable() {
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/anios`);
            const years = await res.json();
            const select = document.getElementById('filterYear');
            if (select) select.innerHTML = '<option value="all">Todos los años</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
        } catch (e) { console.error("Error cargando años:", e); }
    }
    
    // ========== NUEVO: FILTRO INTELIGENTE DE ALIMENTADORES ==========
    
    initFeederFilter() {
        this.setupFeederModeTabs();
        this.setupFeederEventListeners();
        this.updateFeederCount();
        this.setFeederMode('manual'); // modo por defecto
    }
    
    setupFeederModeTabs() {
        const tabs = document.querySelectorAll('.mode-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.mode;
                this.setFeederMode(mode);
            });
        });
    }
    
    setFeederMode(mode) {
        this.selectionMode = mode;
        
        // Actualizar UI de pestañas
        const tabs = document.querySelectorAll('.mode-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.mode === mode);
        });
    
        // Mostrar/ocultar selector de estación según modo
        const stationSelectorContainer = document.getElementById('stationSelectorContainer');
        if (mode === 'station' || mode === 'manual') {
            stationSelectorContainer.style.display = 'block';
        } else {
            stationSelectorContainer.style.display = 'none';
        }
    
        // Si el modo es 'all', seleccionar todos los alimentadores
        if (mode === 'all') {
            this.selectAllFeeders();
        }
    
        // Si el modo es 'station' y hay una estación seleccionada, seleccionar todos de esa estación
        if (mode === 'station' && this.currentStationFilter) {
            this.selectStationFeeders(this.currentStationFilter);
        }
    
        // Actualizar hint informativo
        this.updateFeederModeHint();
    }
    
    updateFeederModeHint() {
        const hint = document.getElementById('estacionHint');
        if (!hint) return;
        
        switch(this.selectionMode) {
            case 'manual':
                hint.innerHTML = '<i class="fas fa-info-circle"></i> Filtra los alimentadores por estación y selecciona manualmente con Ctrl+Click.';
                break;
            case 'station':
                hint.innerHTML = '<i class="fas fa-info-circle"></i> Al seleccionar una estación, se marcarán automáticamente todos sus alimentadores.';
                break;
            case 'all':
                hint.innerHTML = '<i class="fas fa-info-circle"></i> Modo "Todos los alimentadores" – se muestran y seleccionan todos.';
                break;
        }
    }
    
    setupFeederEventListeners() {
        // Selector de estación: al cambiar, filtrar opciones del select múltiple
        const estacionSelect = document.getElementById('filterEstacion');
        if (estacionSelect) {
            estacionSelect.addEventListener('change', (e) => {
                const estacion = e.target.value;
                this.currentStationFilter = estacion;
                this.filterFeedersByStation(estacion);
                
                // Si el modo es 'station', seleccionar todos de esa estación automáticamente
                if (this.selectionMode === 'station' && estacion) {
                    this.selectStationFeeders(estacion);
                }
            });
        }
    
        // Botón "Todos"
        const selectAllBtn = document.getElementById('selectAllFeedersBtn');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => this.selectAllFeeders());
        }
    
        // Botón "Todos de esta estación"
        const selectStationBtn = document.getElementById('selectStationFeedersBtn');
        if (selectStationBtn) {
            selectStationBtn.addEventListener('click', () => {
                const estacion = document.getElementById('filterEstacion')?.value;
                if (estacion) {
                    this.selectStationFeeders(estacion);
                } else {
                    this.showNotification('Selecciona una estación primero', 'warning');
                }
            });
        }
    
        // Botón "Limpiar"
        const clearBtn = document.getElementById('clearFeedersBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearFeeders());
        }
    
        // Detectar cambios en el select múltiple para actualizar contador
        const feederSelect = document.getElementById('filterTransformador');
        if (feederSelect) {
            feederSelect.addEventListener('change', () => this.updateFeederCount());
        }
    }
    
    filterFeedersByStation(estacion) {
        const feederSelect = document.getElementById('filterTransformador');
        if (!feederSelect) return;
    
        // Guardar selección actual para restaurarla después del filtro
        const selectedValues = Array.from(feederSelect.selectedOptions).map(opt => opt.value);
    
        // Limpiar opciones actuales
        feederSelect.innerHTML = '';
    
        // Obtener todos los alimentadores
        let allFeeders = [...this.allSecciones];
    
        // Filtrar si hay estación seleccionada
        if (estacion) {
            allFeeders = allFeeders.filter(f => f.startsWith(estacion));
        }
    
        // Agregar opciones al select
        allFeeders.forEach(feeder => {
            const option = document.createElement('option');
            option.value = feeder;
            option.textContent = feeder;
            feederSelect.appendChild(option);
        });
    
        // Restaurar selección solo para los que aún existen
        selectedValues.forEach(val => {
            const option = Array.from(feederSelect.options).find(opt => opt.value === val);
            if (option) option.selected = true;
        });
    
        // Actualizar contador
        this.updateFeederCount();
    }
    
    selectAllFeeders() {
        const feederSelect = document.getElementById('filterTransformador');
        if (!feederSelect) return;
        
        // Asegurar que todas las opciones estén visibles (quitar filtro de estación)
        if (document.getElementById('filterEstacion').value !== '') {
            document.getElementById('filterEstacion').value = '';
            this.filterFeedersByStation('');
        }
        
        Array.from(feederSelect.options).forEach(opt => opt.selected = true);
        this.updateFeederCount();
        this.showNotification('Todos los alimentadores seleccionados', 'success');
    }
    
    selectStationFeeders(estacion) {
        const feederSelect = document.getElementById('filterTransformador');
        if (!feederSelect) return;
    
        // Primero, aseguramos que el filtro por estación esté aplicado
        if (document.getElementById('filterEstacion').value !== estacion) {
            document.getElementById('filterEstacion').value = estacion;
            this.filterFeedersByStation(estacion);
        }
    
        // Seleccionar todas las opciones visibles
        Array.from(feederSelect.options).forEach(opt => opt.selected = true);
        this.updateFeederCount();
        this.showNotification(`Todos los alimentadores de ${estacion} seleccionados`, 'success');
    }
    
    clearFeeders() {
        const feederSelect = document.getElementById('filterTransformador');
        if (!feederSelect) return;
        
        Array.from(feederSelect.options).forEach(opt => opt.selected = false);
        this.updateFeederCount();
        this.showNotification('Selección de alimentadores limpiada', 'info');
    }
    
    updateFeederCount() {
        const feederSelect = document.getElementById('filterTransformador');
        const countSpan = document.getElementById('feederCount');
        if (!feederSelect || !countSpan) return;
        
        const count = feederSelect.selectedOptions.length;
        countSpan.textContent = count;
        
        // Actualizar también el hint de alimentadores seleccionados
        const hint = document.getElementById('feederCountHint');
        if (hint) {
            hint.innerHTML = `<i class="fas fa-info-circle"></i> <span id="feederCount">${count}</span> alimentadores seleccionados`;
        }
    }
    
    // ========== CONFIGURACIÓN DE VALORES POR DEFECTO ==========
    setDefaultFilterValues() {
        this.setGlobalMode('unique');
        this.selectedMonths = new Set([1,2,3,4,5,6,7,8,9,10,11,12]);
        this.updateMonthButtons();
        this.updateMonthSelect();
        const periodo = document.getElementById('filterPeriodo');
        if (periodo) periodo.value = 'select_months';
        this.filters.periodo = 'select_months';
        setTimeout(() => {
            const setSelect = (id, defaultValue) => {
                const el = document.getElementById(id);
                if (el && el.options.length) {
                    if (Array.from(el.options).find(opt => opt.value === defaultValue)) el.value = defaultValue;
                    else if (el.options.length > 0) el.value = el.options[0].value;
                }
            };
            setSelect('filterYear', '2024');
            setSelect('filterTipoMedicion', 'ACCID.DEP');
            
            // Para alimentadores, seleccionar ACY1 por defecto
            const feedSel = document.getElementById('filterTransformador');
            if (feedSel) {
                // Limpiar filtro de estación
                const estSel = document.getElementById('filterEstacion');
                if (estSel) estSel.value = '';
                this.filterFeedersByStation('');
                // Seleccionar ACY1 si existe
                const option = Array.from(feedSel.options).find(opt => opt.value === 'ACY1');
                if (option) {
                    option.selected = true;
                } else if (feedSel.options.length > 0) {
                    feedSel.options[0].selected = true;
                }
                this.updateFeederCount();
            }
            
            this.filters = {
                year: [document.getElementById('filterYear')?.value || '2024'],
                tipoMedicion: [document.getElementById('filterTipoMedicion')?.value || 'ACCID.DEP'],
                transformador: this.getSelectedValues('filterTransformador'),
                month: Array.from(this.selectedMonths),
                estacion: '',
                periodo: 'select_months'
            };
        }, 500);
    }
    
    // ========== MANEJO DE FILTROS GLOBALES ==========
    setGlobalMode(mode) {
        this.globalMode = mode;
        const unique = document.getElementById('globalModeUnique');
        const multiple = document.getElementById('globalModeMultiple');
        const hint = document.getElementById('globalModeHint');
        if (unique && multiple) {
            unique.classList.toggle('active', mode === 'unique');
            multiple.classList.toggle('active', mode === 'multiple');
        }
        if (hint) hint.textContent = mode === 'unique' ? 'Único: un valor por filtro' : 'Múltiple: selecciona varios valores con Ctrl+Click';
        const guide = document.getElementById('monthModeGroup');
        if (guide) guide.style.display = mode === 'multiple' ? 'block' : 'none';
    }
    
    resetFilters() {
        this.filters = { ...this.defaultFilters };
        this.selectedMonths = new Set([1,2,3,4,5,6,7,8,9,10,11,12]);
        this.currentStationGroup = null;
        this.updateMonthButtons();
        this.updateMonthSelect();
        
        // Resetear filtro de alimentadores
        this.setFeederMode('manual');
        this.currentStationFilter = '';
        const estSel = document.getElementById('filterEstacion');
        if (estSel) estSel.value = '';
        this.filterFeedersByStation('');
        this.clearFeeders();
        // Seleccionar ACY1 por defecto
        const feedSel = document.getElementById('filterTransformador');
        if (feedSel) {
            const option = Array.from(feedSel.options).find(opt => opt.value === 'ACY1');
            if (option) option.selected = true;
            this.updateFeederCount();
        }
        
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        setVal('filterYear', '2024');
        setVal('filterTipoMedicion', 'ACCID.DEP');
        setVal('filterPeriodo', 'select_months');
        
        this.showNotification("Filtros restablecidos", "success");
        setTimeout(() => this.loadData(), 500);
    }
    
    clearAllFilters() {
        document.querySelectorAll('.multi-select').forEach(select => 
            Array.from(select.options).forEach(opt => opt.selected = false));
        this.selectedMonths.clear();
        this.updateMonthButtons();
        this.updateMonthSelect();
        
        // Resetear filtro de alimentadores
        this.setFeederMode('manual');
        this.currentStationFilter = '';
        const estSel = document.getElementById('filterEstacion');
        if (estSel) estSel.value = '';
        this.filterFeedersByStation('');
        this.clearFeeders();
        
        const tipoSel = document.getElementById('filterTipoMedicion');
        if (tipoSel) Array.from(tipoSel.options).forEach(opt => opt.selected = false);
        const yearSel = document.getElementById('filterYear');
        if (yearSel) Array.from(yearSel.options).forEach(opt => opt.selected = false);
        
        this.filters = { tipoMedicion: [], transformador: [], year: [], month: [], estacion: '', periodo: 'select_months' };
        this.currentStationGroup = null;
        this.showNotification("Filtros limpiados", "info");
    }
    
    onPeriodoChange() {
        const periodo = document.getElementById('filterPeriodo')?.value;
        this.filters.periodo = periodo;
        const monthGroup = document.getElementById('monthSelectorGroup');
        if (monthGroup) monthGroup.style.display = periodo === 'select_months' ? 'block' : 'none';
        if (periodo !== 'select_months') {
            const now = new Date();
            const cm = now.getMonth() + 1;
            this.selectedMonths.clear();
            if (periodo === 'last3') for (let i=0;i<3;i++) this.selectedMonths.add(((cm - i -1 +12)%12)+1);
            else if (periodo === 'last6') for (let i=0;i<6;i++) this.selectedMonths.add(((cm - i -1 +12)%12)+1);
            else if (periodo === 'last12' || periodo === 'currentYear' || periodo === 'lastYear') 
                for (let i=1;i<=12;i++) this.selectedMonths.add(i);
            this.updateMonthButtons();
            this.updateMonthSelect();
            this.loadDataDebounced();
        }
    }
    
    // ========== MESES ==========
    toggleMonthSelection(e) {
        const month = parseInt(e.currentTarget.dataset.month);
        this.selectedMonths.has(month) ? this.selectedMonths.delete(month) : this.selectedMonths.add(month);
        this.updateMonthButtons(); this.updateMonthSelect();
        this.filters.month = Array.from(this.selectedMonths);
        if (this.globalMode === 'unique') this.loadDataDebounced();
    }
    
    updateMonthButtons() {
        document.querySelectorAll('.month-btn').forEach(btn => {
            const m = parseInt(btn.dataset.month);
            btn.classList.toggle('selected', this.selectedMonths.has(m));
        });
        const hint = document.getElementById('monthHint');
        if (hint) hint.innerHTML = `<i class="fas fa-info-circle"></i> ${this.selectedMonths.size} mes(es) seleccionado(s)`;
    }
    
    updateMonthSelect() {
        const sel = document.getElementById('filterMonth');
        if (sel) {
            Array.from(sel.options).forEach(opt => opt.selected = this.selectedMonths.has(parseInt(opt.value)));
            this.filters.month = Array.from(this.selectedMonths);
        }
    }
    
    selectAllMonths() { 
        for (let i=1;i<=12;i++) this.selectedMonths.add(i); 
        this.updateMonthButtons(); this.updateMonthSelect(); 
        this.showNotification("Todos los meses seleccionados","success"); 
        if (this.globalMode === 'unique') this.loadDataDebounced(); 
    }
    
    deselectAllMonths() { 
        this.selectedMonths.clear(); 
        this.updateMonthButtons(); this.updateMonthSelect(); 
        this.showNotification("Todos los meses deseleccionados","info"); 
        if (this.globalMode === 'unique') this.loadDataDebounced(); 
    }
    
    // ========== CARGA DE DATOS ==========
    async loadData() {
        this.showLoading(true, "Cargando datos desde el servidor...", null);
        try {
            const params = new URLSearchParams();
            
            // Alimentadores seleccionados (sección)
            const selectedFeed = this.getSelectedValues('filterTransformador');
            let seccionVal = 'ACY1';
            if (selectedFeed.length > 0) {
                seccionVal = selectedFeed.join(',');
            }
            params.append('seccion', seccionVal);
            
            // Año
            const yearSel = document.getElementById('filterYear');
            const years = this.getSelectedValues('filterYear');
            params.append('anio', years.length ? years.join(',') : (yearSel?.value || '2024'));
            
            // Mes
            if (this.selectedMonths.size && this.filters.periodo === 'select_months')
                params.append('mes', Array.from(this.selectedMonths).join(','));
            else if (this.filters.periodo && this.filters.periodo !== 'select_months')
                params.append('periodo', this.filters.periodo);
            else params.append('mes', 'all');
            
            // Tipo de medición
            const tipoSel = document.getElementById('filterTipoMedicion');
            const tipos = this.getSelectedValues('filterTipoMedicion');
            params.append('tipo_medicion', tipos.length ? tipos.join(',') : (tipoSel?.value || 'ACCID.DEP'));
            
            // Estación (solo para filtrar, no para la API como sección)
            // No se envía porque ya filtramos por alimentadores específicos
            
            const url = `${this.apiBaseUrl}/api/datos?${params}`;
            console.log("📥 URL:", url);
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.data = await res.json();
            this.filteredData = [...this.data];
            
            this.showLoading(true, "Procesando datos...", 70);
            
            if (this.data.length === 0) {
                this.showNotification("No hay datos con los filtros actuales", "warning");
                this.clearChartsAndTable();
                if (this.isInitialLoad) { 
                    console.log("⚠️ Generando datos de ejemplo..."); 
                    this.generateSampleData(); 
                }
            } else {
                this.updateStats();
                this.updateKPIs();
                this.updateSpecialKPIs();
                this.updateCharts();
                this.updateScatterChart();
                this.updatePieCharts();
                this.updateStationSummary();
                this.pagination.currentPage = 1;
                this.updateTable();
                this.updateComparisonTags();
                this.showNotification(`${this.data.length} registros cargados`, "success");
            }
        } catch (error) {
            console.error("❌ Error cargando datos:", error);
            this.showNotification(`Error: ${error.message}`, "error");
            if (this.isInitialLoad) { 
                console.log("⚠️ Generando datos de ejemplo..."); 
                this.generateSampleData(); 
            }
        } finally { 
            this.showLoading(false); 
        }
    }
    
    // ========== KPIS ESPECIALES ==========
    updateSpecialKPIs() {
        const specialSection = document.getElementById('specialKpiSection');
        if (!specialSection) return;
        
        const selectedAlimentadores = this.getSelectedValues('filterTransformador');
        const allFeedersCount = this.allSecciones.length;
        const isAllSelected = selectedAlimentadores.length === allFeedersCount && allFeedersCount > 0;
        
        if (!isAllSelected) {
            specialSection.style.display = 'none';
            return;
        }
        
        specialSection.style.display = 'grid';
        
        const feeders = this.data.map(d => d.transformador);
        const uniqueFeeders = [...new Set(feeders)];
        const stations = new Set(uniqueFeeders.map(f => f.substring(0,3)));
        
        document.getElementById('stationCount').textContent = stations.size;
        document.getElementById('stationNames').textContent = Array.from(stations).slice(0,3).join(', ') + (stations.size > 3 ? '...' : '');
        
        const stationData = {};
        this.data.forEach(d => {
            const station = d.transformador.substring(0,3);
            if (!stationData[station]) stationData[station] = { sum: 0, count: 0 };
            stationData[station].sum += d.frecuencia;
            stationData[station].count += 1;
        });
        let bestStation = null, bestAvg = Infinity;
        Object.entries(stationData).forEach(([st, data]) => {
            const avg = data.sum / data.count;
            if (avg < bestAvg) { bestAvg = avg; bestStation = st; }
        });
        document.getElementById('bestStationName').textContent = bestStation || '--';
        document.getElementById('bestStationValue').textContent = this.safeToFixed(bestAvg);
        
        const feederData = {};
        this.data.forEach(d => {
            if (!feederData[d.transformador]) feederData[d.transformador] = { sum: 0, count: 0 };
            feederData[d.transformador].sum += d.frecuencia;
            feederData[d.transformador].count += 1;
        });
        let bestFeeder = null, bestFeederAvg = Infinity;
        Object.entries(feederData).forEach(([fd, data]) => {
            const avg = data.sum / data.count;
            if (avg < bestFeederAvg) { bestFeederAvg = avg; bestFeeder = fd; }
        });
        document.getElementById('topFeederName').textContent = bestFeeder || '--';
        document.getElementById('topFeederValue').textContent = this.safeToFixed(bestFeederAvg);
        
        const values = this.data.map(d => d.frecuencia).filter(v => !isNaN(v));
        if (values.length > 1) {
            const mean = values.reduce((a,b)=>a+b,0)/values.length;
            const variance = values.reduce((a,b)=>a+Math.pow(b-mean,2),0)/values.length;
            const cv = (Math.sqrt(variance)/mean)*100;
            document.getElementById('globalCV').textContent = cv.toFixed(2) + '%';
            const badge = document.getElementById('globalCVBadge');
            badge.textContent = cv < 10 ? 'BAJA' : cv < 30 ? 'MEDIA' : 'ALTA';
            badge.style.backgroundColor = cv < 10 ? '#10b981' : cv < 30 ? '#f59e0b' : '#ef4444';
        }
    }
    
    // ========== LIMPIAR GRÁFICOS ==========
    clearChartsAndTable() {
        if (this.mainChart) { this.mainChart.data.labels = []; this.mainChart.data.datasets = []; this.mainChart.update(); this.showNoDataMessage(this.mainChart, 'mainChart'); }
        if (this.rankingChart) { this.rankingChart.data.labels = []; this.rankingChart.data.datasets[0].data = []; this.rankingChart.update(); this.showNoDataMessage(this.rankingChart, 'rankingChart'); }
        if (this.scatterChart) { this.scatterChart.data.datasets = []; this.scatterChart.update(); this.showNoDataMessage(this.scatterChart, 'scatterChart'); }
        if (this.pieChartByFeeder) { this.pieChartByFeeder.data.labels = []; this.pieChartByFeeder.data.datasets[0].data = []; this.pieChartByFeeder.update(); this.showNoDataMessage(this.pieChartByFeeder, 'pieChartFeeder'); }
        if (this.pieChartByType) { this.pieChartByType.data.labels = []; this.pieChartByType.data.datasets[0].data = []; this.pieChartByType.update(); this.showNoDataMessage(this.pieChartByType, 'pieChartType'); }
        if (this.stationSummaryChart) { this.stationSummaryChart.data.labels = []; this.stationSummaryChart.data.datasets[0].data = []; this.stationSummaryChart.update(); this.showNoDataMessage(this.stationSummaryChart, 'stationSummaryChart'); }
        const tbody = document.getElementById('dataTable');
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="no-data"><i class="fas fa-database"></i> No hay datos para mostrar</td></tr>`;
        ['rangeValue','rangeInfo','variabilityValue','variabilityBadge','worstSeries','worstValue'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (id === 'rangeValue' || id === 'variabilityValue' || id === 'worstValue') el.textContent = '0.0000';
                else if (id === 'rangeInfo') el.textContent = '0-0';
                else if (id === 'variabilityBadge') { el.textContent = '--'; el.style.backgroundColor = ''; }
                else if (id === 'worstSeries') el.textContent = '--';
            }
        });
        ['dataCount','loadedSeries','totalPoints','seriesCount','activeSeries'].forEach(id => { const el = document.getElementById(id); if(el) el.textContent = '0'; });
        document.getElementById('specialKpiSection').style.display = 'none';
    }
    
    getSelectedValues(selectId) {
        const sel = document.getElementById(selectId);
        if (!sel) return [];
        return sel.multiple ? Array.from(sel.selectedOptions).map(o=>o.value).filter(v=>v) : (sel.value ? [sel.value] : []);
    }
    
    // ========== GENERAR DATOS DE EJEMPLO ==========
    generateSampleData() {
        console.log("⚠️ Generando datos de ejemplo...");
        const secciones = this.filters.transformador?.length ? this.filters.transformador : ['ACY1','ACY2','ACY3'];
        const años = this.filters.year?.map(y=>parseInt(y)).filter(y=>!isNaN(y)).length ? this.filters.year.map(y=>parseInt(y)) : [2023,2024];
        const tipos = this.filters.tipoMedicion?.length ? this.filters.tipoMedicion : ['ACCID.DEP','TOTAL FEP'];
        const meses = Array.from(this.selectedMonths).length ? Array.from(this.selectedMonths) : [1,2,3,4,5,6,7,8,9,10,11,12];
        this.data = [];
        secciones.forEach((sec, i) => {
            años.forEach(an => {
                meses.forEach(me => {
                    tipos.forEach((tp, j) => {
                        let base = tp === 'ACCID.DEP' ? 0.5 + i*0.2 + Math.random()*0.3 :
                                  tp.includes('TOTAL') ? 120 + i*30 + Math.random()*80 : 40 + i*15 + Math.random()*30;
                        const varMes = Math.sin(me/12*Math.PI*2)*0.15;
                        const varAn = (an-2023)*0.05;
                        this.data.push({
                            transformador: sec,
                            frecuencia: parseFloat((base*(1+varMes+varAn)).toFixed(4)),
                            fecha: `${an}-${String(me).padStart(2,'0')}-01`,
                            tipo: tp,
                            departamento: 'Zona Este',
                            year: an,
                            month: me,
                            combinationKey: `${sec}-${an}-${tp}`,
                            combinationLabel: `${sec} (${an}, ${tp})`
                        });
                    });
                });
            });
        });
        this.filteredData = [...this.data];
        this.updateStats(); this.updateKPIs(); this.updateSpecialKPIs(); this.updateCharts(); this.updateScatterChart();
        this.updatePieCharts(); this.updateStationSummary(); this.updateTable();
        console.log(`✅ Datos de ejemplo: ${this.data.length} registros`);
    }
    
    // ========== ACTUALIZACIÓN UI ==========
    updateStats() {
        const ids = ['dataCount','loadedSeries','totalPoints','seriesCount','activeSeries'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (id === 'dataCount' || id === 'totalPoints') el.textContent = this.data.length.toLocaleString();
            if (id === 'loadedSeries' || id === 'seriesCount' || id === 'activeSeries') {
                const unique = new Set(this.data.map(d => d.combinationKey)).size;
                el.textContent = unique;
            }
        });
    }
    
    updateKPIs() {
        if (!this.data.length) return;
        const values = this.data.map(d => d.frecuencia).filter(v => !isNaN(v));
        if (!values.length) return;
        const min = Math.min(...values), max = Math.max(...values);
        const range = max - min;
        const rangeVal = document.getElementById('rangeValue');
        if (rangeVal) rangeVal.textContent = range.toFixed(4);
        const rangeInfo = document.getElementById('rangeInfo');
        if (rangeInfo) rangeInfo.textContent = `${this.safeToFixed(min)}-${this.safeToFixed(max)}`;
        if (values.length > 1) {
            const mean = values.reduce((a,b)=>a+b,0)/values.length;
            const variance = values.reduce((a,b)=>a+Math.pow(b-mean,2),0)/values.length;
            const cv = (Math.sqrt(variance)/mean)*100;
            const varVal = document.getElementById('variabilityValue');
            if (varVal) varVal.textContent = cv.toFixed(2)+'%';
            const varBadge = document.getElementById('variabilityBadge');
            if (varBadge) {
                varBadge.textContent = cv < 10 ? 'BAJA' : cv < 30 ? 'MEDIA' : 'ALTA';
                varBadge.style.backgroundColor = cv < 10 ? '#10b981' : cv < 30 ? '#f59e0b' : '#ef4444';
            }
        }
        const series = {};
        this.data.forEach(d => {
            if (!series[d.combinationKey]) series[d.combinationKey] = { label: d.combinationLabel, vals: [] };
            series[d.combinationKey].vals.push(d.frecuencia);
        });
        let worstKey = null, worstAvg = -Infinity;
        Object.entries(series).forEach(([k, v]) => {
            const avg = v.vals.reduce((a,b)=>a+b,0)/v.vals.length;
            if (avg > worstAvg) { worstAvg = avg; worstKey = k; }
        });
        if (worstKey) {
            const ws = document.getElementById('worstSeries');
            if (ws) ws.textContent = series[worstKey].label;
            const wv = document.getElementById('worstValue');
            if (wv) wv.textContent = worstAvg.toFixed(4);
        }
    }
    
    updateComparisonTags() {
        const cont = document.getElementById('comparisonTags');
        if (!cont) return;
        cont.innerHTML = '';
        const tipos = this.getSelectedValues('filterTipoMedicion');
        const alims = this.getSelectedValues('filterTransformador');
        const años = this.getSelectedValues('filterYear');
        tipos.filter(t=>t!=='all').forEach(t => cont.appendChild(this.createTag('Tipo: '+t, 'tipo')));
        alims.filter(a=>a).forEach(a => cont.appendChild(this.createTag('Alim: '+a, 'alimentador')));
        años.filter(a=>a!=='all').forEach(a => cont.appendChild(this.createTag('Año: '+a, 'año')));
        if (!cont.children.length) cont.appendChild(this.createTag('Selecciona filtros para comparar', 'hint'));
    }
    createTag(text, cls) {
        const span = document.createElement('span');
        span.className = `tag ${cls}`;
        span.textContent = text;
        return span;
    }
    
    // ========== GRÁFICOS ==========
    updateCharts() {
        if (!this.data.length) { this.clearChartsAndTable(); return; }
        this.updateMainChart();
        this.updateRankingChart();
    }
    
    updateMainChart() {
        if (!this.mainChart) return;
        const grouped = this.groupDataForChart();
        const datasets = [];
        const labelsSet = new Set();
        Object.entries(grouped).forEach(([key, pts], idx) => {
            pts.sort((a,b)=> a.year!==b.year ? a.year-b.year : a.month-b.month);
            pts.forEach(p => labelsSet.add(`${p.year}-${String(p.month).padStart(2,'0')}`));
            datasets.push({
                label: key,
                data: [],
                borderColor: this.chartPalette[idx % this.chartPalette.length],
                backgroundColor: this.chartPalette[idx % this.chartPalette.length] + '20',
                borderWidth: 2.5,
                tension: 0.2,
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBorderWidth: 2,
                pointHoverBackgroundColor: '#fff'
            });
        });
        const labels = Array.from(labelsSet).sort();
        datasets.forEach(ds => {
            const pts = grouped[ds.label];
            labels.forEach(lbl => {
                const [y,m] = lbl.split('-').map(Number);
                const p = pts.find(p => p.year===y && p.month===m);
                ds.data.push(p ? p.frecuencia : null);
            });
        });
        this.mainChart.data.labels = labels;
        this.mainChart.data.datasets = datasets;
        const chartType = document.getElementById('chartType')?.value || 'line';
        this.mainChart.config.type = chartType;
        if (chartType === 'bar') {
            this.mainChart.data.datasets.forEach(ds => { ds.fill = false; ds.borderWidth = 1; ds.borderRadius = 4; });
        } else if (chartType === 'scatter') {
            this.mainChart.data.datasets.forEach(ds => { ds.showLine = false; ds.pointRadius = 5; ds.pointHoverRadius = 8; });
        } else {
            this.mainChart.data.datasets.forEach(ds => { ds.showLine = true; ds.pointRadius = 0; });
        }
        this.mainChart.update();
        this.updateChartLegend();
    }
    
    groupDataForChart() {
        const g = {};
        this.data.forEach(d => {
            let key;
            switch(this.groupBy) {
                case 'alimentador': key = d.transformador; break;
                case 'year': key = d.year.toString(); break;
                case 'tipo': key = d.tipo; break;
                case 'combinado': key = d.combinationLabel; break;
                default: key = d.combinationKey;
            }
            if (!g[key]) g[key] = [];
            g[key].push({ year: d.year, month: d.month, frecuencia: d.frecuencia });
        });
        return g;
    }
    
    updateChartLegend() {
        const leg = document.getElementById('mainChartLegend');
        if (!leg) return;
        if (!this.mainChart?.data.datasets?.length) { leg.innerHTML = '<div class="legend-empty">Sin datos</div>'; return; }
        let html = '<div class="legend-title">Series:</div>';
        this.mainChart.data.datasets.forEach((ds,i) => {
            const hidden = this.mainChart.getDatasetMeta(i).hidden === true;
            html += `<div class="legend-item ${hidden?'hidden':''}" data-index="${i}">
                        <span class="legend-color" style="background:${ds.borderColor}"></span>
                        <span class="legend-text">${ds.label}</span>
                        <span class="legend-action"><i class="fas fa-eye${hidden?'-slash':''}"></i></span>
                    </div>`;
        });
        leg.innerHTML = html;
        leg.querySelectorAll('.legend-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.legend-action')) {
                    const idx = parseInt(el.dataset.index);
                    const meta = this.mainChart.getDatasetMeta(idx);
                    meta.hidden = meta.hidden === null ? true : null;
                    this.mainChart.update();
                    this.updateChartLegend();
                }
            });
        });
    }
    
    updateRankingChart() {
        if (!this.rankingChart || !this.data.length) { if (this.rankingChart) this.showNoDataMessage(this.rankingChart, 'rankingChart'); return; }
        const series = {};
        this.data.forEach(d => {
            const key = d.combinationLabel;
            if (!series[key]) series[key] = [];
            series[key].push(d.frecuencia);
        });
        let ranking = Object.entries(series).map(([lbl, vals]) => {
            const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            const last = vals[vals.length-1];
            return { label: lbl, avg, range: max-min, last, values: vals };
        });
        const sortBy = document.getElementById('rankingSort')?.value || 'avg';
        ranking.sort((a,b) => {
            if (sortBy === 'stability') return a.range - b.range;
            if (sortBy === 'trend') return b.last - a.last;
            return b.avg - a.avg;
        });
        const top = ranking.slice(0, 10);
        this.rankingChart.data.labels = top.map(t => t.label);
        this.rankingChart.data.datasets[0].data = top.map(t => t.avg);
        this.rankingChart.data.datasets[0].backgroundColor = top.map((_,i) => this.chartPalette[i%this.chartPalette.length] + '80');
        this.rankingChart.data.datasets[0].borderColor = top.map((_,i) => this.chartPalette[i%this.chartPalette.length]);
        this.rankingChart.update();
    }
    
    updateScatterChart() {
        if (!this.scatterChart || !this.data.length) { if (this.scatterChart) this.showNoDataMessage(this.scatterChart, 'scatterChart'); return; }
        const feeders = [...new Set(this.data.map(d=>d.transformador))];
        const datasets = feeders.map((f, i) => ({
            label: f,
            data: this.data.filter(d=>d.transformador===f).map(d=>({ x: new Date(d.fecha), y: d.frecuencia })),
            backgroundColor: this.chartPalette[i%this.chartPalette.length]+'80',
            borderColor: this.chartPalette[i%this.chartPalette.length],
            borderWidth: 1.5,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointHoverBorderWidth: 2,
            pointHoverBackgroundColor: '#fff'
        }));
        this.scatterChart.data.datasets = datasets;
        this.scatterChart.update();
    }
    
    updatePieCharts() {
        if (!this.data.length) {
            if (this.pieChartByFeeder) this.showNoDataMessage(this.pieChartByFeeder, 'pieChartFeeder');
            if (this.pieChartByType) this.showNoDataMessage(this.pieChartByType, 'pieChartType');
            return;
        }
        const feederData = {};
        this.data.forEach(d => feederData[d.transformador] = (feederData[d.transformador] || 0) + d.frecuencia);
        const feederLabels = Object.keys(feederData);
        const feederValues = Object.values(feederData);
        if (this.pieChartByFeeder) {
            this.pieChartByFeeder.data.labels = feederLabels;
            this.pieChartByFeeder.data.datasets[0].data = feederValues;
            this.pieChartByFeeder.data.datasets[0].backgroundColor = feederLabels.map((_,i) => this.chartPalette[i%this.chartPalette.length]);
            this.pieChartByFeeder.update();
        }
        const typeData = {};
        this.data.forEach(d => typeData[d.tipo] = (typeData[d.tipo] || 0) + d.frecuencia);
        const typeLabels = Object.keys(typeData);
        const typeValues = Object.values(typeData);
        if (this.pieChartByType) {
            this.pieChartByType.data.labels = typeLabels;
            this.pieChartByType.data.datasets[0].data = typeValues;
            this.pieChartByType.data.datasets[0].backgroundColor = typeLabels.map((_,i) => this.chartPalette[(i+5)%this.chartPalette.length]);
            this.pieChartByType.update();
        }
    }
    
    updateStationSummary() {
        if (!this.stationSummaryChart) return;
        // Determinar el grupo de estación actual: si se seleccionó "Todos de estación" en el modo station,
        // pero también podemos detectar si todos los alimentadores seleccionados pertenecen a la misma estación.
        const selectedFeeders = this.getSelectedValues('filterTransformador');
        if (selectedFeeders.length === 0) {
            const container = document.getElementById('stationSummaryContainer');
            if (container) container.style.display = 'none';
            return;
        }
        // Verificar si todos los seleccionados comparten el mismo prefijo de estación
        const prefixes = new Set(selectedFeeders.map(f => f.substring(0,3)));
        if (prefixes.size !== 1) {
            const container = document.getElementById('stationSummaryContainer');
            if (container) container.style.display = 'none';
            return;
        }
        const estacion = Array.from(prefixes)[0];
        this.currentStationGroup = estacion;
        
        const container = document.getElementById('stationSummaryContainer');
        if (container) container.style.display = 'block';
        const stationName = document.getElementById('stationName');
        if (stationName) stationName.textContent = this.currentStationGroup;
        
        const stationData = this.data.filter(d => d.transformador.startsWith(this.currentStationGroup));
        if (!stationData.length) { this.showNoDataMessage(this.stationSummaryChart, 'stationSummaryChart'); return; }
        const feederAvg = {};
        stationData.forEach(d => {
            if (!feederAvg[d.transformador]) feederAvg[d.transformador] = { sum: 0, count: 0 };
            feederAvg[d.transformador].sum += d.frecuencia;
            feederAvg[d.transformador].count += 1;
        });
        const labels = Object.keys(feederAvg);
        const avgs = labels.map(l => feederAvg[l].sum / feederAvg[l].count);
        this.stationSummaryChart.data.labels = labels;
        this.stationSummaryChart.data.datasets[0].data = avgs;
        this.stationSummaryChart.data.datasets[0].backgroundColor = labels.map((_,i) => this.chartPalette[i%this.chartPalette.length]);
        this.stationSummaryChart.update();
    }
    
    // ========== CONTROLES DE GRÁFICOS ==========
    onChartTypeChange() { this.updateMainChart(); }
    toggleChartPoints() {
        if (!this.mainChart) return;
        const show = this.mainChart.data.datasets[0]?.pointRadius === 0;
        this.mainChart.data.datasets.forEach(ds => { ds.pointRadius = show ? 5 : 0; ds.pointHoverRadius = show ? 8 : 6; });
        this.mainChart.update();
    }
    zoomChart(dir) {
        if (!this.mainChart) return;
        const scale = dir === 'in' ? 0.8 : 1.2;
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
        this.groupBy = document.getElementById('groupBy')?.value || 'alimentador';
        this.updateCharts();
    }
    
    // ========== EXPANDIR GRÁFICOS ==========
    expandChart() {
        const chartData = {
            mainChart: {
                labels: this.mainChart?.data.labels || [],
                datasets: (this.mainChart?.data.datasets || []).map(ds => ({
                    label: ds.label,
                    data: ds.data,
                    borderColor: ds.borderColor,
                    backgroundColor: ds.backgroundColor
                }))
            },
            rankingChart: {
                labels: this.rankingChart?.data.labels || [],
                data: this.rankingChart?.data.datasets[0]?.data || [],
                colors: this.rankingChart?.data.datasets[0]?.backgroundColor || []
            },
            scatterChart: {
                datasets: this.scatterChart?.data.datasets || []
            },
            pieFeeder: {
                labels: this.pieChartByFeeder?.data.labels || [],
                data: this.pieChartByFeeder?.data.datasets[0]?.data || [],
                colors: this.pieChartByFeeder?.data.datasets[0]?.backgroundColor || []
            },
            pieType: {
                labels: this.pieChartByType?.data.labels || [],
                data: this.pieChartByType?.data.datasets[0]?.data || [],
                colors: this.pieChartByType?.data.datasets[0]?.backgroundColor || []
            },
            stationSummary: {
                labels: this.stationSummaryChart?.data.labels || [],
                data: this.stationSummaryChart?.data.datasets[0]?.data || [],
                colors: this.stationSummaryChart?.data.datasets[0]?.backgroundColor || [],
                stationName: this.currentStationGroup || ''
            },
            seriesCount: this.mainChart?.data.datasets?.length || 0,
            dataPoints: this.data.length,
            periodRange: this.getPeriodRange(),
            palette: this.chartPalette
        };
        localStorage.setItem('ande_chart_data', JSON.stringify(chartData));
        window.open('chart.html', '_blank', 'width=1400,height=900');
    }
    
    getPeriodRange() {
        if (!this.data.length) return 'N/A';
        const dates = this.data.map(d => new Date(d.fecha));
        const min = new Date(Math.min(...dates)), max = new Date(Math.max(...dates));
        return `${min.toLocaleDateString('es-ES',{year:'numeric',month:'short'})} - ${max.toLocaleDateString('es-ES',{year:'numeric',month:'short'})}`;
    }
    
    // ========== TABLA ==========
    updateTable() {
        const tbody = document.getElementById('dataTable');
        if (!tbody) return;
        if (!this.filteredData.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="no-data"><i class="fas fa-database"></i> No hay datos para mostrar</td></tr>`;
            this.updatePaginationControls(0,0,0);
            return;
        }
        const total = this.filteredData.length;
        const perPage = parseInt(document.getElementById('rowsPerPage')?.value) || 25;
        this.pagination.totalPages = Math.ceil(total / perPage);
        if (this.pagination.currentPage > this.pagination.totalPages) this.pagination.currentPage = this.pagination.totalPages || 1;
        const start = (this.pagination.currentPage - 1) * perPage;
        const end = Math.min(start + perPage, total);
        const pageData = this.filteredData.slice(start, end);
        let html = '';
        pageData.forEach((row, i) => {
            const idx = start + i + 1;
            html += `<tr>
                <td>${idx}</td>
                <td>${row.transformador || 'N/A'}</td>
                <td>${row.year || 'N/A'}</td>
                <td>${row.tipo || 'N/A'}</td>
                <td>${row.fecha || 'N/A'}</td>
                <td>${this.safeToFixed(row.frecuencia)}</td>
                <td><span class="status-badge ${this.getStatusClass(row.frecuencia)}">${this.getStatusText(row.frecuencia)}</span></td>
                <td><button class="btn-icon small" onclick="dashboard.viewDetails(${JSON.stringify(row).replace(/"/g,'&quot;')})" title="Ver detalles"><i class="fas fa-eye"></i></button></td>
            </tr>`;
        });
        tbody.innerHTML = html;
        this.updatePaginationControls(start, end, total);
    }
    
    updatePaginationControls(start, end, total) {
        const ids = ['rowsShownStart','rowsShownEnd','rowsTotal','currentPage'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (id === 'rowsShownStart') el.textContent = total > 0 ? start+1 : 0;
            else if (id === 'rowsShownEnd') el.textContent = end;
            else if (id === 'rowsTotal') el.textContent = total;
            else if (id === 'currentPage') el.textContent = this.pagination.currentPage;
        });
        ['firstPage','prevPage'].forEach(id => { const el=document.getElementById(id); if(el) el.disabled = this.pagination.currentPage === 1; });
        ['nextPage','lastPage'].forEach(id => { const el=document.getElementById(id); if(el) el.disabled = this.pagination.currentPage === this.pagination.totalPages; });
    }
    
    goToPage(p) {
        if (p < 1 || p > this.pagination.totalPages) return;
        this.pagination.currentPage = p;
        this.updateTable();
        document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    sortTable(col) {
        if (this.sortConfig.column === col) this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        else { this.sortConfig.column = col; this.sortConfig.direction = 'asc'; }
        this.filteredData.sort((a,b) => {
            let av = a[col], bv = b[col];
            if (col === 'fecha') { av = new Date(av); bv = new Date(bv); }
            else if (col === 'valor') { av = parseFloat(av) || 0; bv = parseFloat(bv) || 0; }
            if (av < bv) return this.sortConfig.direction === 'asc' ? -1 : 1;
            if (av > bv) return this.sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        this.updateTable();
        this.updateSortIcons(col);
    }
    
    updateSortIcons(col) {
        document.querySelectorAll('th[data-sort]').forEach(th => {
            const icon = th.querySelector('i');
            if (icon) icon.className = th.dataset.sort === col ? (this.sortConfig.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down') : 'fas fa-sort';
        });
    }
    
    filterTable(term) {
        if (!term?.trim()) this.filteredData = [...this.data];
        else {
            const t = term.toLowerCase().trim();
            this.filteredData = this.data.filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(t)));
        }
        this.pagination.currentPage = 1;
        this.updateTable();
    }
    
    getStatusClass(v) { return v == null || isNaN(v) ? 'unknown' : v < 0.5 ? 'good' : v < 1.0 ? 'warning' : 'critical'; }
    getStatusText(v) { return v == null || isNaN(v) ? 'DESCONOCIDO' : v < 0.5 ? 'NORMAL' : v < 1.0 ? 'ALERTA' : 'CRÍTICO'; }
    
    viewDetails(d) {
        const modal = document.getElementById('modalBody');
        if (!modal) return;
        modal.innerHTML = `
            <div class="detail-row"><span class="detail-label">Alimentador:</span><span class="detail-value">${d.transformador||'N/A'}</span></div>
            <div class="detail-row"><span class="detail-label">Fecha:</span><span class="detail-value">${d.fecha||'N/A'}</span></div>
            <div class="detail-row"><span class="detail-label">Tipo:</span><span class="detail-value">${d.tipo||'N/A'}</span></div>
            <div class="detail-row"><span class="detail-label">Departamento:</span><span class="detail-value">${d.departamento||'N/A'}</span></div>
            <div class="detail-row"><span class="detail-label">Valor:</span><span class="detail-value highlight">${this.safeToFixed(d.frecuencia)}</span></div>
            <div class="detail-row"><span class="detail-label">Estado:</span><span class="detail-value status-badge ${this.getStatusClass(d.frecuencia)}">${this.getStatusText(d.frecuencia)}</span></div>
        `;
        const modalWin = document.getElementById('seriesModal');
        if (modalWin) modalWin.style.display = 'flex';
    }
    
    // ========== EXCEL Y CARGAS ==========
    async uploadExcel() {
        const file = document.getElementById('excelFileInput')?.files[0];
        if (!file) { this.showNotification("Selecciona un archivo Excel", "warning"); return; }
        const formData = new FormData();
        formData.append('archivo', file);
        this.showLoading(true, "Subiendo Excel...", null);
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/subir-excel`, { method: 'POST', body: formData });
            const result = await res.json();
            if (res.ok) {
                this.showNotification(`✅ ${result.insertadas} filas insertadas, ${result.errores} errores`, "success");
                setTimeout(async () => {
                    await this.loadTiposMedicion(); await this.loadSeccionesDisponibles();
                    await this.loadYearsAvailable(); await this.loadData(); await this.loadCargas();
                }, 1000);
            } else throw new Error(result.error);
        } catch (e) {
            this.showNotification(`Error: ${e.message}`, "error");
        } finally {
            this.showLoading(false);
            document.getElementById('excelFileInput').value = '';
        }
    }
    
    async loadCargas() {
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/cargas`);
            const cargas = await res.json();
            this.renderCargas(cargas);
            await this.loadEstadisticas();
        } catch (e) { console.error("Error cargando cargas:", e); }
    }
    
    renderCargas(cargas) {
        const cont = document.getElementById('cargasContainer');
        if (!cont) return;
        if (!cargas.length) {
            cont.innerHTML = `<div style="text-align:center;padding:2rem;"><i class="fas fa-inbox fa-2x"></i><p>No hay cargas registradas</p></div>`;
            return;
        }
        let html = `<div class="cargas-table"><table><thead><tr><th>Archivo</th><th>Fecha</th><th>Insertadas</th><th>Errores</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>`;
        cargas.forEach(c => {
            const fecha = new Date(c.fecha_carga).toLocaleString('es-ES');
            const estadoClass = c.estado === 'completado' ? 'success' : c.estado === 'procesando' ? 'warning' : 'error';
            html += `<tr>
                <td><i class="fas fa-file-excel" style="color:#2e7d32;"></i> ${c.nombre_archivo}</td>
                <td>${fecha}</td>
                <td><span class="badge ${c.insertadas>0?'success':'secondary'}">${c.insertadas}</span></td>
                <td><span class="badge ${c.errores>0?'danger':'secondary'}">${c.errores}</span></td>
                <td><span class="status ${estadoClass}"><i class="fas fa-circle"></i> ${c.estado}</span></td>
                <td><button class="btn-icon small" onclick="dashboard.eliminarCarga(${c.id})" title="Eliminar"><i class="fas fa-trash"></i></button></td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
        cont.innerHTML = html;
        const total = document.getElementById('totalCargas');
        if (total) total.textContent = cargas.length;
        const completadas = document.getElementById('cargasCompletadas');
        if (completadas) completadas.textContent = cargas.filter(c=>c.estado==='completado').length;
        const conErrores = document.getElementById('cargasConErrores');
        if (conErrores) conErrores.textContent = cargas.filter(c=>c.errores>0).length;
    }
    
    async eliminarCarga(id) {
        if (!confirm("¿Eliminar esta carga y sus datos?")) return;
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/cargas/${id}`, { method: 'DELETE' });
            const result = await res.json();
            if (res.ok) {
                this.showNotification(`Carga eliminada (${result.filas_eliminadas} filas)`, "success");
                setTimeout(async () => { await this.loadCargas(); await this.loadData(); }, 1000);
            } else throw new Error(result.error);
        } catch (e) {
            this.showNotification(`Error al eliminar: ${e.message}`, "error");
        }
    }
    
    async loadEstadisticas() {
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/estadisticas`);
            const stats = await res.json();
            const el = document.getElementById('totalDatosGlobal');
            if (el) el.textContent = stats.total_datos.toLocaleString();
        } catch (e) {}
    }
    
    // ========== SIDEBAR ==========
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const main = document.querySelector('.main-content');
        if (sidebar && main) {
            sidebar.classList.toggle('active');
            main.classList.toggle('expanded');
            const btn = document.getElementById('sidebarToggle');
            if (btn) {
                const icon = btn.querySelector('i');
                const text = btn.querySelector('.btn-text');
                if (sidebar.classList.contains('active')) {
                    if (icon) icon.className = 'fas fa-times';
                    if (text) text.textContent = 'Cerrar';
                } else {
                    if (icon) icon.className = 'fas fa-filter';
                    if (text) text.textContent = 'Filtros';
                }
            }
        }
    }
    
    startLiveUpdates() {
        setInterval(() => { if (this.serverConnected) { this.loadData(); this.loadCargas(); } }, 300000);
    }
    
    formatValue(v) {
        if (v === null || v === undefined || isNaN(v)) return '';
        if (v >= 1e6) return (v/1e6).toFixed(2) + 'M';
        if (v >= 1e3) return (v/1e3).toFixed(1) + 'k';
        if (Math.abs(v) < 0.001) return v.toExponential(2);
        if (Math.abs(v) < 1) return v.toFixed(4);
        if (Math.abs(v) < 10) return v.toFixed(3);
        return v.toFixed(2);
    }
}

// ========== GLOBAL INIT ==========
function initializeDashboard() {
    try {
        window.dashboard = new ANDEDashboard();
        const modalClose = document.getElementById('modalClose');
        const seriesModal = document.getElementById('seriesModal');
        if (modalClose && seriesModal) {
            modalClose.addEventListener('click', () => seriesModal.style.display = 'none');
            seriesModal.addEventListener('click', (e) => { if (e.target === seriesModal) seriesModal.style.display = 'none'; });
        }
        setTimeout(() => window.dashboard.initialize(), 500);
    } catch (e) {
        console.error("❌ Error crítico:", e);
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.innerHTML = `
                <div class="loader-card">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3.8rem; color: #f59e0b; margin-bottom: 1.2rem;"></i>
                    <p class="loading-text" style="color: white;">Error al cargar la aplicación</p>
                    <p style="color: #cbd5e1; margin-bottom: 1.8rem;">${e.message || 'Intenta recargar la página.'}</p>
                    <button onclick="location.reload()" class="btn-retry">
                        <i class="fas fa-sync-alt"></i> Recargar página
                    </button>
                </div>
            `;
        }
    }
}

function checkRequiredElements() {
    const required = ['globalModeUnique','globalModeMultiple','filterPeriodo','filterEstacion','applyFilters','filterTipoMedicion','filterTransformador','filterYear','mainChart'];
    return required.filter(id => !document.getElementById(id));
}

document.addEventListener('DOMContentLoaded', () => {
    const missing = checkRequiredElements();
    if (missing.length) {
        console.warn("Elementos faltantes:", missing);
        setTimeout(() => {
            if (checkRequiredElements().length === 0) initializeDashboard();
            else {
                const overlay = document.getElementById('loadingOverlay');
                if (overlay) {
                    overlay.innerHTML = `
                        <div class="loader-card">
                            <i class="fas fa-exclamation-triangle" style="font-size: 3.8rem; color: #f59e0b; margin-bottom: 1.2rem;"></i>
                            <p class="loading-text" style="color: white;">Error de estructura</p>
                            <p style="color: #cbd5e1; margin-bottom: 1.8rem;">No se encontraron algunos elementos necesarios.</p>
                            <button onclick="location.reload()" class="btn-retry">
                                <i class="fas fa-sync-alt"></i> Recargar página
                            </button>
                        </div>
                    `;
                }
            }
        }, 500);
    } else initializeDashboard();
});
window.addEventListener('load', () => { if (!window.dashboard) setTimeout(initializeDashboard, 1000); });
window.dashboard = null;