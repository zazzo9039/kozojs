import path from 'node:path';
import pc from 'picocolors';
import { checkArchitecture, type ArchitectureCheckOptions, type ArchitectureReport } from '../architecture/check.js';

export interface CheckCommandOptions extends ArchitectureCheckOptions { json?: boolean }

export async function checkCommand(options: CheckCommandOptions = {}): Promise<ArchitectureReport> {
  const report = await checkArchitecture(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }
  for (const item of report.findings) {
    const location = `${path.relative(report.root, item.file)}:${item.line}`;
    const label = item.severity === 'error' ? pc.red(item.code) : pc.yellow(item.code);
    console.log(`${label} ${location} ${item.description}`);
    console.log(pc.dim(`  ${item.suggestion}`));
  }
  const summary = `${report.filesChecked} files, ${report.errors} errors, ${report.warnings} warnings`;
  console.log(report.errors > 0 ? pc.red(summary) : pc.green(summary));
  return report;
}
