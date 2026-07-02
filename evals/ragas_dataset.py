"""Load evals/ragas_recorded.jsonl for offline / live RAGAS scoring (#82)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

RAGAS_REQUIRED_FIELDS = frozenset(
    {"id", "golden_id", "user_input", "retrieved_contexts", "response", "notes"}
)

DEFAULT_RAGAS_PATH = Path(__file__).resolve().parent / "ragas_recorded.jsonl"


def load_ragas_rows(path: Path | None = None) -> list[dict[str, Any]]:
    """Parse RAGAS fixture JSONL. Each row includes `_line` (source line number)."""
    ragas_path = path or DEFAULT_RAGAS_PATH
    rows: list[dict[str, Any]] = []
    text = ragas_path.read_text(encoding="utf-8")
    for line_no, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue
        row = json.loads(stripped)
        if not isinstance(row, dict):
            raise ValueError(f"line {line_no}: expected JSON object")
        missing = RAGAS_REQUIRED_FIELDS - row.keys()
        if missing:
            raise ValueError(f"line {line_no} ({row.get('id')}): missing {sorted(missing)}")
        contexts = row["retrieved_contexts"]
        if not isinstance(contexts, list) or not contexts:
            raise ValueError(f"line {line_no} ({row['id']}): retrieved_contexts must be a non-empty list")
        if not all(isinstance(c, str) and c.strip() for c in contexts):
            raise ValueError(f"line {line_no} ({row['id']}): retrieved_contexts must be non-empty strings")
        if not isinstance(row["response"], str) or not row["response"].strip():
            raise ValueError(f"line {line_no} ({row['id']}): response must be a non-empty string")
        row["_line"] = line_no
        rows.append(row)
    return rows
