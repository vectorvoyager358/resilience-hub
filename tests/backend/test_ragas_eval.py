"""Tests for RAGAS nightly eval (#82)."""

from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from evals.ragas_dataset import load_ragas_rows
from evals.ragas_runner import (
    RagasCaseResult,
    _rows_to_ragas_dataset,
    build_ragas_report,
    score_ragas_rows,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
RAGAS_DATASET = REPO_ROOT / "evals" / "ragas_recorded.jsonl"


class RagasDatasetTest(unittest.TestCase):
    def test_recorded_subset_has_six_cases(self):
        rows = load_ragas_rows(RAGAS_DATASET)
        self.assertEqual(len(rows), 6)

    def test_each_row_has_contexts_and_response(self):
        rows = load_ragas_rows(RAGAS_DATASET)
        for row in rows:
            with self.subTest(row_id=row["id"]):
                self.assertTrue(row["retrieved_contexts"])
                self.assertTrue(row["response"].strip())
                self.assertTrue(row["golden_id"].startswith("rag-"))


class RagasRunnerTest(unittest.TestCase):
    def test_rows_to_ragas_dataset_avoids_hf_from_dict(self):
        rows = load_ragas_rows(RAGAS_DATASET)[:1]
        dataset = _rows_to_ragas_dataset(rows)
        self.assertEqual(len(dataset), 1)
        self.assertEqual(dataset[0].user_input, rows[0]["user_input"])

    def test_score_ragas_rows_uses_sync_scoring(self):
        rows = load_ragas_rows(RAGAS_DATASET)[:1]

        with patch("evals.ragas_runner._build_ragas_models") as mock_models:
            mock_models.return_value = (MagicMock(), MagicMock())
            with patch(
                "evals.ragas_runner._score_ragas_sample",
                return_value=(0.9, 0.85),
            ) as mock_score:
                results, cost = score_ragas_rows(
                    rows, min_faithfulness=0.5, min_answer_relevancy=0.5
                )

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].status, "pass")
        self.assertEqual(results[0].faithfulness, 0.9)
        self.assertIsNone(cost)
        mock_score.assert_called_once()

    def test_build_report_flags_low_scores(self):
        results = [
            RagasCaseResult(
                id="ragas-001",
                golden_id="rag-001",
                faithfulness=0.3,
                answer_relevancy=0.9,
                status="fail",
                errors=["faithfulness: 0.300 < 0.5"],
            )
        ]
        report = build_ragas_report(
            mode="ragas",
            dataset_path=RAGAS_DATASET,
            results=results,
            judge_model="gemini-2.5-flash-lite",
            min_faithfulness=0.5,
            min_answer_relevancy=0.5,
            estimated_cost_usd=0.12,
        )
        self.assertEqual(report.summary["failed"], 1)
        self.assertEqual(report.estimated_cost_usd, 0.12)


if __name__ == "__main__":
    unittest.main()
