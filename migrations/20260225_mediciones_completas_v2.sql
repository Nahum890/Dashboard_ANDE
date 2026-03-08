BEGIN TRANSACTION;

DROP TABLE IF EXISTS mediciones_completas_v2;

CREATE TABLE mediciones_completas_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seccion TEXT,
    anio INTEGER,
    mes INTEGER,
    departamento TEXT,
    local TEXT,
    tipo_medicion TEXT,
    valor REAL,
    carga_id INTEGER,
    UNIQUE(seccion, anio, mes, tipo_medicion)
);

INSERT INTO mediciones_completas_v2 (
    id,
    seccion,
    anio,
    mes,
    departamento,
    local,
    tipo_medicion,
    valor,
    carga_id
)
SELECT
    id,
    TRIM(seccion) AS seccion,
    anio,
    mes,
    departamento,
    NULL AS local,
    TRIM(tipo_medicion) AS tipo_medicion,
    valor,
    carga_id
FROM mediciones_completas;

ALTER TABLE mediciones_completas RENAME TO mediciones_completas_backup;
ALTER TABLE mediciones_completas_v2 RENAME TO mediciones_completas;

COMMIT;
