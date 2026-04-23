import * as https from 'https';
import { BrowserId, PolicyFile } from './types';
import { PolicyStore } from './policyStore';

const SOURCES: Record<BrowserId, string | undefined> = {
  edge: 'https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/store-policies/developer-policies',
  chrome: 'https://developer.chrome.com/docs/webstore/program-policies',
  firefox: 'https://extensionworkshop.com/documentation/publish/add-on-policies/',
  safari: 'https://developer.apple.com/app-store/review/guidelines/',
  custom: undefined
};

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Zozimus-Extension-Validator/0.1' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve, reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

/**
 * Refreshes a single browser's policy file. We do not attempt to fully re-derive
 * machine-checkable rules from natural-language pages — instead we fetch the page,
 * compute a hash, and update `lastUpdated` + `sourceHash`. If the hash changes,
 * the user is notified that store policies may have changed and the seed file
 * should be reviewed.
 */
export async function refreshBrowser(browser: BrowserId, store: PolicyStore): Promise<{ changed: boolean; error?: string }> {
  const url = SOURCES[browser];
  if (!url) return { changed: false };
  const current = store.load(browser);
  try {
    const html = await fetchUrl(url);
    const hash = simpleHash(html);
    const prevHash = (current as PolicyFile & { sourceHash?: string }).sourceHash;
    const changed = prevHash !== hash;
    const updated: PolicyFile & { sourceHash?: string } = {
      ...current,
      source: url,
      lastUpdated: new Date().toISOString(),
      sourceHash: hash
    };
    store.save(browser, updated);
    return { changed };
  } catch (err) {
    return { changed: false, error: (err as Error).message };
  }
}

export async function refreshAll(store: PolicyStore): Promise<Record<BrowserId, { changed: boolean; error?: string }>> {
  const results = {} as Record<BrowserId, { changed: boolean; error?: string }>;
  for (const b of ['edge', 'chrome', 'firefox', 'safari'] as BrowserId[]) {
    results[b] = await refreshBrowser(b, store);
  }
  return results;
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h.toString(16);
}
