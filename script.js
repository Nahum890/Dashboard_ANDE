// script.js
console.log("🚀 Dashboard iniciando...");
console.log("📍 URL actual:", window.location.href);
console.log("🌐 Origen:", window.location.origin);
console.log("🔗 Protocolo:", window.location.protocol);
console.log("🏠 Hostname:", window.location.hostname);
console.log("🚪 Puerto:", window.location.port);

class ANDEDashboard {
    constructor() {
        // Usa mismo origen por defecto; permite override opcional con window.API_BASE_URL
        this.apiBaseUrl = window.API_BASE_URL || window.location.origin;
        this.data = [];
        this.filteredData = [];
        this.mainChart = null;
        this.rankingChart = null;
        this.scatterChart = null;
        this.previousData = null;
        this.sortConfig = { column: null, direction: 'asc' };

        // Paleta de colores expandida para muchas series
        this.chartPalette = [
            '#FF0000', '#FF4500', '#FF8C00', '#FFD700', '#ADFF2F', '#32CD32', 
            '#00FA9A', '#00CED1', '#1E90FF', '#4169E1', '#8A2BE2', '#DA70D6',
            '#FF1493', '#FF69B4', '#C71585', '#8B0000', '#B22222', '#DC143C',
            '#FF6347', '#FF7F50', '#FFA500', '#FFD700', '#FFFF00', '#9ACD32',
            '#6B8E23', '#228B22', '#008000', '#006400', '#2E8B57', '#20B2AA'
        ];
        this.activeColorMap = {};
        this.seriesMap = {}; // Mapa de series únicas
        this.allSecciones = []; // Todas las secciones disponibles
        this.estaciones = []; // Lista de estaciones únicas (primeras 3 letras)
        this.monthSelectionMode = 'unique'; // 'unique' o 'multiple'
        this.globalComparisonMode = 'unique'; // 'unique' o 'multiple' - NUEVO: Modo global
        this.lastSelectedMonth = null;

        this.filters = {
            tipoMedicion: [],    // Array
            transformador: [],   // Array
            year: [],            // Array
            month: [],           // Array para selección múltiple
            estacion: '',        // Filtro de estación
            periodo: 'select_months'  // Por defecto "Seleccionar Meses"
        };

        this.groupBy = 'alimentador'; // Por defecto agrupar por alimentador
        
        this.pagination = { currentPage: 1, rowsPerPage: 25, totalPages: 1 };
        this.chartZoom = { min: null, max: null };
        
        this.initialize();
    }
    // ===================================
    // FUNCIÓN AUXILIAR PARA MANEJO SEGURO DE VALORES (CORRECCIÓN AGREGADA)
    // ===================================
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
            this.updateComparisonTags();
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
            // CAMBIADO: Usar this.apiBaseUrl en lugar de URL relativa
            const res = await fetch(`${this.apiBaseUrl}/api/tipos-medicion`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const tipos = await res.json();
            
            if (tipos && tipos.length > 0) {
                console.log("✅ Tipos de medición cargados desde BD:", tipos);
                this.fillMultiSelect('filterTipoMedicion', tipos);
            } else {
                throw new Error("No hay tipos de medición en la BD");
            }
        } catch (error) {
            console.warn("⚠️  Usando tipos de medición por defecto:", error.message);
            this.fillMultiSelect('filterTipoMedicion', [
                'ACCID.DEP', 'ACCID.FEP', 'PROG.FEP', 'PROD.FEP', 'TOTAL FEP',
                'ACCID.PENF', 'PROG.PENF', 'PROD.PENF', 'TOTAL PENEF', 'PROG.DEP',
                'PROD.DEP', 'TOTAL DEP'
            ]);
        }
    }

    async loadSeccionesDisponibles() {
        try {
            // CAMBIADO: Usar this.apiBaseUrl en lugar de URL relativa
            const res = await fetch(`${this.apiBaseUrl}/api/secciones`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const secciones = await res.json();
            
            if (secciones && secciones.length > 0) {
                console.log("✅ Secciones cargadas desde BD:", secciones.length, "total");
                this.allSecciones = secciones;
                
                // Extraer estaciones únicas (primeras 3 letras)
                const estacionesSet = new Set();
                secciones.forEach(seccion => {
                    if (seccion && seccion.length >= 3) {
                        estacionesSet.add(seccion.substring(0, 3));
                    }
                });
                this.estaciones = Array.from(estacionesSet).sort();
                
                // Llenar select de estaciones
                this.fillEstacionSelect();
                
                // Llenar select de alimentadores (inicialmente todos)
                this.fillMultiSelect('filterTransformador', secciones);
            } else {
                throw new Error("No hay secciones en la BD");
            }
        } catch (error) {
            console.warn("⚠️  Usando secciones por defecto:", error.message);
            const defaultSecciones = [
                'ACY1', 'ACY2', 'ACY3', 'ACY4', 'ACY5', 'ACY6'
            ];
            this.allSecciones = defaultSecciones;
            this.estaciones = ['ACY'];
            this.fillEstacionSelect();
            this.fillMultiSelect('filterTransformador', defaultSecciones);
        }
    }

    fillEstacionSelect() {
        const selectEstacion = document.getElementById('filterEstacion');
        // Limpiar opciones existentes excepto "Todas"
        selectEstacion.innerHTML = '<option value="">Todas las estaciones</option>';
        
        this.estaciones.forEach(estacion => {
            const option = document.createElement('option');
            option.value = estacion;
            option.textContent = estacion;
            selectEstacion.appendChild(option);
        });
    }

    filterAlimentadoresByEstacion(estacion) {
        if (!estacion) {
            // Mostrar todos los alimentadores
            this.fillMultiSelect('filterTransformador', this.allSecciones);
        } else {
            // Filtrar alimentadores que comienzan con la estación seleccionada
            const filteredSecciones = this.allSecciones.filter(seccion => 
                seccion.startsWith(estacion)
            );
            this.fillMultiSelect('filterTransformador', filteredSecciones);
        }
    }

    async loadYearsAvailable() {
        try {
            // CAMBIADO: Usar this.apiBaseUrl en lugar de URL relativa
            const res = await fetch(`${this.apiBaseUrl}/api/anios`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const years = await res.json();
            
            if (years && years.length > 0) {
                console.log("✅ Años cargados desde BD:", years);
                years.sort((a, b) => b - a); // Ordenar descendente
                this.fillMultiSelect('filterYear', years);
            } else {
                throw new Error("No hay años en la BD");
            }
        } catch (error) {
            console.warn("⚠️  Usando años por defecto:", error.message);
            const years = [2025, 2024, 2023, 2022, 2021, 2020, 2019];
            this.fillMultiSelect('filterYear', years);
        }
    }

    fillMultiSelect(id, data) {
        const select = document.getElementById(id);
        if (!select) return;
        
        select.innerHTML = '';
        
        data.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item;
            opt.textContent = item;
            select.appendChild(opt);
        });
    }

    // ===================================
    // NUEVO: MÉTODOS PARA MODO GLOBAL
    // ===================================
    
    setGlobalComparisonMode(mode) {
        this.globalComparisonMode = mode;
        document.body.classList.remove('global-mode-unique', 'global-mode-multiple');
        document.body.classList.add(mode === 'unique' ? 'global-mode-unique' : 'global-mode-multiple');
        
        // Actualizar botones de modo global
        if (mode === 'unique') {
            document.getElementById('globalModeUnique').classList.add('active');
            document.getElementById('globalModeMultiple').classList.remove('active');
            document.getElementById('globalModeHint').innerHTML = 
                '<i class="fas fa-info-circle"></i> Modo único: selecciona un valor por filtro';
            
            // En modo único, limitar a una selección en todos los filtros
            this.limitToSingleSelection('filterYear');
            this.limitToSingleSelection('filterTipoMedicion');
            this.limitToSingleSelection('filterTransformador');
            this.limitToSingleSelection('filterMonth');
            
            // También forzar modo único en meses
            this.setMonthSelectionMode('unique');
            
        } else {
            document.getElementById('globalModeUnique').classList.remove('active');
            document.getElementById('globalModeMultiple').classList.add('active');
            document.getElementById('globalModeHint').innerHTML = 
                '<i class="fas fa-info-circle"></i> Modo múltiple: selecciona varios valores (Ctrl + Click / Shift + Click)';
            
            // Permitir múltiples selecciones
            this.allowMultipleSelections('filterYear');
            this.allowMultipleSelections('filterTipoMedicion');
            this.allowMultipleSelections('filterTransformador');
            this.allowMultipleSelections('filterMonth');
            
            // Permitir múltiples selecciones en meses
            this.setMonthSelectionMode('multiple');
        }

        this.updateMonthModeVisibility();
        
        this.showNotification(`Modo de comparación: ${mode === 'unique' ? 'único' : 'múltiple'}`, "info");
    }

    limitToSingleSelection(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        // Si hay más de uno seleccionado, dejar solo el primero
        const selectedOptions = Array.from(select.selectedOptions);
        if (selectedOptions.length > 1) {
            // Deseleccionar todos excepto el primero
            selectedOptions.slice(1).forEach(option => {
                option.selected = false;
            });
        }
    }

    allowMultipleSelections(selectId) {
        // En modo múltiple, no hacemos nada especial
        // Los selectores múltiples ya permiten Ctrl+Click
        console.log(`Permitiendo múltiples selecciones en: ${selectId}`);
    }

    // --- LÓGICA DE FILTROS MEJORADA ---
    setInitialDefaults() {
        console.log("🔧 Configurando valores predeterminados para comparación...");
        
        // Configurar modo global único por defecto - NUEVO
        this.setGlobalComparisonMode('unique');
        
        // Seleccionar algunos valores por defecto para demostración
        const tipoSel = document.getElementById('filterTipoMedicion');
        const yearSel = document.getElementById('filterYear');
        const transSel = document.getElementById('filterTransformador');
        
        // Seleccionar primer tipo (solo uno porque estamos en modo único)
        if (tipoSel.options.length > 0) {
            tipoSel.options[0].selected = true;
        }
        
        // Seleccionar año 2025 por defecto (solo uno)
        let found2025 = false;
        for (let i = 0; i < yearSel.options.length; i++) {
            if (yearSel.options[i].value === '2025') {
                yearSel.options[i].selected = true;
                found2025 = true;
                break;
            }
        }
        
        // Si no existe 2025, seleccionar el primer año disponible
        if (!found2025 && yearSel.options.length > 0) {
            yearSel.options[0].selected = true;
        }
        
        // Seleccionar primer alimentador (solo uno)
        if (transSel.options.length > 0) {
            transSel.options[0].selected = true;
        }
        
        // Configurar agrupación
        document.getElementById('groupBy').value = 'alimentador';
        
        // Configurar período en "Seleccionar Meses"
        document.getElementById('filterPeriodo').value = 'select_months';
        
        // Establecer modo único por defecto para meses
        this.monthSelectionMode = 'unique';
        
        // Mostrar los selectores de mes
        this.updateMonthModeVisibility();

        this.syncFilters();
        this.updateComparisonTags();
    }

    syncFilters() {
        const tipoOpts = Array.from(document.getElementById('filterTipoMedicion').selectedOptions);
        const yearOpts = Array.from(document.getElementById('filterYear').selectedOptions);
        const transOpts = Array.from(document.getElementById('filterTransformador').selectedOptions);
        const monthOpts = Array.from(document.getElementById('filterMonth').selectedOptions);
        
        this.filters = {
            tipoMedicion: tipoOpts.map(o => o.value),
            transformador: transOpts.map(o => o.value),
            year: yearOpts.map(o => o.value),
            month: monthOpts.map(o => o.value), // Ahora es un array
            estacion: document.getElementById('filterEstacion').value,
            periodo: document.getElementById('filterPeriodo').value
        };
        
        this.groupBy = document.getElementById('groupBy').value;
        
        console.log("📋 Filtros actualizados:", this.filters);
        console.log("📊 Agrupar por:", this.groupBy);
        console.log("🌐 Modo global:", this.globalComparisonMode);
    }

    updateComparisonTags() {
        const tagsContainer = document.getElementById('comparisonTags');
        tagsContainer.innerHTML = '';
        
        let hasSelections = false;
        
        // Modo global
        const modeTag = document.createElement('span');
        modeTag.className = this.globalComparisonMode === 'unique' ? 'tag mode-unique-tag' : 'tag mode-multiple-tag';
        modeTag.innerHTML = `<i class="fas fa-exchange-alt"></i> Modo: ${this.globalComparisonMode === 'unique' ? 'Único' : 'Múltiple'}`;
        tagsContainer.appendChild(modeTag);
        hasSelections = true;
        
        // Años
        if (this.filters.year.length > 0) {
            const tag = document.createElement('span');
            tag.className = 'tag year-tag';
            tag.innerHTML = `<i class="fas fa-calendar"></i> ${this.filters.year.length} año(s)`;
            tagsContainer.appendChild(tag);
            hasSelections = true;
        }
        
        // Alimentadores
        if (this.filters.transformador.length > 0) {
            const tag = document.createElement('span');
            tag.className = 'tag transformer-tag';
            tag.innerHTML = `<i class="fas fa-transformer"></i> ${this.filters.transformador.length} alimentador(es)`;
            tagsContainer.appendChild(tag);
            hasSelections = true;
        }
        
        // Estación (si está seleccionada)
        if (this.filters.estacion) {
            const tag = document.createElement('span');
            tag.className = 'tag station-tag';
            tag.innerHTML = `<i class="fas fa-building"></i> Estación: ${this.filters.estacion}`;
            tagsContainer.appendChild(tag);
            hasSelections = true;
        }
        
        // Tipos de medición
        if (this.filters.tipoMedicion.length > 0) {
            const tag = document.createElement('span');
            tag.className = 'tag type-tag';
            tag.innerHTML = `<i class="fas fa-chart-line"></i> ${this.filters.tipoMedicion.length} tipo(s)`;
            tagsContainer.appendChild(tag);
            hasSelections = true;
        }
        
        // Meses (si están seleccionados)
        if (this.filters.month.length > 0) {
            const tag = document.createElement('span');
            tag.className = 'tag month-tag';
            tag.innerHTML = `<i class="fas fa-calendar-alt"></i> ${this.filters.month.length} mes(es)`;
            tagsContainer.appendChild(tag);
            hasSelections = true;
        }
        
        // Período (si está seleccionado)
        if (this.filters.periodo) {
            const tag = document.createElement('span');
            tag.className = 'tag period-tag';
            tag.innerHTML = `<i class="fas fa-clock"></i> ${this.getPeriodoLabel(this.filters.periodo)}`;
            tagsContainer.appendChild(tag);
            hasSelections = true;
        }
        
        if (!hasSelections) {
            const tag = document.createElement('span');
            tag.className = 'tag hint';
            tag.textContent = 'Selecciona filtros para comparar';
            tagsContainer.appendChild(tag);
        }
        
        // Actualizar contador de series posibles
        const monthMultiplier = this.filters.month.length > 0 ? this.filters.month.length : 1;
        const totalCombinations = this.filters.year.length * 
                                 this.filters.transformador.length * 
                                 this.filters.tipoMedicion.length * 
                                 monthMultiplier;
        document.getElementById('activeSeries').textContent = totalCombinations;
    }

    async loadData() {
        this.showLoading(true);
        try {
            this.previousData = this.data.length > 0 ? [...this.data] : null;
            
            // Validar según modo global - NUEVO
            if (this.globalComparisonMode === 'unique') {
                // En modo único, validar que haya al menos un valor en cada filtro
                if (!this.filters.transformador[0] || !this.filters.year[0] || !this.filters.tipoMedicion[0]) {
                    console.log("⚠️  Faltan filtros en modo único");
                    this.showNotification("Selecciona un valor en cada filtro", "warning");
                    this.showLoading(false);
                    return;
                }
            } else {
                // En modo múltiple, validar que haya al menos una selección
                if (this.filters.transformador.length === 0 || 
                    this.filters.year.length === 0 || 
                    this.filters.tipoMedicion.length === 0) {
                    console.log("⚠️  No hay filtros seleccionados, cargando datos demo");
                    this.loadDemoComparisonData();
                    return;
                }
            }
            
            // Cargar datos para cada combinación
            this.data = [];
            const promises = [];
            
            // Determinar los meses a consultar
            const monthsToQuery = this.filters.month.length > 0 ? this.filters.month : [null];
            
            // Crear combinaciones de filtros
            for (const year of this.filters.year) {
                for (const tipo of this.filters.tipoMedicion) {
                    for (const seccion of this.filters.transformador) {
                        for (const month of monthsToQuery) {
                            promises.push(
                                this.loadCombinationData(year, tipo, seccion, month)
                            );
                        }
                    }
                }
            }
            
            // Esperar todas las peticiones
            const results = await Promise.all(promises);
            this.data = results.flat();
            this.filteredData = [...this.data];

            console.log("✅ Datos cargados:", this.data.length, "registros");

            // Actualizar estadísticas
            this.updateStats();
            this.updateKPIs();
            this.updateCharts();
            this.pagination.currentPage = 1;
            this.updateTable();
            
            this.showNotification(`Comparación cargada: ${this.data.length} registros`, "success");
            
        } catch (e) {
            console.error('❌ Error cargando datos:', e);
            this.showNotification("Error cargando datos del servidor", "error");
            this.loadDemoComparisonData();
        } finally { 
            this.showLoading(false);
        }
    }

    async loadCombinationData(year, tipoMedicion, seccion, month = null) {
        const params = new URLSearchParams();
        params.append('anio', year);
        params.append('tipo_medicion', tipoMedicion.trim());
        params.append('seccion', seccion.trim());
        
        if(month) params.append('mes', month);

        // CAMBIADO: Usar this.apiBaseUrl en lugar de variable no definida API_BASE_URL
        const url = `${this.apiBaseUrl}/api/datos?${params.toString()}`;
        console.log("🌐 Solicitando combinación:", url);
        
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`);
        
        const data = await res.json();
        
        // Añadir metadatos de la combinación
        return data.map(item => ({
            ...item,
            combinationKey: `${seccion}-${year}-${tipoMedicion}`,
            combinationLabel: this.getCombinationLabel(seccion, year, tipoMedicion),
            year: year,
            tipo: tipoMedicion
        }));
    }

    getCombinationLabel(alimentador, year, tipo) {
        // Crear etiqueta basada en la configuración de agrupación
        switch(this.groupBy) {
            case 'alimentador':
                return `${alimentador} (${year}, ${tipo})`;
            case 'year':
                return `${year} - ${alimentador} (${tipo})`;
            case 'tipo':
                return `${tipo} - ${alimentador} (${year})`;
            case 'combinado':
                return `${alimentador}/${year}/${tipo}`;
            default:
                return `${alimentador}-${year}-${tipo}`;
        }
    }

    loadDemoComparisonData() {
        console.log("📂 Cargando datos de demostración para comparación...");
        
        const demoData = [];
        const years = this.filters.year.length > 0 ? this.filters.year : ['2024'];
        const alimentadores = this.filters.transformador.length > 0 ? 
            this.filters.transformador : ['ACY1'];
        const tipos = this.filters.tipoMedicion.length > 0 ? 
            this.filters.tipoMedicion : ['TOTAL PENEF'];
        
        let idCounter = 0;
        
        years.forEach(year => {
            tipos.forEach(tipo => {
                alimentadores.forEach(alimentador => {
                    for (let month = 1; month <= 12; month++) {
                        demoData.push({
                            id: idCounter++,
                            transformador: alimentador,
                            frecuencia: this.generateComparisonValue(year, tipo, alimentador, month),
                            fecha: `${year}-${String(month).padStart(2, '0')}-01`,
                            tipo: tipo,
                            departamento: 'ALTO PARANÁ',
                            combinationKey: `${alimentador}-${year}-${tipo}`,
                            combinationLabel: this.getCombinationLabel(alimentador, year, tipo),
                            year: year
                        });
                    }
                });
            });
        });
        
        this.data = demoData;
        this.filteredData = [...demoData];
        
        console.log("📊 Datos demo generados:", demoData.length, "registros de",
                   years.length * tipos.length * alimentadores.length, "combinaciones");
        
        this.updateStats();
        this.updateKPIs();
        this.updateCharts();
        this.updateTable();
        
        this.showNotification("Usando datos de demostración para comparación", "warning");
    }
    
    generateComparisonValue(year, tipo, alimentador, month) {
        // Valores base por tipo
        let baseValue;
        switch(tipo) {
            case 'TOTAL PENEF':
            case 'TOTAL DEP':
            case 'TOTAL FEP':
                baseValue = 50000;
                break;
            case 'ACCID.DEP':
            case 'ACCID.FEP':
            case 'ACCID.PENF':
                baseValue = 5;
                break;
            case 'PROG.DEP':
            case 'PROG.FEP':
            case 'PROG.PENF':
                baseValue = 0.5;
                break;
            default:
                baseValue = 50;
        }
        
        // Variación por año
        const yearFactor = parseInt(year) - 2020;
        
        // Variación por alimentador (basado en hash simple)
        const alimentadorHash = alimentador.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const alimentadorFactor = (alimentadorHash % 10) / 10;
        
        // Variación por mes
        const monthFactor = Math.sin(month * 0.5) * 0.3;
        
        // Variación aleatoria
        const randomFactor = (Math.random() - 0.5) * 0.2;
        
        return baseValue * (1 + yearFactor * 0.05) * 
               (1 + alimentadorFactor) * 
               (1 + monthFactor) * 
               (1 + randomFactor);
    }

    updateStats() {
        const totalPoints = this.data.length;
        const uniqueCombinations = [...new Set(this.data.map(d => d.combinationKey))].length;
        
        document.getElementById('dataCount').textContent = totalPoints.toLocaleString();
        document.getElementById('seriesCount').textContent = uniqueCombinations;
        document.getElementById('loadedSeries').textContent = uniqueCombinations;
        document.getElementById('totalPoints').textContent = totalPoints;
        document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
        document.getElementById('updateTime').textContent = new Date().toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // --- GRÁFICOS MEJORADOS PARA COMPARACIÓN ---
    initCharts() {
        Chart.defaults.font.family = "'Inter', 'Segoe UI', system-ui, sans-serif";
        Chart.defaults.color = '#64748b';
        Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.95)';
        Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 14 };
        Chart.defaults.plugins.tooltip.bodyFont = { size: 13 };
        Chart.defaults.plugins.legend.labels.font = { weight: '600', size: 12 };
        Chart.defaults.plugins.legend.labels.padding = 20;

        // 1. Gráfico Principal de Comparación
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
                        display: true,
                        position: 'top',
                        align: 'start',
                        labels: {
                            boxWidth: 12,
                            padding: 15,
                            font: {
                                size: 11
                            },
                            generateLabels: (chart) => {
                                const datasets = chart.data.datasets;
                                return datasets.map((dataset, i) => ({
                                    text: dataset.label,
                                    fillStyle: dataset.borderColor,
                                    strokeStyle: dataset.borderColor,
                                    lineWidth: 2,
                                    hidden: chart.getDatasetMeta(i).hidden,
                                    index: i
                                }));
                            }
                        }
                    },
                    tooltip: { 
                        mode: 'index', 
                        intersect: false, 
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleFont: { weight: '600', size: 14 },
                        bodyFont: { size: 12 },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        callbacks: {
                            title: (context) => {
                                return context[0].dataset.label;
                            },
                            label: (context) => {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                const date = context.label;
                                if (value === null || value === undefined || isNaN(value)) {
                                    return `${date}: Sin dato`;
                                }
                                return `${date}: ${value.toFixed(4)}`;
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
                            callback: this.formatValueCallback
                        }
                    }, 
                    x: { 
                        grid: { 
                            display: false 
                        },
                        ticks: {
                            font: { size: 12 },
                            maxRotation: 45,
                            callback: (value, index, values) => {
                                // Formatear fechas para mostrar mes-año
                                const dateStr = this.mainChart.data.labels[index];
                                try {
                                    const [year, month] = dateStr.split('-');
                                    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                                    return `${months[parseInt(month)-1]} ${year}`;
                                } catch (e) {
                                    return dateStr;
                                }
                            }
                        }
                    } 
                },
                elements: {
                    point: {
                        radius: 3,
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
                            label: (context) => {
                                const series = context.dataset.label;
                                const value = context.parsed.x;
                                if (value === null || value === undefined || isNaN(value)) {
                                    return `${series}: Sin dato`;
                                }
                                return `${series}: ${value.toFixed(4)}`;
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
                            callback: this.formatValueCallback
                        }
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            font: { size: 12, weight: '600' },
                            callback: (value) => {
                                // Truncar etiquetas largas
                                if (value.length > 20) {
                                    return value.substring(0, 20) + '...';
                                }
                                return value;
                            }
                        }
                    }
                },
                elements: {
                    bar: {
                        borderRadius: 6,
                        borderSkipped: false,
                    }
                }
            }
        });

        // 3. Gráfico de Dispersión
        const ctxScatter = document.getElementById('scatterChart').getContext('2d');
        this.scatterChart = new Chart(ctxScatter, {
            type: 'scatter',
            data: { datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const point = context.raw;
                                if (point.x === null || point.x === undefined || isNaN(point.x) ||
                                    point.y === null || point.y === undefined || isNaN(point.y)) {
                                    return `${point.label}: Sin dato`;
                                }
                                return `${point.label}: (${point.x.toFixed(2)}, ${point.y.toFixed(4)})`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Variable X'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Variable Y'
                        }
                    }
                }
            }
        });
    }

    formatValueCallback(value) {
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

    updateCharts() {
        if (!this.mainChart || this.data.length === 0) {
            console.warn("⚠️  No hay datos para mostrar en gráficos");
            return;
        }

        console.log("📈 Actualizando gráficos con", this.data.length, "registros");
        
        // Obtener todas las combinaciones únicas
        const uniqueCombinations = [...new Set(this.data.map(d => d.combinationKey))];
        console.log("🔄 Combinaciones únicas:", uniqueCombinations.length);
        
        // Obtener todas las fechas únicas y ordenarlas
        const uniqueDates = [...new Set(this.data.map(d => d.fecha))].sort((a, b) => {
            return new Date(a) - new Date(b);
        });
        
        // Agrupar datos por combinación
        const groupedData = {};
        const seriesStats = {};
        
        uniqueCombinations.forEach(combination => {
            const items = this.data.filter(d => d.combinationKey === combination);
            const firstItem = items[0];
            
            // Crear mapa de fecha -> valor para esta combinación
            const dateMap = {};
            items.forEach(item => {
                dateMap[item.fecha] = item.frecuencia;
            });
            
            // Crear array de valores para cada fecha única
            groupedData[combination] = {
                label: firstItem.combinationLabel,
                data: uniqueDates.map(date => dateMap[date] !== undefined ? dateMap[date] : null),
                alimentador: firstItem.transformador,
                year: firstItem.year,
                tipo: firstItem.tipo
            };
            
            // Calcular estadísticas para esta serie
            const valores = items.map(i => i.frecuencia).filter(v => v !== null);
            if (valores.length > 0) {
                const sum = valores.reduce((a, b) => a + b, 0);
                const avg = sum / valores.length;
                const max = Math.max(...valores);
                const min = Math.min(...valores);
                const std = Math.sqrt(valores.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / valores.length);
                
                seriesStats[combination] = {
                    avg: avg,
                    min: min,
                    max: max,
                    std: std,
                    cv: (std / avg) * 100, // Coeficiente de variación
                    count: valores.length
                };
            }
        });
        
        // Asignar colores a las series
        this.activeColorMap = {};
        uniqueCombinations.forEach((combination, idx) => {
            this.activeColorMap[combination] = this.chartPalette[idx % this.chartPalette.length];
        });
        
        // Crear datasets para el gráfico principal
        const datasetsMain = uniqueCombinations.map((combination, idx) => {
            const series = groupedData[combination];
            const color = this.activeColorMap[combination];
            
            // Determinar estilo basado en el tipo de agrupación
            let lineStyle = 'solid';
            if (this.groupBy === 'year') {
                // Diferentes estilos para diferentes años
                const yearIndex = this.filters.year.indexOf(series.year);
                lineStyle = ['solid', 'dash', 'dot'][yearIndex % 3] || 'solid';
            } else if (this.groupBy === 'tipo') {
                // Diferentes estilos para diferentes tipos
                const tipoIndex = this.filters.tipoMedicion.indexOf(series.tipo);
                lineStyle = ['solid', 'dash', 'dot'][tipoIndex % 3] || 'solid';
            }
            
            return {
                label: series.label,
                data: series.data,
                borderColor: color,
                backgroundColor: color + '20',
                borderWidth: 3,
                borderDash: lineStyle === 'solid' ? [] : 
                           lineStyle === 'dash' ? [10, 5] : [5, 5],
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 8,
                pointBackgroundColor: color,
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                fill: false,
                pointHoverBackgroundColor: '#ffffff',
                pointHoverBorderColor: color,
                pointHoverBorderWidth: 3,
                hidden: idx >= 15 // Ocultar series después de 15 para evitar saturación
            };
        });
        
        // Actualizar gráfico principal
        this.mainChart.data.labels = uniqueDates;
        this.mainChart.data.datasets = datasetsMain;
        
        // Actualizar tipo de gráfico si se cambió
        const chartType = document.getElementById('chartType').value;
        this.mainChart.config.type = chartType;
        
        // Actualizar escalas basadas en datos
        const allValues = this.data.map(d => d.frecuencia).filter(v => v !== null);
        if (allValues.length > 0) {
            const minVal = Math.min(...allValues);
            const maxVal = Math.max(...allValues);
            const range = maxVal - minVal;
            
            // Ajustar escala con margen
            this.mainChart.options.scales.y.min = minVal - range * 0.1;
            this.mainChart.options.scales.y.max = maxVal + range * 0.1;
        }
        
        try {
            this.mainChart.update();
            console.log("✅ Gráfico principal actualizado");
        } catch (error) {
            console.error("❌ Error al actualizar gráfico principal:", error);
        }
        
        // Actualizar gráfico de ranking
        this.updateRankingChart(seriesStats);
        
        // Actualizar gráfico de dispersión
        this.updateScatterChart();
        
        // Actualizar KPIs
        this.updateComparisonKPIs(seriesStats);
    }

    updateRankingChart(seriesStats) {
        if (!this.rankingChart) return;
        
        const sortMethod = document.getElementById('rankingSort').value;
        
        // Ordenar series según método seleccionado
        let sortedSeries = Object.keys(seriesStats).sort((a, b) => {
            switch(sortMethod) {
                case 'avg':
                    return seriesStats[b].avg - seriesStats[a].avg;
                case 'stability':
                    return seriesStats[a].cv - seriesStats[b].cv; // Menor CV = más estable
                case 'trend':
                    // Simular tendencia (en realidad necesitaríamos cálculo de tendencia)
                    return Math.random() - 0.5;
                default:
                    return seriesStats[b].avg - seriesStats[a].avg;
            }
        });
        
        // Limitar a 20 series para legibilidad
        if (sortedSeries.length > 20) {
            sortedSeries = sortedSeries.slice(0, 20);
        }
        
        const labels = sortedSeries.map(key => {
            const items = this.data.filter(d => d.combinationKey === key);
            return items[0]?.combinationLabel || key;
        });
        
        const data = sortedSeries.map(key => seriesStats[key]?.avg || 0);
        const colors = sortedSeries.map(key => this.activeColorMap[key] || '#94a3b8');
        
        this.rankingChart.data.labels = labels;
        this.rankingChart.data.datasets = [{
            label: 'Promedio',
            data: data,
            backgroundColor: colors,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: colors.map(c => c + 'CC')
        }];
        
        try {
            this.rankingChart.update();
            console.log("✅ Gráfico de ranking actualizado");
        } catch (error) {
            console.error("❌ Error al actualizar gráfico de ranking:", error);
        }
    }

    updateScatterChart() {
        if (!this.scatterChart) return;
        
        const xVar = document.getElementById('scatterX').value;
        const yVar = document.getElementById('scatterY').value;
        
        // Agrupar por combinación para el scatter plot
        const uniqueCombinations = [...new Set(this.data.map(d => d.combinationKey))];
        const datasets = [];
        
        uniqueCombinations.slice(0, 10).forEach((combination, idx) => { // Limitar a 10 series
            const items = this.data.filter(d => d.combinationKey === combination);
            const firstItem = items[0];
            const color = this.activeColorMap[combination] || this.chartPalette[idx];
            
            const points = items.map(item => {
                let xValue;
                switch(xVar) {
                    case 'fecha':
                        xValue = new Date(item.fecha).getTime();
                        break;
                    case 'alimentador':
                        // Convertir alimentador a número para el eje X
                        xValue = this.filters.transformador.indexOf(item.transformador);
                        break;
                    case 'tipo':
                        xValue = this.filters.tipoMedicion.indexOf(item.tipo);
                        break;
                    default:
                        xValue = idx;
                }
                
                let yValue;
                switch(yVar) {
                    case 'valor':
                        yValue = item.frecuencia;
                        break;
                    case 'desviacion':
                        // Calcular desviación del promedio de la serie
                        const serieAvg = items.reduce((sum, i) => sum + i.frecuencia, 0) / items.length;
                        yValue = Math.abs(item.frecuencia - serieAvg);
                        break;
                    case 'tendencia':
                        // Simular tendencia
                        yValue = Math.sin(new Date(item.fecha).getMonth() * 0.5) * 0.3 + 0.5;
                        break;
                    default:
                        yValue = item.frecuencia;
                }
                
                return {
                    x: xValue,
                    y: yValue,
                    label: `${item.transformador} - ${item.fecha}`
                };
            });
            
            datasets.push({
                label: firstItem?.combinationLabel || combination,
                data: points,
                backgroundColor: color + '80',
                borderColor: color,
                borderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 10
            });
        });
        
        this.scatterChart.data.datasets = datasets;
        
        // Configurar ejes
        this.scatterChart.options.scales.x.title.text = this.getAxisLabel(xVar);
        this.scatterChart.options.scales.y.title.text = this.getAxisLabel(yVar);
        
        try {
            this.scatterChart.update();
        } catch (error) {
            console.error("❌ Error al actualizar gráfico de dispersión:", error);
        }
    }

    getAxisLabel(variable) {
        switch(variable) {
            case 'fecha': return 'Fecha';
            case 'alimentador': return 'Alimentador';
            case 'tipo': return 'Tipo de Medición';
            case 'valor': return 'Valor';
            case 'desviacion': return 'Desviación';
            case 'tendencia': return 'Tendencia';
            default: return variable;
        }
    }

    updateComparisonKPIs(seriesStats) {
        if (!seriesStats || Object.keys(seriesStats).length === 0) {
            return;
        }
        
        // Calcular estadísticas globales
        const allAverages = Object.values(seriesStats).map(s => s.avg);
        const allMins = Object.values(seriesStats).map(s => s.min);
        const allMaxs = Object.values(seriesStats).map(s => s.max);
        const allCVs = Object.values(seriesStats).map(s => s.cv);
        
        const globalAvg = allAverages.reduce((a, b) => a + b, 0) / allAverages.length;
        const globalMin = Math.min(...allMins);
        const globalMax = Math.max(...allMaxs);
        const globalRange = globalMax - globalMin;
        const avgCV = allCVs.reduce((a, b) => a + b, 0) / allCVs.length;
        
        // Encontrar la peor serie (mayor CV = menos estable)
        let worstSeriesKey = Object.keys(seriesStats)[0];
        let worstCV = seriesStats[worstSeriesKey].cv;
        
        Object.entries(seriesStats).forEach(([key, stats]) => {
            if (stats.cv > worstCV) {
                worstCV = stats.cv;
                worstSeriesKey = key;
            }
        });
        
        const worstSeries = this.data.find(d => d.combinationKey === worstSeriesKey);
        
        // Actualizar elementos
        document.getElementById('rangeValue').textContent = this.safeToFixed(globalRange);
        document.getElementById('rangeInfo').textContent = `${this.safeToFixed(globalMin, 0)}-${this.safeToFixed(globalMax, 0)}`;
        
        document.getElementById('variabilityValue').textContent = this.safeToFixed(avgCV, 2) + '%';
        const variabilityBadge = document.getElementById('variabilityBadge');
        if (avgCV < 10) {
            variabilityBadge.textContent = 'Excelente';
            variabilityBadge.style.background = 'rgba(16, 185, 129, 0.1)';
            variabilityBadge.style.color = 'var(--success)';
        } else if (avgCV < 20) {
            variabilityBadge.textContent = 'Buena';
            variabilityBadge.style.background = 'rgba(245, 158, 11, 0.1)';
            variabilityBadge.style.color = 'var(--warning)';
        } else {
            variabilityBadge.textContent = 'Alta';
            variabilityBadge.style.background = 'rgba(239, 68, 68, 0.1)';
            variabilityBadge.style.color = 'var(--danger)';
        }
        
        if (worstSeries) {
            document.getElementById('worstSeries').textContent = worstSeries.transformador;
            document.getElementById('worstValue').textContent = this.safeToFixed(seriesStats[worstSeriesKey].cv, 2) + '% CV';
        }
        
        document.getElementById('activeSeries').textContent = Object.keys(seriesStats).length;
    }

    // --- TABLA MEJORADA ---
    updateTable() {
        const tbody = document.getElementById('dataTable');
        tbody.innerHTML = '';
        const start = (this.pagination.currentPage - 1) * this.pagination.rowsPerPage;
        const end = start + this.pagination.rowsPerPage;
        const pageData = this.filteredData.slice(start, end);

        if(pageData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding:3rem; color:#94a3b8;">
                        <i class="fas fa-exchange-alt" style="font-size:2rem; margin-bottom:1rem; display:block; opacity:0.5;"></i>
                        No hay datos para comparar con los filtros actuales<br>
                        <small>Selecciona al menos un año, un alimentador y un tipo de medición</small>
                    </td>
                </tr>`;
            this.updatePaginationInfo(0, 0, 0);
            return;
        }

        pageData.forEach(item => {
            const tr = document.createElement('tr');
            const color = this.activeColorMap[item.combinationKey] || '#94a3b8';
            
            // Estado basado en desviación del promedio de la serie
            const serieItems = this.data.filter(d => d.combinationKey === item.combinationKey);
            const serieAvg = serieItems.reduce((a, b) => a + b.frecuencia, 0) / serieItems.length;
            const diff = Math.abs(item.frecuencia - serieAvg) / serieAvg;
            
            let statusClass = 'status-optimal';
            let statusText = 'Normal';
            let statusIcon = 'fa-check-circle';
            
            if(diff >= 0.1 && diff < 0.3) {
                statusClass = 'status-regular';
                statusText = 'Desviado';
                statusIcon = 'fa-exclamation-circle';
            }
            if(diff >= 0.3) {
                statusClass = 'status-critical';
                statusText = 'Anómalo';
                statusIcon = 'fa-times-circle';
            }

            tr.innerHTML = `
                <td style="display:flex; align-items:center; gap:12px; font-weight:600;">
                    <span style="width:14px; height:14px; border-radius:50%; background:${color}; 
                        box-shadow:0 0 0 3px ${color}20, 0 2px 4px rgba(0,0,0,0.1);"></span>
                    ${item.combinationLabel}
                </td>
                <td style="font-weight:600; color:#475569;">${item.transformador}</td>
                <td style="font-weight:500;">${item.year}</td>
                <td style="font-weight:500; color:#8b5cf6;">${item.tipo}</td>
                <td style="font-weight:500; color:#475569;">${item.fecha}</td>
                <td style="font-family:'Roboto Mono', monospace; font-size:1.05em; font-weight:700; color:#0f172a;">
                    ${this.safeToFixed(item.frecuencia)}
                </td>
                <td>
                    <span class="status-indicator ${statusClass}">
                        <i class="fas ${statusIcon}"></i>
                        ${statusText}
                    </span>
                </td>
                <td>
                    <button class="btn-icon small" title="Ver detalles" onclick="dashboard.showSeriesDetails('${item.combinationKey}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon small" title="Aislar serie" onclick="dashboard.isolateSeries('${item.combinationKey}')">
                        <i class="fas fa-filter"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        this.updatePaginationInfo(start + 1, end, this.filteredData.length);
        this.updatePaginationButtons();
    }

    // --- NUEVOS MÉTODOS PARA COMPARACIÓN ---
    showSeriesDetails(combinationKey) {
        const serieItems = this.data.filter(d => d.combinationKey === combinationKey);
        if (serieItems.length === 0) return;
        
        const firstItem = serieItems[0];
        const valores = serieItems.map(i => i.frecuencia);
        const avg = valores.reduce((a, b) => a + b, 0) / valores.length;
        const min = Math.min(...valores);
        const max = Math.max(...valores);
        const std = Math.sqrt(valores.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / valores.length);
        
        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <div class="series-details">
                <div class="series-header" style="display:flex; align-items:center; gap:1rem; margin-bottom:1.5rem;">
                    <span style="width:20px; height:20px; border-radius:50%; background:${this.activeColorMap[combinationKey] || '#94a3b8'}"></span>
                    <h4 style="margin:0;">${firstItem.combinationLabel}</h4>
                </div>
                
                <div class="stats-grid" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:1rem; margin-bottom:1.5rem;">
                    <div class="stat-card" style="background:#f8fafc; padding:1rem; border-radius:8px;">
                        <div style="font-size:0.85rem; color:#64748b;">Promedio</div>
                        <div style="font-size:1.5rem; font-weight:700; color:#0f172a;">${this.safeToFixed(avg)}</div>
                    </div>
                    <div class="stat-card" style="background:#f8fafc; padding:1rem; border-radius:8px;">
                        <div style="font-size:0.85rem; color:#64748b;">Rango</div>
                        <div style="font-size:1.5rem; font-weight:700; color:#0f172a;">${this.safeToFixed(min)} - ${this.safeToFixed(max)}</div>
                    </div>
                    <div class="stat-card" style="background:#f8fafc; padding:1rem; border-radius:8px;">
                        <div style="font-size:0.85rem; color:#64748b;">Desviación</div>
                        <div style="font-size:1.5rem; font-weight:700; color:#0f172a;">${this.safeToFixed(std)}</div>
                    </div>
                    <div class="stat-card" style="background:#f8fafc; padding:1rem; border-radius:8px;">
                        <div style="font-size:0.85rem; color:#64748b;">Muestras</div>
                        <div style="font-size:1.5rem; font-weight:700; color:#0f172a;">${serieItems.length}</div>
                    </div>
                </div>
                
                <div class="series-info">
                    <p><strong>Alimentador:</strong> ${firstItem.transformador}</p>
                    <p><strong>Año:</strong> ${firstItem.year}</p>
                    <p><strong>Tipo de medición:</strong> ${firstItem.tipo}</p>
                    <p><strong>Departamento:</strong> ${firstItem.departamento || 'N/A'}</p>
                    <p><strong>Periodo:</strong> ${serieItems[0].fecha} - ${serieItems[serieItems.length-1].fecha}</p>
                </div>
            </div>
        `;
        
        document.getElementById('seriesModal').style.display = 'flex';
    }

    isolateSeries(combinationKey) {
        // Aislar esta serie en el gráfico
        const datasets = this.mainChart.data.datasets;
        datasets.forEach((dataset, index) => {
            const meta = this.mainChart.getDatasetMeta(index);
            const isTargetSeries = dataset.label.includes(combinationKey.split('-')[0]);
            meta.hidden = !isTargetSeries;
        });
        
        this.mainChart.update();
        this.showNotification(`Aislando serie: ${combinationKey.split('-')[0]}`, "success");
    }

    // --- EVENTOS MEJORADOS ---
    initializeEvents() {
        // Aplicar filtros
        document.getElementById('applyFilters').addEventListener('click', () => {
            this.syncFilters();
            
            // Validar según modo global
            if (this.globalComparisonMode === 'unique') {
                // En modo único, validar que haya al menos un valor en cada filtro
                if (!this.filters.transformador[0] || !this.filters.year[0] || !this.filters.tipoMedicion[0]) {
                    this.showNotification("Selecciona un valor en cada filtro", "warning");
                    return;
                }
            } else {
                // En modo múltiple, validar que haya al menos una selección
                if (this.filters.transformador.length === 0) {
                    this.showNotification("Selecciona al menos un alimentador", "warning");
                    return;
                }
                if (this.filters.year.length === 0) {
                    this.showNotification("Selecciona al menos un año", "warning");
                    return;
                }
                if (this.filters.tipoMedicion.length === 0) {
                    this.showNotification("Selecciona al menos un tipo de medición", "warning");
                    return;
                }
            }
            
            if(window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('active');
            this.loadData();
            this.updateComparisonTags();
        });

        // Restablecer filtros
        document.getElementById('resetFilters').addEventListener('click', () => {
            this.setInitialDefaults();
            this.loadData();
            this.showNotification("Filtros restablecidos", "success");
        });

        // Limpiar todo
        document.getElementById('clearAll').addEventListener('click', () => {
            document.getElementById('filterTipoMedicion').selectedIndex = -1;
            document.getElementById('filterYear').selectedIndex = -1;
            document.getElementById('filterTransformador').selectedIndex = -1;
            document.getElementById('filterMonth').selectedIndex = -1;
            document.getElementById('filterEstacion').value = '';
            document.getElementById('filterPeriodo').value = 'select_months';
            
            // Limpiar botones de meses
            this.clearMonthSelection();
            
            // Mostrar selectores de mes
            document.getElementById('monthModeGroup').style.display = 'block';
            document.getElementById('monthSelectorGroup').style.display = 'block';
            
            // Restaurar todos los alimentadores cuando se limpia la estación
            this.filterAlimentadoresByEstacion('');
            
            // Restaurar modo único global - NUEVO
            this.setGlobalComparisonMode('unique');
            
            this.syncFilters();
            this.updateComparisonTags();
            this.showNotification("Filtros limpiados", "info");
        });

        // Cambiar tipo de gráfico
        document.getElementById('chartType').addEventListener('change', () => {
            this.updateCharts();
        });

        // Cambiar agrupación
        document.getElementById('groupBy').addEventListener('change', () => {
            this.syncFilters();
            this.loadData();
        });

        // Cambiar ranking
        document.getElementById('rankingSort').addEventListener('change', () => {
            this.updateCharts();
        });

        // Cambiar scatter plot
        document.getElementById('scatterX').addEventListener('change', () => {
            this.updateCharts();
        });
        document.getElementById('scatterY').addEventListener('change', () => {
            this.updateCharts();
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
                d.combinationLabel.toLowerCase().includes(term) ||
                d.tipo.toLowerCase().includes(term) ||
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

        // Ir a sección de importación Excel
        const goToExcelUpload = document.getElementById('goToExcelUpload');
        if (goToExcelUpload) {
            goToExcelUpload.addEventListener('click', () => {
                const section = document.getElementById('excelUploadSection');
                if (section) {
                    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    this.showNotification('Sección de importación Excel visible', 'info');
                }
            });
        }

        // Exportar datos
        document.getElementById('exportData').addEventListener('click', () => {
            this.exportData();
        });

        // Pantalla completa
        document.getElementById('fullscreenToggle').addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Nuevo: Alternar leyenda
        document.getElementById('toggleLegend').addEventListener('click', () => {
            const legend = this.mainChart.options.plugins.legend;
            legend.display = !legend.display;
            this.mainChart.update();
        });

        // Nuevo: Alternar puntos
        document.getElementById('togglePoints').addEventListener('click', () => {
            const datasets = this.mainChart.data.datasets;
            const showPoints = datasets[0]?.pointRadius > 0;
            
            datasets.forEach(dataset => {
                dataset.pointRadius = showPoints ? 0 : 4;
                dataset.pointHoverRadius = showPoints ? 0 : 8;
            });
            
            this.mainChart.update();
        });

        // Cerrar modal
        document.getElementById('modalClose').addEventListener('click', () => {
            document.getElementById('seriesModal').style.display = 'none';
        });

        // Cerrar modal al hacer clic fuera
        document.getElementById('seriesModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('seriesModal')) {
                document.getElementById('seriesModal').style.display = 'none';
            }
        });

        // Filtro de estación
        document.getElementById('filterEstacion').addEventListener('change', (e) => {
            const estacion = e.target.value;
            this.filters.estacion = estacion;
            this.filterAlimentadoresByEstacion(estacion);
            this.showNotification(`Filtro de estación: ${estacion || 'Todas'}`, "info");
        });

        // Filtro de período
        document.getElementById('filterPeriodo').addEventListener('change', (e) => {
            const periodo = e.target.value;
            this.filters.periodo = periodo;
            
            if (periodo === 'select_months') {
                // Mostrar selectores de modo y meses
                this.updateMonthModeVisibility();
            } else {
                // Ocultar selectores y aplicar período predefinido
                document.getElementById('monthModeGroup').style.display = 'none';
                document.getElementById('monthSelectorGroup').style.display = 'none';
                this.applyPeriodoFilter(periodo);
            }
        });

        // Carga de Excel
        const uploadExcelBtn = document.getElementById('uploadExcelBtn');
        if (uploadExcelBtn) {
            uploadExcelBtn.addEventListener('click', () => this.handleExcelUpload());
        }
        
        // Eventos para botones de meses
        document.querySelectorAll('.month-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.toggleMonthSelection(e.target.dataset.month, e.shiftKey);
            });
        });

        // NUEVO: Eventos para modo global único/múltiple
        document.getElementById('globalModeUnique').addEventListener('click', () => {
            this.setGlobalComparisonMode('unique');
        });
        
        document.getElementById('globalModeMultiple').addEventListener('click', () => {
            this.setGlobalComparisonMode('multiple');
        });
        
        // NUEVO: Eventos para selectores múltiples que respeten el modo global
        ['filterYear', 'filterTipoMedicion', 'filterTransformador', 'filterMonth'].forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                select.addEventListener('change', (e) => {
                    if (this.globalComparisonMode === 'unique') {
                        this.limitToSingleSelection(selectId);
                    }
                    this.syncFilters();
                    this.updateComparisonTags();
                });
            }
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

    // --- FUNCIONES ADICIONALES ---
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
            if (column === 'valor' || column === 'frecuencia') {
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
        document.querySelectorAll('.data-table th[data-sort]').forEach(th => {
            const icon = th.querySelector('i');
            if (!icon) return;

            if (th.dataset.sort === this.sortConfig.column) {
                icon.className = this.sortConfig.direction === 'asc'
                    ? 'fas fa-sort-up'
                    : 'fas fa-sort-down';
            } else {
                icon.className = 'fas fa-sort';
            }
        });
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

    showDetails(alimentador, fecha) {
        const detalles = this.data.find(d => d.transformador === alimentador && d.fecha === fecha);
        if (detalles) {
            alert(`📋 Detalles de ${alimentador} en ${fecha}\n\n` +
                  `• Tipo: ${detalles.tipo || 'N/A'}\n` +
                  `• Valor: ${this.safeToFixed(detalles.frecuencia)}\n` +
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
        a.download = `ande-comparacion-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification("Datos de comparación exportados", "success");
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

    // ============================================
    // FUNCIONES PARA SELECCIÓN DE MESES
    // ============================================
    
    setMonthSelectionMode(mode) {
        this.monthSelectionMode = mode;
        
        if (mode === 'unique') {
            // En modo único, mantener solo un mes seleccionado
            const selectedMonths = Array.from(document.querySelectorAll('.month-btn.selected'));
            if (selectedMonths.length > 1) {
                // Deseleccionar todos excepto el primero
                selectedMonths.slice(1).forEach(btn => btn.classList.remove('selected'));
                this.syncMonthsToHiddenSelect();
            }
            
            document.getElementById('monthHint').innerHTML = 
                '<i class="fas fa-info-circle"></i> Selecciona un mes';
        } else {
            document.getElementById('monthHint').innerHTML = 
                '<i class="fas fa-info-circle"></i> Selecciona varios meses (Ctrl + Click) o rangos (Shift + Click)';
        }
        
        this.showNotification(`Modo ${mode === 'unique' ? 'único' : 'múltiple'} activado`, "info");
    }
    
    toggleMonthSelection(month, isRangeSelection = false) {
        const btn = document.querySelector(`.month-btn[data-month="${month}"]`);
        if (!btn) return;
        
        if (this.monthSelectionMode === 'unique') {
            // Modo único: deseleccionar todos los demás
            document.querySelectorAll('.month-btn.selected').forEach(b => {
                b.classList.remove('selected');
            });
            btn.classList.add('selected');
            this.lastSelectedMonth = Number(month);
        } else {
            const currentMonth = Number(month);
            if (isRangeSelection && this.lastSelectedMonth) {
                const start = Math.min(this.lastSelectedMonth, currentMonth);
                const end = Math.max(this.lastSelectedMonth, currentMonth);
                document.querySelectorAll('.month-btn').forEach(button => {
                    const btnMonth = Number(button.dataset.month);
                    if (btnMonth >= start && btnMonth <= end) {
                        button.classList.add('selected');
                    }
                });
            } else {
                // Modo múltiple: toggle del botón
                btn.classList.toggle('selected');
            }
            this.lastSelectedMonth = currentMonth;
        }
        
        // Sincronizar con el select oculto
        this.syncMonthsToHiddenSelect();
        this.syncFilters();
        this.updateComparisonTags();
    }

    updateMonthModeVisibility() {
        const periodo = document.getElementById('filterPeriodo').value;
        const shouldShowMonthSelectors = periodo === 'select_months';
        const shouldShowGuide = this.globalComparisonMode === 'multiple' && shouldShowMonthSelectors;
        document.getElementById('monthModeGroup').style.display = shouldShowGuide ? 'block' : 'none';
        document.getElementById('monthSelectorGroup').style.display = shouldShowMonthSelectors ? 'block' : 'none';
    }
    
    syncMonthsToHiddenSelect() {
        const selectedBtns = document.querySelectorAll('.month-btn.selected');
        const selectedMonths = Array.from(selectedBtns).map(btn => btn.dataset.month);
        
        const hiddenSelect = document.getElementById('filterMonth');
        
        // Deseleccionar todas las opciones
        Array.from(hiddenSelect.options).forEach(option => {
            option.selected = false;
        });
        
        // Seleccionar las opciones correspondientes
        selectedMonths.forEach(month => {
            Array.from(hiddenSelect.options).forEach(option => {
                if (option.value === month) {
                    option.selected = true;
                }
            });
        });
    }
    
    clearMonthSelection() {
        document.querySelectorAll('.month-btn.selected').forEach(btn => {
            btn.classList.remove('selected');
        });
        this.syncMonthsToHiddenSelect();
    }

    applyPeriodoFilter(periodo) {
        if (!periodo || periodo === 'select_months') {
            // Modo seleccionar meses - no hacer nada, ya están los selectores visibles
            return;
        }

        // Limpiar selección de meses en los botones
        this.clearMonthSelection();

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // 0-11 to 1-12

        let selectedYears = [];
        let selectedMonths = [];

        switch(periodo) {
            case 'last3':
                // Últimos 3 meses
                selectedMonths = this.getLastNMonths(3, currentYear, currentMonth);
                selectedYears = [currentYear];
                if (selectedMonths.some(m => m > currentMonth)) {
                    selectedYears.push(currentYear - 1);
                }
                break;
            
            case 'last6':
                // Últimos 6 meses
                selectedMonths = this.getLastNMonths(6, currentYear, currentMonth);
                selectedYears = [currentYear];
                if (selectedMonths.some(m => m > currentMonth)) {
                    selectedYears.push(currentYear - 1);
                }
                break;
            
            case 'last12':
                // Últimos 12 meses
                selectedMonths = Array.from({length: 12}, (_, i) => i + 1);
                selectedYears = [currentYear, currentYear - 1];
                break;
            
            case 'currentYear':
                // Año actual
                selectedMonths = Array.from({length: currentMonth}, (_, i) => i + 1);
                selectedYears = [currentYear];
                break;
            
            case 'lastYear':
                // Año pasado completo
                selectedMonths = Array.from({length: 12}, (_, i) => i + 1);
                selectedYears = [currentYear - 1];
                break;
        }

        // Aplicar selecciones
        this.selectMultipleOptions('filterYear', selectedYears.map(String));
        this.selectMultipleOptions('filterMonth', selectedMonths.map(String));
        
        this.showNotification(`Período aplicado: ${this.getPeriodoLabel(periodo)}`, "success");
    }

    getLastNMonths(n, currentYear, currentMonth) {
        const months = [];
        for (let i = 0; i < n; i++) {
            let month = currentMonth - i;
            if (month <= 0) {
                month += 12;
            }
            months.unshift(month);
        }
        return months;
    }

    getPeriodoLabel(periodo) {
        const labels = {
            'last3': 'Últimos 3 meses',
            'last6': 'Últimos 6 meses',
            'last12': 'Últimos 12 meses',
            'currentYear': 'Año actual',
            'lastYear': 'Año pasado'
        };
        return labels[periodo] || 'Personalizado';
    }

    selectMultipleOptions(selectId, values) {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        // Deseleccionar todas las opciones primero
        Array.from(select.options).forEach(option => {
            option.selected = false;
        });
        
        // Seleccionar las opciones especificadas
        values.forEach(value => {
            Array.from(select.options).forEach(option => {
                if (option.value === value) {
                    option.selected = true;
                }
            });
        });
        
        // Si es el selector de meses, actualizar también los botones visuales
        if (selectId === 'filterMonth') {
            // Limpiar selección de botones
            document.querySelectorAll('.month-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
            
            // Seleccionar los botones correspondientes
            values.forEach(value => {
                const btn = document.querySelector(`.month-btn[data-month="${value}"]`);
                if (btn) {
                    btn.classList.add('selected');
                }
            });
        }
    }

    setExcelStatus(message, type = 'info') {
        const statusEl = document.getElementById('excelUploadStatus');
        if (!statusEl) return;

        const colorMap = {
            info: 'var(--text-muted)',
            success: 'var(--success)',
            error: 'var(--danger)',
            warning: 'var(--warning)'
        };

        statusEl.textContent = message;
        statusEl.style.color = colorMap[type] || colorMap.info;
    }

    async handleExcelUpload() {
        const fileInput = document.getElementById('excelFileInput');
        const uploadBtn = document.getElementById('uploadExcelBtn');
        const file = fileInput?.files?.[0];

        if (!file) {
            this.setExcelStatus('Selecciona un archivo .xlsx antes de subir.', 'warning');
            this.showNotification('Selecciona un archivo .xlsx', 'warning');
            return;
        }

        if (!file.name.toLowerCase().endsWith('.xlsx')) {
            this.setExcelStatus('Archivo inválido. Solo se admiten archivos .xlsx.', 'error');
            this.showNotification('Formato inválido, usa .xlsx', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('archivo', file);

        try {
            uploadBtn.disabled = true;
            this.setExcelStatus('Subiendo archivo y procesando datos...', 'info');

            const response = await fetch(`${this.apiBaseUrl}/api/subir-excel`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || result.error || 'No se pudo procesar el archivo');
            }

            this.setExcelStatus(`Carga completada. Insertadas: ${result.insertadas}, ignoradas: ${result.ignoradas}.`, 'success');
            this.showNotification('Excel cargado correctamente', 'success');
            await this.loadData();
        } catch (error) {
            console.error('Error al subir Excel:', error);
            this.setExcelStatus(`Error: ${error.message}`, 'error');
            this.showNotification('Error al cargar Excel', 'error');
        } finally {
            uploadBtn.disabled = false;
        }
    }

    updateKPIs() {
        if(this.data.length === 0) {
            return;
        }

        const vals = this.data.map(d => d.frecuencia);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;

        // Calcular tendencia si hay datos anteriores
        let trend = 0;
        if (this.previousData && this.previousData.length > 0) {
            const prevAvg = this.previousData.reduce((a, b) => a + b.frecuencia, 0) / this.previousData.length;
            trend = ((avg - prevAvg) / prevAvg) * 100;
        }
    }
}

// Inicializar dashboard cuando el DOM esté cargado
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new ANDEDashboard();
});
