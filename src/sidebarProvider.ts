import * as vscode from 'vscode';
import * as fs from 'fs';
import { PolicyStore } from './policyStore';
import { refreshAll } from './policyFetcher';
import { validatePackage } from './validator';
import { buildAiPrompt, buildHumanReport } from './reportGenerator';
import { BrowserId, CustomDefinition, ValidationReport } from './types';

const ALL_BROWSERS: BrowserId[] = ['edge', 'chrome', 'firefox', 'safari'];

function sanitizeBrowsers(input: unknown): BrowserId[] {
  if (!Array.isArray(input)) return ALL_BROWSERS;
  const filtered = input.filter((b): b is BrowserId =>
    typeof b === 'string' && (ALL_BROWSERS as string[]).includes(b)
  );
  return filtered.length ? filtered : ALL_BROWSERS;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'zozimusValidator.sidebar';
  private view?: vscode.WebviewView;
  private lastReport?: ValidationReport;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: PolicyStore
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((msg) => this.onMessage(msg));
    this.postState();
  }

  private postState(): void {
    if (!this.view) return;
    const policies = this.store.loadAll().map((p) => ({
      browser: p.browser,
      source: p.source,
      lastUpdated: p.lastUpdated,
      count: p.policies.length
    }));
    const custom = this.store.loadCustom().definitions;
    this.view.webview.postMessage({
      type: 'state',
      policies,
      custom,
      report: this.lastReport,
      aiPrompt: this.lastReport ? buildAiPrompt(this.lastReport) : '',
      humanReport: this.lastReport ? buildHumanReport(this.lastReport) : ''
    });
  }

  private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.postState();
        return;
      case 'pickAndValidate':
        await this.pickAndValidate('file', sanitizeBrowsers(msg.browsers));
        return;
      case 'pickFolderAndValidate':
        await this.pickAndValidate('folder', sanitizeBrowsers(msg.browsers));
        return;
      case 'refreshPolicies': {
        const result = await refreshAll(this.store);
        const changed = Object.entries(result).filter(([, v]) => v.changed).map(([k]) => k);
        if (changed.length) {
          vscode.window.showInformationMessage(`Zozimus: Source pages changed for ${changed.join(', ')}. Review your policy JSON.`);
        } else {
          vscode.window.showInformationMessage('Zozimus: Policies refreshed. No source changes detected.');
        }
        this.postState();
        return;
      }
      case 'addCustom': {
        const def = msg.definition as Omit<CustomDefinition, 'id' | 'createdAt'>;
        if (!def.browser || !def.failureMessage) return;
        const file = this.store.loadCustom();
        file.definitions.push({
          ...def,
          id: 'custom.' + Date.now().toString(36),
          createdAt: new Date().toISOString()
        });
        this.store.saveCustom(file);
        this.postState();
        return;
      }
      case 'deleteCustom': {
        const id = msg.id as string;
        const file = this.store.loadCustom();
        file.definitions = file.definitions.filter((d) => d.id !== id);
        this.store.saveCustom(file);
        this.postState();
        return;
      }
      case 'copyAiPrompt':
        if (this.lastReport) {
          await vscode.env.clipboard.writeText(buildAiPrompt(this.lastReport));
          vscode.window.showInformationMessage('Zozimus: AI prompt copied to clipboard.');
        }
        return;
      case 'saveReport':
        if (this.lastReport) {
          const uri = await vscode.window.showSaveDialog({
            filters: { 'Text Report': ['txt'], 'JSON': ['json'] },
            defaultUri: vscode.Uri.file(`zozimus-report-${Date.now()}.txt`)
          });
          if (uri) {
            const content = uri.fsPath.endsWith('.json')
              ? JSON.stringify(this.lastReport, null, 2)
              : buildHumanReport(this.lastReport);
            fs.writeFileSync(uri.fsPath, content, 'utf8');
            vscode.window.showInformationMessage('Zozimus: Report saved.');
          }
        }
        return;
      case 'openExternal':
        vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
        return;
    }
  }

  private async pickAndValidate(mode: 'file' | 'folder', browsers: BrowserId[]): Promise<void> {
    const uri = await vscode.window.showOpenDialog(
      mode === 'folder'
        ? {
            canSelectMany: false,
            canSelectFiles: false,
            canSelectFolders: true,
            openLabel: 'Validate folder'
          }
        : {
            canSelectMany: false,
            canSelectFiles: true,
            canSelectFolders: false,
            filters: { 'Extension Package': ['zip', 'crx', 'xpi'] },
            openLabel: 'Validate package'
          }
    );
    if (!uri || !uri[0]) return;
    try {
      const policyFiles = this.store.loadAll();
      const customDefinitions = this.store.loadCustom().definitions;
      this.lastReport = validatePackage({
        packagePath: uri[0].fsPath,
        policyFiles,
        customDefinitions,
        browsers
      });
      this.postState();
    } catch (err) {
      vscode.window.showErrorMessage(`Zozimus: Failed to validate — ${(err as Error).message}`);
    }
  }

  public async runValidationOnPath(packagePath: string, browsers: BrowserId[] = ALL_BROWSERS): Promise<void> {
    const policyFiles = this.store.loadAll();
    const customDefinitions = this.store.loadCustom().definitions;
    this.lastReport = validatePackage({ packagePath, policyFiles, customDefinitions, browsers });
    this.postState();
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;`;
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>${getStyles()}</style>
</head>
<body>
  <header class="zoz-header">
    <div class="zoz-title">Browser Extension Validator</div>
    <div class="zoz-sub">Edge · Chrome · Firefox · Safari</div>
  </header>

  <nav class="zoz-tabs">
    <button class="zoz-tab active" data-tab="validate">Validate</button>
    <button class="zoz-tab" data-tab="policies">Policies</button>
    <button class="zoz-tab" data-tab="custom">Custom</button>
    <button class="zoz-tab" data-tab="about">About</button>
  </nav>

  <section id="tab-validate" class="zoz-pane active">
    <div class="zoz-browser-picker">
      <div class="zoz-picker-label">Validate against:</div>
      <label class="zoz-chip"><input type="checkbox" class="zoz-browser" value="edge" checked> Edge</label>
      <label class="zoz-chip"><input type="checkbox" class="zoz-browser" value="chrome" checked> Chrome</label>
      <label class="zoz-chip"><input type="checkbox" class="zoz-browser" value="firefox" checked> Firefox</label>
      <label class="zoz-chip"><input type="checkbox" class="zoz-browser" value="safari" checked> Safari</label>
      <button id="btn-browser-all" class="zoz-link">All</button>
      <button id="btn-browser-none" class="zoz-link">None</button>
    </div>
    <div class="zoz-row">
      <button id="btn-validate" class="zoz-primary">Select package file…</button>
      <button id="btn-validate-folder" class="zoz-secondary">Select folder…</button>
    </div>
    <div class="zoz-hint">Pick a <code>.zip</code>/<code>.crx</code>/<code>.xpi</code> package, or a folder containing <code>manifest.json</code>.</div>
    <div id="result" class="zoz-result hidden"></div>
    <div id="report" class="zoz-report hidden"></div>
    <div id="prompt-wrap" class="hidden">
      <div class="zoz-row">
        <h3>AI auto-fix prompt</h3>
        <button id="btn-copy-prompt" class="zoz-secondary">Copy</button>
        <button id="btn-save-report" class="zoz-secondary">Save report…</button>
      </div>
      <textarea id="ai-prompt" readonly></textarea>
    </div>
  </section>

  <section id="tab-policies" class="zoz-pane">
    <button id="btn-refresh" class="zoz-primary">Refresh now</button>
    <div id="policy-list"></div>
  </section>

  <section id="tab-custom" class="zoz-pane">
    <h3>Add custom failure definition</h3>
    <label>Browser
      <select id="cust-browser">
        <option value="all">All</option>
        <option value="edge">Edge</option>
        <option value="chrome">Chrome</option>
        <option value="firefox">Firefox</option>
        <option value="safari">Safari</option>
      </select>
    </label>
    <label>Failure message (as written by the review team)
      <input id="cust-msg" type="text" placeholder="e.g. Your extension uses remote code in background.js" />
    </label>
    <label>Optional regex pattern to detect this in source
      <input id="cust-pattern" type="text" placeholder="e.g. fetch\\(['\\\"]https?://" />
    </label>
    <label>Optional probable fix
      <input id="cust-fix" type="text" placeholder="e.g. Bundle the script locally" />
    </label>
    <button id="btn-add-custom" class="zoz-primary">Add definition</button>
    <h3><a href="#" data-link="https://github.com/zozimustechnologies/ExtensionValidator/blob/main/policies/custom-definitions.json">Existing definitions</a></h3>
    <div id="custom-list"></div>
  </section>

  <section id="tab-about" class="zoz-pane">
    <div class="zoz-brand-card">
      <div class="zoz-title">Zozimus Technologies</div>
      <p>Open-source tooling for browser extension developers.</p>
      <p><a href="#" data-link="https://github.com/zozimustechnologies">github.com/zozimustechnologies</a></p>
      <button id="btn-donate" class="zoz-donate">♥ Donate</button>
      <p class="zoz-copy">© Zozimus Technologies</p>
    </div>
  </section>

  <script nonce="${nonce}">${getScript()}</script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

function getStyles(): string {
  return `
:root {
  --zoz-grad: linear-gradient(135deg, #3d7ea6 0%, #1a4a6e 100%);
  --zoz-accent: #3d7ea6;
  --zoz-dark: #1a4a6e;
  --zoz-red: #d93025;
  --zoz-pass: #1e8e3e;
  --zoz-fail: #d93025;
}
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); margin: 0; padding: 0; font-size: 13px; }
.hidden { display: none !important; }
.zoz-header { background: var(--zoz-grad); color: white; padding: 12px; }
.zoz-title { font-weight: 700; font-size: 14px; }
.zoz-sub { font-size: 11px; opacity: 0.9; }
.zoz-tabs { display: flex; border-bottom: 1px solid var(--vscode-panel-border); }
.zoz-tab { flex: 1; background: transparent; color: var(--vscode-foreground); border: none; padding: 8px 4px; cursor: pointer; font-size: 12px; border-bottom: 2px solid transparent; }
.zoz-tab.active { border-bottom-color: var(--zoz-accent); font-weight: 600; }
.zoz-pane { display: none; padding: 12px; }
.zoz-pane.active { display: block; }
.zoz-primary { background: var(--zoz-grad); color: white; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-weight: 600; }
.zoz-secondary { background: transparent; color: var(--zoz-accent); border: 1px solid var(--zoz-accent); padding: 4px 10px; border-radius: 4px; cursor: pointer; margin-left: 6px; }
.zoz-donate { background: var(--zoz-red); color: white; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-weight: 700; margin-top: 8px; }
.zoz-result { margin-top: 12px; padding: 10px; border-radius: 6px; font-weight: 700; text-align: center; font-size: 14px; }
.zoz-result.pass { background: rgba(30,142,62,0.15); color: var(--zoz-pass); border: 1px solid var(--zoz-pass); }
.zoz-result.fail { background: rgba(217,48,37,0.15); color: var(--zoz-fail); border: 1px solid var(--zoz-fail); }
.zoz-report { margin-top: 10px; max-height: 280px; overflow: auto; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
.zoz-finding { padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); font-size: 12px; }
.zoz-finding .sev { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; margin-right: 6px; }
.sev.error { background: var(--zoz-fail); color: white; }
.sev.warning { background: #e8a317; color: white; }
.sev.info { background: var(--zoz-accent); color: white; }
.zoz-finding .loc { color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); font-size: 11px; }
.zoz-finding .fix { color: var(--vscode-descriptionForeground); margin-top: 2px; }
.zoz-row { display: flex; align-items: center; gap: 6px; margin: 10px 0 4px; }
.zoz-row h3 { margin: 0; flex: 1; font-size: 12px; }
.zoz-hint { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 6px; }
.zoz-hint code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; }
textarea { width: 100%; height: 180px; box-sizing: border-box; font-family: var(--vscode-editor-font-family); font-size: 11px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 6px; }
label { display: block; margin: 8px 0; font-size: 11px; color: var(--vscode-descriptionForeground); }
input, select { width: 100%; box-sizing: border-box; padding: 4px 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 3px; }
.zoz-policy { padding: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin-top: 8px; }
.zoz-policy .name { font-weight: 700; text-transform: capitalize; }
.zoz-policy .meta { font-size: 11px; color: var(--vscode-descriptionForeground); }
.zoz-custom-item { padding: 6px 8px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin-top: 6px; font-size: 12px; }
.zoz-custom-item button { float: right; background: transparent; color: var(--zoz-fail); border: none; cursor: pointer; }
.zoz-brand-card { background: var(--zoz-grad); color: white; padding: 16px; border-radius: 8px; text-align: center; }
.zoz-brand-card a { color: white; text-decoration: underline; }
.zoz-copy { font-size: 10px; opacity: 0.85; margin-top: 12px; }
h3 { font-size: 12px; margin: 12px 0 6px; }
.zoz-browser-picker { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px; }
.zoz-picker-label { font-size: 11px; font-weight: 600; margin-right: 4px; }
.zoz-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border: 1px solid var(--vscode-panel-border); border-radius: 12px; cursor: pointer; font-size: 11px; }
.zoz-chip input { width: auto; margin: 0; }
.zoz-link { background: transparent; color: var(--zoz-accent); border: none; cursor: pointer; font-size: 11px; padding: 0 4px; text-decoration: underline; }
`;
}

function getScript(): string {
  return `
