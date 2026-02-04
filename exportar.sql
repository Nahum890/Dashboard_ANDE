.headers on
.mode csv
.output prueba.csv
SELECT seccion, anio, mes, departamento, local, tipo_medicion, valor FROM mediciones_completas LIMIT 3;
.quit