"""Tests for manifest loading."""

from __future__ import annotations

import json
import pytest
from pathlib import Path

from extension_validator.manifest import Manifest, ManifestError

FIXTURES = Path(__file__).parent / "fixtures"


class TestManifestFromDirectory:
    def test_loads_valid_mv3(self):
        m = Manifest.from_directory(FIXTURES / "valid_mv3")
        assert m.manifest_version == 3
        assert m.name == "My Test Extension"
        assert m.version == "1.0.0"

    def test_loads_valid_mv2(self):
        m = Manifest.from_directory(FIXTURES / "valid_mv2")
        assert m.manifest_version == 2
        assert m.name == "My Legacy Extension"

    def test_raises_for_missing_directory(self, tmp_path):
        with pytest.raises(ManifestError, match="Not a directory"):
            Manifest.from_directory(tmp_path / "nonexistent")

    def test_raises_for_missing_manifest_json(self, tmp_path):
        with pytest.raises(ManifestError, match="manifest.json not found"):
            Manifest.from_directory(tmp_path)

    def test_raises_for_invalid_json(self, tmp_path):
        (tmp_path / "manifest.json").write_text("not json!!!")
        with pytest.raises(ManifestError, match="Invalid JSON"):
            Manifest.from_directory(tmp_path)

    def test_raises_for_non_object_json(self, tmp_path):
        (tmp_path / "manifest.json").write_text("[1, 2, 3]")
        with pytest.raises(ManifestError, match="must be a JSON object"):
            Manifest.from_directory(tmp_path)


class TestManifestAccessors:
    def setup_method(self):
        self.m = Manifest.from_directory(FIXTURES / "valid_mv3")

    def test_permissions(self):
        assert "storage" in self.m.permissions
        assert "activeTab" in self.m.permissions

    def test_host_permissions(self):
        assert "https://example.com/*" in self.m.host_permissions

    def test_background(self):
        assert self.m.background.get("service_worker") == "background.js"

    def test_browser_specific_settings(self):
        gecko = self.m.browser_specific_settings.get("gecko", {})
        assert gecko.get("id") == "my-extension@example.com"

    def test_icons(self):
        assert "48" in self.m.icons

    def test_get(self):
        assert self.m.get("name") == "My Test Extension"
        assert self.m.get("missing_key", "default") == "default"
