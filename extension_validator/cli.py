"""Command-line interface for extension-validator."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .manifest import ManifestError
from .result import Severity
from .validator import ExtensionValidator


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="extension-validator",
        description="Check Edge, Chrome, Firefox, and Safari policies on your browser extension.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  extension-validator ./my-extension
  extension-validator ./my-extension --browsers Chrome Firefox
  extension-validator ./my-extension --browsers Chrome --no-pass
""",
    )
    parser.add_argument(
        "path",
        metavar="PATH",
        help="Path to the extension directory (must contain manifest.json).",
    )
    parser.add_argument(
        "--browsers",
        nargs="+",
        metavar="BROWSER",
        choices=["Chrome", "Edge", "Firefox", "Safari"],
        default=None,
        help="Browsers to check (default: all). Choices: Chrome Edge Firefox Safari.",
    )
    parser.add_argument(
        "--no-pass",
        action="store_true",
        default=False,
        help="Suppress passing checks from output.",
    )
    parser.add_argument(
        "--errors-only",
        action="store_true",
        default=False,
        help="Only show ERROR-level failures.",
    )
    return parser


def _print_report(report, no_pass: bool, errors_only: bool) -> None:
    """Pretty-print a BrowserReport to stdout."""
    status_icon = "✓" if report.passed else "✗"
    print(f"\n{'=' * 60}")
    print(f"  {status_icon} {report.browser.upper()}")
    print(f"  {report.summary()}")
    print(f"{'=' * 60}")

    for result in report.results:
        if result.passed and no_pass:
            continue
        if errors_only and (result.passed or result.severity != Severity.ERROR):
            continue
        print(str(result))


def main(argv: list[str] | None = None) -> int:
    """Entry point for the CLI.

    Returns an exit code: 0 for success (no errors), 1 for policy errors,
    2 for usage/manifest errors.
    """
    parser = _build_parser()
    args = parser.parse_args(argv)

    try:
        validator = ExtensionValidator(args.path)
        # Trigger manifest loading early to catch errors before any output
        _ = validator.manifest
    except ManifestError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    print(f"Validating extension at: {Path(args.path).resolve()}")
    print(f"Manifest: {validator.manifest.name!r}  (version {validator.manifest.manifest_version})")

    try:
        reports = validator.validate(browsers=args.browsers)
    except (ManifestError, ValueError, KeyError) as exc:
        print(f"ERROR: Unexpected error during validation: {exc}", file=sys.stderr)
        return 2

    overall_pass = True
    for report in reports:
        _print_report(report, no_pass=args.no_pass, errors_only=args.errors_only)
        if not report.passed:
            overall_pass = False

    print(f"\n{'=' * 60}")
    if overall_pass:
        print("  OVERALL: PASS – No policy errors found.")
    else:
        print("  OVERALL: FAIL – One or more policy errors found.")
    print(f"{'=' * 60}\n")

    return 0 if overall_pass else 1


if __name__ == "__main__":
    sys.exit(main())
