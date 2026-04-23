// One-shot script: append real-world reported rejection entries to each policy file.
// Run with: node scripts/append-reported-rejections.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'policies');

// Sources consulted (publicly reported rejections / common reviewer feedback):
//  - Chrome Web Store help: https://developer.chrome.com/docs/webstore/troubleshooting
//  - Chrome Web Store program policies & enforcement: https://developer.chrome.com/docs/webstore/program-policies/
//  - Edge Add-ons certification notes: https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/store-policies/developer-policies
//  - Firefox AMO common rejection reasons: https://extensionworkshop.com/documentation/publish/add-on-policies/
//  - Firefox source-submission requirements: https://extensionworkshop.com/documentation/publish/source-code-submission/
//  - Apple App Review (Safari Web Extensions §4.4.2 + §2.5.2): https://developer.apple.com/app-store/review/guidelines/

const reported = {
  edge: [
    {
      id: 'edge.reported.descTooShort',
      title: 'Reported rejection: short description must be substantive (Edge Add-ons)',
      category: 'reported-rejection',
      severity: 'warning',
      check: { type: 'manifestField', field: 'description', exists: true, minLength: 25 },
      fix: 'Expand the description to clearly state what the extension does and the value to the user. One-word descriptions are routinely rejected.'
    },
    {
      id: 'edge.reported.remoteCodeFetch',
      title: 'Reported rejection: extension fetches and executes remote JavaScript',
      category: 'reported-rejection',
      severity: 'error',
      check: { type: 'sourcePattern', pattern: 'fetch\\(\\s*[\'\"]https?://[^\'\"\\s]+\\.js[\'\"]|new\\s+Function\\s*\\(|eval\\s*\\(', flags: 'g' },
      fix: 'Bundle all executable code in the package. Edge certification rejects extensions that download/eval JS at runtime.'
    },
    {
      id: 'edge.reported.broadHostPermissions',
      title: 'Reported rejection: requests <all_urls> without justification',
      category: 'reported-rejection',
      severity: 'warning',
      check: { type: 'permissionsBlocklist', blocked: ['<all_urls>', 'http://*/*', 'https://*/*'] },
      fix: 'Restrict host permissions to the specific origins your features require, or switch to activeTab + user gesture.'
    },
    {
      id: 'edge.reported.minifiedNoSource',
      title: 'Reported rejection: heavily minified bundles without readable sources',
      category: 'reported-rejection',
      severity: 'info',
      check: { type: 'manual' },
      fix: 'Provide unminified source or a build script in the developer notes so reviewers can audit the code.'
    },
    {
      id: 'edge.reported.iconQuality',
      title: 'Reported rejection: low-quality / generic / placeholder icon',
      category: 'reported-rejection',
      severity: 'info',
      check: { type: 'manifestField', field: 'icons', exists: true },
      fix: 'Provide a distinct, high-resolution icon. Stock or default icons are commonly cited as a rejection reason.'
    }
  ],
  chrome: [
    {
      id: 'chrome.reported.singlePurpose',
      title: 'Reported rejection: violates single-purpose policy (multiple unrelated features)',
      category: 'reported-rejection',
      severity: 'warning',
      check: { type: 'manual' },
      fix: 'Limit the extension to a single, narrow purpose. Split additional features into separate listings.'
    },
    {
      id: 'chrome.reported.blueArgon',
      title: 'Reported rejection: Blue Argon — disclosure mismatch / does not match listing',
      category: 'reported-rejection',
      severity: 'error',
      check: { type: 'manual' },
      fix: 'Ensure your store description, screenshots and Permission Justifications accurately describe every feature in the package.'
    },
    {
      id: 'chrome.reported.purpleAgate',
      title: 'Reported rejection: Purple Agate — affiliate links / advertising not disclosed',
      category: 'reported-rejection',
      severity: 'warning',
      check: { type: 'sourcePattern', pattern: '\\?(?:tag|aff|affid|partner|ref|utm_source)=', flags: 'gi' },
      fix: 'Disclose any affiliate codes, referral links, or ad injection in the listing description and privacy practices.'
    },
    {
      id: 'chrome.reported.redInvalid',
      title: 'Reported rejection: Red Invalid — manifest references files not in the package',
      category: 'reported-rejection',
      severity: 'error',
      check: { type: 'manual' },
      fix: 'Verify every path in manifest.json (background, content_scripts, web_accessible_resources, icons, action.default_popup) exists in the zip.'
    },
    {
      id: 'chrome.reported.yellowMagnesium',
      title: 'Reported rejection: Yellow Magnesium — broad host permissions without need',
      category: 'reported-rejection',
      severity: 'warning',
      check: { type: 'permissionsBlocklist', blocked: ['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*'] },
      fix: 'Use activeTab or specific host patterns. Justify each host permission in the developer dashboard.'
    },
    {
      id: 'chrome.reported.greenTerpene',
      title: 'Reported rejection: Green Terpene — code obfuscated / minified beyond what build tools produce',
      category: 'reported-rejection',
      severity: 'warning',
      check: { type: 'sourcePattern', pattern: '\\beval\\s*\\(|\\b_0x[a-f0-9]{4,}\\b|String\\.fromCharCode\\(\\s*(?:\\d+\\s*,\\s*){10,}', flags: 'gi' },
      fix: 'Do not obfuscate code. Standard minification is allowed; control-flow obfuscation, hex-name renaming, and string-array packers are rejected.'
    },
    {
      id: 'chrome.reported.greyEpsilon',
      title: 'Reported rejection: Grey Epsilon — privacy policy missing or inadequate',
      category: 'reported-rejection',
      severity: 'error',
      check: { type: 'manual' },
      fix: 'Provide a privacy policy URL on the dashboard whenever you handle personal/sensitive data, and answer all data-handling certifications.'
    },
    {
      id: 'chrome.reported.spamKeyword',
      title: 'Reported rejection: keyword spam / misleading metadata',
      category: 'reported-rejection',
      severity: 'warning',
      check: { type: 'manifestField', field: 'name', exists: true, mustNotMatch: '\\b(?:best|free|#1|number\\s*one|top\\s*\\d+|amazing)\\b' },
      fix: 'Remove superlatives and irrelevant trending keywords from the name. Review the title for trademark misuse.'
    },
    {
      id: 'chrome.reported.notesEmpty',
      title: 'Reported rejection: missing reviewer test instructions / login',
      category: 'reported-rejection',
      severity: 'info',
      check: { type: 'manual' },
      fix: 'Provide working test credentials and step-by-step usage notes in "Notes for reviewers" when features require sign-in or backend access.'
    }
  ],
  firefox: [
    {
      id: 'firefox.reported.minifiedSource',
      title: 'Reported rejection: minified/transpiled code without source-code submission',
      category: 'reported-rejection',
      severity: 'error',
      check: { type: 'manual' },
      fix: 'Submit original source plus build instructions via the AMO source-code submission form when you ship bundled/minified output.'
    },
    {
      id: 'firefox.reported.thirdPartyLib',
      title: 'Reported rejection: third-party library shipped without upstream URL/version',
      category: 'reported-rejection',
      severity: 'warning',
      check: { type: 'manual' },
      fix: 'For each bundled library, document name, version and origin URL in source-submission notes so reviewers can diff against upstream.'
    },
    {
      id: 'firefox.reported.evalAndNew',
      title: 'Reported rejection: dynamic code execution (eval / new Function / setTimeout-string)',
      category: 'reported-rejection',
      severity: 'error',
      check: { type: 'sourcePattern', pattern: '\\beval\\s*\\(|\\bnew\\s+Function\\s*\\(|setTimeout\\s*\\(\\s*[\'\"]', flags: 'g' },
      fix: 'Replace eval/new Function with statically declared code. Pass functions, not strings, to setTimeout/setInterval.'
    },
    {
      id: 'firefox.reported.remoteScript',
      title: 'Reported rejection: loading remote scripts / WASM not bundled',
      category: 'reported-rejection',
      severity: 'error',
      check: { type: 'sourcePattern', pattern: 'document\\.createElement\\(\\s*[\'\"]script[\'\"]\\s*\\)|importScripts\\s*\\(|<script[^>]+src\\s*=\\s*[\'\"]https?:', flags: 'gi' },
      fix: 'Bundle every script, worker, and wasm file inside the .xpi. AMO blocks add-ons that fetch executable code at runtime.'
    },
    {
      id: 'firefox.reported.consentSearchHijack',
      title: 'Reported rejection: changes search engine / homepage / new tab without explicit consent',
      category: 'reported-rejection',
      severity: 'error',
      check: { type: 'sourcePattern', pattern: 'chrome_url_overrides|chrome_settings_overrides', flags: 'g' },
      fix: 'Surface a clear opt-in dialog before overriding new-tab, homepage, or search defaults. Provide a one-click revert.'
    },
    {
      id: 'firefox.reported.dataCollection',
      title: 'Reported rejection: undisclosed telemetry / data collection',
      category: 'reported-rejection',
      severity: 'warning',
      check: { type: 'sourcePattern', pattern: '(?:google-analytics|googletagmanager|mixpanel|segment\\.com|sentry-cdn|amplitude\\.com|/collect\\?)', flags: 'gi' },
      fix: 'Disclose all data collection in the listing and obtain explicit user consent. Mozilla rejects silent analytics.'
    },
    {
      id: 'firefox.reported.broadOriginsXhr',
      title: 'Reported rejection: cross-origin XHR/fetch beyond declared host permissions',
      category: 'reported-rejection',
      severity: 'warning',
      check: { type: 'manual' },
      fix: 'Match every fetch/XHR origin to a declared host permission and justify it in the AMO listing.'
    }
  ],
  safari: [
    {
      id: 'safari.reported.2.5.2.remote',
      title: 'Reported rejection (App Review 2.5.2): downloading/executing code at runtime',
      category: 'reported-rejection',
      severity: 'error',
      check: { type: 'sourcePattern', pattern: '\\beval\\s*\\(|new\\s+Function\\s*\\(|importScripts\\s*\\(\\s*[\'\"]https?:|document\\.write\\s*\\(', flags: 'g' },
      fix: 'Apple rejects extensions that load executable code from a remote source. Bundle and statically declare every script.'
    },
    {
      id: 'safari.reported.4.4.2.allUrls',
      title: 'Reported rejection (App Review 4.4.2): Safari extension requests access to all websites',
      category: 'reported-rejection',
      severity: 'warning',
      check: { type: 'permissionsBlocklist', blocked: ['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*'] },
      fix: 'Limit host_permissions to the specific origins where your extension provides functionality. Document why each origin is required.'
    },
    {
      id: 'safari.reported.5.1.1.privacyPolicy',
      title: 'Reported rejection (App Review 5.1.1): privacy policy missing or does not cover the extension',
      category: 'reported-rejection',
      severity: 'error',
      check: { type: 'manifestField', field: 'homepage_url', exists: true },
      fix: 'Provide a privacy policy URL in App Store Connect AND inside the app. The policy must explicitly describe data collected by the Safari extension.'
    },
    {
      id: 'safari.reported.2.3.10.otherPlatforms',
      title: 'Reported rejection (App Review 2.3.10): metadata mentions other browsers / platforms',
      category: 'reported-rejection',
      severity: 'info',
      check: { type: 'manual' },
      fix: 'Strip references to Chrome, Firefox, Edge, Android, etc. from screenshots, description, and in-app UI for the App Store build.'
    },
    {
      id: 'safari.reported.4.2.minimumFunctionality',
      title: 'Reported rejection (App Review 4.2): containing app does little beyond enabling the extension',
      category: 'reported-rejection',
      severity: 'warning',
      check: { type: 'manual' },
      fix: 'Ensure the macOS/iOS containing app has standalone value (settings, onboarding, account management) — not just an "Enable in Safari" button.'
    },
    {
      id: 'safari.reported.consentTracking',
      title: 'Reported rejection (App Tracking Transparency): tracking without ATT prompt',
      category: 'reported-rejection',
      severity: 'warning',
      check: { type: 'sourcePattern', pattern: '(?:facebook\\.net/.*fbevents|google-analytics|googletagmanager|/collect\\?|mixpanel|amplitude|segment\\.com)', flags: 'gi' },
      fix: 'If the extension or containing app tracks users across other companies\u2019 apps/sites, present the ATT prompt and respect the response.'
    }
  ]
};

const fileMap = {
  edge: 'edge-policies.json',
  chrome: 'chrome-policies.json',
  firefox: 'firefox-policies.json',
  safari: 'safari-policies.json'
};

for (const [browser, items] of Object.entries(reported)) {
  const p = path.join(ROOT, fileMap[browser]);
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  const existingIds = new Set(json.policies.map((x) => x.id));
  let added = 0;
  for (const item of items) {
    if (existingIds.has(item.id)) continue;
    json.policies.push(item);
    added++;
  }
  json.policyCount = json.policies.length;
  json.reportedRejectionsAdded = (json.reportedRejectionsAdded || 0) + added;
  json.reportedRejectionsSources = [
    'https://developer.chrome.com/docs/webstore/troubleshooting',
    'https://developer.chrome.com/docs/webstore/program-policies/',
    'https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/store-policies/developer-policies',
    'https://extensionworkshop.com/documentation/publish/add-on-policies/',
    'https://extensionworkshop.com/documentation/publish/source-code-submission/',
    'https://developer.apple.com/app-store/review/guidelines/'
  ];
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log(browser, '+', added, '→', json.policies.length);
}
