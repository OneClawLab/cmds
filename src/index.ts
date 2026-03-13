import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { routeQuery } from './router.js';
import { search } from './search.js';
import { resolveInfo, CommandNotFoundError } from './info.js';
import { listSummary, listByCategory, CategoryNotFoundError } from './list.js';
import { scan } from './scanner.js';
import { loadRuntimeIndex, loadTldrIndex } from './data.js';
import { format, shouldOutputJson } from './formatter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
) as { version: string };

const program = new Command();

program
  .name('cmds')
  .description('cmds - Discover linux commands for human and AI')
  .version(packageJson.version);

// Configure commander to exit with code 2 on argument/usage errors
program.exitOverride();
program.configureOutput({
  writeErr: (str) => process.stderr.write(str),
  writeOut: (str) => process.stdout.write(str),
});

// --- Default command (smart router) ---
program
  .argument('[query]', 'search query or command name')
  .option('--limit <n>', 'max results', '5')
  .option('--json', 'JSON output')
  .action(async (query: string | undefined, opts: { limit: string; json?: boolean }) => {
    if (!query) {
      program.outputHelp();
      process.exitCode = 0;
      return;
    }

    const json = shouldOutputJson(!!opts.json);

    const index = await loadRuntimeIndex();
    if (!index) {
      process.stderr.write('No runtime index found. Run `cmds scan` first.\n');
      process.exitCode = 1;
      return;
    }

    const route = routeQuery(query, index);

    if (route.type === 'info') {
      try {
        const info = await resolveInfo(query, index);
        process.stdout.write(format(info, { json }) + '\n');
        process.exitCode = 0;
      } catch (err) {
        if (err instanceof CommandNotFoundError) {
          process.stderr.write(err.message + '\n');
          process.exitCode = 1;
        } else {
          process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
          process.exitCode = 1;
        }
      }
    } else {
      const results = await search(query, index, { limit: parseInt(opts.limit, 10) || 5 });
      if (results.length === 0) {
        process.stderr.write(`No results found for: ${query}\n`);
        process.exitCode = 1;
        return;
      }
      process.stdout.write(format(results, { json }) + '\n');
      process.exitCode = 0;
    }
  });

// --- info subcommand ---
program
  .command('info <command>')
  .description('Show detailed info for a command')
  .option('--json', 'JSON output')
  .action(async (command: string, opts: { json?: boolean }) => {
    const json = shouldOutputJson(!!opts.json);

    const index = await loadRuntimeIndex();
    if (!index) {
      process.stderr.write('No runtime index found. Run `cmds scan` first.\n');
      process.exitCode = 1;
      return;
    }

    try {
      const info = await resolveInfo(command, index);
      process.stdout.write(format(info, { json }) + '\n');
      process.exitCode = 0;
    } catch (err) {
      if (err instanceof CommandNotFoundError) {
        process.stderr.write(err.message + '\n');
        process.exitCode = 1;
      } else {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    }
  });

// --- list subcommand ---
program
  .command('list')
  .description('List available commands')
  .option('--category <type>', 'filter by category')
  .option('--json', 'JSON output')
  .action(async (opts: { category?: string; json?: boolean }) => {
    const json = shouldOutputJson(!!opts.json);

    const index = await loadRuntimeIndex();
    if (!index) {
      process.stderr.write('No runtime index found. Run `cmds scan` first.\n');
      process.exitCode = 1;
      return;
    }

    try {
      if (opts.category) {
        const commands = listByCategory(index, opts.category);
        process.stdout.write(format(commands, { json }) + '\n');
      } else {
        const summary = listSummary(index);
        process.stdout.write(format(summary, { json }) + '\n');
      }
      process.exitCode = 0;
    } catch (err) {
      if (err instanceof CategoryNotFoundError) {
        process.stderr.write(err.message + '\n');
        process.exitCode = 1;
      } else {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    }
  });

// --- scan subcommand ---
program
  .command('scan')
  .description('Scan system for installed commands')
  .option('--json', 'JSON output')
  .action(async (opts: { json?: boolean }) => {
    const json = shouldOutputJson(!!opts.json);

    try {
      const tldrIndex = await loadTldrIndex();
      const result = await scan(tldrIndex);
      process.stdout.write(format(result, { json }) + '\n');
      process.exitCode = 0;
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    }
  });

// --- Parse and handle errors ---
(async () => {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    // commander throws CommanderError on exitOverride
    if (err && typeof err === 'object' && 'exitCode' in err) {
      const exitCode = (err as { exitCode: number }).exitCode;
      process.exitCode = exitCode;
    } else {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    }
  }
})();
