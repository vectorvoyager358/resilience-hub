#!/usr/bin/env bash
# Regenerate requirements-dev.txt (nightly RAGAS deps) from requirements-dev.in.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -x ".venv/bin/pip-compile" ]]; then
  python3 -m venv .venv
  # pip-tools 7.6.0 is not yet compatible with pip 26.2.
  .venv/bin/pip install --upgrade "pip<26.2" pip-tools
fi
PIP_COMPILE=".venv/bin/pip-compile"

"$PIP_COMPILE" --strip-extras --output-file requirements-dev.txt requirements-dev.in

echo "Updated requirements-dev.txt from requirements-dev.in"
