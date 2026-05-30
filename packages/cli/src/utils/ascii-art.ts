import pc from 'picocolors';

export const KOZO_LOGO = `
${pc.red(' _  __')}${pc.yellow('___ ')}${pc.red('______')}${pc.yellow('___ ')}
${pc.red('| |/ /')}${pc.yellow(' _ \\\\')}${pc.red('|_  /')}${pc.yellow(' _ \\\\')}
${pc.red("| ' /")}${pc.yellow(' (_) |')}${pc.red('/ /')}${pc.yellow(' (_) |')}
${pc.red('|_|\\_\\\\')}${pc.yellow('___/')}${pc.red('___|\\\\')}${pc.yellow('___/')}
`;

export const KOZO_BANNER = `
${pc.bold(pc.red('🔥 KOZO'))} ${pc.dim('- The Structure for the Edge')}
`;

export function printLogo() {
  console.log(KOZO_LOGO);
}

export function printBanner() {
  console.log(KOZO_BANNER);
}
