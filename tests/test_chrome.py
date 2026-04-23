"""Tests for Chrome policy checker."""

from __future__ import annotations

import json
import pytest
from pathlib import Path

from extension_validator.manifest import Manifest
from extension_validator.policies.chrome import ChromePolicyChecker
from extension_validator.result import Severity

FIXTURES = Path(__file__).parent / "fixtures"


def make_manifest(tmp_path, data: dict) -> Manifest:
    (tmp_path / "manifest.json").write_text(json.dumps(data))
    return Manifest.from_directory(tmp_path)


class TestChromeManifestVersion:
    def setup_method(self):
        self.checker = ChromePolicyChecker()

    def test_mv3_passes(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "valid_mv3"))
        mv_result = next(r for r in report.results if r.rule == "manifest-version")
        assert mv_result.passed

    def test_mv2_fails(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "valid_mv2"))
        mv_result = next(r for r in report.results if r.rule == "manifest-version")
        assert not mv_result.passed
        assert mv_result.severity == Severity.ERROR

    def test_missing_version_fails(self, tmp_path):
        m = make_manifest(tmp_path, {"name": "Test", "version": "1.0"})
        report = self.checker.check(m)
        mv_result = next(r for r in report.results if r.rule == "manifest-version")
        assert not mv_result.passed


class TestChromeBackground:
    def setup_method(self):
        self.checker = ChromePolicyChecker()

    def test_service_worker_passes(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "background": {"service_worker": "sw.js"},
        })
        report = self.checker.check(m)
        bg_result = next(r for r in report.results if r.rule == "background-service-worker")
        assert bg_result.passed

    def test_scripts_in_mv3_fails(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "background": {"scripts": ["bg.js"]},
        })
        report = self.checker.check(m)
        bg_result = next(r for r in report.results if r.rule == "background-service-worker")
        assert not bg_result.passed

    def test_page_in_mv3_fails(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "background": {"page": "bg.html"},
        })
        report = self.checker.check(m)
        bg_result = next(r for r in report.results if r.rule == "background-service-worker")
        assert not bg_result.passed


class TestChromeAction:
    def setup_method(self):
        self.checker = ChromePolicyChecker()

    def test_browser_action_in_mv3_fails(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "browser_action": {"default_popup": "popup.html"},
        })
        report = self.checker.check(m)
        action_result = next(r for r in report.results if r.rule == "action-key")
        assert not action_result.passed

    def test_action_in_mv3_passes(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "action": {"default_popup": "popup.html"},
        })
        report = self.checker.check(m)
        action_result = next(r for r in report.results if r.rule == "action-key")
        assert action_result.passed


class TestChromeHostPermissions:
    def setup_method(self):
        self.checker = ChromePolicyChecker()

    def test_host_in_permissions_mv3_fails(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "permissions": ["https://example.com/*"],
        })
        report = self.checker.check(m)
        hp_result = next(r for r in report.results if r.rule == "host-permissions-key")
        assert not hp_result.passed

    def test_host_in_host_permissions_mv3_passes(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "permissions": ["storage"],
            "host_permissions": ["https://example.com/*"],
        })
        report = self.checker.check(m)
        hp_result = next(r for r in report.results if r.rule == "host-permissions-key")
        assert hp_result.passed


class TestChromeCSP:
    def setup_method(self):
        self.checker = ChromePolicyChecker()

    def test_unsafe_eval_fails(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "unsafe_csp"))
        csp_result = next(r for r in report.results if r.rule == "no-remote-code")
        assert not csp_result.passed

    def test_safe_csp_passes(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "valid_mv3"))
        csp_result = next(r for r in report.results if r.rule == "no-remote-code")
        assert csp_result.passed

    def test_remote_script_src_fails(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "content_security_policy": {
                "extension_pages": "script-src https://cdn.example.com; object-src 'self'"
            },
        })
        report = self.checker.check(m)
        csp_result = next(r for r in report.results if r.rule == "no-remote-code")
        assert not csp_result.passed


class TestChromeWebAccessibleResources:
    def setup_method(self):
        self.checker = ChromePolicyChecker()

    def test_mv3_string_entries_fail(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "web_accessible_resources": ["images/logo.png"],
        })
        report = self.checker.check(m)
        war_result = next(r for r in report.results if r.rule == "web-accessible-resources")
        assert not war_result.passed

    def test_mv3_object_entries_pass(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "web_accessible_resources": [{"resources": ["images/*"], "matches": ["<all_urls>"]}],
        })
        report = self.checker.check(m)
        war_result = next(r for r in report.results if r.rule == "web-accessible-resources")
        assert war_result.passed


class TestChromePermissions:
    def setup_method(self):
        self.checker = ChromePolicyChecker()

    def test_unsupported_permission_fails(self, tmp_path):
        # Use a permission that Chrome does not recognise
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "permissions": ["unknownPermissionXYZ"],
        })
        report = self.checker.check(m)
        result = next(
            (r for r in report.results if r.rule == "permission-unknownPermissionXYZ"), None
        )
        assert result is not None
        assert not result.passed

    def test_valid_permission_passes(self, tmp_path):
        m = make_manifest(tmp_path, {
            "manifest_version": 3,
            "name": "T",
            "version": "1",
            "permissions": ["storage"],
        })
        report = self.checker.check(m)
        storage_result = next(r for r in report.results if r.rule == "permission-storage")
        assert storage_result.passed


class TestChromeOverall:
    def setup_method(self):
        self.checker = ChromePolicyChecker()

    def test_valid_mv3_passes_overall(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "valid_mv3"))
        assert report.passed

    def test_mv2_fails_overall(self):
        report = self.checker.check(Manifest.from_directory(FIXTURES / "valid_mv2"))
        assert not report.passed
