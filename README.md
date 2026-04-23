# Browser Extension Validator

A VS Code sidebar extension that validates browser-extension packages (`.zip` / `.crx` / `.xpi`) **and unpacked folders** against the published developer policies for **Microsoft Edge Add-ons**, **Chrome Web Store**, **Firefox AMO**, and **Safari Web Extensions**, plus your own custom failure definitions.

> Website / docs: **https://zozimustechnologies.github.io/ExtensionValidator/**

## Features

1. **Bundled policy catalogs** — one JSON per browser under `policies/`, seeded from each store's published developer policies.
   - Edge: **56** policies — full Edge Add-ons §1.x / §2.x leaf list
   - Chrome: **38** policies — principles, Best Practices, Safety, Privacy, Marketing/Monetization, Quality, Technical, Account
   - Firefox: **40** policies — No Surprises, Content, Submission, Development (incl. obfuscation), User Scripts, Data Collection/Consent, Privacy, Monetization
   - Safari: **31** policies — App Review §1.6, §2.x, §4.4 (incl. §4.4.2 Safari extensions), §5.1.x, §5.2, §5.6
   - Custom: unlimited user-defined rules
2. **Real reported rejections** — beyond the official policy text, the catalog includes reasons real review teams have cited:
   - Chrome **Blue Argon** (disclosure mismatch), **Purple Agate** (affiliate/ads), **Red Invalid** (missing manifest paths), **Yellow Magnesium** (broad hosts), **Green Terpene** (obfuscation), **Grey Epsilon** (privacy policy)
   - Firefox source-submission failures, dynamic-code execution, undisclosed analytics, search/new-tab hijack without consent
   - Safari §2.5.2 remote-code, §4.4.2 `<all_urls>`, §5.1.1 privacy policy, §4.2 minimum functionality, ATT-required tracking SDKs
   - Edge: short-description, remote-code fetch, broad host perms, low-quality icon, minified-without-source
3. **Browser multi-select** — chip picker on the Validate tab. Pick any subset of Edge / Chrome / Firefox / Safari and only those policies run. The PASS/FAIL banner shows the active scope, e.g. `✓ PASS — 3 finding(s) [edge]`.
4. **Validate file or folder** — pick a packaged `.zip` / `.crx` / `.xpi` or an unpacked source folder. Both are unpacked in memory; large/binary files are skipped automatically.
5. **Pass / Fail report** — bright green ✓ PASS or red ✗ FAIL banner. Every finding lists severity, browser, policy id, file, line, code snippet, and a probable fix.
6. **AI auto-fix prompt** — copy-pasteable prompt grouped by browser and policy id, ready to drop into ChatGPT / Copilot / Claude. The prompt declares which browsers were validated.
7. **Custom Definitions tab** — capture failure messages your code received from a real Edge / Chrome / Firefox / Safari review team. Each entry is `(browser, failureMessage, optional regex, optional fix)`. Custom definitions evaluate alongside built-in policies. The "Existing definitions" header links to [policies/custom-definitions.json on GitHub](https://github.com/zozimustechnologies/ExtensionValidator/blob/main/policies/custom-definitions.json) so you can hand-edit or PR new entries.
8. **Scheduled policy refresh** — fetches each upstream policy page, hashes it, and notifies you when a source change is detected. Default 30 days; toggle with `zozimus.autoRefresh`, set the interval with `zozimus.refreshIntervalDays`, or run on demand via the **Zozimus: Refresh Browser Store Policies** command. The bundled seed is also re-applied automatically when a new release ships more policies than the locally cached file.
9. **Persistent storage** — policy and custom-definition files mirror into VS Code's globalStorage so your edits survive upgrades.
10. **Save report / copy prompt** — export the finding list to `.txt` or `.json`, or copy the AI prompt straight to your clipboard. No telemetry — every check runs locally.
11. **Sidebar UI** — dedicated Activity Bar container with four tabs: Validate, Policies, Custom, About.
12. **Zozimus branding** — gradient `linear-gradient(135deg, #3d7ea6 0%, #1a4a6e 100%)` header, red Donate button → [Wise](https://wise.com/pay/business/sandeepchadda?utm_source=open_link), and copyright link to [github.com/zozimustechnologies](https://github.com/zozimustechnologies).

## Build

```powershell
npm install
npm run compile
```

Press **F5** in VS Code to launch an Extension Development Host and click the shield icon in the Activity Bar.

## Settings

| Setting | Default | Description |
|---|---|---|
| `zozimus.autoRefresh` | `true` | Automatically refresh policies on the configured interval. |
| `zozimus.refreshIntervalDays` | `30` | How often (days) to refresh browser store policies. |

## Commands

| Command | Description |
|---|---|
| `Zozimus: Validate Extension Package` | Open the sidebar to pick and validate a package or folder. |
| `Zozimus: Refresh Browser Store Policies` | Force a policy-source refresh now. |

## Policy file format

Each browser file lives under `policies/<browser>-policies.json`:

```json
{
  "browser": "edge",
  "source": "https://learn.microsoft.com/...",
  "lastUpdated": "...",
  "policyCount": 56,
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

## Project layout

```
├── package.json              # Extension manifest (commands, settings, view container)
├── policies/                 # Versioned policy catalogs (Edge / Chrome / Firefox / Safari + custom)
├── scripts/
│   └── append-reported-rejections.js   # Idempotent script that appends real-world rejection rules
├── src/
│   ├── extension.ts          # Activation, scheduled refresh, seed management
│   ├── sidebarProvider.ts    # Webview UI (4 tabs, browser multi-select)
│   ├── validator.ts          # Package loader (zip + folder) + policy engine
│   ├── policyStore.ts        # Read/write policy + custom JSON
│   ├── policyFetcher.ts      # Hash upstream policy pages
│   ├── reportGenerator.ts    # Human report + AI prompt
│   └── types.ts              # Shared types
├── media/sidebar-icon.svg    # Activity Bar icon
└── docs/                     # GitHub Pages site (https://zozimustechnologies.github.io/ExtensionValidator/)
```

## License

MIT — see [LICENSE](LICENSE).

© Zozimus Technologies — https://github.com/zozimustechnologies
# Browser Extension Validator

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

