"""Tests for Firefox policy checker."""

from __future__ import annotations

import json
import pytest
from pathlib import Path

from extension_validator.manifest import Manifest
from extension_validator.policies.firefox import FirefoxPolicyChecker
from extension_validator.result import Severity

FIXTURES = Path(__file__).parent / "fixtures"


def make_manifest(tmp_path, data: dict) -> Manifest:
    (tmp_path / "manifest.json").write_text(json.dumps(data))
    return Manifest.from_directory(tmp_path)


class TestFirefoxManifestVersion:
    def setup_method(self):
        self.checker = FirefoxPolicyChecker()

    def test_mv3_passes(self, tmp_path):
        m = make_manifest(tmp_path, {"manifest_version": 3, "name": "T", "version": "1"})
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "manifest-version")
        assert result.passed

    def test_mv2_is_warning(self, tmp_path):
        m = make_manifest(tmp_path, {"manifest_version": 2, "name": "T", "version": "1"})
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "manifest-version")
        assert not result.passed
        assert result.severity == Severity.WARNING


class TestFirefoxGeckoId:
    def setup_method(self):
        self.checker = FirefoxPolicyChecker()

    def test_gecko_id_present_passes(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "valid_mv3"))
        result = next(r for r in report.results if r.rule == "gecko-id")
        assert result.passed

    def test_gecko_id_missing_warns(self, tmp_path):
        m = make_manifest(tmp_path, {"manifest_version": 3, "name": "T", "version": "1"})
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "gecko-id")
        assert not result.passed
        assert result.severity == Severity.WARNING

    def test_gecko_strict_min_version_present_passes(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "valid_mv3"))
        result = next(r for r in report.results if r.rule == "gecko-strict-min-version")
        assert result.passed

    def test_gecko_strict_min_version_missing_is_info(self, tmp_path):
        m = make_manifest(tmp_path, {"manifest_version": 3, "name": "T", "version": "1"})
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "gecko-strict-min-version")
        assert not result.passed
        assert result.severity == Severity.INFO


class TestFirefoxBackground:
    def setup_method(self):
        self.checker = FirefoxPolicyChecker()

    def test_service_worker_mv3_passes(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "background": {"service_worker": "sw.js"},
        })
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "background")
        assert result.passed

    def test_scripts_mv3_fails(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "background": {"scripts": ["bg.js"]},
        })
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "background")
        assert not result.passed

    def test_page_mv3_fails(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "background": {"page": "bg.html"},
        })
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "background")
        assert not result.passed


class TestFirefoxPermissions:
    def setup_method(self):
        self.checker = FirefoxPolicyChecker()

    def test_unsupported_permission_fails(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "unsupported_perms"))
        cert_result = next(
            (r for r in report.results if r.rule == "permission-certificateProvider"), None
        )
        assert cert_result is not None
        assert not cert_result.passed
        assert cert_result.severity == Severity.ERROR

    def test_sensitive_permission_warns(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "permissions": ["tabs"],
        })
        report = self.checker.check(m)
        tabs_result = next(r for r in report.results if r.rule == "permission-tabs")
        assert not tabs_result.passed
        assert tabs_result.severity == Severity.WARNING

    def test_valid_permission_passes(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "permissions": ["storage"],
        })
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "permission-storage")
        assert result.passed


class TestFirefoxOverall:
    def setup_method(self):
        self.checker = FirefoxPolicyChecker()

    def test_valid_mv3_passes(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "valid_mv3"))
        # valid_mv3 has gecko id and gecko strict_min_version – should pass
        assert report.passed

    def test_unsupported_perms_fails(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "unsupported_perms"))
        assert not report.passed
