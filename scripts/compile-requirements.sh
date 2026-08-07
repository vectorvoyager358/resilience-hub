#!/usr/bin/env bash
# Regenerate requirements.txt (Python lockfile) from requirements.in.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON_BIN="${PYTHON_BIN:-python3.12}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python 3.12 is required (set PYTHON_BIN to an equivalent executable)." >&2
  exit 1
fi

if [[ ! -x ".venv/bin/python" ]] || ! .venv/bin/python -c 'import sys; raise SystemExit(sys.version_info[:2] != (3, 12))'; then
  "$PYTHON_BIN" -m venv --clear .venv
fi

if [[ ! -x ".venv/bin/pip-compile" ]]; then
  .venv/bin/pip install --upgrade pip pip-tools
fi
PIP_COMPILE=".venv/bin/pip-compile"

"$PIP_COMPILE" --strip-extras --output-file requirements.txt requirements.in

echo "Updated requirements.txt from requirements.in"
