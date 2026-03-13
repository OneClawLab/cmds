import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
) as { version: string };

const program = new Command();

program
  .name('cmds')
  .description('cmds - Discover linux commands for human and AI')
  .version(packageJson.version);

// TODO: sub-commands will be added here

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