const vscode = acquireVsCodeApi();
const tabs = document.querySelectorAll('.zoz-tab');
const panes = document.querySelectorAll('.zoz-pane');
tabs.forEach(t => t.addEventListener('click', () => {
  tabs.forEach(x => x.classList.remove('active'));
  panes.forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById('tab-' + t.dataset.tab).classList.add('active');
}));

function getSelectedBrowsers() {
  return Array.from(document.querySelectorAll('.zoz-browser:checked')).map(cb => cb.value);
}
document.getElementById('btn-browser-all').addEventListener('click', e => {
  e.preventDefault();
  document.querySelectorAll('.zoz-browser').forEach(cb => { cb.checked = true; });
});
document.getElementById('btn-browser-none').addEventListener('click', e => {
  e.preventDefault();
  document.querySelectorAll('.zoz-browser').forEach(cb => { cb.checked = false; });
});

document.getElementById('btn-validate').addEventListener('click', () => vscode.postMessage({ type: 'pickAndValidate', browsers: getSelectedBrowsers() }));
document.getElementById('btn-validate-folder').addEventListener('click', () => vscode.postMessage({ type: 'pickFolderAndValidate', browsers: getSelectedBrowsers() }));
document.getElementById('btn-refresh').addEventListener('click', () => vscode.postMessage({ type: 'refreshPolicies' }));
document.getElementById('btn-copy-prompt').addEventListener('click', () => vscode.postMessage({ type: 'copyAiPrompt' }));
document.getElementById('btn-save-report').addEventListener('click', () => vscode.postMessage({ type: 'saveReport' }));
document.getElementById('btn-donate').addEventListener('click', () => vscode.postMessage({ type: 'openExternal', url: 'https://wise.com/pay/business/sandeepchadda?utm_source=open_link' }));
document.querySelectorAll('[data-link]').forEach(el => el.addEventListener('click', e => {
  e.preventDefault();
  vscode.postMessage({ type: 'openExternal', url: el.dataset.link });
}));

