#!/usr/bin/env python3
"""Offline chat eval runner (#79).

Default: routing-only (no Gemini, no Pinecone, no network).
Optional --mock-chat: stubbed /api/chat-assistant meta checks.

Usage (from repo root):
  python scripts/run_chat_eval.py
  python scripts/run_chat_eval.py --mock-chat --report evals/reports/latest.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from evals.runner import run_eval  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Run offline chat golden evals.")
    parser.add_argument(
        "--dataset",
        type=Path,
        default=REPO_ROOT / "evals" / "chat_golden.jsonl",
        help="Path to chat_golden.jsonl",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="Write JSON report (default: evals/reports/chat_eval_<timestamp>.json)",
    )
    parser.add_argument(
        "--mock-chat",
        action="store_true",
        help="Also POST each case to /api/chat-assistant with mocked Firestore/Gemini/Pinecone",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Not implemented — live evals cost API credits (see evals/README.md)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print per-case pass/fail lines",
    )
    args = parser.parse_args()

    if args.live:
        print(
            "error: --live is not implemented. Use routing/mock-chat only, or run manual smoke locally.",
            file=sys.stderr,
        )
        return 2

    report = run_eval(dataset_path=args.dataset, mock_chat=args.mock_chat)

    report_path = args.report
    if report_path is None:
        ts = report.generated_at.replace(":", "-").replace("+00:00", "Z")
        report_path = REPO_ROOT / "evals" / "reports" / f"chat_eval_{ts}.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report.to_dict(), indent=2) + "\n", encoding="utf-8")

    summary = report.summary
    print(
        f"chat eval ({report.mode}): {summary['passed']}/{summary['total']} passed "
        f"→ {report_path.relative_to(REPO_ROOT)}"
    )

    if args.verbose:
        for row in report.results:
            mark = "PASS" if row.status == "pass" else "FAIL"
            print(f"  [{mark}] {row.id}")
            for err in row.errors:
                print(f"         {err}")

    if summary["failed"]:
        for row in report.results:
            if row.status == "fail":
                print(f"FAIL {row.id}: {'; '.join(row.errors)}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
