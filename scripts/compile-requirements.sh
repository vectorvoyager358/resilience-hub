#!/usr/bin/env bash
# Regenerate requirements.txt (Python lockfile) from requirements.in.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -x ".venv/bin/pip-compile" ]]; then
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip pip-tools
fi
PIP_COMPILE=".venv/bin/pip-compile"

"$PIP_COMPILE" --strip-extras --output-file requirements.txt requirements.in

echo "Updated requirements.txt from requirements.in"
