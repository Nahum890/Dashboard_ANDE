import csv

input_file = "datos.csv"   # nombre del archivo original
output_file = "datos_2023_filtrados.csv"

with open(input_file, mode='r', encoding='utf-8') as infile, \
     open(output_file, mode='w', newline='', encoding='utf-8') as outfile:

    reader = csv.DictReader(infile)
    # Definir las columnas de salida
    fieldnames = ['seccion', 'anio', 'mes', 'departamento', 'tipo_medicion', 'valor']
    writer = csv.DictWriter(outfile, fieldnames=fieldnames)
    writer.writeheader()

    for row in reader:
        if row['anio'] == '2023':   # filtrar año 2023
            # Crear un nuevo diccionario solo con las columnas deseadas
            new_row = {col: row[col] for col in fieldnames}
            writer.writerow(new_row)

print(f"Archivo '{output_file}' generado con los datos de 2023.")