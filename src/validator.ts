import * as path from 'path';
import * as fs from 'fs';
import AdmZip from 'adm-zip';
import { BrowserId, CustomDefinition, Finding, Policy, PolicyFile, ValidationReport } from './types';

interface PackageFile {
  path: string;
  content: string;
}

interface LoadedPackage {
  name: string;
  manifest: Record<string, unknown> | null;
  files: PackageFile[];
}

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.json', '.html', '.htm', '.css', '.txt', '.md']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.vscode', 'out', 'dist', 'build', '.cache']);
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB per text file

export function loadPackage(packagePath: string): LoadedPackage {
  const stat = fs.statSync(packagePath);
  return stat.isDirectory() ? loadFromDirectory(packagePath) : loadFromZip(packagePath);
}

function loadFromZip(packagePath: string): LoadedPackage {
  const zip = new AdmZip(packagePath);
  const entries = zip.getEntries();
  const files: PackageFile[] = [];
  let manifest: Record<string, unknown> | null = null;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const ext = path.extname(entry.entryName).toLowerCase();
    if (entry.entryName.toLowerCase().endsWith('manifest.json')) {
      try {
        const text = entry.getData().toString('utf8');
        manifest = JSON.parse(text) as Record<string, unknown>;
        files.push({ path: entry.entryName, content: text });
      } catch {
        files.push({ path: entry.entryName, content: entry.getData().toString('utf8') });
      }
      continue;
    }
    if (TEXT_EXTENSIONS.has(ext)) {
      files.push({ path: entry.entryName, content: entry.getData().toString('utf8') });
    }
  }

  return { name: path.basename(packagePath), manifest, files };
}

function loadFromDirectory(rootDir: string): LoadedPackage {
  const files: PackageFile[] = [];
  let manifest: Record<string, unknown> | null = null;

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(rootDir, abs).split(path.sep).join('/');
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(abs);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      const isManifest = e.name.toLowerCase() === 'manifest.json';
      if (!isManifest && !TEXT_EXTENSIONS.has(ext)) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }
      if (stat.size > MAX_FILE_BYTES) continue;
      let content: string;
      try {
        content = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      if (isManifest && manifest === null) {
        try {
          manifest = JSON.parse(content) as Record<string, unknown>;
        } catch {
          // leave manifest null; manifest checks will flag it
        }
      }
      files.push({ path: rel, content });
    }
  };

  walk(rootDir);
  return { name: path.basename(rootDir), manifest, files };
}

function getField(obj: Record<string, unknown> | null, field: string): unknown {
  if (!obj) return undefined;
  return obj[field];
}

function findLineForPattern(content: string, regex: RegExp): { line: number; snippet: string } | null {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      regex.lastIndex = 0;
      return { line: i + 1, snippet: lines[i].trim().slice(0, 200) };
    }
    regex.lastIndex = 0;
  }
  return null;
}

