"""Firefox policy checker.

Policy references:
  https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/
  https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json
"""

from __future__ import annotations

from ..manifest import Manifest
from ..result import BrowserReport, Severity
from .base import BasePolicyChecker

# Permissions NOT supported in Firefox (Chrome-only)
_UNSUPPORTED_PERMISSIONS = {
    "certificateProvider",
    "documentScan",
    "enterprise.deviceAttributes",
    "enterprise.hardwarePlatform",
    "enterprise.networkingAttributes",
    "enterprise.platformKeys",
    "fileBrowserHandler",
    "fileSystemProvider",
    "loginState",
    "platformKeys",
    "printing",
    "printingMetrics",
    "wallpaper",
    "webAuthenticationProxy",
}

# Sensitive permissions that Firefox review flags
_SENSITIVE_PERMISSIONS = {
    "tabs",
    "webRequest",
    "nativeMessaging",
    "cookies",
    "history",
    "bookmarks",
    "management",
    "debugger",
    "proxy",
    "pageCapture",
    "clipboardRead",
    "clipboardWrite",
}


class FirefoxPolicyChecker(BasePolicyChecker):
    """Validates an extension manifest against Firefox Add-ons (AMO) policies."""

    @property
    def browser_name(self) -> str:
        return "Firefox"

    def check(self, manifest: Manifest) -> BrowserReport:
        report = BrowserReport(browser=self.browser_name)
        results = report.results

        results.extend(self._check_name_and_version(manifest))
        results.append(self._check_manifest_version(manifest))
        results.append(self._check_gecko_id(manifest))
        results.append(self._check_strict_min_version(manifest))
        results.append(self._check_background(manifest))
        results.append(self._check_no_remote_code(manifest))
        results.extend(self._check_permissions(manifest))
        results.append(self._check_icons_declared(manifest))

        return report

    def _check_manifest_version(self, manifest: Manifest):
        rule = "manifest-version"
        mv = manifest.manifest_version
        if mv == 3:
            return self._pass(
                rule,
                "Manifest V3 detected. Firefox supports MV3 (Firefox 109+).",
            )
        if mv == 2:
            return self._fail(
                rule,
                "Manifest V2 is currently supported by Firefox but migration to MV3 is recommended.",
                Severity.WARNING,
            )
        return self._fail(rule, f"Unknown or missing manifest_version: {mv!r}.")

    def _check_gecko_id(self, manifest: Manifest):
        """Firefox requires a Gecko extension ID for AMO (Add-ons Mozilla Org) submission."""
        rule = "gecko-id"
        bss = manifest.browser_specific_settings
        gecko = bss.get("gecko", {})
        ext_id = gecko.get("id", "")
        if ext_id:
            return self._pass(
                rule,
                f"Gecko extension ID is declared: '{ext_id}'.",
            )
        return self._fail(
            rule,
            "Missing 'browser_specific_settings.gecko.id'. "
            "A Gecko ID is required for Firefox AMO submission and ensures consistent storage keys.",
            Severity.WARNING,
        )

    def _check_strict_min_version(self, manifest: Manifest):
        """Check that a minimum Firefox version is declared (recommended)."""
        rule = "gecko-strict-min-version"
        bss = manifest.browser_specific_settings
        gecko = bss.get("gecko", {})
        smv = gecko.get("strict_min_version", "")
        if smv:
            return self._pass(
                rule,
                f"'strict_min_version' is set to '{smv}'.",
                Severity.INFO,
            )
        return self._fail(
            rule,
            "No 'browser_specific_settings.gecko.strict_min_version' set. "
            "Declaring a minimum Firefox version avoids compatibility issues.",
            Severity.INFO,
        )

    def _check_background(self, manifest: Manifest):
        """Firefox MV3 background must be a service_worker or scripts."""
        rule = "background"
        mv = manifest.manifest_version
        bg = manifest.background
        if mv == 3:
            if bg.get("service_worker"):
                return self._pass(rule, "Background service worker declared (MV3 compliant).")
            if bg.get("page"):
                return self._fail(
                    rule,
                    "MV3 does not support 'background.page'. Use 'background.service_worker'.",
                )
            if bg.get("scripts"):
                return self._fail(
                    rule,
                    "MV3 does not support 'background.scripts'. Use 'background.service_worker'.",
                )
            return self._pass(rule, "No background declared (allowed in MV3).")
        # MV2 checks
        if bg.get("page") or bg.get("scripts"):
            return self._pass(rule, "Background script/page declared (MV2 style).")
        return self._pass(rule, "No background declared.", Severity.INFO)

    def _check_permissions(self, manifest: Manifest):
        results = []
        all_perms = manifest.permissions + manifest.optional_permissions
        for perm in all_perms:
            if perm.startswith("http") or perm.startswith("*") or perm == "<all_urls>":
                continue
            rule = f"permission-{perm}"
            if perm in _UNSUPPORTED_PERMISSIONS:
                results.append(
                    self._fail(
                        rule,
                        f"Permission '{perm}' is not supported by Firefox.",
                        Severity.ERROR,
                    )
                )
            elif perm in _SENSITIVE_PERMISSIONS:
                results.append(
                    self._fail(
                        rule,
                        f"Permission '{perm}' requires justification in Firefox AMO review.",
                        Severity.WARNING,
                    )
                )
            else:
                results.append(self._pass(rule, f"Permission '{perm}' is valid in Firefox."))
        return results
