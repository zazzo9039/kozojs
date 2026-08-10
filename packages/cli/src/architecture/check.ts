import fs from 'fs-extra';
import path from 'node:path';
import { glob } from 'glob';
import ts from 'typescript';

export type FindingSeverity = 'error' | 'warning';

export interface ArchitectureFinding {
  code: string;
  severity: FindingSeverity;
  file: string;
  line: number;
  description: string;
  suggestion: string;
  documentation: string;
}

export interface ArchitectureCheckOptions {
  cwd?: string;
  architecture?: boolean;
  contracts?: boolean;
}

export interface ArchitectureReport {
  root: string;
  filesChecked: number;
  findings: ArchitectureFinding[];
  errors: number;
  warnings: number;
}

const DOCS = 'https://kozojs.dev/docs/architecture-check';
const ROUTE_FILE = /\.routes\.tsx?$/;
const SERVICE_FILE = /\.service\.tsx?$/;
const CONTRACT_FILE = /\.contract\.tsx?$/;
const CONFIG_FILE = /(?:^|[\\/])(config|bootstrap|env)(?:[.\\/]|$)/i;
const PERSISTENCE_IMPORT = /(?:prisma|drizzle(?:-orm)?|sequelize|typeorm|mongoose|better-sqlite3|mysql2|postgres|pg)(?:\/|$)/i;
const TRANSPORT_IMPORT = /(?:^|\/)(?:hono)(?:\/|$)|@kozojs\/core/i;

function finding(
  source: ts.SourceFile,
  node: ts.Node,
  code: string,
  severity: FindingSeverity,
  description: string,
  suggestion: string,
): ArchitectureFinding {
  return {
    code,
    severity,
    file: source.fileName,
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    description,
    suggestion,
    documentation: `${DOCS}#${code.toLowerCase()}`,
  };
}

function importText(node: ts.ImportDeclaration): string | undefined {
  return ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined;
}

function isDeepFeatureImport(fileName: string, specifier: string): boolean {
  if (!specifier.startsWith('.')) return false;
  const normalized = fileName.replace(/\\/g, '/');
  const match = /\/modules\/([^/]+)\//.exec(normalized);
  if (!match) return false;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(normalized), specifier));
  const target = /\/modules\/([^/]+)\/(.+)$/.exec(resolved);
  return Boolean(target && target[1] !== match[1] && !/(?:^|\/)index(?:\.[cm]?[jt]s)?$/.test(target[2]!));
}

function hasResponseProperty(node: ts.CallExpression): boolean {
  const schema = node.arguments[1];
  return Boolean(schema && ts.isObjectLiteralExpression(schema) && schema.properties.some((property) =>
    property.name?.getText() === 'response'));
}

