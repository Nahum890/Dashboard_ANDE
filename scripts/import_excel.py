#!/usr/bin/env python3
"""Importador opcional de Excel con mismas reglas del backend."""

from __future__ import annotations

import argparse
import sqlite3
import unicodedata
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd

BASE_COLUMNS = {"seccion", "anio", "mes", "departamento"}


def normalize_header(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip().lower()
    text = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


def normalize_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def map_row(row: Dict[str, object]) -> Dict[str, object]:
    alias = {
        "seccion": "seccion",
        "alimentador": "seccion",
        "anio": "anio",
        "ano": "anio",
        "mes": "mes",
        "tipo_medicion": "tipo_medicion",
        "tipo": "tipo_medicion",
        "valor": "valor",
        "departamento": "departamento",
    }
    mapped: Dict[str, object] = {}
    for key, value in row.items():
        norm = normalize_header(key)
        mapped[alias.get(norm, norm)] = value
    return mapped


def detect_valid_sheet(path: Path) -> Optional[Tuple[str, pd.DataFrame]]:
    xls = pd.ExcelFile(path)
    for sheet_name in xls.sheet_names:
        df = pd.read_excel(path, sheet_name=sheet_name)
        if df.empty:
            continue
        headers = [normalize_header(c) for c in df.columns]
        header_set = set(headers)

        has_base = "mes" in header_set and ("seccion" in header_set or "alimentador" in header_set) and (
            "anio" in header_set or "ano" in header_set
        )
        long_format = "tipo_medicion" in header_set and "valor" in header_set
        pivot_format = any(h not in {"seccion", "alimentador", "anio", "ano", "mes", "departamento"} for h in headers)

        if has_base and (long_format or pivot_format):
            return sheet_name, df
    return None


def transform_rows(df: pd.DataFrame):
    records: List[Tuple[str, int, int, Optional[str], str, float]] = []
    rejects = {
        "header_faltante": 0,
        "seccion_faltante": 0,
        "anio_invalido": 0,
        "mes_invalido": 0,
        "tipo_medicion_faltante": 0,
        "valor_invalido": 0,
        "error_fila": 0,
    }
    details: List[str] = []

    for idx, raw_row in enumerate(df.to_dict(orient="records"), start=2):
        try:
            row = map_row(raw_row)
            seccion = normalize_text(row.get("seccion"))

            try:
                anio = int(float(row.get("anio")))
            except (TypeError, ValueError):
                anio = None

            try:
                mes = int(float(row.get("mes")))
            except (TypeError, ValueError):
                mes = None

            departamento = normalize_text(row.get("departamento")) or None

            if not seccion:
                rejects["seccion_faltante"] += 1
                details.append(f"Fila {idx}: Falta 'seccion'")
                continue
            if anio is None:
                rejects["anio_invalido"] += 1
                details.append(f"Fila {idx}: 'anio' inválido: {row.get('anio')}")
                continue
            if mes is None or mes < 1 or mes > 12:
                rejects["mes_invalido"] += 1
                details.append(f"Fila {idx}: 'mes' inválido: {row.get('mes')}")
                continue

            is_long = "tipo_medicion" in row and "valor" in row

            if is_long:
                tipo = normalize_text(row.get("tipo_medicion"))
                try:
                    valor = float(row.get("valor"))
                except (TypeError, ValueError):
                    valor = None

                if not tipo:
                    rejects["tipo_medicion_faltante"] += 1
                    details.append(f"Fila {idx}: Falta 'tipo_medicion'")
                    continue
                if valor is None:
                    rejects["valor_invalido"] += 1
                    details.append(f"Fila {idx}: 'valor' inválido: {row.get('valor')}")
                    continue

                records.append((seccion, anio, mes, departamento, tipo, valor))
                continue

            for key, raw_value in row.items():
                if key in BASE_COLUMNS:
                    continue
                if raw_value is None or str(raw_value).strip() == "":
                    continue

                try:
                    valor = float(raw_value)
                except (TypeError, ValueError):
                    rejects["valor_invalido"] += 1
                    details.append(f"Fila {idx}: valor inválido en '{key}': {raw_value}")
                    continue

                tipo = normalize_text(key).upper()
                if not tipo:
                    rejects["tipo_medicion_faltante"] += 1
                    details.append(f"Fila {idx}: tipo de medición vacío en pivote")
                    continue

                records.append((seccion, anio, mes, departamento, tipo, valor))
        except Exception as exc:  # noqa: BLE001
            rejects["error_fila"] += 1
            details.append(f"Fila {idx}: Error - {exc}")

    return records, rejects, details


def import_excel(excel_path: Path, db_path: Path, dry_run: bool = False) -> Dict[str, object]:
    detected = detect_valid_sheet(excel_path)
    if not detected:
        return {
            "ok": False,
            "error": "No se encontró una hoja válida con headers requeridos",
            "resumen_rechazos": {"header_faltante": 1},
            "total_procesado": 0,
        }

    sheet_name, df = detected
    records, rejects, details = transform_rows(df)
    errors = sum(rejects.values())

    inserted = 0
    if not dry_run and records:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.executemany(
            """
            INSERT OR REPLACE INTO mediciones_completas
            (seccion, anio, mes, departamento, tipo_medicion, valor)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            records,
        )
        inserted = cur.rowcount if cur.rowcount and cur.rowcount > 0 else len(records)
        conn.commit()
        conn.close()
    else:
        inserted = len(records)

    return {
        "ok": True,
        "hoja_usada": sheet_name,
        "insertadas": inserted,
        "errores": errors,
        "total_procesado": len(df),
        "total_registros_largos": len(records),
        "resumen_rechazos": rejects,
        "detalles_errores": details[:20],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Importador masivo opcional de Excel para ANDE")
    parser.add_argument("excel", type=Path, help="Ruta del archivo Excel")
    parser.add_argument("--db", type=Path, default=Path("ANDE.db"), help="Ruta de base de datos SQLite")
    parser.add_argument("--dry-run", action="store_true", help="Valida y transforma sin insertar")
    args = parser.parse_args()

    result = import_excel(args.excel, args.db, dry_run=args.dry_run)
    print(result)

    if not result.get("ok"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
