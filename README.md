# ExtensionValidator

Check Edge, Chrome, Firefox, and Safari policies on your browser extension.

`extension-validator` is a Python command-line tool that reads your extension's
`manifest.json` and validates it against the published policies of all four major
browsers: **Chrome**, **Edge**, **Firefox**, and **Safari**.

---

## Features

| Check | Chrome | Edge | Firefox | Safari |
|---|:---:|:---:|:---:|:---:|
| Manifest V3 required | ✓ | ✓ | ✓ | ✓ |
| Background service worker (MV3) | ✓ | ✓ | ✓ | ✓ |
| `action` key (not `browser_action`/`page_action`) | ✓ | ✓ | | |
| Host permissions in `host_permissions` field | ✓ | ✓ | | |
| No remote code / unsafe-eval in CSP | ✓ | ✓ | ✓ | ✓ |
| `web_accessible_resources` object format (MV3) | ✓ | ✓ | | ✓ |
| Permission support per browser | ✓ | ✓ | ✓ | ✓ |
| Sensitive permissions flagged | ✓ | ✓ | ✓ | ✓ |
| `browser_specific_settings.gecko.id` (AMO) | | | ✓ | |
| Firefox `strict_min_version` advisory | | | ✓ | |
| Persistent background page restriction | | | | ✓ |
| App Store distribution advisory | | | | ✓ |
| Edge-specific settings advisory | | ✓ | | |

---

## Installation

```bash
pip install extension-validator
```

Or install from source:

```bash
git clone https://github.com/zozimustechnologies/ExtensionValidator.git
cd ExtensionValidator
pip install -e .
```

---

## Usage

```
extension-validator PATH [--browsers BROWSER [BROWSER ...]] [--no-pass] [--errors-only]
```

### Arguments

| Argument | Description |
|---|---|
| `PATH` | Path to the extension directory (must contain `manifest.json`). |
| `--browsers` | Browsers to check. Choices: `Chrome` `Edge` `Firefox` `Safari`. Default: all. |
| `--no-pass` | Suppress passing checks from output. |
| `--errors-only` | Only show `ERROR`-level failures. |

### Examples

Validate against all four browsers:

```bash
extension-validator ./my-extension
```

Validate against Chrome and Firefox only:

```bash
extension-validator ./my-extension --browsers Chrome Firefox
```

Show only errors (hide warnings and passing checks):

```bash
extension-validator ./my-extension --errors-only
```

---

## Example output

```
Validating extension at: /path/to/my-extension
Manifest: 'My Test Extension'  (version 3)

============================================================
  ✓ CHROME
  Chrome: PASS (0 error(s), 0 warning(s), 0 info(s))
============================================================
  [✓] manifest-version: Manifest V3 is used (required by Chrome).
  [✓] background-service-worker: Background service worker declared (MV3 compliant).
  ...

============================================================
  OVERALL: PASS – No policy errors found.
============================================================
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | All checked browsers pass (no `ERROR`-level violations). |
| `1` | One or more `ERROR`-level policy violations found. |
| `2` | Could not load/parse `manifest.json`, or invalid arguments. |

---

## Python API

You can also use `ExtensionValidator` programmatically:

```python
from extension_validator import ExtensionValidator

validator = ExtensionValidator("./my-extension")
reports = validator.validate()          # all four browsers

for report in reports:
    print(report.summary())
    for result in report.results:
        if not result.passed:
            print(f"  [{result.severity.value}] {result.rule}: {result.message}")
```

Validate a subset of browsers:

```python
reports = validator.validate(browsers=["Chrome", "Firefox"])
```

---

## Policy references

- **Chrome**: <https://developer.chrome.com/docs/extensions/mv3/>
- **Edge**: <https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/manifest-v3>
- **Firefox**: <https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/>
- **Safari**: <https://developer.apple.com/documentation/safariservices/safari_web_extensions>

---

## License

[MIT](LICENSE)

