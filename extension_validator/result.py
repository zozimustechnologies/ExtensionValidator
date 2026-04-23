"""Policy result data types."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Severity(str, Enum):
    """Severity level of a policy violation."""

    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


@dataclass
class PolicyResult:
    """A single policy check result."""

    rule: str
    message: str
    severity: Severity
    passed: bool

    def __str__(self) -> str:
        status = "✓" if self.passed else ("✗" if self.severity == Severity.ERROR else "⚠")
        return f"  [{status}] {self.rule}: {self.message}"


@dataclass
class BrowserReport:
    """Aggregated policy results for a single browser."""

    browser: str
    results: list[PolicyResult] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        """True if no ERROR-level failures exist."""
        return all(r.passed or r.severity != Severity.ERROR for r in self.results)

    @property
    def errors(self) -> list[PolicyResult]:
        return [r for r in self.results if not r.passed and r.severity == Severity.ERROR]

    @property
    def warnings(self) -> list[PolicyResult]:
        return [r for r in self.results if not r.passed and r.severity == Severity.WARNING]

    @property
    def infos(self) -> list[PolicyResult]:
        return [r for r in self.results if not r.passed and r.severity == Severity.INFO]

    def summary(self) -> str:
        e = len(self.errors)
        w = len(self.warnings)
        i = len(self.infos)
        status = "PASS" if self.passed else "FAIL"
        return (
            f"{self.browser}: {status} "
            f"({e} error(s), {w} warning(s), {i} info(s))"
        )
