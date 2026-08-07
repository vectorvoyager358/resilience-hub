"""Tests for /api/weather (Open-Meteo) with HTTP fully mocked."""

from __future__ import annotations

import unittest
from unittest.mock import patch
from urllib.parse import urlparse

from tests.backend.test_chat import _load_app


class WeatherRouteTest(unittest.TestCase):
    def setUp(self):
        self.app = _load_app().app
        self.client = self.app.test_client()

    @patch("server.routes.weather._http_get_json")
    @patch("server.auth_util.verify_bearer_uid")
    def test_weather_success(self, mock_verify, mock_http):
        mock_verify.return_value = "uid1"

        def fake_get(url: str, **_kwargs):
            host = urlparse(url).hostname
            if host == "api.open-meteo.com":
                return {
                    "timezone": "Europe/Berlin",
                    "current": {
                        "time": "2026-05-12T14:00",
                        "temperature_2m": 12.4,
                        "weather_code": 3,
                        "is_day": 1,
                    },
                }
            raise AssertionError(f"unexpected url {url!r}")

        mock_http.side_effect = fake_get

        r = self.client.get(
            "/api/weather?lat=52.52&lon=13.41",
            headers={"Authorization": "Bearer fake"},
        )
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertEqual(data["temperatureC"], 12.4)
        self.assertEqual(data["weatherCode"], 3)
        self.assertEqual(data["observationTimeLocal"], "14:00")
        self.assertTrue(data["isDay"])
        self.assertEqual(data["emojis"], "\U0001f31e\u2601\ufe0f")
        self.assertNotIn("city", data)
        self.assertNotIn("summary", data)
        self.assertNotIn("emoji", data)
        self.assertNotIn("timezone", data)

    @patch("server.routes.weather._http_get_json")
    @patch("server.auth_util.verify_bearer_uid")
    def test_weather_night_is_day_zero(self, mock_verify, mock_http):
        mock_verify.return_value = "uid1"

        def fake_get(url: str, **_kwargs):
            host = urlparse(url).hostname
            if host == "api.open-meteo.com":
                return {
                    "timezone": "America/Los_Angeles",
                    "current": {
                        "time": "2026-05-12T09:30",
                        "temperature_2m": 20.0,
                        "weather_code": 0,
                        "is_day": 0,
                    },
                }
            raise AssertionError(f"unexpected url {url!r}")

        mock_http.side_effect = fake_get

        r = self.client.get(
            "/api/weather?lat=34.05&lon=-118.24",
            headers={"Authorization": "Bearer fake"},
        )
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertEqual(data["weatherCode"], 0)
        self.assertFalse(data["isDay"])
        self.assertEqual(data["emojis"], "\U0001f319\u2728")
        self.assertNotIn("city", data)

    @patch("server.routes.weather._http_get_json")
    @patch("server.auth_util.verify_bearer_uid")
    def test_weather_is_day_defaults_true_when_missing(self, mock_verify, mock_http):
        mock_verify.return_value = "uid1"

        def fake_get(url: str, **_kwargs):
            host = urlparse(url).hostname
            if host == "api.open-meteo.com":
                self.assertIn("is_day", url)
                return {
                    "timezone": "UTC",
                    "current": {
                        "time": "2026-05-12T12:00",
                        "temperature_2m": 10.0,
                        "weather_code": 0,
                    },
                }
            raise AssertionError(f"unexpected url {url!r}")

        mock_http.side_effect = fake_get

        r = self.client.get(
            "/api/weather?lat=1.0&lon=1.0",
            headers={"Authorization": "Bearer fake"},
        )
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertTrue(data["isDay"])
        self.assertEqual(data["emojis"], "\U0001f31e")

    @patch("server.routes.weather._http_get_json")
    @patch("server.auth_util.verify_bearer_uid")
    def test_weather_emojis_infer_night_when_is_day_missing_evening_clock(
        self, mock_verify, mock_http
    ):
        mock_verify.return_value = "uid1"

        def fake_get(url: str, **_kwargs):
            host = urlparse(url).hostname
            if host == "api.open-meteo.com":
                return {
                    "timezone": "UTC",
                    "current": {
                        "time": "2026-05-12T23:15",
                        "temperature_2m": 18.0,
                        "weather_code": 0,
                    },
                }
            raise AssertionError(f"unexpected url {url!r}")

        mock_http.side_effect = fake_get

        r = self.client.get(
            "/api/weather?lat=1.0&lon=1.0",
            headers={"Authorization": "Bearer fake"},
        )
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertFalse(data["isDay"])
        self.assertEqual(data["emojis"], "\U0001f319\u2728")

    def test_weather_unauthorized(self):
        r = self.client.get("/api/weather?lat=0&lon=0")
        self.assertEqual(r.status_code, 401)

    @patch("server.auth_util.verify_bearer_uid")
    def test_weather_invalid_lat(self, mock_verify):
        mock_verify.return_value = "uid1"
        r = self.client.get(
            "/api/weather?lat=not-a-number&lon=0",
            headers={"Authorization": "Bearer fake"},
        )
        self.assertEqual(r.status_code, 400)
