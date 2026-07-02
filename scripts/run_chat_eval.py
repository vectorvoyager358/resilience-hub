#!/usr/bin/env python3
"""Offline chat eval runner (#79) with optional RAGAS nightly scoring (#82).

Default: routing-only (no Gemini, no Pinecone, no network).
Optional --mock-chat: stubbed /api/chat-assistant meta checks.
Optional --ragas: faithfulness + answer relevancy on recorded subset (paid Gemini judge).
Optional --live with --ragas: refresh answers via live chat before scoring (more API cost).

Usage (from repo root):
  python scripts/run_chat_eval.py
  python scripts/run_chat_eval.py --mock-chat --report evals/reports/latest.json
  pip install -r requirements-dev.txt
  python scripts/run_chat_eval.py --ragas
  python scripts/run_chat_eval.py --live --ragas
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


def _load_dotenv() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv(REPO_ROOT / ".env")
    except ImportError:
        pass


def _print_ragas_report(report, report_path: Path, *, verbose: bool) -> int:
    summary = report.summary
    cost_note = ""
    if report.estimated_cost_usd is not None:
        cost_note = f", est. judge cost ${report.estimated_cost_usd:.4f}"
    print(
        f"ragas eval ({report.mode}): {summary['passed']}/{summary['total']} passed "
        f"(mean faithfulness={summary.get('meanFaithfulness')}, "
        f"mean answer relevancy={summary.get('meanAnswerRelevancy')}{cost_note}) "
        f"→ {report_path.relative_to(REPO_ROOT)}"
    )
    if verbose:
        for row in report.results:
            mark = "PASS" if row.status == "pass" else "FAIL"
            print(
                f"  [{mark}] {row.id} "
                f"f={row.faithfulness} ar={row.answer_relevancy}"
            )
            for err in row.errors:
                print(f"         {err}")

    if summary["failed"]:
        for row in report.results:
            if row.status == "fail":
                print(f"FAIL {row.id}: {'; '.join(row.errors)}", file=sys.stderr)
        return 1
    return 0


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
        "--ragas",
        action="store_true",
        help="Run RAGAS faithfulness + answer relevancy on evals/ragas_recorded.jsonl (paid Gemini)",
    )
    parser.add_argument(
        "--ragas-dataset",
        type=Path,
        default=REPO_ROOT / "evals" / "ragas_recorded.jsonl",
        help="Path to ragas_recorded.jsonl (used with --ragas)",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="With --ragas: call live /api/chat-assistant before scoring (Gemini; Pinecone if configured)",
    )
    parser.add_argument(
        "--judge-model",
        default="gemini-2.5-flash-lite",
        help="Gemini model for RAGAS judge (default: gemini-2.5-flash-lite)",
    )
    parser.add_argument(
        "--min-faithfulness",
        type=float,
        default=0.5,
        help="Fail cases below this faithfulness score (default: 0.5)",
    )
    parser.add_argument(
        "--min-answer-relevancy",
        type=float,
        default=0.5,
        help="Fail cases below this answer relevancy score (default: 0.5)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print per-case pass/fail lines",
    )
    args = parser.parse_args()

    if args.ragas or args.live:
        _load_dotenv()

    if args.live and not args.ragas:
        print("error: --live requires --ragas", file=sys.stderr)
        return 2

    exit_code = 0

    if not args.ragas:
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
            exit_code = 1

    if args.ragas:
        try:
            from evals.ragas_runner import run_ragas_eval
        except ImportError as e:
            print(
                "error: --ragas requires nightly dev deps. "
                "Run: pip install -r requirements-dev.txt",
                file=sys.stderr,
            )
            print(f"detail: {e}", file=sys.stderr)
            return 2

        ragas_report = run_ragas_eval(
            dataset_path=args.ragas_dataset,
            live=args.live,
            judge_model=args.judge_model,
            min_faithfulness=args.min_faithfulness,
            min_answer_relevancy=args.min_answer_relevancy,
        )
        ragas_path = args.report
        if ragas_path is None:
            ts = ragas_report.generated_at.replace(":", "-").replace("+00:00", "Z")
            ragas_path = REPO_ROOT / "evals" / "reports" / f"ragas_eval_{ts}.json"
        ragas_path.parent.mkdir(parents=True, exist_ok=True)
        ragas_path.write_text(json.dumps(ragas_report.to_dict(), indent=2) + "\n", encoding="utf-8")
        ragas_exit = _print_ragas_report(ragas_report, ragas_path, verbose=args.verbose)
        exit_code = max(exit_code, ragas_exit)

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
