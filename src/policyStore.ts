import * as fs from 'fs';
import * as path from 'path';
import { BrowserId, CustomDefinitionFile, PolicyFile } from './types';

export class PolicyStore {
  constructor(private readonly policiesDir: string) {}

  private fileFor(browser: BrowserId): string {
    return path.join(this.policiesDir, `${browser}-policies.json`);
  }

  load(browser: BrowserId): PolicyFile {
    const file = this.fileFor(browser);
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as PolicyFile;
  }

  save(browser: BrowserId, data: PolicyFile): void {
    const file = this.fileFor(browser);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  }

  loadAll(): PolicyFile[] {
    return (['edge', 'chrome', 'firefox', 'safari'] as BrowserId[]).map((b) => this.load(b));
  }

  loadCustom(): CustomDefinitionFile {
    const file = path.join(this.policiesDir, 'custom-definitions.json');
    if (!fs.existsSync(file)) {
      return { definitions: [] };
    }
    return JSON.parse(fs.readFileSync(file, 'utf8')) as CustomDefinitionFile;
  }

  saveCustom(data: CustomDefinitionFile): void {
    const file = path.join(this.policiesDir, 'custom-definitions.json');
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  }
}
