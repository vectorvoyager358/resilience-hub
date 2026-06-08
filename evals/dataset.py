"""Load and validate evals/chat_golden.jsonl."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

REQUIRED_FIELDS = frozenset({"id", "message", "history", "expect_rag", "notes"})

DEFAULT_GOLDEN_PATH = Path(__file__).resolve().parent / "chat_golden.jsonl"


def load_golden_rows(path: Path | None = None) -> list[dict[str, Any]]:
    """Parse JSONL golden cases. Each row includes `_line` (source line number)."""
    golden_path = path or DEFAULT_GOLDEN_PATH
    rows: list[dict[str, Any]] = []
    text = golden_path.read_text(encoding="utf-8")
    for line_no, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue
        row = json.loads(stripped)
        if not isinstance(row, dict):
            raise ValueError(f"line {line_no}: expected JSON object")
        missing = REQUIRED_FIELDS - row.keys()
        if missing:
            raise ValueError(f"line {line_no} ({row.get('id')}): missing {sorted(missing)}")
        if not isinstance(row["history"], list):
            raise ValueError(f"line {line_no} ({row['id']}): history must be a list")
        if not isinstance(row["expect_rag"], bool):
            raise ValueError(f"line {line_no} ({row['id']}): expect_rag must be boolean")
        row["_line"] = line_no
        rows.append(row)
    return rows
