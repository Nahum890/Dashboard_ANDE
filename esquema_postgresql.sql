-- esquema_postgresql.sql
-- Crear estructura de la base de datos ANDE

-- Tabla principal de mediciones
CREATE TABLE IF NOT EXISTS mediciones_completas (
    id SERIAL PRIMARY KEY,
    seccion VARCHAR(50) NOT NULL,
    anio INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100),
    mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
    departamento VARCHAR(100) DEFAULT 'ALTO PARANÁ',
    tipo_medicion VARCHAR(50) NOT NULL,
    valor DECIMAL(15, 4) NOT NULL,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_medicion UNIQUE (seccion, anio, mes, tipo_medicion)
);

-- Tabla para logs de actualizaciones
CREATE TABLE IF NOT EXISTS logs_actualizacion (
    id SERIAL PRIMARY KEY,
    archivo VARCHAR(255),
    registros_procesados INTEGER,
    estado VARCHAR(50),
    mensaje TEXT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para estadísticas en caché
CREATE TABLE IF NOT EXISTS estadisticas_cache (
    clave VARCHAR(100) PRIMARY KEY,
    valor TEXT,
    actualizado TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);