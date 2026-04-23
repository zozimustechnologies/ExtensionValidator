import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PolicyStore } from './policyStore';
import { refreshAll } from './policyFetcher';
import { SidebarProvider } from './sidebarProvider';

const LAST_REFRESH_KEY = 'zozimus.lastPolicyRefresh';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function activate(context: vscode.ExtensionContext): void {
  const policiesDir = ensurePoliciesDir(context);
  const store = new PolicyStore(policiesDir);

  const provider = new SidebarProvider(context, store);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zozimus.refreshPolicies', async () => {
      await runScheduledRefresh(context, store, true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zozimus.validatePackage', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.zozimusValidator');
      await provider.runValidationOnPath; // no-op marker; UI handles selection
      vscode.window.showInformationMessage('Zozimus: Use the sidebar "Select extension package…" button.');
    })
  );

  // Schedule periodic refresh
  void runScheduledRefresh(context, store, false);
  const interval = setInterval(() => {
    void runScheduledRefresh(context, store, false);
  }, ONE_DAY_MS);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

export function deactivate(): void {
  /* nothing */
}

function ensurePoliciesDir(context: vscode.ExtensionContext): string {
  // Read seed policies from extension install dir; mirror into globalStorage
  // so user edits / refreshes persist across upgrades.
  const seedDir = path.join(context.extensionPath, 'policies');
  const userDir = path.join(context.globalStorageUri.fsPath, 'policies');
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  for (const file of ['edge-policies.json', 'chrome-policies.json', 'firefox-policies.json', 'safari-policies.json', 'custom-definitions.json']) {
    const dest = path.join(userDir, file);
    const seed = path.join(seedDir, file);
    if (!fs.existsSync(seed)) continue;
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(seed, dest);
      continue;
    }
    // Refresh seed if the bundled file ships more policies than what the user has cached.
    if (file === 'custom-definitions.json') continue;
    try {
      const seedJson = JSON.parse(fs.readFileSync(seed, 'utf8')) as { policies?: unknown[] };
      const destJson = JSON.parse(fs.readFileSync(dest, 'utf8')) as { policies?: unknown[] };
      const seedCount = seedJson.policies?.length ?? 0;
      const destCount = destJson.policies?.length ?? 0;
      if (seedCount > destCount) {
        fs.copyFileSync(seed, dest);
      }
    } catch {
      // If parsing fails, replace with the seed.
      fs.copyFileSync(seed, dest);
    }
  }
  return userDir;
}

async function runScheduledRefresh(context: vscode.ExtensionContext, store: PolicyStore, force: boolean): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('zozimus');
  const auto = cfg.get<boolean>('autoRefresh', true);
  const days = cfg.get<number>('refreshIntervalDays', 30);
  const last = context.globalState.get<number>(LAST_REFRESH_KEY, 0);
  const due = Date.now() - last >= days * ONE_DAY_MS;
  if (!force && (!auto || !due)) return;

  const result = await refreshAll(store);
  await context.globalState.update(LAST_REFRESH_KEY, Date.now());
  const changed = Object.entries(result).filter(([, v]) => v.changed).map(([k]) => k);
  if (force || changed.length) {
    if (changed.length) {
      vscode.window.showInformationMessage(`Zozimus: Store policy pages changed for ${changed.join(', ')}. Review your policy JSON.`);
    } else if (force) {
      vscode.window.showInformationMessage('Zozimus: Policies refreshed. No source changes detected.');
    }
  }
}
