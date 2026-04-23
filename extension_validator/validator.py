"""Core validator that runs all browser policy checks."""

from __future__ import annotations

from pathlib import Path

from .manifest import Manifest
from .policies import (
    ChromePolicyChecker,
    EdgePolicyChecker,
    FirefoxPolicyChecker,
    SafariPolicyChecker,
)
from .result import BrowserReport

_ALL_CHECKERS = [
    ChromePolicyChecker(),
    EdgePolicyChecker(),
    FirefoxPolicyChecker(),
    SafariPolicyChecker(),
]


class ExtensionValidator:
    """Validates a browser extension against Chrome, Edge, Firefox, and Safari policies.

    Usage::

        validator = ExtensionValidator("/path/to/extension")
        reports = validator.validate()
        for report in reports:
            print(report.summary())
    """

    def __init__(self, extension_path: str | Path) -> None:
        self.extension_path = Path(extension_path)
        self._manifest: Manifest | None = None

    @property
    def manifest(self) -> Manifest:
        if self._manifest is None:
            from .manifest import Manifest
            self._manifest = Manifest.from_directory(self.extension_path)
        return self._manifest

    def validate(self, browsers: list[str] | None = None) -> list[BrowserReport]:
        """Run policy checks for all (or specified) browsers.

        Parameters
        ----------
        browsers:
            Optional list of browser names to check (e.g. ``["Chrome", "Firefox"]``).
            When *None* all four browsers are checked.

        Returns
        -------
        list[BrowserReport]
            One report per browser.
        """
        manifest = self.manifest
        checkers = _ALL_CHECKERS
        if browsers:
            browsers_lower = {b.lower() for b in browsers}
            checkers = [c for c in _ALL_CHECKERS if c.browser_name.lower() in browsers_lower]
        return [checker.check(manifest) for checker in checkers]
