"""Tests for Safari policy checker."""

from __future__ import annotations

import json
import pytest
from pathlib import Path

from extension_validator.manifest import Manifest
from extension_validator.policies.safari import SafariPolicyChecker
from extension_validator.result import Severity

FIXTURES = Path(__file__).parent / "fixtures"


def make_manifest(tmp_path, data: dict) -> Manifest:
    (tmp_path / "manifest.json").write_text(json.dumps(data))
    return Manifest.from_directory(tmp_path)


class TestSafariManifestVersion:
    def setup_method(self):
        self.checker = SafariPolicyChecker()

    def test_mv3_passes(self, tmp_path):
        m = make_manifest(tmp_path, {"manifest_version": 3, "name": "T", "version": "1"})
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "manifest-version")
        assert result.passed

    def test_mv2_warns(self, tmp_path):
        m = make_manifest(tmp_path, {"manifest_version": 2, "name": "T", "version": "1"})
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "manifest-version")
        assert not result.passed
        assert result.severity == Severity.WARNING


class TestSafariBackground:
    def setup_method(self):
        self.checker = SafariPolicyChecker()

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

    def test_page_in_mv3_fails(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "background": {"page": "bg.html"},
        })
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "background")
        assert not result.passed

    def test_persistent_background_mv2_warns(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 2,
            "name": "T",
            "version": "1",
            "background": {"scripts": ["bg.js"], "persistent": True},
        })
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "background")
        assert not result.passed
        assert result.severity == Severity.WARNING


class TestSafariPermissions:
    def setup_method(self):
        self.checker = SafariPolicyChecker()

    def test_unsupported_permission_fails(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "unsupported_perms"))
        web_req_result = next(
            (r for r in report.results if r.rule == "permission-webRequest"), None
        )
        assert web_req_result is not None
        assert not web_req_result.passed
        assert web_req_result.severity == Severity.ERROR

    def test_sensitive_permission_warns(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "permissions": ["tabs"],
        })
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "permission-tabs")
        assert not result.passed
        assert result.severity == Severity.WARNING

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


class TestSafariWebAccessibleResources:
    def setup_method(self):
        self.checker = SafariPolicyChecker()

    def test_mv3_string_entries_fail(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "web_accessible_resources": ["images/logo.png"],
        })
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "web-accessible-resources")
        assert not result.passed

    def test_mv3_object_entries_pass(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "web_accessible_resources": [{"resources": ["img/*"], "matches": ["<all_urls>"]}],
        })
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "web-accessible-resources")
        assert result.passed


class TestSafariDistributionInfo:
    def setup_method(self):
        self.checker = SafariPolicyChecker()

    def test_safari_distribution_info_present(self, tmp_path):
        m = make_manifest(tmp_path, {"manifest_version": 3, "name": "T", "version": "1"})
        report = self.checker.check(m)
        result = next(r for r in report.results if r.rule == "safari-distribution")
        assert result is not None
        assert result.severity == Severity.INFO


class TestSafariOverall:
    def setup_method(self):
        self.checker = SafariPolicyChecker()

    def test_valid_mv3_passes(self):
        # valid_mv3 has no unsupported perms, service_worker background
        report = self.checker.check(Manifest.from_directory(FIXTURES / "valid_mv3"))
        assert report.passed

    def test_unsupported_perms_fails(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "unsupported_perms"))
        assert not report.passed
