"""Smoke test for scripts/run_chat_eval.py (#79)."""

from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RUNNER = REPO_ROOT / "scripts" / "run_chat_eval.py"
PYTHON = REPO_ROOT / ".venv" / "bin" / "python"


def _run_runner(*extra: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    py = str(PYTHON if PYTHON.is_file() else sys.executable)
    return subprocess.run(
        [py, str(RUNNER), *extra],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )


class RunChatEvalScriptTest(unittest.TestCase):
    def test_routing_exits_zero(self):
        result = _run_runner()
        self.assertEqual(result.returncode, 0, msg=result.stderr or result.stdout)
        self.assertIn("passed", result.stdout)

    def test_mock_chat_exits_zero(self):
        result = _run_runner("--mock-chat")
        self.assertEqual(result.returncode, 0, msg=result.stderr or result.stdout)
        self.assertIn("routing+mock_chat", result.stdout)

    def test_live_without_ragas_exits_nonzero(self):
        result = _run_runner("--live")
        self.assertEqual(result.returncode, 2)
        self.assertIn("--live requires --ragas", result.stderr)

    def test_ragas_missing_api_key_exits_nonzero(self):
        import os

        # Subprocess must not inherit .env keys: load_dotenv() only fills unset vars.
        env = os.environ.copy()
        env["RAGAS_API_KEY"] = ""
        env["GEMINI_API_KEY"] = ""
        env["GOOGLE_API_KEY"] = ""
        result = _run_runner("--ragas", env=env)
        if "requirements-dev.txt" in (result.stderr or ""):
            self.assertEqual(result.returncode, 2)
            return
        self.assertNotEqual(result.returncode, 0, msg=result.stderr or result.stdout)


if __name__ == "__main__":
    unittest.main()
