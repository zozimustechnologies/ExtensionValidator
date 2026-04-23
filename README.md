# Zozimus Extension Validator

A VS Code sidebar extension that validates browser-extension packages (`.zip` / `.crx` / `.xpi`) against the published developer policies for **Microsoft Edge Add-ons**, **Chrome Web Store**, **Firefox AMO**, and **Safari Web Extensions**, plus your own custom failure definitions.

## Features

1. **Bundled policy catalogs** — one JSON file per browser under `policies/`, seeded from each store's published developer policies.
2. **Monthly auto-refresh** — every `zozimus.refreshIntervalDays` (default 30) the extension fetches the upstream policy pages, hashes them, and notifies you when a source change is detected. Toggle with `zozimus.autoRefresh`. Run on demand via the **Zozimus: Refresh Browser Store Policies** command.
3. **Validate any package** — open the **Zozimus** sidebar → **Validate** → *Select extension package…* — pick a `.zip`, `.crx`, or `.xpi`. The package is unpacked in-memory and every policy from every browser is evaluated.
4. **Pass / Fail banner** — bright green ✓ PASS or red ✗ FAIL banner.
5. **Detailed report** — every finding lists severity, browser, policy id, file, line, code snippet, and a probable fix.
6. **AI auto-fix prompt** — copy-pasteable prompt generated for every failed validation, ready to drop into ChatGPT / Copilot / Claude.
7. **Custom Definitions tab** — capture failure messages your code received from a real Edge / Chrome / Firefox / Safari review team. Each entry is `(browser, failureMessage, optional regex, optional fix)`. Custom definitions are evaluated alongside built-in policies on every subsequent validation.
8. **Persistent storage** — policy and custom-definition files mirror into VS Code's globalStorage so your edits survive upgrades.
9. **Sidebar UI** — dedicated Activity Bar container with four tabs: Validate, Policies, Custom, About.
10. **Zozimus branding** — gradient `linear-gradient(135deg, #3d7ea6 0%, #1a4a6e 100%)` header, red Donate button → [Wise](https://wise.com/pay/business/sandeepchadda?utm_source=open_link), and copyright link to [github.com/zozimustechnologies](https://github.com/zozimustechnologies).

## Build

```powershell
npm install
npm run compile
```

Press **F5** in VS Code to launch an Extension Development Host and click the Zozimus icon in the Activity Bar.

## Settings

| Setting | Default | Description |
|---|---|---|
| `zozimus.autoRefresh` | `true` | Automatically refresh policies on the configured interval. |
| `zozimus.refreshIntervalDays` | `30` | How often (days) to refresh browser store policies. |

## Policy file format

Each browser file lives under `policies/<browser>-policies.json`:

```json
{
  "browser": "edge",
  "source": "https://learn.microsoft.com/...",
  "lastUpdated": "...",
  "policies": [
    {
      "id": "edge.manifest.v3",
      "title": "Manifest V3 required",
      "category": "manifest",
      "severity": "error",
      "check": { "type": "manifestField", "field": "manifest_version", "equals": 3 },
      "fix": "Set \"manifest_version\": 3 in manifest.json."
    }
  ]
}
```

Supported `check.type` values: `fileExists`, `manifestField`, `sourcePattern`, `permissionsBlocklist`, `manual`.

## License

See [LICENSE](LICENSE).

© Zozimus Technologies — https://github.com/zozimustechnologies

