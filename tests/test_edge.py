"""Tests for Edge policy checker."""

from __future__ import annotations

import json
import pytest
from pathlib import Path

from extension_validator.manifest import Manifest
from extension_validator.policies.edge import EdgePolicyChecker
from extension_validator.result import Severity

FIXTURES = Path(__file__).parent / "fixtures"


def make_manifest(tmp_path, data: dict) -> Manifest:
    (tmp_path / "manifest.json").write_text(json.dumps(data))
    return Manifest.from_directory(tmp_path)


class TestEdgeInheritsChrome:
    """Edge checker should include Chrome checks."""

    def setup_method(self):
        self.checker = EdgePolicyChecker()

    def test_mv3_passes_chrome_checks(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "valid_mv3"))
        mv_result = next(r for r in report.results if r.rule == "manifest-version")
        assert mv_result.passed

    def test_mv2_fails_chrome_checks(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "valid_mv2"))
        mv_result = next(r for r in report.results if r.rule == "manifest-version")
        assert not mv_result.passed


class TestEdgeSpecificChecks:
    def setup_method(self):
        self.checker = EdgePolicyChecker()

    def test_edge_mv3_recommendation_passes_for_mv3(self, tmp_path):
        m = make_manifest(tmp_path, {"manifest_version": 3, "name": "T", "version": "1"})
        report = self.checker.check(m)
        edge_mv = next(r for r in report.results if r.rule == "edge-manifest-version")
        assert edge_mv.passed

    def test_edge_mv3_recommendation_fails_for_mv2(self, tmp_path):
        m = make_manifest(tmp_path, {"manifest_version": 2, "name": "T", "version": "1"})
        report = self.checker.check(m)
        edge_mv = next(r for r in report.results if r.rule == "edge-manifest-version")
        assert not edge_mv.passed

    def test_edge_settings_present_passes(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "browser_specific_settings": {"edge": {"minimum_edge_version": "79.0"}},
        })
        report = self.checker.check(m)
        edge_bss = next(r for r in report.results if r.rule == "edge-browser-specific-settings")
        assert edge_bss.passed

    def test_no_edge_settings_is_info(self, tmp_path):
        m = make_manifest(tmp_path, {"manifest_version": 3, "name": "T", "version": "1"})
        report = self.checker.check(m)
        edge_bss = next(r for r in report.results if r.rule == "edge-browser-specific-settings")
        assert edge_bss.severity == Severity.INFO

    def test_browser_name_is_edge(self):
        assert self.checker.browser_name == "Edge"


class TestEdgeOverall:
    def setup_method(self):
        self.checker = EdgePolicyChecker()

    def test_valid_mv3_passes(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "valid_mv3"))
        assert report.passed

    def test_mv2_fails_overall(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "valid_mv2"))
        assert not report.passed
