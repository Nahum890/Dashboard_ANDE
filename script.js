// script.js - VERSIÓN 6.2 - HD + ANIMACIONES (CORREGIDO - Sin error this._fn)
console.log("🚀 Dashboard ANDE v6.2 iniciando (HD + Animaciones CORREGIDAS)...");

class ANDEDashboard {
    constructor() {
        console.log("🔧 Constructor llamado");
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
        this.latestRankingData = [];
        this.rankingItems = [];
        
        this.chartPalette = [
            '#FF6B6B', '#4ECDC4', '#FFD166', '#06D6A0', '#118AB2', 
            '#EF476F', '#7B68EE', '#20B2AA', '#FF8C00', '#9ACD32',
            '#DA70D6', '#00CED1', '#FF6347', '#4682B4', '#DAA520',
            '#CD5C5C', '#40E0D0', '#EE82EE', '#F4A460', '#5F9EA0'
        ];
        
        this.allSecciones = [];
        this.estaciones = [];
        
        this.defaultFilters = {
            tipoMedicion: ['TOTAL FEP'],
            transformador: [],
            year: [],
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
        this.isLoadingData = false;
        this.liveUpdatesIntervalId = null;
        
        // ---------- PROPIEDADES PARA FILTRO INTELIGENTE ----------
        this.selectionMode = 'compare_stations';
        this.currentStationFilter = '';
        this.currentStationCompare = '';
        this.selectedStations = [];
        this.fepDepRequestId = 0;
        
        // ---------- DEBOUNCE ----------
        this.loadDataDebounced = this.debounce(this.loadData.bind(this), 500);
        
        // ---------- CONFIGURACIÓN DE ANIMACIONES ----------
        this.animationConfig = {
            duration: 800,
            easing: 'easeInOutQuart',
            delay: 50
        };
    }
    
    // ========== DEBOUNCE ==========
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            console.log(`⏱️ Debounce: llamada a ${func.name} dentro de ${wait}ms`);
            const later = () => {
                console.log(`⏱️ Ejecutando ${func.name} después del debounce`);
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
        if (el) { 
            console.log(`🔗 Agregando listener para ${elementId} (${eventType})`);
            el.addEventListener(eventType, callback); 
            return true; 
        }
        if (elementId !== 'filterPeriodo' && elementId !== 'monthModeGroup') {
            console.warn(`⚠️ Elemento '${elementId}' no encontrado`);
        }
        return false;
    }


    resolveSeccionParam(selectedFeed = []) {
        const normalized = Array.isArray(selectedFeed)
            ? selectedFeed.map(v => String(v || '').trim()).filter(Boolean)
            : [];

        const unique = Array.from(new Set(normalized));
        const totalFeeders = Array.isArray(this.allSecciones) ? this.allSecciones.length : 0;
        const allSelected = totalFeeders > 0 && unique.length >= totalFeeders;

        if (!unique.length || allSelected) return 'all';

        const joined = unique.join(',');
        // Evitar URLs enormes que provocan fallos de red en navegador/proxy
        if (joined.length > 1200) return 'all';
        return joined;
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
    
    showErrorInOverlay(message, retryCallback) {
        const overlay = document.getElementById('loadingOverlay');
        const loaderCard = document.getElementById('loaderCard');
        if (!overlay || !loaderCard) return;
        
        loaderCard.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="font-size: 3.8rem; color: #f59e0b; margin-bottom: 1.2rem;"></i>
            <p class="loading-text" style="color: white; margin-bottom: 0.5rem;">Oops, algo salió mal</p>
            <p style="color: #cbd5e1; font-size: 1rem; margin-bottom: 1.8rem;">${message}</p>
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
        console.log("🔍 Verificando servidor...");
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/health`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.serverConnected = true;
            console.log("✅ Servidor conectado");
            return true;
        } catch (e) {
            this.serverConnected = false;
            console.error("❌ Error de conexión:", e);
            this.showErrorInOverlay(
                "No se pudo conectar al servidor. Verifica que esté ejecutándose en el puerto 10000.",
                () => this.initialize()
            );
            return false;
        }
    }
    
    async verificarEstadoBD() {
        console.log("🔍 Verificando base de datos...");
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/verificar-datos`);
            const data = await res.json();
            console.log("📊 Estado BD:", data);
            if (!data.tabla_existe || data.total_registros === 0) {
                this.showNotification("Base de datos vacía. Sube un archivo Excel para comenzar.", "warning");
                return true;
            }
            return true;
        } catch {
            console.warn("⚠️ No se pudo verificar BD, se continuará con datos de ejemplo si es necesario.");
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
            this.showLoading(true, "Inicializando gráficos HD...", 50);
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
            this.showNotification("Dashboard cargado correctamente ✨", "success");
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
    
    // ========== CONFIGURACIÓN GLOBAL DE ANIMACIONES ==========
    getAnimationConfig() {
        return {
            duration: this.animationConfig.duration,
            easing: this.animationConfig.easing,
            delay: this.animationConfig.delay,
            loop: false,
            onProgress: null,
            onComplete: null
        };
    }
    
    // ========== INICIALIZACIÓN DE GRÁFICOS CON HD Y ANIMACIONES ==========
    initCharts() {
        console.log("📊 Inicializando gráficos HD con animaciones...");
        
        // Configuración global de Chart.js para ALTA CALIDAD
        Chart.defaults.font.family = "'Inter', 'Segoe UI', system-ui, sans-serif";
        Chart.defaults.font.size = 12;
        Chart.defaults.color = '#334155';
        Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15,23,42,0.95)';
        Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
        Chart.defaults.plugins.tooltip.bodyColor = '#cbd5e1';
        Chart.defaults.plugins.tooltip.borderColor = '#60a5fa';
        Chart.defaults.plugins.tooltip.borderWidth = 2;
        Chart.defaults.responsive = true;
        Chart.defaults.maintainAspectRatio = true;
        
        // ✨ ALTA DEFINICIÓN: Aumentar devicePixelRatio para gráficos más nítidos
        Chart.defaults.devicePixelRatio = Math.max(window.devicePixelRatio || 2, 3);
        
        Chart.defaults.animation.duration = 800;
        Chart.defaults.animation.easing = 'easeInOutQuart';
        
        // Configuración de transiciones suaves
        Chart.defaults.transitions = {
            resize: {
                animation: {
                    duration: 500
                }
            }
        };
        
        this.initMainChart();
        this.initRankingChart();
        this.initScatterChart();
        this.initPieCharts();
        this.initStationSummaryChart();
    }
    
    initMainChart() {
        const canvas = document.getElementById('mainChart');
        if (!canvas) {
            console.error("❌ Canvas 'mainChart' no encontrado");
            return;
        }
        console.log("📈 Inicializando mainChart HD");
        const ctx = canvas.getContext('2d');
        
        // Limpiar canvas con fondo blanco nítido
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        this.mainChart = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2,
                devicePixelRatio: Math.max(window.devicePixelRatio || 2, 3),
                
                animation: {
                    duration: 800,
                    easing: 'easeInOutQuart'
                },
                
                plugins: {
                    legend: { display: false },
                    tooltip: { 
                        mode: 'index', 
                        intersect: false,
                        backgroundColor: 'rgba(15,23,42,0.98)',
                        titleColor: '#ffffff',
                        bodyColor: '#cbd5e1',
                        borderColor: '#60a5fa',
                        borderWidth: 2,
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: {
                            size: 13,
                            weight: 'bold'
                        },
                        bodyFont: {
                            size: 12
                        },
                        animation: {
                            duration: 200
                        }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: false,
                        grid: { 
                            color: 'rgba(148,163,184,0.15)',
                            lineWidth: 1
                        },
                        ticks: { 
                            color: '#334155', 
                            font: { size: 11, weight: '500' },
                            callback: (v) => this.formatValue(v),
                            padding: 8
                        }
                    },
                    x: { 
                        grid: { 
                            color: 'rgba(148,163,184,0.1)',
                            lineWidth: 1
                        },
                        ticks: { 
                            color: '#334155', 
                            font: { size: 11, weight: '500' },
                            maxRotation: 45, 
                            minRotation: 30,
                            padding: 8
                        }
                    }
                },
                interaction: { 
                    mode: 'index', 
                    intersect: false,
                    animateRotate: true,
                    animateScale: true
                },
                elements: {
                    line: { 
                        borderWidth: 2.5, 
                        tension: 0.2,
                        borderCapStyle: 'round',
                        borderJoinStyle: 'round'
                    },
                    point: { 
                        radius: 0, 
                        hoverRadius: 7, 
                        borderWidth: 2,
                        hoverBorderWidth: 3,
                        hitRadius: 10
                    }
                }
            }
        });
        console.log("✅ Gráfico principal HD inicializado");
    }
    
    initRankingChart() {
        const canvas = document.getElementById('rankingChart');
        if (!canvas) {
            console.error("❌ Canvas 'rankingChart' no encontrado");
            return;
        }
        console.log("📊 Inicializando rankingChart HD");
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        this.rankingChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: [], datasets: [{
                label: 'Promedio', 
                data: [], 
                backgroundColor: [], 
                borderColor: [], 
                borderWidth: 1.5, 
                borderRadius: 6,
                borderSkipped: false
            }] },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 1.5,
                devicePixelRatio: Math.max(window.devicePixelRatio || 2, 3),
                
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                },
                
                plugins: { 
                    legend: { display: false },
                    tooltip: { 
                        callbacks: { 
                            label: (ctx) => `Promedio: ${this.formatValue(ctx.raw)}` 
                        },
                        backgroundColor: 'rgba(15,23,42,0.98)',
                        padding: 10,
                        cornerRadius: 6,
                        animation: {
                            duration: 150
                        }
                    }
                },
                scales: {
                    x: { 
                        grid: { 
                            color: 'rgba(148,163,184,0.15)',
                            lineWidth: 1
                        },
                        ticks: { 
                            color: '#334155', 
                            font: { size: 11, weight: '500' },
                            callback: (v) => this.formatValue(v),
                            padding: 6
                        }
                    },
                    y: { 
                        grid: { display: false },
                        ticks: { 
                            color: '#334155', 
                            font: { size: 11, weight: '600' },
                            padding: 10
                        }
                    }
                }
            }
        });
        console.log("✅ Gráfico de ranking HD inicializado");
    }
    
    initScatterChart() {
        const canvas = document.getElementById('scatterChart');
        if (!canvas) {
            console.error("❌ Canvas 'scatterChart' no encontrado");
            return;
        }
        console.log("📉 Inicializando scatterChart HD");
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        this.scatterChart = new Chart(ctx, {
            type: 'scatter',
            data: { datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2,
                devicePixelRatio: Math.max(window.devicePixelRatio || 2, 3),
                
                // ✨ ANIMACIONES DE DISPERSIÓN (Corregido)
                animation: {
                    duration: 1000,
                    easing: 'easeInOutQuart'
                },
                
                plugins: { 
                    legend: { 
                        position: 'top', 
                        labels: { 
                            color: '#334155', 
                            font: { size: 12, weight: '500' },
                            padding: 15,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        } 
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                return `${ctx.dataset.label}: ${this.formatValue(ctx.parsed.y)}`;
                            }
                        },
                        backgroundColor: 'rgba(15,23,42,0.98)',
                        padding: 12,
                        cornerRadius: 8
                    }
                },
                scales: {
                    x: {
                        type: 'category',
                        grid: {
                            color: 'rgba(148,163,184,0.15)',
                            lineWidth: 1
                        },
                        ticks: {
                            color: '#334155',
                            font: { size: 11, weight: '500' },
                            padding: 8
                        }
                    },
                    y: { 
                        grid: { 
                            color: 'rgba(148,163,184,0.15)',
                            lineWidth: 1
                        },
                        ticks: { 
                            color: '#334155', 
                            font: { size: 11, weight: '500' },
                            callback: (v) => this.formatValue(v),
                            padding: 8
                        }
                    }
                },
                elements: {
                    point: { 
                        radius: 5, 
                        hoverRadius: 8, 
                        borderWidth: 2,
                        backgroundColor: 'rgba(255,255,255,0.9)',
                        borderColor: '#ffffff',
                        hoverBorderWidth: 3
                    }
                }
            }
        });
        console.log("✅ Gráfico de dispersión HD inicializado");
    }
    
    initPieCharts() {
        console.log("🥧 Inicializando gráficos de pastel HD");
        const canvas1 = document.getElementById('pieChartFeeder');
        if (canvas1) {
            const ctx = canvas1.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas1.width, canvas1.height);
            
            this.pieChartByFeeder = new Chart(ctx, {
                type: 'doughnut',
                data: { labels: [], datasets: [{ 
                    data: [], 
                    backgroundColor: this.chartPalette, 
                    borderWidth: 3,
                    borderColor: '#ffffff',
                    hoverBorderWidth: 4,
                    hoverBorderColor: '#ffffff'
                }] },
                options: {
                    responsive: true, 
                    maintainAspectRatio: true,
                    aspectRatio: 1.2,
                    devicePixelRatio: Math.max(window.devicePixelRatio || 2, 3),
                    cutout: '65%',
                    
                    animation: {
                        duration: 1200,
                        easing: 'easeInOutQuart'
                    },
                    
                    plugins: {
                        legend: { 
                            position: 'bottom', 
                            labels: { 
                                color: '#334155', 
                                font: { size: 11, weight: '500' }, 
                                padding: 15,
                                usePointStyle: true,
                                pointStyle: 'circle'
                            } 
                        },
                        tooltip: { 
                            callbacks: { 
                                label: (ctx) => {
                                    const total = ctx.dataset.data.reduce((a,b) => a + b, 0);
                                    const percent = ((ctx.raw / total) * 100).toFixed(1);
                                    return `${ctx.label}: ${this.formatValue(ctx.raw)} (${percent}%)`;
                                }
                            },
                            backgroundColor: 'rgba(15,23,42,0.98)',
                            padding: 12,
                            cornerRadius: 8
                        }
                    }
                }
            });
        }
        
        const canvas2 = document.getElementById('pieChartType');
        if (canvas2) {
            const ctx = canvas2.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas2.width, canvas2.height);
            
            this.pieChartByType = new Chart(ctx, {
                type: 'doughnut',
                data: { labels: [], datasets: [{ 
                    data: [], 
                    backgroundColor: this.chartPalette.slice(5), 
                    borderWidth: 3,
                    borderColor: '#ffffff',
                    hoverBorderWidth: 4,
                    hoverBorderColor: '#ffffff'
                }] },
                options: {
                    responsive: true, 
                    maintainAspectRatio: true,
                    aspectRatio: 1.2,
                    devicePixelRatio: Math.max(window.devicePixelRatio || 2, 3),
                    cutout: '65%',
                    
                    animation: {
                        duration: 1200,
                        easing: 'easeInOutQuart'
                    },
                    
                    plugins: {
                        legend: { 
                            position: 'bottom', 
                            labels: { 
                                color: '#334155', 
                                font: { size: 11, weight: '500' }, 
                                padding: 15,
                                usePointStyle: true,
                                pointStyle: 'circle'
                            } 
                        },
                        tooltip: { 
                            callbacks: { 
                                label: (ctx) => {
                                    const total = ctx.dataset.data.reduce((a,b) => a + b, 0);
                                    const percent = ((ctx.raw / total) * 100).toFixed(1);
                                    return `${ctx.label}: ${this.formatValue(ctx.raw)} (${percent}%)`;
                                }
                            },
                            backgroundColor: 'rgba(15,23,42,0.98)',
                            padding: 12,
                            cornerRadius: 8
                        }
                    }
                }
            });
        }
        console.log("✅ Gráficos de pastel HD inicializados");
    }
    
    initStationSummaryChart() {
        const canvas = document.getElementById('stationSummaryChart');
        if (!canvas) return;
        console.log("🏭 Inicializando stationSummaryChart HD");
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        this.stationSummaryChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: [], datasets: [{
                label: 'Promedio', 
                data: [], 
                backgroundColor: this.chartPalette, 
                borderWidth: 1.5,
                borderRadius: 6,
                borderColor: '#ffffff',
                borderSkipped: false
            }] },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 1.8,
                devicePixelRatio: Math.max(window.devicePixelRatio || 2, 3),
                
                // ✨ ANIMACIONES DE RESUMEN (Corregido)
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                },
                
                plugins: { 
                    legend: { display: false },
                    title: { 
                        display: true, 
                        text: 'Resumen de alimentadores en la estación', 
                        color: '#1e293b', 
                        font: { size: 14, weight: 'bold' },
                        padding: { top: 10, bottom: 20 }
                    },
                    tooltip: { 
                        callbacks: { 
                            label: (ctx) => `Promedio: ${this.formatValue(ctx.raw)}` 
                        },
                        backgroundColor: 'rgba(15,23,42,0.98)',
                        padding: 10,
                        cornerRadius: 6
                    }
                },
                scales: {
                    x: { 
                        grid: { 
                            color: 'rgba(148,163,184,0.15)',
                            lineWidth: 1
                        },
                        ticks: { 
                            color: '#334155', 
                            font: { size: 11, weight: '500' },
                            callback: (v) => this.formatValue(v),
                            padding: 6
                        }
                    },
                    y: { 
                        grid: { display: false },
                        ticks: { 
                            color: '#334155', 
                            font: { size: 11, weight: '600' },
                            padding: 10
                        }
                    }
                }
            }
        });
        console.log("✅ Gráfico de resumen de estación HD inicializado");
    }
    
    // ========== EVENT LISTENERS PRINCIPALES ==========
    setupEventListeners() {
        console.log("🔗 Configurando event listeners...");
        this.safeAddEventListener('applyFilters', 'click', () => {
            console.log("🖱️ Botón Aplicar filtros clickeado");
            this.loadData();
        });
        this.safeAddEventListener('resetFilters', 'click', () => {
            console.log("🖱️ Botón Restablecer clickeado");
            this.resetFilters();
        });
        this.safeAddEventListener('clearAll', 'click', () => {
            console.log("🖱️ Botón Limpiar todo clickeado");
            this.clearAllFilters();
        });
        this.safeAddEventListener('globalModeUnique', 'click', () => {
            console.log("🖱️ Modo único seleccionado");
            this.setGlobalMode('unique');
        });
        this.safeAddEventListener('globalModeMultiple', 'click', () => {
            console.log("🖱️ Modo múltiple seleccionado");
            this.setGlobalMode('multiple');
        });
        this.safeAddEventListener('filterTipoMedicion', 'change', () => {
            console.log("🔄 Selector de tipo de medición cambiado");
            this.onFilterChange();
        });
        this.safeAddEventListener('filterYear', 'change', () => {
            console.log("🔄 Selector de año cambiado");
            this.onFilterChange();
        });
        
        document.querySelectorAll('.period-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                console.log("🖱️ Pestaña de período clickeada:", e.currentTarget.dataset.period);
                this.onPeriodTabClick(e);
            });
        });
        
        document.querySelectorAll('.month-btn').forEach(btn => btn.addEventListener('click', (e) => {
            console.log("🖱️ Botón de mes clickeado:", e.currentTarget.dataset.month);
            this.toggleMonthSelection(e);
        }));
        this.safeAddEventListener('selectAllMonths', 'click', () => {
            console.log("🖱️ Seleccionar todos los meses");
            this.selectAllMonths();
        });
        this.safeAddEventListener('deselectAllMonths', 'click', () => {
            console.log("🖱️ Deseleccionar todos los meses");
            this.deselectAllMonths();
        });
        
        this.safeAddEventListener('groupBy', 'change', () => {
            console.log("🔄 Selector de agrupación cambiado");
            this.onGroupByChange();
        });
        this.safeAddEventListener('chartType', 'change', () => {
            console.log("🔄 Selector de tipo de gráfico cambiado");
            this.onChartTypeChange();
        });
        this.safeAddEventListener('togglePoints', 'click', () => {
            console.log("🖱️ Botón toggle puntos clickeado");
            this.toggleChartPoints();
        });
        this.safeAddEventListener('zoomIn', 'click', () => {
            console.log("🖱️ Zoom in");
            this.zoomChart('in');
        });
        this.safeAddEventListener('zoomOut', 'click', () => {
            console.log("🖱️ Zoom out");
            this.zoomChart('out');
        });
        this.safeAddEventListener('resetZoom', 'click', () => {
            console.log("🖱️ Reset zoom");
            this.resetChartZoom();
        });
        this.safeAddEventListener('expandChartBtn', 'click', () => {
            console.log("🖱️ Expandir gráficos");
            this.expandChart();
        });
        
        // Ranking controls
        this.safeAddEventListener('rankingGroup', 'change', () => {
            console.log("🔄 Selector de agrupación de ranking cambiado");
            this.updateRankingChart();
        });
        this.safeAddEventListener('rankingSort', 'change', () => {
            console.log("🔄 Selector de orden de ranking cambiado");
            this.updateRankingChart();
        });
        this.safeAddEventListener('rankingViewMode', 'change', () => {
            this.updateRankingChart();
        });
        this.safeAddEventListener('rankingDisplayMode', 'change', () => {
            this.updateRankingChart();
        });
        this.safeAddEventListener('openFullRankingBtn', 'click', () => {
            this.openFullRankingTab();
        });
        this.safeAddEventListener('stationSummarySelect', 'change', () => {
            this.updateStationSummary();
        });
        
        this.safeAddEventListener('expandRankingBtn', 'click', () => {
            console.log("🖱️ Ver ranking completo");
            this.expandRankingChart();
        });
        this.safeAddEventListener('stationSummarySelect', 'change', (e) => {
            this.stationSummarySelection = e.target.value || '__ALL__';
            this.updateStationSummary();
        });
        
        this.safeAddEventListener('tableSearch', 'input', (e) => {
            console.log("🔍 Búsqueda en tabla:", e.target.value);
            this.filterTable(e.target.value);
        });
        this.safeAddEventListener('rowsPerPage', 'change', () => {
            console.log("🔄 Filas por página cambiado");
            this.updateTable();
        });
        this.safeAddEventListener('firstPage', 'click', () => {
            console.log("🖱️ Primera página");
            this.goToPage(1);
        });
        this.safeAddEventListener('prevPage', 'click', () => {
            console.log("🖱️ Página anterior");
            this.goToPage(this.pagination.currentPage - 1);
        });
        this.safeAddEventListener('nextPage', 'click', () => {
            console.log("🖱️ Página siguiente");
            this.goToPage(this.pagination.currentPage + 1);
        });
        this.safeAddEventListener('lastPage', 'click', () => {
            console.log("🖱️ Última página");
            this.goToPage(this.pagination.totalPages);
        });
        document.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
            console.log("🖱️ Ordenar por:", th.dataset.sort);
            this.sortTable(th.dataset.sort);
        }));
        
        this.safeAddEventListener('uploadExcelBtn', 'click', () => {
            console.log("🖱️ Subir Excel");
            this.uploadExcel();
        });
        this.safeAddEventListener('sidebarToggle', 'click', () => {
            console.log("🖱️ Toggle sidebar");
            this.toggleSidebar();
        });
        this.safeAddEventListener('sidebarClose', 'click', () => {
            console.log("🖱️ Cerrar sidebar");
            this.toggleSidebar();
        });
        
        window.addEventListener('resize', () => {
            console.log("🪟 Ventana redimensionada");
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                this.resizeAllCharts();
            }, 250);
        });
    }
    
    resizeAllCharts() {
        console.log("📏 Redimensionando todos los gráficos HD");
        requestAnimationFrame(() => {
            if (this.mainChart) this.mainChart.resize();
            if (this.rankingChart) this.rankingChart.resize();
            if (this.scatterChart) this.scatterChart.resize();
            if (this.pieChartByFeeder) this.pieChartByFeeder.resize();
            if (this.pieChartByType) this.pieChartByType.resize();
            if (this.stationSummaryChart) this.stationSummaryChart.resize();
        });
    }
    
    // ========== PESTAÑAS DE PERÍODO ==========
    onPeriodTabClick(e) {
        const tab = e.currentTarget;
        const periodo = tab.dataset.period;
        console.log("📆 Período seleccionado:", periodo);
        
        document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        this.filters.periodo = periodo;
        
        const monthGroup = document.getElementById('monthSelectorGroup');
        if (monthGroup) monthGroup.style.display = periodo === 'select_months' ? 'block' : 'none';
        
        if (periodo !== 'select_months') {
            this.calculateMonthsForPeriod(periodo);
        }
        
        if (this.globalMode === 'unique') this.loadDataDebounced();
    }
    
    calculateMonthsForPeriod(periodo) {
        console.log("📅 Calculando meses para período:", periodo);
        const now = new Date();
        const cm = now.getMonth() + 1;
        this.selectedMonths.clear();
        
        if (periodo === 'last3') {
            for (let i = 0; i < 3; i++) this.selectedMonths.add(((cm - i - 1 + 12) % 12) + 1);
        } else if (periodo === 'last6') {
            for (let i = 0; i < 6; i++) this.selectedMonths.add(((cm - i - 1 + 12) % 12) + 1);
        } else if (periodo === 'last12' || periodo === 'currentYear' || periodo === 'lastYear') {
            for (let i = 1; i <= 12; i++) this.selectedMonths.add(i);
        }
        
        console.log("📅 Meses seleccionados:", Array.from(this.selectedMonths));
        this.updateMonthButtons();
        this.updateMonthSelect();
    }
    
    // ========== FILTROS ==========
    onFilterChange() {
        console.log("🔄 Filtro cambiado, globalMode =", this.globalMode);
        if (this.globalMode === 'unique') {
            this.enforceSingleSelect('filterTransformador');
            this.enforceSingleSelect('filterTipoMedicion');
            this.enforceSingleSelect('filterYear');
            console.log("🔄 Modo único, cargando datos con debounce");
            this.loadDataDebounced();
        } else {
            console.log("🔄 Modo múltiple, esperando click en Aplicar");
        }
    }
    
    // ========== CARGA DE METADATOS ==========
    async loadTiposMedicion() {
        console.log("📥 Cargando tipos de medición...");
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/tipos-medicion`);
            const tipos = await res.json();
            const select = document.getElementById('filterTipoMedicion');
            if (select) {
                select.innerHTML = '<option value="all">Todos los tipos</option>' + 
                    tipos.map(t => `<option value="${t}">${t}</option>`).join('');
            }
            console.log(`✅ Tipos de medición cargados: ${tipos.length}`);
        } catch (e) { console.error("Error cargando tipos:", e); }
    }
    
    async loadSeccionesDisponibles() {
        console.log("📥 Cargando secciones...");
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/secciones`);
            const secciones = await res.json();
            this.allSecciones = secciones;
            
            const estacionesSet = new Set(secciones.map(s => s.substring(0,3)).filter(s => s.length === 3));
            this.estaciones = Array.from(estacionesSet).sort();
    
            const estSel = document.getElementById('filterEstacion');
            if (estSel) {
                estSel.innerHTML = '<option value="">Todas las estaciones</option>' + 
                    this.estaciones.map(e => `<option value="${e}">${e}</option>`).join('');
            }

            const estCompareSel = document.getElementById('filterEstacionCompare');
            if (estCompareSel) {
                estCompareSel.innerHTML = '<option value="">Selecciona estación 2</option>' +
                    this.estaciones.map(e => `<option value="${e}">${e}</option>`).join('');
            }

            this.syncStaticStationSelectors();
    
            const feedSel = document.getElementById('filterTransformador');
            if (feedSel) {
                feedSel.innerHTML = secciones.map(s => `<option value="${s}">${s}</option>`).join('');
            }
    
            this.initFeederFilter();
            
            console.log(`✅ Secciones cargadas: ${secciones.length} secciones, ${this.estaciones.length} estaciones`);
        } catch (e) { 
            console.error("Error cargando secciones:", e); 
        }
    }
    
    async loadYearsAvailable() {
        console.log("📥 Cargando años...");
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/anios`);
            const years = await res.json();
            const select = document.getElementById('filterYear');
            if (select) {
                select.innerHTML = '<option value="all">Todos los años</option>' + 
                    years.map(y => `<option value="${y}">${y}</option>`).join('');
            }
            console.log(`✅ Años cargados: ${years.length}`);
        } catch (e) { console.error("Error cargando años:", e); }
    }
    
    // ========== FILTRO INTELIGENTE DE ALIMENTADORES ==========
    initFeederFilter() {
        console.log("🔧 Inicializando filtro inteligente de alimentadores");
        this.setupFeederModeTabs();
        this.setupFeederEventListeners();
        this.updateFeederCount();
        this.setFeederMode('compare_stations');
        this.renderStationSelectors();
        this.updateComparisonUiByGlobalMode();
    }
    
    setupFeederModeTabs() {
        const tabs = document.querySelectorAll('.mode-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.mode;
                console.log("🖱️ Modo de alimentadores cambiado a:", mode);
                this.setFeederMode(mode);
            });
        });
    }

    syncStaticStationSelectors() {
        const estSel = document.getElementById('filterEstacion');
        if (estSel) {
            estSel.innerHTML = '<option value="">Todas las estaciones</option>' +
                this.estaciones.map(e => `<option value="${e}">${e}</option>`).join('');
        }

        const estCompareSel = document.getElementById('filterEstacionCompare');
        if (estCompareSel) {
            estCompareSel.innerHTML = '<option value="">Selecciona estación 2</option>' +
                this.estaciones.map(e => `<option value="${e}">${e}</option>`).join('');
        }
    }

    renderStationSelectors() {
        const container = document.getElementById('stationSelectorsDynamic');
        const countInput = document.getElementById('stationCountInput');
        if (!container || !countInput) return;

        const count = Math.max(1, Math.min(20, parseInt(countInput.value) || 1));
        countInput.value = String(count);

        const prev = this.selectedStations.length ? [...this.selectedStations] : [''];
        container.innerHTML = '';

        for (let i = 0; i < count; i++) {
            const wrap = document.createElement('div');
            wrap.style.marginBottom = '0.5rem';
            wrap.innerHTML = `
                <label class="form-label" style="font-size:0.82rem; margin-bottom:0.35rem; display:block;">
                    <i class="fas fa-building"></i> Estación ${i + 1}
                </label>
                <select class="form-select station-dynamic-select" data-index="${i}">
                    <option value="">${i === 0 ? 'Todas las estaciones' : 'Selecciona estación'}</option>
                    ${this.estaciones.map(e => `<option value="${e}">${e}</option>`).join('')}
                </select>
            `;
            container.appendChild(wrap);
        }

        container.querySelectorAll('.station-dynamic-select').forEach((sel, i) => {
            if (prev[i]) sel.value = prev[i];
            sel.addEventListener('change', () => {
                this.selectedStations = this.getSelectedStations();
                if (this.selectionMode === 'manual') {
                    const first = this.selectedStations[0] || '';
                    this.currentStationFilter = first;
                    this.filterFeedersByStation(first);
                } else if (this.selectionMode === 'station_multi') {
                    this.selectStationsFeeders();
                }
            });
        });

        this.selectedStations = this.getSelectedStations();
    }

    getSelectedStations() {
        return Array.from(document.querySelectorAll('.station-dynamic-select'))
            .map(sel => sel.value)
            .filter(Boolean);
    }

    setFeederMode(mode) {
        if (this.globalMode === 'unique' && mode !== 'manual') mode = 'manual';
        this.selectionMode = mode;
        const tabs = document.querySelectorAll('.mode-tab');
        tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));

        const stationSelectorContainer = document.getElementById('stationSelectorContainer');
        const compareStationContainer = document.getElementById('compareStationContainer');
        const stationMultiContainer = document.getElementById('stationMultiContainer');

        if (stationSelectorContainer) {
            stationSelectorContainer.style.display = (mode === 'manual' || mode === 'compare_stations') ? 'block' : 'none';
        }

        if (compareStationContainer) {
            compareStationContainer.style.display = mode === 'compare_stations' ? 'block' : 'none';
        }

        if (stationMultiContainer) {
            stationMultiContainer.style.display = mode === 'station_multi' ? 'block' : 'none';
        }

        if (mode === 'all') this.selectAllFeeders();
        if (mode === 'station' && this.currentStationFilter) this.selectStationFeeders(this.currentStationFilter);
        if (mode === 'compare_stations') {
            const estSel = document.getElementById('filterEstacion');
            const estCompareSel = document.getElementById('filterEstacionCompare');
            const available = this.estaciones || [];
            if (available.length) {
                if (estSel && !estSel.value) estSel.value = available[0];
                if (estCompareSel && !estCompareSel.value) estCompareSel.value = available[1] || available[0];
                this.currentStationFilter = estSel?.value || this.currentStationFilter;
                this.currentStationCompare = estCompareSel?.value || this.currentStationCompare;
            }
            this.selectComparisonStationsFeeders();
        }

        this.updateFeederModeHint();
    }

    updateFeederModeHint() {
        const hint = document.getElementById('estacionHint');
        if (!hint) return;
        const texts = {
            manual: 'Filtra los alimentadores por estación y selecciona manualmente con Ctrl+Click.',
            station: 'Al seleccionar una estación, se marcarán automáticamente todos sus alimentadores.',
            station_multi: 'Define cuántas estaciones comparar y elige cada una para seleccionar sus alimentadores automáticamente.',
            compare_stations: 'Selecciona 2 estaciones para comparar sus alimentadores en conjunto.',
            all: 'Modo "Todos los alimentadores" – se muestran y seleccionan todos.'
        };
        hint.innerHTML = `<i class="fas fa-info-circle"></i> ${texts[this.selectionMode] || texts.manual}`;
    }

    setupFeederEventListeners() {
        const estacionSelect = document.getElementById('filterEstacion');
        if (estacionSelect) {
            estacionSelect.addEventListener('change', (e) => {
                const estacion = e.target.value;
                console.log("🔄 Estación 1 seleccionada:", estacion);
                this.currentStationFilter = estacion;

                if (this.selectionMode === 'compare_stations') {
                    this.selectComparisonStationsFeeders();
                } else {
                    this.filterFeedersByStation(estacion);
                }
            });
        }

        const estacionCompareSelect = document.getElementById('filterEstacionCompare');
        if (estacionCompareSelect) {
            estacionCompareSelect.addEventListener('change', (e) => {
                const estacion = e.target.value;
                console.log("🔄 Estación 2 seleccionada:", estacion);
                this.currentStationCompare = estacion;
                if (this.selectionMode === 'compare_stations') this.selectComparisonStationsFeeders();
            });
        }

        const stationCountInput = document.getElementById('stationCountInput');
        if (stationCountInput) {
            stationCountInput.addEventListener('change', () => {
                this.renderStationSelectors();
                if (this.selectionMode === 'station_multi') this.selectStationsFeeders();
            });
            stationCountInput.addEventListener('input', () => {
                const val = parseInt(stationCountInput.value, 10);
                if (Number.isNaN(val)) return;
                stationCountInput.value = String(Math.max(1, Math.min(20, val)));
            });
        }

        const selectAllBtn = document.getElementById('selectAllFeedersBtn');
        if (selectAllBtn) selectAllBtn.addEventListener('click', () => {
            console.log("🖱️ Botón 'Todos' clickeado");
            this.selectAllFeeders();
        });

        const clearBtn = document.getElementById('clearFeedersBtn');
        if (clearBtn) clearBtn.addEventListener('click', () => {
            console.log("🖱️ Botón 'Limpiar' clickeado");
            this.clearFeeders();
        });

        const feederSelect = document.getElementById('filterTransformador');
        if (feederSelect) {
            feederSelect.addEventListener('change', () => {
                this.updateFeederCount();
                if (this.globalMode === 'unique') this.loadDataDebounced();
            });
        }
    }

    filterFeedersByStation(estacion) {
        console.log("🔍 Filtrando alimentadores por estación:", estacion);
        const feederSelect = document.getElementById('filterTransformador');
        if (!feederSelect) return;

        const selectedValues = Array.from(feederSelect.selectedOptions).map(opt => opt.value);
        feederSelect.innerHTML = '';

        let allFeeders = [...this.allSecciones];
        if (estacion) allFeeders = allFeeders.filter(f => f.startsWith(estacion));

        allFeeders.forEach(feeder => {
            const option = document.createElement('option');
            option.value = feeder;
            option.textContent = feeder;
            option.selected = true;
            feederSelect.appendChild(option);
        });

        selectedValues.forEach(val => {
            const option = Array.from(feederSelect.options).find(opt => opt.value === val);
            if (option) option.selected = true;
        });

        this.updateFeederCount();
    }

    selectAllFeeders() {
        console.log("✅ Seleccionando todos los alimentadores");
        const feederSelect = document.getElementById('filterTransformador');
        if (!feederSelect) return;

        this.filterFeedersByStation('');
        Array.from(feederSelect.options).forEach(opt => opt.selected = true);
        this.updateFeederCount();
        this.showNotification('Todos los alimentadores seleccionados', 'success');
        if (this.globalMode === 'unique') this.loadDataDebounced();
    }

    selectStationsFeeders() {
        const stations = this.getSelectedStations();
        this.selectedStations = stations;
        const feederSelect = document.getElementById('filterTransformador');
        if (!feederSelect) return;

        if (!stations.length) {
            this.filterFeedersByStation('');
            Array.from(feederSelect.options).forEach(opt => opt.selected = false);
            this.updateFeederCount();
            this.showNotification('Selecciona al menos una estación', 'warning');
            return;
        }

        const feeders = this.allSecciones.filter(feeder => stations.some(st => feeder.startsWith(st)));
        feederSelect.innerHTML = '';

        feeders.forEach(feeder => {
            const option = document.createElement('option');
            option.value = feeder;
            option.textContent = feeder;
            option.selected = true;
            feederSelect.appendChild(option);
        });

        this.updateFeederCount();
        this.showNotification(`Estaciones seleccionadas: ${stations.join(', ')}`, 'success');
        if (this.globalMode === 'unique') this.loadDataDebounced();
    }

    selectComparisonStationsFeeders() {
        const stationOne = document.getElementById('filterEstacion')?.value || '';
        const stationTwo = document.getElementById('filterEstacionCompare')?.value || '';

        this.currentStationFilter = stationOne;
        this.currentStationCompare = stationTwo;

        const selectedStations = [stationOne, stationTwo].filter(Boolean);
        const feederSelect = document.getElementById('filterTransformador');
        if (!feederSelect) return;

        if (selectedStations.length === 0) {
            this.filterFeedersByStation('');
            Array.from(feederSelect.options).forEach(opt => opt.selected = false);
            this.updateFeederCount();
            this.showNotification('Selecciona al menos una estación para comparar', 'warning');
            return;
        }

        const feeders = this.allSecciones.filter(feeder => selectedStations.some(st => feeder.startsWith(st)));
        feederSelect.innerHTML = '';

        feeders.forEach(feeder => {
            const option = document.createElement('option');
            option.value = feeder;
            option.textContent = feeder;
            option.selected = true;
            feederSelect.appendChild(option);
        });

        this.updateFeederCount();
        const stationLabel = selectedStations.join(' vs ');
        this.showNotification(`Comparando estaciones: ${stationLabel}`, 'success');
        if (this.globalMode === 'unique') this.loadDataDebounced();
    }

    clearFeeders() {
        console.log("🧹 Limpiando selección de alimentadores");
        const feederSelect = document.getElementById('filterTransformador');
        if (!feederSelect) return;
        Array.from(feederSelect.options).forEach(opt => opt.selected = false);
        this.updateFeederCount();
        this.showNotification('Selección de alimentadores limpiada', 'info');
        if (this.globalMode === 'unique') this.loadDataDebounced();
    }
    
    updateFeederCount() {
        const feederSelect = document.getElementById('filterTransformador');
        const countSpan = document.getElementById('feederCount');
        if (!feederSelect || !countSpan) return;
        const count = feederSelect.selectedOptions.length;
        countSpan.textContent = count;
        console.log("🔢 Alimentadores seleccionados:", count);
    }
    
    // ========== CONFIGURACIÓN DE VALORES POR DEFECTO ==========
    setDefaultFilterValues() {
        console.log("⚙️ Configurando valores por defecto");
        this.setGlobalMode('unique');
        this.selectedMonths = new Set([1,2,3,4,5,6,7,8,9,10,11,12]);
        this.updateMonthButtons();
        this.updateMonthSelect();
        
        const periodTabs = document.querySelectorAll('.period-tab');
        periodTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.period === 'select_months');
        });
        this.filters.periodo = 'select_months';
        
        setTimeout(() => {
            const setSelect = (id, defaultValue = null) => {
                const el = document.getElementById(id);
                if (el && el.options.length) {
                    if (defaultValue && Array.from(el.options).find(opt => opt.value === defaultValue)) el.value = defaultValue;
                    else if (el.options.length > 0) el.value = el.options[0].value;
                }
            };

            const yearSelect = document.getElementById('filterYear');
            if (yearSelect && yearSelect.options.length > 0) {
                const yearValues = Array.from(yearSelect.options)
                    .map(opt => Number(opt.value))
                    .filter(Number.isFinite);
                const latestYear = yearValues.length ? String(Math.max(...yearValues)) : null;
                setSelect('filterYear', latestYear);
            }
            setSelect('filterTipoMedicion', 'TOTAL FEP');
            
            const feedSel = document.getElementById('filterTransformador');
            if (feedSel) {
                const estSel = document.getElementById('filterEstacion');
                if (estSel) estSel.value = '';
                const estCompareSel = document.getElementById('filterEstacionCompare');
                if (estCompareSel) estCompareSel.value = '';
                this.filterFeedersByStation('');
                Array.from(feedSel.options).forEach(opt => opt.selected = true);
                this.updateFeederCount();
            }
            
            this.filters = {
                year: [document.getElementById('filterYear')?.value || 'all'],
                tipoMedicion: [document.getElementById('filterTipoMedicion')?.value || 'TOTAL FEP'],
                transformador: this.getSelectedValues('filterTransformador'),
                month: Array.from(this.selectedMonths),
                estacion: '',
                periodo: 'select_months'
            };
            console.log("⚙️ Filtros por defecto establecidos:", this.filters);
        }, 500);
    }
    
    // ========== MANEJO DE FILTROS GLOBALES ==========
    enforceSingleSelect(selectId) {
        const sel = document.getElementById(selectId);
        if (!sel || !sel.multiple) return;
        const selected = Array.from(sel.selectedOptions).map(o => o.value).filter(Boolean);
        if (selected.length <= 1) return;
        const keep = selected[0];
        Array.from(sel.options).forEach(opt => {
            opt.selected = opt.value === keep;
        });
    }

    updateComparisonUiByGlobalMode() {
        const tabs = document.querySelector('.selection-mode-tabs');
        const openMultiBtn = document.getElementById('openStationMultiBtn');
        const compareContainer = document.getElementById('compareStationContainer');
        const stationMultiContainer = document.getElementById('stationMultiContainer');
        const stationSelectorContainer = document.getElementById('stationSelectorContainer');
        const estCompareSel = document.getElementById('filterEstacionCompare');

        if (this.globalMode === 'unique') {
            if (tabs) tabs.style.display = 'none';
            if (openMultiBtn) openMultiBtn.style.display = 'none';
            if (compareContainer) compareContainer.style.display = 'none';
            if (stationMultiContainer) stationMultiContainer.style.display = 'none';
            if (stationSelectorContainer) stationSelectorContainer.style.display = 'block';
            if (estCompareSel) estCompareSel.value = '';

            this.selectionMode = 'manual';
            this.currentStationCompare = '';
            this.enforceSingleSelect('filterTransformador');
            this.enforceSingleSelect('filterTipoMedicion');
            this.enforceSingleSelect('filterYear');
            this.updateFeederModeHint();
            return;
        }

        if (tabs) tabs.style.display = '';
        if (openMultiBtn) openMultiBtn.style.display = '';

        if (this.selectionMode === 'manual') {
            this.setFeederMode('compare_stations');
        } else {
            this.setFeederMode(this.selectionMode);
        }
    }

    setGlobalMode(mode) {
        console.log("🌐 Modo global cambiado a:", mode);
        this.globalMode = mode;
        const unique = document.getElementById('globalModeUnique');
        const multiple = document.getElementById('globalModeMultiple');
        const hint = document.getElementById('globalModeHint');
        if (unique && multiple) {
            unique.classList.toggle('active', mode === 'unique');
            multiple.classList.toggle('active', mode === 'multiple');
        }
        if (hint) hint.textContent = mode === 'unique' 
            ? 'Único: una sola comparación activa por filtro' 
            : 'Múltiple: habilita comparaciones múltiples y selección avanzada';

        this.updateComparisonUiByGlobalMode();
    }
    
    resetFilters() {
        console.log("🔄 Restableciendo filtros");
        this.filters = { ...this.defaultFilters };
        this.selectedMonths = new Set([1,2,3,4,5,6,7,8,9,10,11,12]);
        this.currentStationGroup = null;
        this.updateMonthButtons();
        this.updateMonthSelect();
        
        this.setFeederMode(this.globalMode === 'multiple' ? 'compare_stations' : 'manual');
        this.renderStationSelectors();
        this.updateComparisonUiByGlobalMode();
        this.currentStationFilter = '';
        this.currentStationCompare = '';
        this.selectedStations = [];
        const estSel = document.getElementById('filterEstacion');
        if (estSel) estSel.value = '';
        const estCompareSel = document.getElementById('filterEstacionCompare');
        if (estCompareSel) estCompareSel.value = '';
        this.filterFeedersByStation('');

        const feedSel = document.getElementById('filterTransformador');
        if (feedSel) {
            Array.from(feedSel.options).forEach(opt => opt.selected = true);
            this.updateFeederCount();
        }

        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const yearSelect = document.getElementById('filterYear');
        if (yearSelect && yearSelect.options.length) {
            const yearValues = Array.from(yearSelect.options)
                .map(opt => Number(opt.value))
                .filter(Number.isFinite);
            const latestYear = yearValues.length ? String(Math.max(...yearValues)) : yearSelect.options[0].value;
            setVal('filterYear', latestYear);
        }
        setVal('filterTipoMedicion', 'TOTAL FEP');
        
        document.querySelectorAll('.period-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.period === 'select_months');
        });
        this.filters.periodo = 'select_months';
        const monthGroup = document.getElementById('monthSelectorGroup');
        if (monthGroup) monthGroup.style.display = 'block';
        
        this.showNotification("Filtros restablecidos", "success");
        setTimeout(() => this.loadData(), 500);
    }
    
    clearAllFilters() {
        console.log("🧹 Limpiando todos los filtros");
        document.querySelectorAll('.multi-select').forEach(select => 
            Array.from(select.options).forEach(opt => opt.selected = false));
        this.selectedMonths.clear();
        this.updateMonthButtons();
        this.updateMonthSelect();
        
        this.setFeederMode(this.globalMode === 'multiple' ? 'compare_stations' : 'manual');
        this.renderStationSelectors();
        this.updateComparisonUiByGlobalMode();
        this.currentStationFilter = '';
        this.currentStationCompare = '';
        this.selectedStations = [];
        const estSel = document.getElementById('filterEstacion');
        if (estSel) estSel.value = '';
        const estCompareSel = document.getElementById('filterEstacionCompare');
        if (estCompareSel) estCompareSel.value = '';
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
    
    // ========== MESES ==========
    toggleMonthSelection(e) {
        const month = parseInt(e.currentTarget.dataset.month);
        console.log("🖱️ Mes clickeado:", month);
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
        console.log("✅ Seleccionar todos los meses");
        for (let i=1;i<=12;i++) this.selectedMonths.add(i); 
        this.updateMonthButtons(); this.updateMonthSelect(); 
        this.showNotification("Todos los meses seleccionados","success"); 
        if (this.globalMode === 'unique') this.loadDataDebounced(); 
    }
    
    deselectAllMonths() { 
        console.log("❌ Deseleccionar todos los meses");
        this.selectedMonths.clear(); 
        this.updateMonthButtons(); this.updateMonthSelect(); 
        this.showNotification("Todos los meses deseleccionados","info"); 
        if (this.globalMode === 'unique') this.loadDataDebounced(); 
    }
    
    // ========== CARGA DE DATOS ==========
    async loadData() {
        if (this.isLoadingData) {
            console.log("⏳ loadData en progreso, se omite llamada duplicada");
            return;
        }

        this.isLoadingData = true;
        console.log("📥 Iniciando carga de datos...");
        this.showLoading(true, "Cargando datos desde el servidor...", null);
        try {
            const selectedFeed = this.getSelectedValues('filterTransformador');
            const seccionVal = selectedFeed.length > 0 ? selectedFeed.join(',') : 'all';
            console.log("🔌 Alimentadores:", selectedFeed, "=> seccion:", seccionVal);

            const years = this.getSelectedValues('filterYear');
            const anioVal = years.length ? years.join(',') : 'all';
            console.log("📅 Años:", years);

            let mesVal = 'all';
            if (this.selectedMonths.size && this.filters.periodo === 'select_months') {
                mesVal = Array.from(this.selectedMonths).join(',');
                console.log("📆 Meses seleccionados:", Array.from(this.selectedMonths));
            }

            const periodoVal = (this.filters.periodo && this.filters.periodo !== 'select_months')
                ? this.filters.periodo
                : null;
            if (periodoVal) {
                console.log("📆 Período:", periodoVal);
            }

            const tipos = this.getSelectedValues('filterTipoMedicion');
            const tipoVal = tipos.length ? tipos.join(',') : 'all';
            console.log("📊 Tipos:", tipos);

            // Construir payload para POST
            const payload = {
                seccion: seccionVal,
                anio: anioVal,
                tipo_medicion: tipoVal
            };
            if (mesVal !== 'all') payload.mes = mesVal;
            if (periodoVal) payload.periodo = periodoVal;

            console.log("📦 Payload enviado:", payload);

            let res;
            try {
                res = await fetch(`${this.apiBaseUrl}/api/datos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } catch (fetchErr) {
                const isNetworkSuspended = String(fetchErr?.message || '').includes('Failed to fetch');
                if (isNetworkSuspended && seccionVal !== 'all') {
                    console.warn('⚠️ Reintentando carga con seccion=all por posible URL extensa');
                    payload.seccion = 'all';
                    res = await fetch(`${this.apiBaseUrl}/api/datos`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } else {
                    throw fetchErr;
                }
            }

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            console.log(`✅ Datos recibidos: ${data.length} registros`);

            this.data = data;
            this.filteredData = [...this.data];

            this.showLoading(true, "Procesando datos...", 70);

            if (this.data.length === 0) {
                this.showNotification("No hay datos con los filtros actuales", "warning");
                this.clearChartsAndTable();
                await this.refreshFepDepTotals();
            } else {
                console.log("📈 Actualizando UI con nuevos datos (con animaciones HD)...");
                this.updateStats();
                this.updateKPIs();
                await this.refreshFepDepTotals();
                this.updateSpecialKPIs();

                // Actualizar gráficos con animaciones
                this.updateCharts();
                this.updateScatterChart();
                this.updatePieCharts();
                this.updateStationSummary();

                this.pagination.currentPage = 1;
                this.updateTable();
                this.updateComparisonTags();
                this.showNotification(`${this.data.length} registros cargados ✨`, "success");
            }
        } catch (error) {
            console.error("❌ Error cargando datos:", error);
            this.showNotification(`Error: ${error.message}`, "error");
            this.clearChartsAndTable();
            this.renderFepDepTotals(0, 0);
        } finally {
            this.showLoading(false);
        }
    }


    
    // ========== KPIS ESPECIALES ==========
    updateSpecialKPIs() {
        console.log("📊 Actualizando KPIs especiales");
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
        
        const stationCountEl = document.getElementById('stationCount');
        if (stationCountEl) stationCountEl.textContent = stations.size;
        
        const stationNamesEl = document.getElementById('stationNames');
        if (stationNamesEl) stationNamesEl.textContent = Array.from(stations).slice(0,3).join(', ') + (stations.size > 3 ? '...' : '');
        
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
        
        const bestStationNameEl = document.getElementById('bestStationName');
        if (bestStationNameEl) bestStationNameEl.textContent = bestStation || '--';
        const bestStationValueEl = document.getElementById('bestStationValue');
        if (bestStationValueEl) bestStationValueEl.textContent = this.safeToFixed(bestAvg);
        
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
        
        const topFeederNameEl = document.getElementById('topFeederName');
        if (topFeederNameEl) topFeederNameEl.textContent = bestFeeder || '--';
        const topFeederValueEl = document.getElementById('topFeederValue');
        if (topFeederValueEl) topFeederValueEl.textContent = this.safeToFixed(bestFeederAvg);
        
        const values = this.data.map(d => d.frecuencia).filter(v => !isNaN(v));
        if (values.length > 1) {
            const mean = values.reduce((a,b)=>a+b,0)/values.length;
            const variance = values.reduce((a,b)=>a+Math.pow(b-mean,2),0)/values.length;
            const cv = (Math.sqrt(variance)/mean)*100;
            const globalCVEl = document.getElementById('globalCV');
            if (globalCVEl) globalCVEl.textContent = cv.toFixed(2) + '%';
            const badge = document.getElementById('globalCVBadge');
            if (badge) {
                badge.textContent = cv < 10 ? 'BAJA' : cv < 30 ? 'MEDIA' : 'ALTA';
                badge.style.backgroundColor = cv < 10 ? '#10b981' : cv < 30 ? '#f59e0b' : '#ef4444';
            }
        }
    }
    
    // ========== LIMPIAR GRÁFICOS ==========
    clearChartsAndTable() {
        console.log("🧹 Limpiando gráficos y tabla");
        
        // Limpiar con animación suave de salida
        const clearWithAnimation = (chart) => {
            if (!chart) return;
            chart.data.labels = [];
            chart.data.datasets = [];
            chart.update('none'); // Sin animación al limpiar
        };
        
        clearWithAnimation(this.mainChart);
        clearWithAnimation(this.rankingChart);
        clearWithAnimation(this.scatterChart);
        clearWithAnimation(this.pieChartByFeeder);
        clearWithAnimation(this.pieChartByType);
        clearWithAnimation(this.stationSummaryChart);
        
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
        ['dataCount','loadedSeries','totalPoints','seriesCount','activeSeries'].forEach(id => { 
            const el = document.getElementById(id); 
            if(el) el.textContent = '0'; 
        });
        const specialSection = document.getElementById('specialKpiSection');
        if (specialSection) specialSection.style.display = 'none';
    }
    
    getSelectedValues(selectId) {
        const sel = document.getElementById(selectId);
        if (!sel) return [];
        const values = sel.multiple ? Array.from(sel.selectedOptions).map(o=>o.value).filter(v=>v) : (sel.value ? [sel.value] : []);
        return values;
    }
    
    // ========== GENERAR DATOS DE EJEMPLO ==========
    generateSampleData() {
        console.log("⚠️ Generando datos de ejemplo...");
        const secciones = this.filters.transformador?.length ? this.filters.transformador : ['ACY1','ACY2','ACY3'];
        const años = this.filters.year?.map(y=>parseInt(y)).filter(y=>!isNaN(y)).length ? this.filters.year.map(y=>parseInt(y)) : [2023,2024];
        const tipos = this.filters.tipoMedicion?.length ? this.filters.tipoMedicion : ['TOTAL FEP'];
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
        console.log(`✅ Datos de ejemplo generados: ${this.data.length} registros`);
        this.updateStats(); this.updateKPIs(); this.updateSpecialKPIs(); 
        this.updateCharts(); 
        this.updateScatterChart();
        this.updatePieCharts(); 
        this.updateStationSummary(); 
        this.updateTable();
    }
    
    // ========== ACTUALIZACIÓN UI ==========
    updateStats() {
        console.log("📊 Actualizando estadísticas");
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
    
    parseNumericValue(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
        if (value === null || value === undefined) return NaN;

        let str = String(value).trim();
        if (!str) return NaN;

        if (str.includes(',') && str.includes('.')) {
            if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
                str = str.replace(/\./g, '').replace(',', '.');
            } else {
                str = str.replace(/,/g, '');
            }
        } else if (str.includes(',')) {
            str = str.replace(',', '.');
        }

        const parsed = Number(str);
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    normalizeTipo(tipo) {
        return String(tipo || '')
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Z0-9]/g, '');
    }

    calculateFepDepTotals(dataset = []) {
        return dataset.reduce((acc, row) => {
            const freq = this.parseNumericValue(row.frecuencia);
            if (!Number.isFinite(freq)) return acc;

            const tipoNorm = this.normalizeTipo(row.tipo);
            if (tipoNorm === 'TOTALFEP') acc.fep += freq;
            if (tipoNorm === 'TOTALDEP') acc.dep += freq;
            return acc;
        }, { fep: 0, dep: 0 });
    }

    renderFepDepTotals(totalFep, totalDep) {
        const totalFepEl = document.getElementById('totalFep');
        const totalDepEl = document.getElementById('totalDep');
        if (totalFepEl) totalFepEl.textContent = this.safeToFixed(totalFep, 2);
        if (totalDepEl) totalDepEl.textContent = this.safeToFixed(totalDep, 2);
    }

    async refreshFepDepTotals() {
        const requestId = ++this.fepDepRequestId;
        try {
            const params = new URLSearchParams();

            const selectedFeed = this.getSelectedValues('filterTransformador');
            const seccionVal = selectedFeed.length > 0 ? selectedFeed.join(',') : 'all';
            params.append('seccion', seccionVal);

            const yearSel = document.getElementById('filterYear');
            const years = this.getSelectedValues('filterYear');
            const anioVal = years.length ? years.join(',') : (yearSel?.value || 'all');
            params.append('anio', anioVal);

            if (this.selectedMonths.size && this.filters.periodo === 'select_months') {
                params.append('mes', Array.from(this.selectedMonths).join(','));
            } else if (this.filters.periodo && this.filters.periodo !== 'select_months') {
                params.append('periodo', this.filters.periodo);
            } else {
                params.append('mes', 'all');
            }

            params.append('tipo_medicion', 'TOTAL FEP,TOTAL DEP');

            const url = `${this.apiBaseUrl}/api/datos?${params}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            if (requestId !== this.fepDepRequestId) return;
            console.log(`📊 refreshFepDepTotals: ${data.length} registros recibidos`);
            const totals = this.calculateFepDepTotals(data);
            console.log('🧮 Totales calculados:', totals);
            this.renderFepDepTotals(totals.fep, totals.dep);
        } catch (error) {
            if (requestId !== this.fepDepRequestId) return;
            console.warn('⚠️ No se pudieron refrescar totales FEP/DEP con consulta global, usando datos actuales.', error);
            const totals = this.calculateFepDepTotals(this.data);
            this.renderFepDepTotals(totals.fep, totals.dep);
        }
    }

    updateKPIs() {
        if (!this.data.length) return;
        const values = this.data
            .map(d => this.parseNumericValue(d.frecuencia))
            .filter(v => Number.isFinite(v));
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
        } else if (str.includes(',')) {
            str = str.replace(',', '.');
        }
        
        const series = {};
        this.data.forEach(d => {
            const value = this.parseNumericValue(d.frecuencia);
            if (!Number.isFinite(value)) return;
            if (!series[d.combinationKey]) series[d.combinationKey] = { label: d.combinationLabel, vals: [] };
            series[d.combinationKey].vals.push(value);
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

    updateKPIs() {
        if (this._isUpdatingKPIs) return;
        this._isUpdatingKPIs = true;
        try {
            if (!Array.isArray(this.data) || !this.data.length) return;

            const values = [];
            for (const row of this.data) {
                const parsed = this.parseNumericValue(row.frecuencia);
                if (Number.isFinite(parsed)) values.push(parsed);
            }
            if (!values.length) return;

            let min = values[0];
            let max = values[0];
            let sum = 0;
            for (const value of values) {
                if (value < min) min = value;
                if (value > max) max = value;
                sum += value;
            }

            const range = max - min;
            const rangeVal = document.getElementById('rangeValue');
            if (rangeVal) rangeVal.textContent = range.toFixed(4);
            const rangeInfo = document.getElementById('rangeInfo');
            if (rangeInfo) rangeInfo.textContent = `${this.safeToFixed(min)}-${this.safeToFixed(max)}`;

            if (values.length > 1) {
                const mean = sum / values.length;
                let varianceAccum = 0;
                for (const value of values) varianceAccum += Math.pow(value - mean, 2);
                const variance = varianceAccum / values.length;
                const cv = mean !== 0 ? (Math.sqrt(variance) / mean) * 100 : 0;
                const varVal = document.getElementById('variabilityValue');
                if (varVal) varVal.textContent = cv.toFixed(2) + '%';
                const varBadge = document.getElementById('variabilityBadge');
                if (varBadge) {
                    varBadge.textContent = cv < 10 ? 'BAJA' : cv < 30 ? 'MEDIA' : 'ALTA';
                    varBadge.style.backgroundColor = cv < 10 ? '#10b981' : cv < 30 ? '#f59e0b' : '#ef4444';
                }
            }

            const series = {};
            for (const d of this.data) {
                const value = this.parseNumericValue(d.frecuencia);
                if (!Number.isFinite(value)) continue;
                if (!series[d.combinationKey]) series[d.combinationKey] = { label: d.combinationLabel, vals: [] };
                series[d.combinationKey].vals.push(value);
            }

            let worstKey = null;
            let worstAvg = -Infinity;
            for (const [k, v] of Object.entries(series)) {
                if (!v.vals.length) continue;
                let localSum = 0;
                for (const x of v.vals) localSum += x;
                const avg = localSum / v.vals.length;
                if (avg > worstAvg) {
                    worstAvg = avg;
                    worstKey = k;
                }
            }

            if (worstKey) {
                const ws = document.getElementById('worstSeries');
                if (ws) ws.textContent = series[worstKey].label;
                const wv = document.getElementById('worstValue');
                if (wv) wv.textContent = worstAvg.toFixed(4);
            }
        } catch (error) {
            console.error('❌ Error en updateKPIs:', error);
        } finally {
            this._isUpdatingKPIs = false;
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
    
    // ========== GRÁFICOS (ACTUALIZACIÓN CON ANIMACIONES) ==========
    updateCharts() {
        console.log("📊 Actualizando gráficos HD con animaciones...");
        if (!this.data.length) { 
            console.log("📉 No hay datos, limpiando gráficos");
            this.clearChartsAndTable(); 
            return; 
        }
        console.log(`📈 Datos disponibles: ${this.data.length} registros`);
        this.updateMainChart();
        this.updateRankingChart();
    }
    
    updateMainChart() {
        console.log("📈 Actualizando gráfico principal HD...");
        if (!this.mainChart) {
            console.warn("mainChart no inicializado");
            return;
        }
        
        const grouped = this.groupDataForChart();
        console.log("📊 Grupos para gráfico principal:", Object.keys(grouped));
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
                pointHoverRadius: 7,
                pointHoverBorderWidth: 3,
                pointHoverBackgroundColor: '#ffffff',
                borderCapStyle: 'round',
                borderJoinStyle: 'round'
            });
        });
        
        const labels = Array.from(labelsSet).sort();
        console.log("📅 Labels del gráfico:", labels);
        datasets.forEach(ds => {
            const pts = grouped[ds.label];
            ds.data = labels.map(lbl => {
                const [y,m] = lbl.split('-').map(Number);
                const p = pts.find(p => p.year===y && p.month===m);
                return p ? p.frecuencia : null;
            });
        });
        
        this.mainChart.data.labels = labels;
        this.mainChart.data.datasets = datasets;
        
        const chartType = document.getElementById('chartType')?.value || 'line';
        if (this.mainChart.config.type !== chartType) {
            this.mainChart.config.type = chartType;
            if (chartType === 'bar') {
                this.mainChart.data.datasets.forEach(ds => { ds.fill = false; ds.borderWidth = 1.5; });
            } else if (chartType === 'scatter') {
                this.mainChart.data.datasets.forEach(ds => { ds.showLine = false; ds.pointRadius = 5; });
            } else {
                this.mainChart.data.datasets.forEach(ds => { ds.showLine = true; ds.pointRadius = 0; });
            }
        }
        
        // ✨ Actualizar con animación suave
        this.mainChart.update();
        console.log("✅ Gráfico principal HD actualizado con animaciones");
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
        if (!this.mainChart?.data.datasets?.length) { 
            leg.innerHTML = '<div class="legend-empty">Sin datos</div>'; 
            return; 
        }
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
                    meta.hidden = !meta.hidden;
                    this.mainChart.update(); // Con animación
                    this.updateChartLegend();
                }
            });
        });
    }
    
    updateRankingChart() {
        console.log("📊 Actualizando ranking HD...");
        if (!this.rankingChart?.data) {
            console.warn("rankingChart no inicializado");
            return;
        }

        const displayMode = document.getElementById('rankingDisplayMode')?.value || 'chart';
        const rankingChartWrapper = document.getElementById('rankingChartWrapper');
        const rankingListWrapper = document.getElementById('rankingListWrapper');
        const showChart = displayMode === 'chart' || displayMode === 'both';
        const showList = displayMode === 'list' || displayMode === 'both';

        if (rankingChartWrapper) rankingChartWrapper.style.display = showChart ? '' : 'none';
        if (rankingListWrapper) rankingListWrapper.style.display = showList ? '' : 'none';

        if (!this.data.length) {
            this.latestRankingData = [];
            this.rankingItems = [];
            this.rankingChart.data.labels = [];
            rankingDataset.data = [];
            rankingDataset.backgroundColor = [];
            rankingDataset.borderColor = [];
            this.rankingChart.update('none');
            if (showList) this.renderRankingList([]);
            return;
        }

        const rankingGroup = document.getElementById('rankingGroup')?.value || 'alimentador';
        const sortBy = document.getElementById('rankingSort')?.value || 'avg';
        const viewMode = document.getElementById('rankingViewMode')?.value || 'top10';

        const series = {};
        if (rankingGroup === 'alimentador') {
            this.data.forEach(d => {
                const key = d.combinationLabel;
                if (!series[key]) series[key] = [];
                series[key].push(d.frecuencia);
            });
        } else {
            this.data.forEach(d => {
                const station = d.transformador.substring(0, 3);
                if (!series[station]) series[station] = [];
                series[station].push(d.frecuencia);
            });
        }

        const ranking = Object.entries(series).map(([label, values]) => {
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            const min = Math.min(...values);
            const max = Math.max(...values);
            const last = values[values.length - 1];
            return { label, avg, range: max - min, last };
        });

        ranking.sort((a, b) => {
            if (sortBy === 'stability') return a.range - b.range;
            if (sortBy === 'trend') return b.last - a.last;
            return b.avg - a.avg;
        });

        const top = viewMode === 'all' ? ranking : ranking.slice(0, 10);
        this.latestRankingData = ranking;
        this.rankingItems = ranking;
        const displayedRanking = viewMode === 'all' ? ranking : ranking.slice(0, 10);
        this.latestRankingData = displayedRanking;

        console.log(`🏆 Ranking mostrado (${viewMode}):`, displayedRanking);
        this.rankingChart.data.labels = displayedRanking.map(t => t.label);
        this.rankingChart.data.datasets[0].data = displayedRanking.map(t => t.avg);
        this.rankingChart.data.datasets[0].backgroundColor = displayedRanking.map((_,i) => this.chartPalette[i%this.chartPalette.length] + '80');
        this.rankingChart.data.datasets[0].borderColor = displayedRanking.map((_,i) => this.chartPalette[i%this.chartPalette.length]);

        // ✨ Actualizar con animación
        this.rankingChart.update();
        if (showList) this.renderRankingList(displayedRanking);
        console.log("✅ Ranking HD actualizado con animaciones");
    }

    renderRankingList(items) {
        const rankingListWrapper = document.getElementById('rankingListWrapper');
        if (!rankingListWrapper) return;

        if (!items.length) {
            rankingListWrapper.innerHTML = '<div class="legend-empty">Sin datos para mostrar</div>';
            return;
        }

        rankingListWrapper.innerHTML = items.map((item, index) => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; padding:0.5rem 0.35rem; border-bottom:${index === items.length - 1 ? 'none' : '1px solid rgba(148,163,184,0.18)'};">
                <div style="display:flex; align-items:center; gap:0.5rem; min-width:0;">
                    <span style="display:inline-flex; width:1.4rem; height:1.4rem; border-radius:999px; align-items:center; justify-content:center; font-weight:700; color:#0f172a; background:${this.chartPalette[index % this.chartPalette.length]}80;">${index + 1}</span>
                    <span style="font-weight:600; color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.label}</span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; line-height:1.15; flex-shrink:0;">
                    <span style="font-weight:700; color:#f8fafc;">${this.safeToFixed(item.avg, 4)} Hz</span>
                    <span style="font-size:0.8rem; color:#94a3b8;">Rango: ${this.safeToFixed(item.range, 4)} · Último: ${this.safeToFixed(item.last, 4)}</span>
                </div>
            </div>
        `).join('');
    }

    openFullRankingTab() {
        const source = Array.isArray(this.latestRankingData) ? this.latestRankingData : (this.rankingItems || []);
        const payload = {
            labels: source.map(item => item.label),
            data: source.map(item => item.avg),
            title: 'Ranking completo',
            subtitle: `Total de elementos: ${source.length}`,
            palette: this.chartPalette
        };
        localStorage.setItem('ande_ranking_full_data', JSON.stringify(payload));
        window.open('ranking.html', '_blank', 'width=1600,height=1000');
    }

    updateScatterChart() {
        console.log("📉 Actualizando gráfico de dispersión HD...");
        if (!this.scatterChart) {
            console.warn("scatterChart no inicializado");
            return;
        }
        if (!this.data.length) {
            this.scatterChart.data.datasets = [];
            this.scatterChart.update('none');
            return;
        }
        
        const feeders = [...new Set(this.data.map(d=>d.transformador))];
        console.log("🔌 Alimentadores en dispersión:", feeders);

        // Construir labels ordenados (YYYY-MM)
        const labelsSet = new Set();
        this.data.forEach(d => labelsSet.add(`${d.year}-${String(d.month).padStart(2,'0')}`));
        const labels = Array.from(labelsSet).sort();

        const datasets = feeders.map((f, i) => ({
            label: f,
            data: labels.map(lbl => {
                const [y, m] = lbl.split('-').map(Number);
                const pt = this.data.find(d => d.transformador === f && d.year === y && d.month === m);
                return pt ? pt.frecuencia : null;
            }),
            backgroundColor: this.chartPalette[i%this.chartPalette.length] + '80',
            borderColor: this.chartPalette[i%this.chartPalette.length],
            borderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointHoverBorderWidth: 3
        }));
        this.scatterChart.data.labels = labels;
        this.scatterChart.data.datasets = datasets;
        
        // ✨ Actualizar con animación
        this.scatterChart.update();
        console.log("✅ Dispersión HD actualizada con animaciones");
    }
    
    updatePieCharts() {
        console.log("🥧 Actualizando gráficos de pastel HD...");
        if (!this.data.length) {
            if (this.pieChartByFeeder) {
                this.pieChartByFeeder.data.labels = [];
                this.pieChartByFeeder.data.datasets[0].data = [];
                this.pieChartByFeeder.update('none');
            }
            if (this.pieChartByType) {
                this.pieChartByType.data.labels = [];
                this.pieChartByType.data.datasets[0].data = [];
                this.pieChartByType.update('none');
            }
            return;
        }
        
        const feederData = {};
        this.data.forEach(d => feederData[d.transformador] = (feederData[d.transformador] || 0) + d.frecuencia);
        const feederLabels = Object.keys(feederData);
        const feederValues = Object.values(feederData);
        console.log("🥧 Datos pastel alimentadores:", feederLabels);
        if (this.pieChartByFeeder) {
            this.pieChartByFeeder.data.labels = feederLabels;
            this.pieChartByFeeder.data.datasets[0].data = feederValues;
            this.pieChartByFeeder.data.datasets[0].backgroundColor = feederLabels.map((_,i) => this.chartPalette[i%this.chartPalette.length]);
            this.pieChartByFeeder.update(); // ✨ Con animación
        }
        
        const typeData = {};
        this.data.forEach(d => typeData[d.tipo] = (typeData[d.tipo] || 0) + d.frecuencia);
        const typeLabels = Object.keys(typeData);
        const typeValues = Object.values(typeData);
        console.log("🥧 Datos pastel tipo:", typeLabels);
        if (this.pieChartByType) {
            this.pieChartByType.data.labels = typeLabels;
            this.pieChartByType.data.datasets[0].data = typeValues;
            this.pieChartByType.data.datasets[0].backgroundColor = typeLabels.map((_,i) => this.chartPalette[(i+5)%this.chartPalette.length]);
            this.pieChartByType.update(); // ✨ Con animación
        }
    }
    
    getCompleteSelectedStations() {
        const selectedFeeders = this.getSelectedValues('filterTransformador');
        if (!selectedFeeders.length) return [];

        const stationToFeeders = {};
        this.allSecciones.forEach(f => {
            const st = f.substring(0, 3);
            if (!stationToFeeders[st]) stationToFeeders[st] = [];
            stationToFeeders[st].push(f);
        });

        return Object.entries(stationToFeeders)
            .filter(([, feeders]) => feeders.every(f => selectedFeeders.includes(f)))
            .map(([station]) => station)
            .sort();
    }

    getStationSummaryBundle(stations) {
        const validStations = (stations || []).filter(Boolean);
        const byStation = {};

        validStations.forEach(station => {
            const stationData = this.data.filter(d => d.transformador?.startsWith(station));
            const feederAvg = {};
            stationData.forEach(d => {
                if (!feederAvg[d.transformador]) feederAvg[d.transformador] = { sum: 0, count: 0 };
                feederAvg[d.transformador].sum += d.frecuencia;
                feederAvg[d.transformador].count += 1;
            });
            const labels = Object.keys(feederAvg);
            byStation[station] = {
                labels,
                data: labels.map(l => feederAvg[l].sum / feederAvg[l].count),
                colors: labels.map((_, i) => this.chartPalette[i % this.chartPalette.length])
            };
        });

        const allLabels = validStations;
        const allData = validStations.map(st => {
            const vals = byStation[st]?.data || [];
            return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
        });

        return {
            stations: validStations,
            byStation,
            allStations: {
                labels: allLabels,
                data: allData,
                colors: allLabels.map((_, i) => this.chartPalette[i % this.chartPalette.length])
            }
        };
    }

    updateStationSummary() {
        if (!this.stationSummaryChart) return;

        const container = document.getElementById('stationSummaryContainer');
        const stationName = document.getElementById('stationName');
        const selector = document.getElementById('stationSummarySelect');
        if (!container || !selector) return;

        const completeStations = this.getCompleteSelectedStations();
        if (!completeStations.length) {
            container.style.display = 'none';
            return;
        }

        const bundle = this.getStationSummaryBundle(completeStations);
        container.style.display = 'block';

        const previous = this.stationSummarySelection;
        selector.innerHTML = '<option value="__ALL__">Resumen global de estaciones seleccionadas</option>' +
            bundle.stations.map(st => `<option value="${st}">${st}</option>`).join('');

        if (previous && (previous === '__ALL__' || bundle.stations.includes(previous))) {
            selector.value = previous;
        } else {
            selector.value = bundle.stations.length === 1 ? bundle.stations[0] : '__ALL__';
        }
        this.stationSummarySelection = selector.value;

        let labels = [];
        let data = [];
        let colors = [];

        if (this.stationSummarySelection === '__ALL__') {
            labels = bundle.allStations.labels;
            data = bundle.allStations.data;
            colors = bundle.allStations.colors;
            this.currentStationGroup = 'Múltiples estaciones';
        } else {
            const current = bundle.byStation[this.stationSummarySelection] || { labels: [], data: [], colors: [] };
            labels = current.labels;
            data = current.data;
            colors = current.colors;
            this.currentStationGroup = this.stationSummarySelection;
        }

        if (stationName) stationName.textContent = this.currentStationGroup;
        this.stationSummaryChart.data.labels = labels;
        this.stationSummaryChart.data.datasets[0].data = data;
        this.stationSummaryChart.data.datasets[0].backgroundColor = colors;
        
        // ✨ Actualizar con animación
        this.stationSummaryChart.update();
        console.log("✅ Resumen de estación HD actualizado con animaciones");
    }

    // ========== CONTROLES DE GRÁFICOS ==========
    // ========== CONTROLES DE GRÁFICOS ==========
    onChartTypeChange() { 
        console.log("🔄 Tipo de gráfico cambiado a:", document.getElementById('chartType')?.value);
        this.updateMainChart(); 
    }
    
    toggleChartPoints() {
        if (!this.mainChart) return;
        const show = this.mainChart.data.datasets[0]?.pointRadius === 0;
        console.log("🔄 Toggle puntos:", show ? "mostrar" : "ocultar");
        this.mainChart.data.datasets.forEach(ds => { 
            ds.pointRadius = show ? 4 : 0; 
            ds.pointHoverRadius = show ? 7 : 6; 
        });
        this.mainChart.update(); // Con animación
    }
    
    zoomChart(dir) {
        if (!this.mainChart) return;
        const scale = dir === 'in' ? 0.8 : 1.2;
        console.log("🔍 Zoom:", dir);
        if (this.mainChart.options.scales.x.min && this.mainChart.options.scales.x.max) {
            const range = this.mainChart.options.scales.x.max - this.mainChart.options.scales.x.min;
            const center = (this.mainChart.options.scales.x.min + this.mainChart.options.scales.x.max) / 2;
            this.mainChart.options.scales.x.min = center - (range * scale) / 2;
            this.mainChart.options.scales.x.max = center + (range * scale) / 2;
            this.mainChart.update();
        }
    }
    
    resetChartZoom() {
        console.log("🔄 Reset zoom");
        if (!this.mainChart) return;
        this.mainChart.options.scales.x.min = undefined;
        this.mainChart.options.scales.x.max = undefined;
        this.mainChart.options.scales.y.min = undefined;
        this.mainChart.options.scales.y.max = undefined;
        this.mainChart.update(); // Con animación
    }
    
    onGroupByChange() {
        this.groupBy = document.getElementById('groupBy')?.value || 'alimentador';
        console.log("🔄 Agrupación cambiada a:", this.groupBy);
        this.updateCharts();
    }
    
    expandRankingChart() {
        console.log("🖥️ Abriendo ranking completo en nueva pestaña");
        const selectedGroup = document.getElementById('rankingGroup')?.value || 'alimentador';
        const selectedSort = document.getElementById('rankingSort')?.value || 'avg';
        const selectedLimit = document.getElementById('rankingViewMode')?.value || 'top10';

        const rankingSeries = {};
        this.data.forEach(d => {
            const key = selectedGroup === 'estacion'
                ? d.transformador.substring(0, 3)
                : d.combinationLabel;
            if (!rankingSeries[key]) rankingSeries[key] = [];
            rankingSeries[key].push(d.frecuencia);
        });

        const rankingAll = this.rankingItems?.length ? this.rankingItems : [];
        const chartData = {
            rankingOnly: true,
            rankingChart: {
                labels: rankingAll.map(r => r.label),
                data: rankingAll.map(r => r.avg),
                colors: rankingAll.map((_,i) => this.chartPalette[i % this.chartPalette.length] + '80')
            },
            rankingChartAll: {
                labels: rankingAll.map(r => r.label),
                data: rankingAll.map(r => r.avg),
                colors: rankingAll.map((_,i) => this.chartPalette[i % this.chartPalette.length] + '80')
            },
            rankingFullData: {
                series: rankingSeries
            },
            palette: this.chartPalette,
            rankingMeta: {
                totalItems: rankingAll.length,
                sort: selectedSort,
                group: selectedGroup,
                limit: selectedLimit
            }
        };
        localStorage.setItem('ande_chart_data', JSON.stringify(chartData));
        window.open('chart.html?view=ranking', '_blank', 'width=1500,height=980');
    }

    // ========== EXPANDIR GRÁFICOS ==========
    expandChart() {
        console.log("🖥️ Expandiendo gráficos a nueva ventana");
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
            rankingChartAll: {
                labels: (this.rankingItems || []).map(r => r.label),
                data: (this.rankingItems || []).map(r => r.avg),
                colors: (this.rankingItems || []).map((_, i) => this.chartPalette[i % this.chartPalette.length] + '80')
            },
            scatterChart: {
                labels: this.scatterChart?.data.labels || [],
                datasets: (this.scatterChart?.data.datasets || []).map(ds => ({
                    label: ds.label,
                    data: ds.data,
                    backgroundColor: ds.backgroundColor,
                    borderColor: ds.borderColor,
                    borderWidth: ds.borderWidth,
                    pointRadius: ds.pointRadius
                }))
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
            stationSummaryBundle: this.expandedStationSummaryBundle || this.getStationSummaryBundle(this.getCompleteSelectedStations()),
            stationSummarySelection: this.stationSummarySelection || '__ALL__',
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
        console.log("📋 Actualizando tabla...");
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
        console.log("📄 Ir a página:", p);
        this.pagination.currentPage = p;
        this.updateTable();
        document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    sortTable(col) {
        if (this.sortConfig.column === col) this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        else { this.sortConfig.column = col; this.sortConfig.direction = 'asc'; }
        console.log("🔽 Ordenando tabla por:", col, this.sortConfig.direction);
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
        console.log("🔍 Filtrando tabla por:", term);
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
        console.log("🔍 Ver detalles de:", d);
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
        console.log("📤 Subiendo archivo:", file.name);
        const formData = new FormData();
        formData.append('archivo', file);
        this.showLoading(true, "Subiendo Excel...", null);
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/subir-excel`, { method: 'POST', body: formData });
            const result = await res.json();
            if (res.ok) {
                this.showNotification(`✅ ${result.insertadas} filas insertadas, ${result.errores} errores`, "success");
                setTimeout(async () => {
                    await this.loadTiposMedicion();
                    await this.loadSeccionesDisponibles();
                    await this.loadYearsAvailable();
                    await this.loadData();
                    await this.loadCargas();
                }, 1000);
            } else throw new Error(result.error);
        } catch (e) {
            console.error("❌ Error subiendo Excel:", e);
            this.showNotification(`Error: ${e.message}`, "error");
        } finally {
            this.showLoading(false);
            document.getElementById('excelFileInput').value = '';
        }
    }
    
    async loadCargas() {
        console.log("📥 Cargando historial de cargas...");
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/cargas`);
            const cargas = await res.json();
            this.renderCargas(cargas);
            await this.loadEstadisticas();
        } catch (e) { console.error("Error cargando cargas:", e); }
    }
    
    renderCargas(cargas) {
        console.log("📋 Renderizando historial de cargas, total:", cargas.length);
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
        console.log("🗑️ Eliminando carga ID:", id);
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/cargas/${id}`, { method: 'DELETE' });
            const result = await res.json();
            if (res.ok) {
                this.showNotification(`Carga eliminada (${result.filas_eliminadas} filas)`, "success");
                setTimeout(async () => { await this.loadCargas(); await this.loadData(); }, 1000);
            } else throw new Error(result.error);
        } catch (e) {
            console.error("❌ Error eliminando carga:", e);
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
        if (this.liveUpdatesIntervalId) clearInterval(this.liveUpdatesIntervalId);
        this.liveUpdatesIntervalId = setInterval(() => {
            if (!this.serverConnected) return;
            if (typeof document !== 'undefined' && document.hidden) return;
            if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
            if (this.isLoadingData) return;
            console.log("🔄 Actualización automática");
            this.loadData();
            this.loadCargas();
        }, 300000);
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
    const required = ['globalModeUnique','globalModeMultiple','stationCountInput','applyFilters','filterTipoMedicion','filterTransformador','filterYear','mainChart'];
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
