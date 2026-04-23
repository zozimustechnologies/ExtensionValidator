"""Manifest parser – loads and validates the structure of a manifest.json file."""

from __future__ import annotations

import json
from pathlib import Path


class ManifestError(Exception):
    """Raised when the manifest cannot be loaded or parsed."""


class Manifest:
    """Parsed representation of a browser extension manifest.json."""

    def __init__(self, data: dict, extension_dir: Path) -> None:
        self._data = data
        self.extension_dir = extension_dir

    # ------------------------------------------------------------------
    # Convenience accessors
    # ------------------------------------------------------------------

    @property
    def raw(self) -> dict:
        return self._data

    @property
    def manifest_version(self) -> int | None:
        return self._data.get("manifest_version")

    @property
    def name(self) -> str:
        return self._data.get("name", "")

    @property
    def version(self) -> str:
        return self._data.get("version", "")

    @property
    def permissions(self) -> list[str]:
        return self._data.get("permissions", [])

    @property
    def optional_permissions(self) -> list[str]:
        return self._data.get("optional_permissions", [])

    @property
    def host_permissions(self) -> list[str]:
        return self._data.get("host_permissions", [])

    @property
    def optional_host_permissions(self) -> list[str]:
        return self._data.get("optional_host_permissions", [])

    @property
    def background(self) -> dict:
        return self._data.get("background", {})

    @property
    def content_security_policy(self) -> str | dict | None:
        return self._data.get("content_security_policy")

    @property
    def content_scripts(self) -> list[dict]:
        return self._data.get("content_scripts", [])

    @property
    def web_accessible_resources(self) -> list:
        return self._data.get("web_accessible_resources", [])

    @property
    def action(self) -> dict | None:
        return self._data.get("action")

    @property
    def browser_action(self) -> dict | None:
        return self._data.get("browser_action")

    @property
    def page_action(self) -> dict | None:
        return self._data.get("page_action")

    @property
    def browser_specific_settings(self) -> dict:
        return self._data.get("browser_specific_settings", {})

    @property
    def icons(self) -> dict:
        return self._data.get("icons", {})

    def get(self, key: str, default=None):
        return self._data.get(key, default)

    # ------------------------------------------------------------------
    # Factory
    # ------------------------------------------------------------------

    @classmethod
    def from_directory(cls, path: str | Path) -> "Manifest":
        """Load manifest.json from an extension directory."""
        extension_dir = Path(path).expanduser().resolve()
        if not extension_dir.is_dir():
            raise ManifestError(f"Not a directory: {extension_dir}")

        manifest_path = extension_dir / "manifest.json"
        if not manifest_path.is_file():
            raise ManifestError(f"manifest.json not found in: {extension_dir}")

        try:
            with manifest_path.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
        except json.JSONDecodeError as exc:
            raise ManifestError(f"Invalid JSON in manifest.json: {exc}") from exc

        if not isinstance(data, dict):
            raise ManifestError("manifest.json must be a JSON object.")

        return cls(data, extension_dir)
