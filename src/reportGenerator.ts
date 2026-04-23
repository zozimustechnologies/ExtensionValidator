import { ValidationReport } from './types';

export function buildAiPrompt(report: ValidationReport): string {
  const errors = report.findings.filter((f) => f.severity === 'error');
  const warnings = report.findings.filter((f) => f.severity === 'warning');
  const lines: string[] = [];

  lines.push('You are a senior browser-extension engineer. Fix every violation below in my extension package so it passes the targeted store review.');
  lines.push('');
  lines.push(`Package: ${report.packageName}`);
  lines.push(`Status: ${report.passed ? 'PASS' : 'FAIL'}`);
  lines.push(`Browsers validated: ${report.browsersValidated.join(', ')}`);
  lines.push(`Total policies evaluated: ${report.totalPolicies}`);
  lines.push(`Errors: ${errors.length}, Warnings: ${warnings.length}`);
  lines.push('');
  lines.push('For each finding, output:');
  lines.push('  1. The exact file and line.');
  lines.push('  2. The corrected code (full replacement block).');
  lines.push('  3. A one-line rationale citing the policy id.');
  lines.push('');
  lines.push('--- FINDINGS ---');

  const grouped = new Map<string, typeof report.findings>();
  for (const f of report.findings) {
    const key = `${f.browser}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(f);
  }

  for (const [browser, items] of grouped) {
    lines.push('');
    lines.push(`### ${browser.toUpperCase()} (${items.length} finding${items.length === 1 ? '' : 's'})`);
    for (const f of items) {
      lines.push('');
      lines.push(`- [${f.severity.toUpperCase()}] ${f.policyId} — ${f.title}`);
      if (f.file) lines.push(`  File: ${f.file}${f.line ? `:${f.line}` : ''}`);
      if (f.snippet) lines.push(`  Code: ${f.snippet}`);
      lines.push(`  Issue: ${f.message}`);
      lines.push(`  Probable fix: ${f.fix}`);
    }
  }

  lines.push('');
  lines.push('--- END FINDINGS ---');
  lines.push('');
  lines.push('Return the patched files as fenced code blocks tagged with their path.');
  return lines.join('\n');
}

export function buildHumanReport(report: ValidationReport): string {
  const lines: string[] = [];
  lines.push(`Validation Report — ${report.packageName}`);
  lines.push(`Generated: ${report.validatedAt}`);
  lines.push(`Browsers validated: ${report.browsersValidated.join(', ')}`);
  lines.push(`Result: ${report.passed ? 'PASS' : 'FAIL'}`);
  lines.push('');
  lines.push('Per-browser summary:');
  for (const [browser, counts] of Object.entries(report.perBrowser)) {
    lines.push(`  ${browser.padEnd(8)} errors=${counts.errors} warnings=${counts.warnings} info=${counts.info}`);
  }
  lines.push('');
  lines.push('Findings:');
  for (const f of report.findings) {
    lines.push(`- [${f.severity}] ${f.browser} :: ${f.policyId} :: ${f.title}`);
    if (f.file) lines.push(`    at ${f.file}${f.line ? `:${f.line}` : ''}`);
    if (f.snippet) lines.push(`    > ${f.snippet}`);
    lines.push(`    fix: ${f.fix}`);
  }
  return lines.join('\n');
}
