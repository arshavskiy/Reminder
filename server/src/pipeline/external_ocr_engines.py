"""
Optional OCR/PDF extraction bridge for benchmarking.

This script intentionally keeps Docling, pdfmux, and craft as optional tools.
It is used by auditPdfOcrFlow.ts only when --external is passed, so Railway
production does not need these heavy dependencies installed for the app to run.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PY_DEPS = HERE.parent.parent / "py_deps"
if PY_DEPS.is_dir():
    sys.path.insert(0, str(PY_DEPS))


def result(engine: str, available: bool, text: str = "", error: str | None = None, meta: dict | None = None) -> dict:
    return {
        "engine": engine,
        "available": available,
        "text": text,
        "error": error,
        "meta": meta or {},
    }


def has_module(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def run_docling(path: Path) -> dict:
    if not has_module("docling"):
        return result("docling", False, error="docling is not installed")

    try:
        from docling.document_converter import DocumentConverter

        converter = DocumentConverter()
        converted = converter.convert(str(path))
        text = converted.document.export_to_markdown()
        return result("docling", True, text=text, meta={"format": "markdown"})
    except Exception as exc:
        return result("docling", True, error=str(exc))


def run_pdfmux(path: Path) -> dict:
    if not has_module("pdfmux") and not shutil.which("pdfmux"):
        return result("pdfmux", False, error="pdfmux is not installed")

    commands = []
    if shutil.which("pdfmux"):
        commands.append(["pdfmux", "convert", str(path)])
    commands.append([sys.executable, "-m", "pdfmux", "convert", str(path)])

    last_error = None
    for command in commands:
        try:
            completed = subprocess.run(
                command,
                check=False,
                text=True,
                capture_output=True,
                timeout=int(os.environ.get("EXTERNAL_OCR_TIMEOUT_SECONDS", "120")),
            )
            output = (completed.stdout or "").strip()
            if completed.returncode == 0 and output:
                return result("pdfmux", True, text=output, meta={"command": command[0]})
            last_error = (completed.stderr or output or f"exit {completed.returncode}").strip()
        except Exception as exc:
            last_error = str(exc)

    return result("pdfmux", True, error=last_error or "pdfmux command failed")


def run_craft(path: Path) -> dict:
    craft_cli = os.environ.get("CRAFT_OCR_CLI", "").strip()
    if not craft_cli:
        return result("craft", False, error="set CRAFT_OCR_CLI to benchmark AyonPal/craft")

    command = [
        sys.executable,
        craft_cli,
        "--input",
        str(path),
        "--ocr",
        "--horizontal-lang",
        os.environ.get("CRAFT_HORIZONTAL_LANG", "heb"),
    ]
    tessdata_dir = os.environ.get("CRAFT_TESSDATA_DIR", "").strip()
    if tessdata_dir:
        command.extend(["--tessdata-dir", tessdata_dir])

    try:
        completed = subprocess.run(
            command,
            check=False,
            text=True,
            capture_output=True,
            timeout=int(os.environ.get("EXTERNAL_OCR_TIMEOUT_SECONDS", "120")),
        )
        output = (completed.stdout or "").strip()
        if completed.returncode == 0 and output:
            return result("craft", True, text=output, meta={"command": craft_cli})
        return result("craft", True, error=(completed.stderr or output or f"exit {completed.returncode}").strip())
    except Exception as exc:
        return result("craft", True, error=str(exc))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", required=True, choices=["docling", "pdfmux", "craft"])
    parser.add_argument("--file", required=True)
    args = parser.parse_args()

    path = Path(args.file)
    if not path.is_file():
        print(json.dumps(result(args.engine, False, error=f"file not found: {path}"), ensure_ascii=False))
        return 0

    if args.engine == "docling":
        payload = run_docling(path)
    elif args.engine == "pdfmux":
        payload = run_pdfmux(path)
    else:
        payload = run_craft(path)

    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
