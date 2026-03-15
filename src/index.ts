import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Gracefully handle EPIPE (broken pipe, e.g. `cmds ... | head`)
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});
process.stderr.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});

import { search } from './search.js';
import { resolveInfo, CommandNotFoundError } from './info.js';
import { listSummary, listByCategory, CategoryNotFoundError } from './list.js';
import { scan } from './scanner.js';
import { loadRuntimeIndex, loadTldrIndex } from './data.js';
import { format, shouldOutputJson } from './formatter.js';
import { installHelp, addSubcommandExamples } from './help.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
) as { version: string };

const program = new Command();

program
  .name('cmds')
  .description('cmds - Discover linux commands for human and AI')
  .version(`cmds ${packageJson.version}`)
  .showHelpAfterError(true);

// Configure commander to exit with code 2 on argument/usage errors
program.exitOverride();
program.enablePositionalOptions();
program.passThroughOptions();
program.configureOutput({
  writeErr: (str) => process.stderr.write(str),
  writeOut: (str) => process.stdout.write(str),
});

// Install help system
installHelp(program);

// --- Default action: show help ---
program.action(() => {
  program.outputHelp();
  process.exitCode = 0;
});

// --- find subcommand ---
const findCmd = program
  .command('find <query>')
  .description('Search for commands by natural language query')
  .option('--limit <n>', 'max results', '5')
  .option('--json', 'JSON output')
  .showHelpAfterError(true)
  .action(async (query: string, opts: { limit: string; json?: boolean }) => {
    const json = shouldOutputJson(!!opts.json);

    const index = await loadRuntimeIndex();
    if (!index) {
      process.stderr.write('No runtime index found. Run `cmds scan` first.\n');
      process.exitCode = 1;
      return;
    }

    const results = await search(query, index, { limit: parseInt(opts.limit, 10) || 5 });
    if (results.length === 0) {
      process.stderr.write(`No results found for: ${query}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(format(results, { json }) + '\n');
    process.exitCode = 0;
  });

addSubcommandExamples(findCmd, 'find');

// --- info subcommand ---
const infoCmd = program
  .command('info <command>')
  .description('Show detailed info for a command')
  .option('--json', 'JSON output')
  .showHelpAfterError(true)
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
        process.stderr.write(`${err.message}\nTry \`cmds scan\` to refresh the index, or \`cmds "${command}"\` to search.\n`);
        process.exitCode = 1;
      } else {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    }
  });
addSubcommandExamples(infoCmd, 'info');

// --- list subcommand ---
const listCmd = program
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
addSubcommandExamples(listCmd, 'list');

// --- scan subcommand ---
const scanCmd = program
  .command('scan')
  .description('Scan system for installed commands')
  .option('--json', 'JSON output')
  .action(async (opts: { json?: boolean }) => {
    const json = shouldOutputJson(!!opts.json);

    try {
      let tldrIndex: Awaited<ReturnType<typeof loadTldrIndex>>;
      try {
        tldrIndex = await loadTldrIndex();
      } catch {
        // tldr index not yet generated — scan still works, just no tldr metadata
        process.stderr.write('Warning: tldr index not found, scanning without tldr metadata.\n');
        tldrIndex = [];
      }
      const result = await scan(tldrIndex);
      process.stdout.write(format(result, { json }) + '\n');
      process.exitCode = 0;
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    }
  });
addSubcommandExamples(scanCmd, 'scan');

// --- Parse and handle errors ---
(async () => {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    // commander throws CommanderError on exitOverride
    if (err && typeof err === 'object' && 'exitCode' in err) {
      const exitCode = (err as { exitCode: number }).exitCode;
      // commander uses exitCode=1 for argument errors; remap to 2 per spec
      process.exitCode = exitCode === 1 ? 2 : exitCode;
    } else {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    }
  }
})();