function findManifestLine(manifestText: string | undefined, field: string): number | undefined {
  if (!manifestText) return undefined;
  const lines = manifestText.split(/\r?\n/);
  const re = new RegExp('"' + field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*:');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return undefined;
}

function checkPolicy(policy: Policy, browser: BrowserId, pkg: LoadedPackage): Finding[] {
  const findings: Finding[] = [];
  const manifestText = pkg.files.find((f) => f.path.toLowerCase().endsWith('manifest.json'))?.content;
  const manifestPath = pkg.files.find((f) => f.path.toLowerCase().endsWith('manifest.json'))?.path ?? 'manifest.json';
  const c = policy.check;

  const push = (message: string, file?: string, line?: number, snippet?: string) =>
    findings.push({
      policyId: policy.id,
      browser,
      severity: policy.severity,
      title: policy.title,
      message,
      file,
      line,
      snippet,
      fix: policy.fix
    });

  switch (c.type) {
    case 'fileExists': {
      const target = (c.path ?? '').toLowerCase();
      const found = pkg.files.some((f) => f.path.toLowerCase() === target || f.path.toLowerCase().endsWith('/' + target));
      if (!found) push(`Required file "${c.path}" not found in package.`);
      break;
    }
    case 'manifestField': {
      if (!pkg.manifest) {
        push('Manifest is missing or invalid; cannot evaluate field check.', manifestPath);
        break;
      }
      const value = getField(pkg.manifest, c.field ?? '');
      const line = findManifestLine(manifestText, c.field ?? '');
      if (c.exists && (value === undefined || value === null || value === '')) {
        push(`Required field "${c.field}" is missing from manifest.json.`, manifestPath, line);
        break;
      }
      if (c.equals !== undefined && value !== c.equals) {
        push(`Field "${c.field}" must equal ${JSON.stringify(c.equals)} but is ${JSON.stringify(value)}.`, manifestPath, line);
      }
      if (typeof value === 'string') {
        if (c.minLength !== undefined && value.length < c.minLength) {
          push(`Field "${c.field}" is too short (${value.length} < ${c.minLength}).`, manifestPath, line);
        }
        if (c.maxLength !== undefined && value.length > c.maxLength) {
          push(`Field "${c.field}" is too long (${value.length} > ${c.maxLength}).`, manifestPath, line);
        }
        if (c.matches && !new RegExp(c.matches).test(value)) {
          push(`Field "${c.field}" value "${value}" does not match required pattern ${c.matches}.`, manifestPath, line);
        }
        if (c.mustNotMatch && new RegExp(c.mustNotMatch).test(value)) {
          push(`Field "${c.field}" value "${value}" contains disallowed pattern ${c.mustNotMatch}.`, manifestPath, line);
        }
      }
      break;
    }
    case 'sourcePattern': {
      if (!c.pattern) break;
      const regex = new RegExp(c.pattern, c.flags ?? 'g');
      for (const f of pkg.files) {
        if (f.path.toLowerCase().endsWith('manifest.json')) continue;
        const ext = path.extname(f.path).toLowerCase();
        if (!['.js', '.mjs', '.cjs', '.html', '.htm'].includes(ext)) continue;
        const hit = findLineForPattern(f.content, new RegExp(regex.source, regex.flags));
        if (hit) push(`Disallowed pattern matched in source.`, f.path, hit.line, hit.snippet);
      }
      break;
    }
    case 'permissionsBlocklist': {
      if (!pkg.manifest) break;
      const perms = ([] as string[])
        .concat((pkg.manifest['permissions'] as string[]) ?? [])
        .concat((pkg.manifest['host_permissions'] as string[]) ?? []);
      const blocked = (c.blocked ?? []).filter((b) => perms.includes(b));
      if (blocked.length) {
        const line = findManifestLine(manifestText, 'permissions');
        push(`Sensitive permissions requested: ${blocked.join(', ')}.`, manifestPath, line);
      }
      break;
    }
    case 'manual':
      // manual checks emit an info-level reminder
      push('Manual review required for this policy.');
      break;
  }

  return findings;
}

function checkCustomDefinition(def: CustomDefinition, pkg: LoadedPackage): Finding[] {
  const findings: Finding[] = [];
  const push = (file?: string, line?: number, snippet?: string) =>
    findings.push({
      policyId: def.id,
      browser: def.browser,
      severity: 'error',
      title: `Custom rule (${def.browser}): ${def.failureMessage}`,
      message: def.failureMessage,
      file,
      line,
      snippet,
      fix: def.fix ?? 'Address the custom failure message above.'
    });

  if (def.pattern) {
    let regex: RegExp;
    try {
      regex = new RegExp(def.pattern, def.flags ?? 'gi');
    } catch {
      return findings;
    }
    for (const f of pkg.files) {
      const hit = findLineForPattern(f.content, new RegExp(regex.source, regex.flags));
      if (hit) push(f.path, hit.line, hit.snippet);
    }
  } else {
    // Pattern-less rule: search the failure message itself across the package
    const escaped = def.failureMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    for (const f of pkg.files) {
      const hit = findLineForPattern(f.content, regex);
      if (hit) push(f.path, hit.line, hit.snippet);
    }
  }
  return findings;
}

export interface ValidateInput {
  packagePath: string;
  policyFiles: PolicyFile[];
  customDefinitions: CustomDefinition[];
  browsers?: BrowserId[];
}

export function validatePackage(input: ValidateInput): ValidationReport {
  const pkg = loadPackage(input.packagePath);
  const findings: Finding[] = [];
  let totalPolicies = 0;
  const perBrowser: ValidationReport['perBrowser'] = {};
  const requested = input.browsers && input.browsers.length ? input.browsers : null;
  const filter = requested ? new Set<BrowserId>(requested) : null;
  const browsersValidated: BrowserId[] = requested
    ? requested.slice()
    : input.policyFiles.map((p) => p.browser);

  for (const pf of input.policyFiles) {
    if (filter && !filter.has(pf.browser)) continue;
    perBrowser[pf.browser] = { errors: 0, warnings: 0, info: 0 };
    for (const policy of pf.policies) {
      totalPolicies++;
      const policyFindings = checkPolicy(policy, pf.browser, pkg);
      for (const f of policyFindings) {
        findings.push(f);
        if (f.severity === 'error') perBrowser[pf.browser].errors++;
        else if (f.severity === 'warning') perBrowser[pf.browser].warnings++;
        else perBrowser[pf.browser].info++;
      }
    }
  }

  perBrowser['custom'] = { errors: 0, warnings: 0, info: 0 };
  for (const def of input.customDefinitions) {
    // Strict filter: only run a custom definition if its browser tag matches a selected one.
    // 'all'-tagged defs run only when no filter is applied (i.e. user picked every browser explicitly or none).
    if (filter) {
      if (def.browser === 'all') continue;
      if (!filter.has(def.browser as BrowserId)) continue;
    }
    totalPolicies++;
    const customFindings = checkCustomDefinition(def, pkg);
    for (const f of customFindings) {
      findings.push(f);
      perBrowser['custom'].errors++;
    }
  }

  const passed = findings.every((f) => f.severity !== 'error');

  return {
    packageName: pkg.name,
    validatedAt: new Date().toISOString(),
    totalPolicies,
    passed,
    findings,
    perBrowser,
    browsersValidated
  };
}
