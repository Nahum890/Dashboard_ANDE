// Dashboard ANDE - Sistema de Monitoreo de Frecuencia Eléctrica
class ANDEDashboard {
    constructor() {
        this.data = [];
        this.filteredData = [];
        this.charts = {
            main: null,
            pie: null,
            bar: null,
            radar: null
        };
        this.filters = {
            tipoMedicion: '',
            transformador: '',
            year: '',
            month: '',
            departamento: ''
        };
        
        this.pagination = {
            currentPage: 1,
            rowsPerPage: 10,
            totalPages: 1,
            totalRows: 0
        };
        
        this.isSidebarOpen = false;
        this.isMobile = window.innerWidth <= 767;
        this.scrollPosition = 0;
        this.currentSort = { column: null, direction: 'asc' };
        
        this.initialize();
    }

    async initialize() {
        this.showLoading(true);
        
        try {
            // Inicializar gráficos primero
            this.initializeCharts();
            
            // Cargar datos iniciales
            await this.loadTiposMedicion();
            await this.loadData();
            
            // Inicializar eventos
            this.initializeEvents();
            
            // Ajustar layout para móvil
            this.adjustLayoutForMobile();
            
            this.showLoading(false);
        } catch (error) {
            console.error('Error en inicialización:', error);
            this.showLoading(false);
            this.showError('Error al inicializar el dashboard');
        }
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        overlay.style.display = show ? 'flex' : 'none';
    }

    async loadTiposMedicion() {
        try {
            const res = await fetch('http://localhost:3000/api/tipos-medicion');
            const tipos = await res.json();
            
            const select = document.getElementById('filterTipoMedicion');
            select.innerHTML = '<option value="">Todas las mediciones</option>';
            
            tipos.forEach(tipo => {
                const option = document.createElement('option');
                option.value = tipo;
                option.textContent = tipo;
                select.appendChild(option);
            });

            // Establecer TOTAL FEP como predeterminado
            if (tipos.includes('TOTAL FEP')) {
                select.value = 'TOTAL FEP';
                this.filters.tipoMedicion = 'TOTAL FEP';
            }
        } catch (error) {
            console.error('Error cargando tipos:', error);
        }
    }

    async loadData() {
        try {
            const params = new URLSearchParams();
            
            // Aplicar filtros actuales a la consulta
            Object.entries(this.filters).forEach(([key, value]) => {
                if (value) {
                    if (key === 'tipoMedicion') params.append('tipo_medicion', value);
                    else if (key === 'transformador') params.append('seccion', value);
                    else if (key === 'year') params.append('anio', value);
                    else if (key === 'month') params.append('mes', value);
                    else if (key === 'departamento') params.append('departamento', value);
                }
            });
            
            const res = await fetch(`http://localhost:3000/api/datos?${params}`);
            this.data = await res.json();
            
            // Actualizar opciones de filtro basadas en los datos
            this.updateFilters();
            
            // Aplicar filtros y actualizar interfaz
            this.applyFilters();
            
        } catch (error) {
            console.error('Error al cargar datos:', error);
            this.showError('Error al cargar datos del servidor');
        }
    }