function inspectSource(source: ts.SourceFile, options: ArchitectureCheckOptions): ArchitectureFinding[] {
  const out: ArchitectureFinding[] = [];
  const relative = source.fileName.replace(/\\/g, '/');
  const architecture = options.architecture !== false;
  const contracts = options.contracts !== false;

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const specifier = importText(node);
      if (specifier && architecture && ROUTE_FILE.test(relative) && PERSISTENCE_IMPORT.test(specifier)) {
        out.push(finding(source, node, 'KOZO_ARCH001', 'error',
          `Persistence dependency "${specifier}" is imported by a route.`,
          'Move persistence access behind an injected service or repository.'));
      }
      if (specifier && architecture && SERVICE_FILE.test(relative) && TRANSPORT_IMPORT.test(specifier)) {
        const clause = node.importClause?.getText(source) ?? '';
        if (/KozoContext|\bContext\b|\bResponse\b/.test(clause) || specifier.startsWith('hono')) {
          out.push(finding(source, node, 'KOZO_ARCH002', 'error',
            `Transport type is imported by a service from "${specifier}".`,
            'Pass plain typed values to the service and keep HTTP adaptation in routes.'));
        }
      }
      if (specifier && architecture && isDeepFeatureImport(relative, specifier)) {
        out.push(finding(source, node, 'KOZO_ARCH004', 'error',
          `Deep import crosses a feature boundary: "${specifier}".`,
          'Export the dependency from the target feature index.ts and import that public barrel.'));
      }
    }

    if (contracts && CONTRACT_FILE.test(relative) && ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'any'
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'z') {
      out.push(finding(source, node, 'KOZO_ARCH003', 'error',
        'Public contract uses z.any().', 'Replace it with a concrete schema or a documented z.unknown() boundary.'));
    }

    if (architecture && !CONFIG_FILE.test(relative) && ts.isPropertyAccessExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'process'
      && node.expression.name.text === 'env') {
      out.push(finding(source, node, 'KOZO_ARCH005', 'error',
        'Environment is read outside a config/bootstrap module.',
        'Validate environment in config and inject an immutable value.'));
    }

    if (contracts && ROUTE_FILE.test(relative) && ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ['get', 'post', 'put', 'patch', 'delete'].includes(node.expression.name.text)
      && node.arguments.length >= 2 && !hasResponseProperty(node)) {
      out.push(finding(source, node, 'KOZO_ARCH102', 'warning',
        'Public route does not declare a response map.',
        'Declare concrete status-to-schema responses for OpenAPI and typed clients.'));
    }

    if (contracts && CONTRACT_FILE.test(relative) && ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'unknown') {
      const line = source.getFullText().slice(node.getFullStart(), node.getEnd());
      if (!/\/\/|\/\*/.test(line)) {
        out.push(finding(source, node, 'KOZO_ARCH103', 'warning',
          'z.unknown() has no nearby justification.',
          'Add a comment describing the untyped boundary or use a concrete schema.'));
      }
    }

    if (contracts && CONTRACT_FILE.test(relative) && ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'date'
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'z') {
      out.push(finding(source, node, 'KOZO_ARCH104', 'warning',
        'Public contract uses z.date().',
        'Represent wire dates as ISO 8601 z.string(); preprocess Date values before validation if needed.'));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (architecture && ROUTE_FILE.test(relative)
    && /createRouter\s*</.test(source.text)
    && !/export\s+(?:const|let|var|default)/.test(source.text)) {
    out.push(finding(source, source, 'KOZO_ARCH006', 'error',
      'Static route contract is not exported.',
      'Export the router and mount it from the application composition root.'));
  }

  if (source.getLineStarts().length > 250 && (ROUTE_FILE.test(relative) || SERVICE_FILE.test(relative))) {
    out.push(finding(source, source, 'KOZO_ARCH101', 'warning',
      `File has ${source.getLineStarts().length} lines.`,
      'Split cohesive responsibilities before the module becomes difficult to test.'));
  }
  return out;
}

async function inspectPackageScripts(root: string): Promise<ArchitectureFinding[]> {
  const manifestPath = path.join(root, 'package.json');
  if (!await fs.pathExists(manifestPath)) return [];
  const manifest = await fs.readJSON(manifestPath) as { scripts?: Record<string, string> };
  const missing = ['typecheck', 'test'].filter((name) => !manifest.scripts?.[name]);
  if (missing.length === 0) return [];
  const source = ts.createSourceFile(manifestPath, await fs.readFile(manifestPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSON);
  return [finding(source, source, 'KOZO_ARCH007', 'error',
    `Project is missing required script(s): ${missing.join(', ')}.`,
    'Add runnable typecheck and test scripts to the project manifest.')];
}

export async function checkArchitecture(options: ArchitectureCheckOptions = {}): Promise<ArchitectureReport> {
  const root = path.resolve(options.cwd ?? process.cwd());
  const files = await glob(['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}'], {
    cwd: root,
    absolute: true,
    nodir: true,
    ignore: ['**/node_modules/**', '**/lib/**', '**/dist/**'],
  });
  const findings: ArchitectureFinding[] = [];
  for (const file of files.sort()) {
    const text = await fs.readFile(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    findings.push(...inspectSource(source, options));
  }
  findings.push(...await inspectPackageScripts(root));
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
  return {
    root,
    filesChecked: files.length,
    findings,
    errors: findings.filter((item) => item.severity === 'error').length,
    warnings: findings.filter((item) => item.severity === 'warning').length,
  };
}
