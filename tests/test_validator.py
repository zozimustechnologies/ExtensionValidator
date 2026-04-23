"""Tests for the ExtensionValidator class and CLI."""

from __future__ import annotations

import json
import pytest
from pathlib import Path
from unittest.mock import patch

from extension_validator.validator import ExtensionValidator
from extension_validator.cli import main
from extension_validator.result import Severity

FIXTURES = Path(__file__).parent / "fixtures"


class TestExtensionValidator:
    def test_validate_returns_four_reports(self):
        validator = ExtensionValidator(FIXTURES / "valid_mv3")
        reports = validator.validate()
        assert len(reports) == 4

    def test_validate_browser_names(self):
        validator = ExtensionValidator(FIXTURES / "valid_mv3")
        reports = validator.validate()
        names = {r.browser for r in reports}
        assert names == {"Chrome", "Edge", "Firefox", "Safari"}

    def test_validate_filtered_by_browser(self):
        validator = ExtensionValidator(FIXTURES / "valid_mv3")
        reports = validator.validate(browsers=["Chrome", "Firefox"])
        assert len(reports) == 2
        names = {r.browser for r in reports}
        assert names == {"Chrome", "Firefox"}

    def test_validate_case_insensitive_browser(self):
        validator = ExtensionValidator(FIXTURES / "valid_mv3")
        reports = validator.validate(browsers=["chrome"])
        assert len(reports) == 1
        assert reports[0].browser == "Chrome"

    def test_manifest_property_loads_once(self):
        validator = ExtensionValidator(FIXTURES / "valid_mv3")
        m1 = validator.manifest
        m2 = validator.manifest
        assert m1 is m2  # Same object, not reloaded


class TestCLIMain:
    def test_valid_mv3_exits_0(self):
        code = main([str(FIXTURES / "valid_mv3")])
        assert code == 0

    def test_mv2_exits_1(self):
        code = main([str(FIXTURES / "valid_mv2")])
        assert code == 1

    def test_missing_path_exits_2(self, tmp_path):
        code = main([str(tmp_path / "nonexistent")])
        assert code == 2

    def test_filter_single_browser(self):
        code = main([str(FIXTURES / "valid_mv3"), "--browsers", "Chrome"])
        assert code == 0

    def test_filter_multiple_browsers(self):
        code = main([str(FIXTURES / "valid_mv3"), "--browsers", "Chrome", "Firefox"])
        assert code == 0

    def test_no_pass_flag(self, capsys):
        # With --no-pass, passing checks should be absent; without it they should appear
        main([str(FIXTURES / "valid_mv3")])
        with_pass = capsys.readouterr().out

        main([str(FIXTURES / "valid_mv3"), "--no-pass"])
        without_pass = capsys.readouterr().out

        # The output without --no-pass should be longer (contains passing check lines)
        assert len(with_pass) > len(without_pass)
        # Passing check marker should be absent when --no-pass is used
        assert "[✓]" not in without_pass

    def test_errors_only_flag(self, capsys):
        main([str(FIXTURES / "valid_mv2"), "--errors-only"])
        captured = capsys.readouterr()
        assert captured.out  # Should have output

    def test_invalid_json_exits_2(self, tmp_path):
        (tmp_path / "manifest.json").write_text("{bad json")
        code = main([str(tmp_path)])
        assert code == 2
