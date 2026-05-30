import pc from 'picocolors';
import { execa } from 'execa';
import path from 'node:path';
import { copyTemplate, isTemplateName, TEMPLATE_NAMES, type TemplateName } from '../utils/copy-template.js';
import { printLogo } from '../utils/ascii-art.js';

export async function initFromTemplate(
  projectName: string,
  template: TemplateName,
  install = true,
): Promise<void> {
  printLogo();
  console.log(pc.bold(pc.red('🔥 Create a new Kozo project')));
  console.log(pc.dim(`Template: ${template}\n`));

  const dest = path.resolve(process.cwd(), projectName);
  await copyTemplate(template, dest, projectName);

  console.log(pc.green('✓ Project created at'), dest);

  if (install) {
    try {
      await execa('pnpm', ['install'], { cwd: dest, stdio: 'inherit' });
    } catch {
      console.log(pc.yellow('Run `pnpm install` manually in the project directory.'));
    }
  }

  console.log(`
${pc.bold('Next steps:')}

  ${pc.cyan(`cd ${projectName}`)}
  ${!install ? pc.cyan('pnpm install') + '\n  ' : ''}${pc.cyan('pnpm dev')}

${pc.dim('List routes:')} ${pc.cyan('kozo routes')}
${pc.dim('Generate client:')} ${pc.cyan('kozo gen:client')}
`);
}

export { TEMPLATE_NAMES, isTemplateName };
