"""Safari policy checker.

Policy references:
  https://developer.apple.com/documentation/safariservices/safari_web_extensions
  https://developer.apple.com/documentation/safariservices/safari_web_extensions/converting_a_web_extension_for_safari
  https://developer.apple.com/documentation/safariservices/safari_web_extensions/assessing_your_safari_web_extension_s_browser_compatibility
"""

from __future__ import annotations

from ..manifest import Manifest
from ..result import BrowserReport, Severity
from .base import BasePolicyChecker

# Permissions with limited or no Safari support
_UNSUPPORTED_PERMISSIONS = {
    "webRequest",                   # Replaced by declarativeNetRequest in Safari MV3
    "webRequestBlocking",           # Not supported in Safari MV3
    "browsingData",                 # Not supported
    "certificateProvider",
    "debugger",
    "desktopCapture",
    "documentScan",
    "enterprise.deviceAttributes",
    "enterprise.hardwarePlatform",
    "enterprise.networkingAttributes",
    "enterprise.platformKeys",
    "fileBrowserHandler",
    "fileSystemProvider",
    "gcm",
    "loginState",
    "pageCapture",
    "platformKeys",
    "printing",
    "printingMetrics",
    "proxy",
    "processes",
    "tabCapture",
    "vpnProvider",
    "wallpaper",
    "webAuthenticationProxy",
}

# Permissions that work in Safari but require explicit user approval
_SENSITIVE_PERMISSIONS = {
    "tabs",
    "cookies",
    "history",
    "bookmarks",
    "nativeMessaging",
    "clipboardRead",
    "clipboardWrite",
    "geolocation",
}


class SafariPolicyChecker(BasePolicyChecker):
    """Validates an extension manifest against Safari Web Extensions policies."""

    @property
    def browser_name(self) -> str:
        return "Safari"

    def check(self, manifest: Manifest) -> BrowserReport:
        report = BrowserReport(browser=self.browser_name)
        results = report.results

        results.extend(self._check_name_and_version(manifest))
        results.append(self._check_manifest_version(manifest))
        results.append(self._check_background(manifest))
        results.append(self._check_no_remote_code(manifest))
        results.append(self._check_web_accessible_resources(manifest))
        results.extend(self._check_permissions(manifest))
        results.append(self._check_icons_declared(manifest))
        results.append(self._check_safari_specific_settings(manifest))

        return report

    def _check_manifest_version(self, manifest: Manifest):
        rule = "manifest-version"
        mv = manifest.manifest_version
        if mv == 3:
            return self._pass(
                rule,
                "Manifest V3 is supported by Safari 15.4+ (recommended).",
            )
        if mv == 2:
            return self._fail(
                rule,
                "Manifest V2 is supported by older Safari but deprecated. Migrate to MV3 (Safari 15.4+).",
                Severity.WARNING,
            )
        return self._fail(rule, f"Unknown or missing manifest_version: {mv!r}.")

    def _check_background(self, manifest: Manifest):
        rule = "background"
        mv = manifest.manifest_version
        bg = manifest.background
        if mv == 3:
            if bg.get("service_worker"):
                return self._pass(
                    rule,
                    "Background service worker declared (supported in Safari 15.4+ MV3).",
                )
            if bg.get("page") or bg.get("scripts"):
                return self._fail(
                    rule,
                    "MV3 requires 'background.service_worker'. "
                    "'page' and 'scripts' are not supported in Safari MV3.",
                )
            return self._pass(rule, "No background declared (allowed in MV3).")
        # MV2
        if bg.get("persistent") is True:
            return self._fail(
                rule,
                "Safari does not support persistent background pages. "
                "Set 'background.persistent' to false or migrate to MV3 service workers.",
                Severity.WARNING,
            )
        return self._pass(rule, "Background configuration appears acceptable for Safari MV2.")

    def _check_web_accessible_resources(self, manifest: Manifest):
        rule = "web-accessible-resources"
        war = manifest.web_accessible_resources
        if not war:
            return self._pass(rule, "No web_accessible_resources declared.")
        if manifest.manifest_version == 3:
            invalid = [e for e in war if isinstance(e, str)]
            if invalid:
                return self._fail(
                    rule,
                    "Safari MV3 requires 'web_accessible_resources' entries to be objects "
                    "with 'resources' and 'matches' fields, not plain strings.",
                )
        return self._pass(rule, "web_accessible_resources format is valid.")

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
                        f"Permission '{perm}' is not supported by Safari.",
                    )
                )
            elif perm in _SENSITIVE_PERMISSIONS:
                results.append(
                    self._fail(
                        rule,
                        f"Permission '{perm}' requires explicit user approval on Safari.",
                        Severity.WARNING,
                    )
                )
            else:
                results.append(self._pass(rule, f"Permission '{perm}' is valid in Safari."))
        return results

    def _check_safari_specific_settings(self, manifest: Manifest):
        """Safari Web Extensions are distributed via the App Store and require
        the native app wrapper generated by safari-web-extension-converter.
        Advise the developer about this requirement.
        """
        rule = "safari-distribution"
        return self._fail(
            rule,
            "Safari Web Extensions must be distributed through the Apple App Store inside "
            "a native macOS/iOS app wrapper. Use 'xcrun safari-web-extension-converter' to "
            "create the Xcode project for App Store submission.",
            Severity.INFO,
        )
