"""Edge policy checker.

Microsoft Edge supports Chromium-based extensions and shares most policies with
Chrome.  Additional Edge-specific policies are checked here.

Policy references:
  https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/manifest-v3
  https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/
"""

from __future__ import annotations

from ..manifest import Manifest
from ..result import BrowserReport, Severity
from .chrome import ChromePolicyChecker

# Permissions available in Edge that are Edge-specific or differ from Chrome
_EDGE_EXTRA_PERMISSIONS: set[str] = {
    "sidePanel",  # Edge supports Side Panel API
}


class EdgePolicyChecker(ChromePolicyChecker):
    """Validates an extension manifest against Microsoft Edge Add-ons policies.

    Edge uses the same Chromium extension platform as Chrome, so most Chrome
    policies apply.  This checker extends ChromePolicyChecker with Edge-specific
    checks.
    """

    @property
    def browser_name(self) -> str:
        return "Edge"

    def check(self, manifest: Manifest) -> BrowserReport:
        # Start with all Chrome checks, then add Edge-specific ones
        chrome_report = super().check(manifest)
        report = BrowserReport(browser=self.browser_name)
        # Copy Chrome results (they apply to Edge too)
        report.results.extend(chrome_report.results)
        # Edge-specific checks
        report.results.append(self._check_edge_mv3_recommendation(manifest))
        report.results.append(self._check_edge_addons_url(manifest))
        return report

    # ------------------------------------------------------------------
    # Edge-specific checks
    # ------------------------------------------------------------------

    def _check_edge_mv3_recommendation(self, manifest: Manifest):
        """Edge requires MV3 for new submissions (same timeline as Chrome)."""
        rule = "edge-manifest-version"
        mv = manifest.manifest_version
        if mv == 3:
            return self._pass(
                rule,
                "Manifest V3 is used (required for new Edge Add-ons submissions).",
            )
        if mv == 2:
            return self._fail(
                rule,
                "Manifest V2 is deprecated in Edge. Migrate to Manifest V3 for new submissions.",
            )
        return self._fail(rule, f"Unknown or missing manifest_version: {mv!r}.")

    def _check_edge_addons_url(self, manifest: Manifest):
        """Edge Add-ons listing page should be referenced via the Edge-specific URL format.

        Extensions targeting Edge can optionally declare the Edge Add-ons listing
        URL inside browser_specific_settings.  This is advisory only.
        """
        rule = "edge-browser-specific-settings"
        bss = manifest.browser_specific_settings
        if "edge" in bss or "msedge" in bss:
            return self._pass(
                rule,
                "Edge-specific settings found in 'browser_specific_settings'.",
                Severity.INFO,
            )
        return self._fail(
            rule,
            "No Edge-specific settings in 'browser_specific_settings'. "
            "Consider adding 'edge' settings for Edge Add-ons listing metadata.",
            Severity.INFO,
        )
