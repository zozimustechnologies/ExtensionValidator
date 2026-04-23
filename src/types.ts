export type Severity = 'error' | 'warning' | 'info';
export type BrowserId = 'edge' | 'chrome' | 'firefox' | 'safari' | 'custom';

export interface PolicyCheck {
  type: 'fileExists' | 'manifestField' | 'sourcePattern' | 'permissionsBlocklist' | 'manual';
  path?: string;
  field?: string;
  equals?: unknown;
  exists?: boolean;
  minLength?: number;
  maxLength?: number;
  matches?: string;
  mustNotMatch?: string;
  pattern?: string;
  flags?: string;
  blocked?: string[];
}

export interface Policy {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  check: PolicyCheck;
  fix: string;
}

export interface PolicyFile {
  browser: BrowserId;
  source: string;
  lastUpdated: string;
  policies: Policy[];
}

export interface CustomDefinition {
  id: string;
  browser: BrowserId | 'all';
  failureMessage: string;
  pattern?: string;
  flags?: string;
  fix?: string;
  createdAt: string;
}

export interface CustomDefinitionFile {
  definitions: CustomDefinition[];
}

export interface Finding {
  policyId: string;
  browser: BrowserId | 'all';
  severity: Severity;
  title: string;
  message: string;
  file?: string;
  line?: number;
  snippet?: string;
  fix: string;
}

export interface ValidationReport {
  packageName: string;
  validatedAt: string;
  totalPolicies: number;
  passed: boolean;
  findings: Finding[];
  perBrowser: Record<string, { errors: number; warnings: number; info: number }>;
  browsersValidated: BrowserId[];
}
