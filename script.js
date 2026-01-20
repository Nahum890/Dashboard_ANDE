// Dashboard ANDE - Sistema de Monitoreo
class ANDEDashboard {
    constructor() {
        this.data = [];
        this.filteredData = [];
        this.charts = {};
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
        
        this.initialize();
    }

    async initialize() {
        this.showLoading(true);
        
        // Cargar datos iniciales
        await this.loadTiposMedicion();
        await this.loadDepartamentos();
        await this.loadData();
        
        // Inicializar eventos
        this.initializeEvents();
        
        // Inicializar gráficos
        this.initializeCharts();
        
        this.showLoading(false);
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
            tipos.forEach(tipo => {
                const option = document.createElement('option');
                option.value = tipo;
                option.textContent = tipo;
                select.appendChild(option);
            });

            if (tipos.includes('TOTAL FEP')) {
                select.value = 'TOTAL FEP';
                this.filters.tipoMedicion = 'TOTAL FEP';
            }
        } catch (error) {
            console.error('Error cargando tipos:', error);
        }
    }

    async loadDepartamentos() {
        try {
            const params = new URLSearchParams(this.filters);
            const res = await fetch(`http://localhost:3000/api/datos?${params}`);
            const data = await res.json();
            
            const departamentos = [...new Set(data.map(d => d.departamento))].filter(d => d);
            const select = document.getElementById('filterDepartamento');
            
            departamentos.sort().forEach(depto => {
                const option = document.createElement('option');
                option.value = depto;
                option.textContent = depto;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Error cargando departamentos:', error);
        }
    }

    async loadData() {
        try {
            const params = new URLSearchParams();
            
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
            
            this.updateFilters();
            this.applyFilters();
            this.updateStats();
        } catch (error) {
            console.error('Error al cargar datos:', error);
            this.showError('Error al cargar datos del servidor');
        }
    }

    updateFilters() {
        // Actualizar años
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

        // Actualizar transformadores
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
        // Filtrar datos
        this.filteredData = this.data.filter(item => {
            if (this.filters.year && !item.fecha.startsWith(this.filters.year)) return false;
            if (this.filters.month) {
                const mes = item.fecha.split('-')[1];
                if (parseInt(mes) !== parseInt(this.filters.month)) return false;
            }
            if (this.filters.transformador && item.transformador !== this.filters.transformador) return false;
            if (this.filters.departamento && item.departamento !== this.filters.departamento) return false;
            if (this.filters.tipoMedicion && item.tipo !== this.filters.tipoMedicion) return false;
            return true;
        });

        // Actualizar estadísticas
        this.updateStats();
        
        // Actualizar gráficos
        this.updateCharts();
        
        // Actualizar tabla
        this.updateTable();
        
        // Actualizar paginación
        this.updatePagination();
    }

    updateStats() {
        if (this.filteredData.length === 0) return;
        
        const valores = this.filteredData.map(d => parseFloat(d.frecuencia));
        const avg = valores.reduce((a, b) => a + b, 0) / valores.length;
        const max = Math.max(...valores);
        const min = Math.min(...valores);
        
        // Calcular desviación estándar
        const variance = valores.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / valores.length;
        const std = Math.sqrt(variance);
        
        // Actualizar elementos
        document.getElementById('avg-value').textContent = avg.toFixed(4);
        document.getElementById('max-value').textContent = max.toFixed(4);
        document.getElementById('min-value').textContent = min.toFixed(4);
        document.getElementById('std-value').textContent = std.toFixed(4);
        
        document.getElementById('kpi-avg').textContent = avg.toFixed(4);
        document.getElementById('kpi-max').textContent = max.toFixed(4);
        document.getElementById('kpi-min').textContent = min.toFixed(4);
        document.getElementById('kpi-std').textContent = std.toFixed(4);
        
        document.getElementById('total-transformadores').textContent = 
            new Set(this.filteredData.map(d => d.transformador)).size;
        document.getElementById('total-mediciones').textContent = this.filteredData.length;
        
        // Actualizar periodo
        const years = [...new Set(this.filteredData.map(d => d.fecha.substring(0, 4)))];
        document.getElementById('periodo-actual').textContent = 
            years.length > 1 ? `${Math.min(...years)}-${Math.max(...years)}` : years[0] || 'N/A';
    }

    initializeCharts() {
        // Gráfico principal
        const mainCtx = document.getElementById('mainChart').getContext('2d');
        this.charts.main = new Chart(mainCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Frecuencia',
                    data: [],
                    borderColor: '#00a8e8',
                    backgroundColor: 'rgba(0, 168, 232, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 8,
                    pointBackgroundColor: '#00a8e8',
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

        // Gráfico de pastel
        const pieCtx = document.getElementById('pieChart').getContext('2d');
        this.charts.pie = new Chart(pieCtx, {
            type: 'pie',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#003366', '#0056b3', '#00a8e8', '#28a745', 
                        '#ffc107', '#dc3545', '#6610f2', '#fd7e14'
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
                                size: 12
                            },
                            padding: 20
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.raw;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return `${context.label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });

        // Gráfico de barras
        const barCtx = document.getElementById('barChart').getContext('2d');
        this.charts.bar = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Valor Promedio',
                    data: [],
                    backgroundColor: 'rgba(0, 86, 179, 0.8)',
                    borderColor: '#0056b3',
                    borderWidth: 2,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0,0,0,0.05)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });

        // Gráfico radar
        const radarCtx = document.getElementById('radarChart').getContext('2d');
        this.charts.radar = new Chart(radarCtx, {
            type: 'radar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Desempeño',
                    data: [],
                    backgroundColor: 'rgba(0, 168, 232, 0.2)',
                    borderColor: '#00a8e8',
                    borderWidth: 2,
                    pointBackgroundColor: '#00a8e8',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        beginAtZero: true,
                        ticks: {
                            display: false
                        },
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        }
                    }
                }
            }
        });
    }

    updateCharts() {
        if (this.filteredData.length === 0) return;
        
        // Ordenar datos por fecha
        const sortedData = [...this.filteredData].sort((a, b) => 
            new Date(a.fecha) - new Date(b.fecha)
        );
        
        // Actualizar gráfico principal
        this.charts.main.data.labels = sortedData.map(d => 
            this.formatDate(d.fecha)
        );
        this.charts.main.data.datasets[0].data = sortedData.map(d => 
            parseFloat(d.frecuencia)
        );
        this.charts.main.data.datasets[0].label = 
            this.filters.tipoMedicion || 'Frecuencia';
        this.charts.main.update();
        
        // Actualizar gráfico de pastel (por tipo de medición)
        if (!this.filters.tipoMedicion) {
            const tipos = {};
            this.filteredData.forEach(d => {
                tipos[d.tipo] = (tipos[d.tipo] || 0) + 1;
            });
            
            this.charts.pie.data.labels = Object.keys(tipos);
            this.charts.pie.data.datasets[0].data = Object.values(tipos);
            this.charts.pie.update();
        }
        
        // Actualizar gráfico de barras (top transformadores)
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
        
        // Actualizar gráfico radar (por departamento)
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
    }

    updateTable() {
        const tbody = document.getElementById('dataTable');
        tbody.innerHTML = '';
        
        const startIdx = (this.pagination.currentPage - 1) * this.pagination.rowsPerPage;
        const endIdx = startIdx + this.pagination.rowsPerPage;
        const pageData = this.filteredData.slice(startIdx, endIdx);
        
        pageData.forEach((item, index) => {
            const row = document.createElement('tr');
            row.style.animationDelay = `${index * 0.05}s`;
            row.classList.add('fade-in-row');
            
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
                    <button class="action-btn view-detail" data-id="${index}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit-item" data-id="${index}">
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
        this.pagination.totalPages = Math.ceil(this.filteredData.length / this.pagination.rowsPerPage);
        
        if (this.pagination.currentPage > this.pagination.totalPages && this.pagination.totalPages > 0) {
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

    initializeEvents() {
        // Filtros
        document.getElementById('applyFilters').addEventListener('click', () => {
            this.filters = {
                tipoMedicion: document.getElementById('filterTipoMedicion').value,
                transformador: document.getElementById('filterTransformador').value,
                year: document.getElementById('filterYear').value,
                month: document.getElementById('filterMonth').value,
                departamento: document.getElementById('filterDepartamento').value
            };
            this.loadData();
        });
        
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
            
            this.loadData();
        });
        
        // Cambiar tipo de gráfico principal
        document.querySelectorAll('.chart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                const type = e.currentTarget.dataset.chartType;
                this.charts.main.config.type = type;
                this.charts.main.update();
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
        
        // Seleccionar todos
        document.getElementById('selectAll').addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.row-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
            });
        });
        
        // Modal
        document.querySelector('.modal-close').addEventListener('click', () => {
            document.getElementById('detailModal').classList.remove('show');
        });
        
        // Cerrar modal al hacer clic fuera
        document.getElementById('detailModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('detailModal')) {
                document.getElementById('detailModal').classList.remove('show');
            }
        });
    }

    exportData() {
        const headers = ['Alimentador', 'Departamento', 'Fecha', 'Tipo', 'Valor', 'Estado'];
        const csvData = [
            headers.join(','),
            ...this.filteredData.map(item => {
                const valor = parseFloat(item.frecuencia);
                let estado = 'Normal';
                if (valor > 1.5) estado = 'Crítico';
                else if (valor > 1.2) estado = 'Alerta';
                
                return [
                    item.transformador || '',
                    item.departamento || '',
                    item.fecha,
                    item.tipo || '',
                    valor.toFixed(4),
                    estado
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
        // Implementar notificación de error
        console.error(message);
        alert(`Error: ${message}`);
    }
}

// Inicializar dashboard cuando se cargue la página
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new ANDEDashboard();
});