document.getElementById('btn-add-custom').addEventListener('click', () => {
  const definition = {
    browser: document.getElementById('cust-browser').value,
    failureMessage: document.getElementById('cust-msg').value.trim(),
    pattern: document.getElementById('cust-pattern').value.trim() || undefined,
    fix: document.getElementById('cust-fix').value.trim() || undefined
  };
  if (!definition.failureMessage) return;
  vscode.postMessage({ type: 'addCustom', definition });
  document.getElementById('cust-msg').value = '';
  document.getElementById('cust-pattern').value = '';
  document.getElementById('cust-fix').value = '';
});

window.addEventListener('message', evt => {
  const msg = evt.data;
  if (msg.type !== 'state') return;

  // Policies tab
  const list = document.getElementById('policy-list');
  list.innerHTML = '';
  for (const p of msg.policies) {
    const div = document.createElement('div');
    div.className = 'zoz-policy';
    div.innerHTML = '<div class="name">' + p.browser + '</div>'
      + '<div class="meta">' + p.count + ' policies · last updated ' + new Date(p.lastUpdated).toLocaleString() + '</div>'
      + '<div class="meta"><a href="#" data-link="' + p.source + '">source</a></div>';
    div.querySelector('a').addEventListener('click', e => { e.preventDefault(); vscode.postMessage({ type: 'openExternal', url: p.source }); });
    list.appendChild(div);
  }

  // Custom tab
  const cl = document.getElementById('custom-list');
  cl.innerHTML = '';
  for (const d of msg.custom) {
    const div = document.createElement('div');
    div.className = 'zoz-custom-item';
    const safe = (s) => (s || '').replace(/</g, '&lt;');
    div.innerHTML = '<button data-id="' + d.id + '">✕</button>'
      + '<strong>' + d.browser + '</strong>: ' + safe(d.failureMessage)
      + (d.pattern ? '<div class="meta"><code>' + safe(d.pattern) + '</code></div>' : '')
      + (d.fix ? '<div class="meta">Fix: ' + safe(d.fix) + '</div>' : '');
    div.querySelector('button').addEventListener('click', () => vscode.postMessage({ type: 'deleteCustom', id: d.id }));
    cl.appendChild(div);
  }

  // Validation result
  const result = document.getElementById('result');
  const report = document.getElementById('report');
  const promptWrap = document.getElementById('prompt-wrap');
  if (msg.report) {
    result.classList.remove('hidden', 'pass', 'fail');
    result.classList.add(msg.report.passed ? 'pass' : 'fail');
    result.textContent = (msg.report.passed ? '✓ PASS' : '✗ FAIL') + ' — ' + msg.report.findings.length + ' finding(s) across ' + msg.report.totalPolicies + ' policies'
      + ' [' + (msg.report.browsersValidated || []).join(', ') + ']';

    report.classList.remove('hidden');
    report.innerHTML = '';
    for (const f of msg.report.findings) {
      const div = document.createElement('div');
      div.className = 'zoz-finding';
      const safe = (s) => (s || '').replace(/</g, '&lt;');
      div.innerHTML = '<span class="sev ' + f.severity + '">' + f.severity + '</span>'
        + '<strong>' + f.browser + '</strong> · ' + safe(f.title)
        + (f.file ? '<div class="loc">' + safe(f.file) + (f.line ? ':' + f.line : '') + '</div>' : '')
        + (f.snippet ? '<div class="loc">› ' + safe(f.snippet) + '</div>' : '')
        + '<div class="fix">Fix: ' + safe(f.fix) + '</div>';
      report.appendChild(div);
    }

    promptWrap.classList.remove('hidden');
    document.getElementById('ai-prompt').value = msg.aiPrompt;
  }
});

vscode.postMessage({ type: 'ready' });
`;
}
