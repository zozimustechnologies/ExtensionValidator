"""Chrome policy checker.

Policy references:
  https://developer.chrome.com/docs/extensions/mv3/
  https://developer.chrome.com/docs/extensions/mv3/manifest/
"""

from __future__ import annotations

from ..manifest import Manifest
from ..result import BrowserReport, Severity
from .base import BasePolicyChecker

# Permissions that are considered high-risk and flagged as warnings
_SENSITIVE_PERMISSIONS = {
    "tabs",
    "webRequest",
    "webRequestBlocking",
    "cookies",
    "history",
    "bookmarks",
    "downloads",
    "management",
    "nativeMessaging",
    "debugger",
    "proxy",
    "privacy",
    "pageCapture",
    "clipboardRead",
    "clipboardWrite",
    "geolocation",
}

# Chrome-supported permissions (MV3) – non-exhaustive but covers common ones
_SUPPORTED_PERMISSIONS_MV3 = {
    "activeTab",
    "alarms",
    "audio",
    "background",
    "bookmarks",
    "browsingData",
    "certificateProvider",
    "clipboardRead",
    "clipboardWrite",
    "contentSettings",
    "contextMenus",
    "cookies",
    "debugger",
    "declarativeContent",
    "declarativeNetRequest",
    "declarativeNetRequestWithHostAccess",
    "declarativeNetRequestFeedback",
    "desktopCapture",
    "documentScan",
    "downloads",
    "downloads.open",
    "downloads.ui",
    "enterprise.deviceAttributes",
    "enterprise.hardwarePlatform",
    "enterprise.networkingAttributes",
    "enterprise.platformKeys",
    "favicon",
    "fileBrowserHandler",
    "fileSystemProvider",
    "fontSettings",
    "gcm",
    "geolocation",
    "history",
    "identity",
    "idle",
    "loginState",
    "management",
    "nativeMessaging",
    "notifications",
    "offscreen",
    "pageCapture",
    "platformKeys",
    "power",
    "printerProvider",
    "printing",
    "printingMetrics",
    "privacy",
    "processes",
    "proxy",
    "scripting",
    "search",
    "sessions",
    "sidePanel",
    "storage",
    "system.cpu",
    "system.display",
    "system.memory",
    "system.storage",
    "tabCapture",
    "tabGroups",
    "tabs",
    "topSites",
    "tts",
    "ttsEngine",
    "unlimitedStorage",
    "vpnProvider",
    "wallpaper",
    "webAuthenticationProxy",
    "webNavigation",
    "webRequest",
}


class ChromePolicyChecker(BasePolicyChecker):
    """Validates an extension manifest against Chrome Web Store policies."""

    @property
    def browser_name(self) -> str:
        return "Chrome"

    def check(self, manifest: Manifest) -> BrowserReport:
        report = BrowserReport(browser=self.browser_name)
        results = report.results

        results.extend(self._check_name_and_version(manifest))
        results.append(self._check_manifest_version(manifest))
        results.append(self._check_background(manifest))
        results.append(self._check_action(manifest))
        results.append(self._check_host_permissions(manifest))
        results.append(self._check_no_remote_code(manifest))
        results.append(self._check_web_accessible_resources(manifest))
        results.extend(self._check_permissions(manifest))
        results.append(self._check_icons_declared(manifest))

        return report

    def _check_manifest_version(self, manifest: Manifest):
        rule = "manifest-version"
        mv = manifest.manifest_version
        if mv == 3:
            return self._pass(rule, "Manifest V3 is used (required by Chrome).")
        if mv == 2:
            return self._fail(
                rule,
                "Manifest V2 is deprecated and disabled in Chrome. Migrate to Manifest V3.",
            )
        return self._fail(rule, f"Unknown or missing manifest_version: {mv!r}.")

    def _check_background(self, manifest: Manifest):
        rule = "background-service-worker"
        mv = manifest.manifest_version
        bg = manifest.background
        if mv == 3:
            if bg.get("service_worker"):
                return self._pass(rule, "Background service worker declared (MV3 compliant).")
            if bg.get("scripts") or bg.get("page"):
                return self._fail(
                    rule,
                    "MV3 requires a background 'service_worker', not 'scripts' or 'page'.",
                )
            # No background at all is acceptable
            return self._pass(rule, "No background script declared (allowed in MV3).")
        # MV2
        return self._pass(rule, "Background check skipped for MV2 (see manifest-version).", Severity.INFO)

    def _check_action(self, manifest: Manifest):
        rule = "action-key"
        if manifest.manifest_version == 3:
            if manifest.browser_action or manifest.page_action:
                return self._fail(
                    rule,
                    "MV3 uses 'action' instead of 'browser_action' or 'page_action'.",
                )
            return self._pass(rule, "'action' key used correctly for MV3 (or omitted).")
        return self._pass(rule, "Action key check skipped for MV2.", Severity.INFO)

    def _check_host_permissions(self, manifest: Manifest):
        rule = "host-permissions-key"
        if manifest.manifest_version == 3:
            # In MV3, host patterns must be in host_permissions, not permissions
            host_patterns_in_permissions = [
                p for p in manifest.permissions
                if p.startswith("http") or p.startswith("*") or p.startswith("<all_urls>")
            ]
            if host_patterns_in_permissions:
                return self._fail(
                    rule,
                    f"Host patterns must be in 'host_permissions' (MV3), not 'permissions': "
                    f"{host_patterns_in_permissions}.",
                )
            return self._pass(rule, "Host permissions are declared in the correct 'host_permissions' field.")
        return self._pass(rule, "Host permissions check skipped for MV2.", Severity.INFO)

    def _check_web_accessible_resources(self, manifest: Manifest):
        rule = "web-accessible-resources"
        war = manifest.web_accessible_resources
        if not war:
            return self._pass(rule, "No web_accessible_resources declared (or none needed).")
        if manifest.manifest_version == 3:
            # MV3 requires objects with 'resources', 'matches' (or 'extension_ids')
            invalid = [
                entry for entry in war
                if isinstance(entry, str)  # MV2 style: list of strings
            ]
            if invalid:
                return self._fail(
                    rule,
                    "MV3 requires 'web_accessible_resources' entries to be objects "
                    "with 'resources' and 'matches' fields, not plain strings.",
                )
        return self._pass(rule, "web_accessible_resources format is valid.")

    def _check_permissions(self, manifest: Manifest):
        results = []
        all_perms = manifest.permissions + manifest.optional_permissions
        for perm in all_perms:
            # Skip host patterns
            if perm.startswith("http") or perm.startswith("*") or perm == "<all_urls>":
                continue
            rule = f"permission-{perm}"
            if perm not in _SUPPORTED_PERMISSIONS_MV3:
                results.append(
                    self._fail(
                        rule,
                        f"Permission '{perm}' is not recognised by Chrome.",
                        Severity.WARNING,
                    )
                )
            elif perm in _SENSITIVE_PERMISSIONS:
                results.append(
                    self._fail(
                        rule,
                        f"Permission '{perm}' is sensitive and may require justification during review.",
                        Severity.WARNING,
                    )
                )
            else:
                results.append(self._pass(rule, f"Permission '{perm}' is valid."))
        return results
