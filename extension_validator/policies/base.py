"""Base class for browser policy checkers."""

from __future__ import annotations

from abc import ABC, abstractmethod

from ..manifest import Manifest
from ..result import BrowserReport, PolicyResult, Severity


class BasePolicyChecker(ABC):
    """Abstract base class for browser-specific policy checkers."""

    @property
    @abstractmethod
    def browser_name(self) -> str:
        """Human-readable browser name."""

    @abstractmethod
    def check(self, manifest: Manifest) -> BrowserReport:
        """Run all policy checks and return a BrowserReport."""

    # ------------------------------------------------------------------
    # Helper builders
    # ------------------------------------------------------------------

    def _pass(self, rule: str, message: str, severity: Severity = Severity.ERROR) -> PolicyResult:
        return PolicyResult(rule=rule, message=message, severity=severity, passed=True)

    def _fail(self, rule: str, message: str, severity: Severity = Severity.ERROR) -> PolicyResult:
        return PolicyResult(rule=rule, message=message, severity=severity, passed=False)

    # ------------------------------------------------------------------
    # Shared policy helpers
    # ------------------------------------------------------------------

    def _check_no_remote_code(self, manifest: Manifest) -> PolicyResult:
        """Ensure extension does not use remotely hosted code."""
        rule = "no-remote-code"
        csp = manifest.content_security_policy
        if isinstance(csp, dict):
            # MV3 style: check both extension_pages and sandbox
            for csp_value in csp.values():
                if _csp_allows_remote_scripts(csp_value):
                    return self._fail(
                        rule,
                        "Content Security Policy allows remote scripts (unsafe-eval or external script-src).",
                    )
        elif isinstance(csp, str):
            if _csp_allows_remote_scripts(csp):
                return self._fail(
                    rule,
                    "Content Security Policy allows remote scripts (unsafe-eval or external script-src).",
                )
        return self._pass(rule, "No remote code execution detected in CSP.")

    def _check_icons_declared(self, manifest: Manifest) -> PolicyResult:
        """Extension should declare at least one icon."""
        rule = "icons-declared"
        if manifest.icons:
            return self._pass(rule, "Icons are declared.", Severity.WARNING)
        return self._fail(rule, "No icons declared in the manifest.", Severity.WARNING)

    def _check_name_and_version(self, manifest: Manifest) -> list[PolicyResult]:
        """Verify required 'name' and 'version' fields are present."""
        results = []
        rule_name = "required-name"
        if manifest.name:
            results.append(self._pass(rule_name, "Extension 'name' is present."))
        else:
            results.append(self._fail(rule_name, "Missing required field 'name'."))

        rule_version = "required-version"
        if manifest.version:
            results.append(self._pass(rule_version, "Extension 'version' is present."))
        else:
            results.append(self._fail(rule_version, "Missing required field 'version'."))
        return results


def _csp_allows_remote_scripts(csp_string: str) -> bool:
    """Return True if the CSP value allows remote scripts or eval."""
    if not csp_string:
        return False
    csp_lower = csp_string.lower()
    if "'unsafe-eval'" in csp_lower:
        return True
    # Check script-src for non-'self'/non-'none' external sources
    for directive in csp_string.split(";"):
        directive = directive.strip()
        parts = directive.split()
        if parts and parts[0].lower() in ("script-src", "default-src"):
            for src in parts[1:]:
                src_lower = src.lower()
                # External URLs in script-src indicate remote code
                if src_lower.startswith("http://") or src_lower.startswith("https://"):
                    return True
    return False
