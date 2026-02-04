import sqlite3
import psycopg2

# === CONFIGURACIÓN ===
PG_CONFIG = {
    "host": "localhost",
    "database": "ande_dashboard",  # <-- CAMBIA ESTO
    "user": "postgres",
    "password": "whysoshy777",       # <-- CAMBIA ESTO
    "port": "5432"
}
SQLITE_FILE = 'ANDE.db'

def migrar():
    sqlite_conn = None
    pg_conn = None

    try:
        print("--- Iniciando proceso de migración ---")
        sqlite_conn = sqlite3.connect(SQLITE_FILE)
        sqlite_cur = sqlite_conn.cursor()
        pg_conn = psycopg2.connect(**PG_CONFIG)
        pg_cur = pg_conn.cursor()

        # 1. Limpiar tabla para empezar de cero
        print("🧹 Limpiando tabla en PostgreSQL...")
        pg_cur.execute("TRUNCATE TABLE mediciones_completas RESTART IDENTITY;")
        pg_conn.commit()

        # 2. Leer datos de SQLite
        sqlite_cur.execute("SELECT seccion, anio, mes, departamento, tipo_medicion, valor FROM mediciones_completas")
        filas = sqlite_cur.fetchall()
        print(f"📖 Se leyeron {len(filas)} registros de SQLite.")

        # 3. Insertar con protección contra duplicados (ON CONFLICT)
        # Si encuentra un duplicado según la regla 'unique_medicion', simplemente lo salta.
        print(f"🚀 Insertando datos... (Esto omitirá los duplicados automáticamente)")
        
        query_insert = """
            INSERT INTO mediciones_completas (seccion, anio, mes, departamento, tipo_medicion, valor) 
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT ON CONSTRAINT unique_medicion DO NOTHING
        """
        
        # Usamos un bucle simple para asegurar que cada fila se evalúe contra el conflicto
        count = 0
        for fila in filas:
            pg_cur.execute(query_insert, fila)
            count += 1
            if count % 10000 == 0:
                print(f"   Procesados {count} registros...")

        pg_conn.commit()
        print(f"🎉 ¡Migración terminada! Revisa tu base de datos.")

    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if sqlite_conn: sqlite_conn.close()
        if pg_conn: pg_conn.close()

if __name__ == "__main__":
    migrar()