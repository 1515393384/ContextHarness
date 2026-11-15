const esbuild = require('esbuild');
const path = require('node:path');

const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: [path.join(__dirname, 'src', 'extension.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile: path.join(__dirname, 'dist', 'extension.js'),
    external: ['vscode'],
    sourcemap: true,
    logLevel: 'info',
  });

  if (watch) {
    await ctx.watch();
    console.log('Watching ContextHarness VS Code extension...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
