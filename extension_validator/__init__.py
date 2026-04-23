"""ExtensionValidator – Check Edge, Chrome, Firefox, and Safari policies on your extension."""

from .validator import ExtensionValidator
from .result import PolicyResult, Severity

__all__ = ["ExtensionValidator", "PolicyResult", "Severity"]
__version__ = "1.0.0"