    updateFilters() {
        // Actualizar años disponibles
        const years = [...new Set(this.data.map(d => d.fecha.substring(0, 4)))].filter(y => y);
        const yearSelect = document.getElementById('filterYear');
        const currentYear = yearSelect.value;
        
        yearSelect.innerHTML = '<option value="">Todos los años</option>';
        years.sort((a, b) => b - a).forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            if (year === currentYear) option.selected = true;
            yearSelect.appendChild(option);
        });

        // Actualizar transformadores disponibles
        const transformadores = [...new Set(this.data.map(d => d.transformador))].filter(t => t);
        const transSelect = document.getElementById('filterTransformador');
        const currentTrans = transSelect.value;
        
        transSelect.innerHTML = '<option value="">Todos los alimentadores</option>';
        transformadores.sort().forEach(trans => {
            const option = document.createElement('option');
            option.value = trans;
            option.textContent = trans;
            if (trans === currentTrans) option.selected = true;
            transSelect.appendChild(option);
        });
    }

    applyFilters() {
        // Aplicar filtros a los datos
        this.filteredData = this.data.filter(item => {
            // Filtrar por año
            if (this.filters.year && !item.fecha.startsWith(this.filters.year)) return false;
            
            // Filtrar por mes
            if (this.filters.month) {
                const mes = item.fecha.split('-')[1];
                if (parseInt(mes) !== parseInt(this.filters.month)) return false;
            }
            
            // Filtrar por transformador
            if (this.filters.transformador && item.transformador !== this.filters.transformador) return false;
            
            // Filtrar por departamento
            if (this.filters.departamento && item.departamento !== this.filters.departamento) return false;
            
            // Filtrar por tipo de medición
            if (this.filters.tipoMedicion && item.tipo !== this.filters.tipoMedicion) return false;
            
            return true;
        });

        // Ordenar por fecha por defecto
        this.filteredData.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        // Actualizar toda la interfaz
        this.updateStats();
        this.updateCharts();
        this.updatePagination();
        this.updateTable();
    }

    updateStats() {
        if (this.filteredData.length === 0) {
            this.resetStats();
            return;
        }
        
        const valores = this.filteredData.map(d => parseFloat(d.frecuencia));
        const avg = valores.reduce((a, b) => a + b, 0) / valores.length;
        const max = Math.max(...valores);
        const min = Math.min(...valores);
        
        // Calcular desviación estándar
        const variance = valores.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / valores.length;
        const std = Math.sqrt(variance);
        
        // Actualizar elementos en sidebar
        document.getElementById('avg-value').textContent = avg.toFixed(4);
        document.getElementById('max-value').textContent = max.toFixed(4);
        document.getElementById('min-value').textContent = min.toFixed(4);
        document.getElementById('std-value').textContent = std.toFixed(4);
        
        // Actualizar KPI cards
        document.getElementById('kpi-avg').textContent = avg.toFixed(4);
        document.getElementById('kpi-max').textContent = max.toFixed(4);
        document.getElementById('kpi-min').textContent = min.toFixed(4);
        document.getElementById('kpi-std').textContent = std.toFixed(4);
        
        // Actualizar estadísticas generales
        document.getElementById('total-transformadores').textContent = 
            new Set(this.filteredData.map(d => d.transformador)).size;
        document.getElementById('total-mediciones').textContent = this.filteredData.length;
        
        // Actualizar período
        const years = [...new Set(this.filteredData.map(d => d.fecha.substring(0, 4)))];
        const periodo = years.length > 1 ? 
            `${Math.min(...years)}-${Math.max(...years)}` : 
            years[0] || 'N/A';
        
        document.getElementById('periodo-actual').textContent = periodo;
    }

    resetStats() {
        document.getElementById('avg-value').textContent = '0.0000';
        document.getElementById('max-value').textContent = '0.0000';
        document.getElementById('min-value').textContent = '0.0000';
        document.getElementById('std-value').textContent = '0.0000';
        
        document.getElementById('kpi-avg').textContent = '0.0000';
        document.getElementById('kpi-max').textContent = '0.0000';
        document.getElementById('kpi-min').textContent = '0.0000';
        document.getElementById('kpi-std').textContent = '0.0000';
        
        document.getElementById('total-transformadores').textContent = '0';
        document.getElementById('total-mediciones').textContent = '0';
        document.getElementById('periodo-actual').textContent = 'N/A';
    }

    initializeCharts() {
        // Verificar que los canvas existan
        const mainCanvas = document.getElementById('mainChart');
        const pieCanvas = document.getElementById('pieChart');
        const barCanvas = document.getElementById('barChart');
        const radarCanvas = document.getElementById('radarChart');
        
        if (!mainCanvas || !pieCanvas || !barCanvas || !radarCanvas) {
            console.error('No se encontraron todos los elementos canvas');
            return;
        }

        // Gráfico principal de tendencia
        const mainCtx = mainCanvas.getContext('2d');
        this.charts.main = new Chart(mainCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Frecuencia',
                    data: [],
                    borderColor: '#00a8e8',
                    backgroundColor: 'rgba(0, 168, 232, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: false,
                    pointRadius: 3,
                    pointHoverRadius: 6
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
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: true,
                            color: 'rgba(0,0,0,0.05)'
                        }
                    },
                    y: {
                        beginAtZero: false,
                        grid: {
                            display: true,
                            color: 'rgba(0,0,0,0.05)'
                        }
                    }
                }
            }
        });

        // Gráfico de pastel
        const pieCtx = pieCanvas.getContext('2d');
        this.charts.pie = new Chart(pieCtx, {
            type: 'pie',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#003366', '#0056b3', '#00a8e8', '#28a745'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    }
                }
            }
        });

        // Gráfico de barras
        const barCtx = barCanvas.getContext('2d');
        this.charts.bar = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Valor Promedio',
                    data: [],
                    backgroundColor: 'rgba(0, 86, 179, 0.8)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });

        // Gráfico radar
        const radarCtx = radarCanvas.getContext('2d');
        this.charts.radar = new Chart(radarCtx, {
            type: 'radar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Desempeño',
                    data: [],
                    backgroundColor: 'rgba(0, 168, 232, 0.2)',
                    borderColor: '#00a8e8'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

    updateCharts() {
        if (this.filteredData.length === 0 || !this.charts.main) {
            return;
        }
        
        try {
            // Ordenar datos por fecha
            const sortedData = [...this.filteredData].sort((a, b) => 
                new Date(a.fecha) - new Date(b.fecha)
            );
            
            // Actualizar gráfico principal
            this.charts.main.data.labels = sortedData.map(d => 
                this.formatChartDate(d.fecha)
            );
            this.charts.main.data.datasets[0].data = sortedData.map(d => 
                parseFloat(d.frecuencia)
            );
            this.charts.main.update();
            
            // Actualizar gráfico de pastel
            if (!this.filters.tipoMedicion) {
                const tipos = {};
                this.filteredData.forEach(d => {
                    tipos[d.tipo] = (tipos[d.tipo] || 0) + 1;
                });
                
                this.charts.pie.data.labels = Object.keys(tipos);
                this.charts.pie.data.datasets[0].data = Object.values(tipos);
                this.charts.pie.update();
            }
            
            // Actualizar gráfico de barras
            const transformadores = {};
            this.filteredData.forEach(d => {
                if (!transformadores[d.transformador]) {
                    transformadores[d.transformador] = {
                        sum: 0,
                        count: 0
                    };
                }
                transformadores[d.transformador].sum += parseFloat(d.frecuencia);
                transformadores[d.transformador].count += 1;
            });
            
            const topTransformadores = Object.entries(transformadores)
                .map(([nombre, data]) => ({
                    nombre,
                    promedio: data.sum / data.count
                }))
                .sort((a, b) => b.promedio - a.promedio)
                .slice(0, 5);
            
            this.charts.bar.data.labels = topTransformadores.map(t => t.nombre);
            this.charts.bar.data.datasets[0].data = topTransformadores.map(t => t.promedio);
            this.charts.bar.update();
            
            // Actualizar gráfico radar
            if (!this.filters.departamento) {
                const departamentos = {};
                this.filteredData.forEach(d => {
                    if (d.departamento) {
                        if (!departamentos[d.departamento]) {
                            departamentos[d.departamento] = {
                                sum: 0,
                                count: 0
                            };
                        }
                        departamentos[d.departamento].sum += parseFloat(d.frecuencia);
                        departamentos[d.departamento].count += 1;
                    }
                });
                
                const deptoEntries = Object.entries(departamentos);
                if (deptoEntries.length > 0) {
                    this.charts.radar.data.labels = deptoEntries.map(([nombre]) => nombre);
                    this.charts.radar.data.datasets[0].data = deptoEntries.map(
                        ([_, data]) => data.sum / data.count
                    );
                    this.charts.radar.update();
                }
            }
        } catch (error) {
            console.error('Error actualizando gráficos:', error);
        }
    }

    updateTable() {
        const tbody = document.getElementById('dataTable');
        tbody.innerHTML = '';
        
        const startIdx = (this.pagination.currentPage - 1) * this.pagination.rowsPerPage;
        const endIdx = startIdx + this.pagination.rowsPerPage;
        const pageData = this.filteredData.slice(startIdx, endIdx);
        
        pageData.forEach((item, index) => {
            const row = document.createElement('tr');
            
            const valor = parseFloat(item.frecuencia);
            let status = 'status-normal';
            let statusText = 'Normal';
            
            if (valor > 1.5) {
                status = 'status-danger';
                statusText = 'Crítico';
            } else if (valor > 1.2) {
                status = 'status-warning';
                statusText = 'Alerta';
            }
            
            row.innerHTML = `
                <td><input type="checkbox" class="row-checkbox"></td>
                <td>${item.transformador || 'N/A'}</td>
                <td>${item.departamento || 'N/A'}</td>
                <td>${this.formatDate(item.fecha)}</td>
                <td>${item.tipo || 'N/A'}</td>
                <td><strong>${valor.toFixed(4)}</strong></td>
                <td><span class="status-badge ${status}">${statusText}</span></td>
                <td>
                    <button class="action-btn view-detail" data-id="${startIdx + index}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit-item" data-id="${startIdx + index}">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
        
        // Actualizar información de paginación
        document.getElementById('rowsShown').textContent = 
            `${startIdx + 1}-${Math.min(endIdx, this.filteredData.length)}`;
        document.getElementById('totalRows').textContent = this.filteredData.length;
        document.getElementById('currentPage').textContent = this.pagination.currentPage;
        document.getElementById('totalPages').textContent = this.pagination.totalPages;
        
        // Habilitar/deshabilitar botones de paginación
        document.getElementById('prevPage').disabled = this.pagination.currentPage === 1;
        document.getElementById('nextPage').disabled = 
            this.pagination.currentPage === this.pagination.totalPages;
    }

    updatePagination() {
        this.pagination.totalRows = this.filteredData.length;
        this.pagination.totalPages = Math.max(1, Math.ceil(this.filteredData.length / this.pagination.rowsPerPage));
        
        if (this.pagination.currentPage > this.pagination.totalPages) {
            this.pagination.currentPage = this.pagination.totalPages;
        }
    }

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const [year, month] = dateString.split('-');
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 
                      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${meses[parseInt(month) - 1]} ${year}`;
    }

    formatChartDate(dateString) {
        if (!dateString) return 'N/A';
        const [year, month] = dateString.split('-');
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 
                      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${meses[parseInt(month) - 1]}`;
    }

    initializeEvents() {
        // Evento para aplicar filtros
        document.getElementById('applyFilters').addEventListener('click', () => {
            this.filters = {
                tipoMedicion: document.getElementById('filterTipoMedicion').value,
                transformador: document.getElementById('filterTransformador').value,
                year: document.getElementById('filterYear').value,
                month: document.getElementById('filterMonth').value,
                departamento: document.getElementById('filterDepartamento').value
            };
            this.pagination.currentPage = 1;
            this.loadData();
        });
        
        // Evento para resetear filtros
        document.getElementById('resetFilters').addEventListener('click', () => {
            document.getElementById('filterTipoMedicion').value = '';
            document.getElementById('filterTransformador').value = '';
            document.getElementById('filterYear').value = '';
            document.getElementById('filterMonth').value = '';
            document.getElementById('filterDepartamento').value = '';
            
            this.filters = {
                tipoMedicion: '',
                transformador: '',
                year: '',
                month: '',
                departamento: ''
            };
            
            this.pagination.currentPage = 1;
            this.loadData();
        });
        
        // Cambiar tipo de gráfico principal
        document.querySelectorAll('.chart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                const type = e.currentTarget.dataset.chartType;
                
                if (this.charts.main) {
                    // Usar 'line' en lugar de 'area' y configurar fill
                    if (type === 'area') {
                        this.charts.main.config.type = 'line';
                        this.charts.main.data.datasets[0].fill = true;
                        this.charts.main.data.datasets[0].backgroundColor = 'rgba(0, 168, 232, 0.2)';
                    } else if (type === 'line') {
                        this.charts.main.config.type = 'line';
                        this.charts.main.data.datasets[0].fill = false;
                        this.charts.main.data.datasets[0].backgroundColor = 'rgba(0, 168, 232, 0.1)';
                    } else {
                        this.charts.main.config.type = type;
                        this.charts.main.data.datasets[0].fill = false;
                        this.charts.main.data.datasets[0].backgroundColor = 'rgba(0, 86, 179, 0.8)';
                    }
                    this.charts.main.update();
                }
            });
        });
        
        // Paginación
        document.getElementById('prevPage').addEventListener('click', () => {
            if (this.pagination.currentPage > 1) {
                this.pagination.currentPage--;
                this.updateTable();
            }
        });
        
        document.getElementById('nextPage').addEventListener('click', () => {
            if (this.pagination.currentPage < this.pagination.totalPages) {
                this.pagination.currentPage++;
                this.updateTable();
            }
        });
        
        // Buscar en tabla
        document.getElementById('tableSearch').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#dataTable tr');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        });
        
        // Exportar datos
        document.querySelector('.btn-export').addEventListener('click', () => {
            this.exportData();
        });
        
        // Seleccionar todos los checkbox
        document.getElementById('selectAll').addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.row-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
            });
        });
        
        // Modal - cerrar
        document.querySelector('.modal-close').addEventListener('click', () => {
            document.getElementById('detailModal').classList.remove('show');
        });
        
        // Cerrar modal al hacer clic fuera
        document.getElementById('detailModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('detailModal')) {
                document.getElementById('detailModal').classList.remove('show');
            }
        });
        
        // Delegación de eventos para botones de acción
        document.addEventListener('click', (e) => {
            if (e.target.closest('.view-detail')) {
                const button = e.target.closest('.view-detail');
                const index = parseInt(button.dataset.id);
                const item = this.filteredData[index];
                if (item) {
                    this.showDetailModal(item);
                }
            }
            
            if (e.target.closest('.edit-item')) {
                const button = e.target.closest('.edit-item');
                const index = parseInt(button.dataset.id);
                const item = this.filteredData[index];
                if (item) {
                    const newValue = prompt('Ingrese nuevo valor:', parseFloat(item.frecuencia).toFixed(4));
                    if (newValue && !isNaN(parseFloat(newValue))) {
                        item.frecuencia = parseFloat(newValue);
                        this.updateStats();
                        this.updateCharts();
                        this.updateTable();
                    }
                }
            }
        });
        
        // ===== MENÚ HAMBURGUESA =====
        // Toggle sidebar en móviles
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            this.toggleSidebar();
        });
        
        // Cerrar sidebar al hacer clic fuera en móvil
        document.addEventListener('click', (e) => {
            if (this.isSidebarOpen && this.isMobile) {
                const sidebar = document.getElementById('sidebar');
                const toggleBtn = document.getElementById('sidebarToggle');
                
                // Si el clic NO fue en el sidebar ni en el botón toggle, cerrar
                if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
                    this.toggleSidebar();
                }
            }
        });
        
        // Cerrar sidebar al redimensionar si se vuelve a desktop
        window.addEventListener('resize', () => {
            const wasMobile = this.isMobile;
            this.isMobile = window.innerWidth <= 767;
            
            if (wasMobile && !this.isMobile && this.isSidebarOpen) {
                this.closeSidebar();
            }
            
            // Redimensionar gráficos
            if (this.charts.main) this.charts.main.resize();
            if (this.charts.pie) this.charts.pie.resize();
            if (this.charts.bar) this.charts.bar.resize();
            if (this.charts.radar) this.charts.radar.resize();
        });
        
        // Cerrar sidebar con tecla ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isSidebarOpen) {
                this.toggleSidebar();
            }
        });
    }

    // Método para alternar sidebar
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('sidebarToggle');
        
        if (!this.isSidebarOpen) {
            // Guardar posición del scroll
            this.scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
            
            // Abrir sidebar
            sidebar.classList.add('show');
            toggleBtn.classList.add('active');
            
            if (this.isMobile) {
                document.body.style.overflow = 'hidden';
                document.body.style.position = 'fixed';
                document.body.style.width = '100%';
                document.body.style.top = `-${this.scrollPosition}px`;
            }
        } else {
            // Cerrar sidebar
            sidebar.classList.remove('show');
            toggleBtn.classList.remove('active');
            
            if (this.isMobile) {
                document.body.style.overflow = '';
                document.body.style.position = '';
                document.body.style.width = '';
                document.body.style.top = '';
                
                // Restaurar posición del scroll
                window.scrollTo(0, this.scrollPosition);
            }
        }
        
        this.isSidebarOpen = !this.isSidebarOpen;
    }

    // Método para cerrar sidebar
    closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('sidebarToggle');
        
        sidebar.classList.remove('show');
        toggleBtn.classList.remove('active');
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.top = '';
        
        this.isSidebarOpen = false;
    }

    // Ajustar layout para móvil
    adjustLayoutForMobile() {
        if (this.isMobile) {
            // Ajustar la altura del contenido principal
            const mainContent = document.querySelector('.main-content');
            const header = document.querySelector('header');
            
            if (header && mainContent) {
                const headerHeight = header.offsetHeight;
                mainContent.style.minHeight = `calc(100vh - ${headerHeight}px)`;
                
                // Ajustar sidebar
                const sidebar = document.getElementById('sidebar');
                if (sidebar) {
                    sidebar.style.top = `${headerHeight}px`;
                    sidebar.style.height = `calc(100vh - ${headerHeight}px)`;
                }
                
                // Ajustar loading overlay
                const loadingOverlay = document.getElementById('loadingOverlay');
                if (loadingOverlay) {
                    loadingOverlay.style.top = `${headerHeight}px`;
                    loadingOverlay.style.height = `calc(100vh - ${headerHeight}px)`;
                }
            }
        }
    }

    showDetailModal(item) {
        const modal = document.getElementById('detailModal');
        const modalBody = document.getElementById('modalBody');
        
        const valor = parseFloat(item.frecuencia);
        let status = 'status-normal';
        let statusText = 'Normal';
        
        if (valor > 1.5) {
            status = 'status-danger';
            statusText = 'Crítico';
        } else if (valor > 1.2) {
            status = 'status-warning';
            statusText = 'Alerta';
        }
        
        modalBody.innerHTML = `
            <div class="modal-details">
                <h4>Detalles de Medición</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Alimentador:</span>
                        <span class="detail-value">${item.transformador || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Departamento:</span>
                        <span class="detail-value">${item.departamento || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Fecha:</span>
                        <span class="detail-value">${this.formatDate(item.fecha)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Tipo:</span>
                        <span class="detail-value">${item.tipo || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Valor:</span>
                        <span class="detail-value">${valor.toFixed(4)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Estado:</span>
                        <span class="detail-value"><span class="status-badge ${status}">${statusText}</span></span>
                    </div>
                </div>
            </div>
        `;
        
        modal.classList.add('show');
    }

    exportData() {
        if (this.filteredData.length === 0) {
            alert('No hay datos para exportar');
            return;
        }
        
        const headers = ['Alimentador', 'Departamento', 'Fecha', 'Tipo', 'Valor'];
        const csvData = [
            headers.join(','),
            ...this.filteredData.map(item => {
                return [
                    `"${item.transformador || ''}"`,
                    `"${item.departamento || ''}"`,
                    `"${item.fecha}"`,
                    `"${item.tipo || ''}"`,
                    parseFloat(item.frecuencia).toFixed(4)
                ].join(',');
            })
        ];
        
        const csvContent = csvData.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `ande_datos_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    showError(message) {
        alert(`Error: ${message}`);
    }
}

// Inicializar dashboard cuando se cargue la página
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new ANDEDashboard();
});