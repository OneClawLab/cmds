import type {
  SearchResult,
  CommandInfo,
  ListSummary,
  CommandEntry,
  ScanResult,
} from './types.js';

export type Formattable =
  | SearchResult[]
  | CommandInfo
  | ListSummary
  | CommandEntry[]
  | ScanResult;

export function isTTY(): boolean {
  return !!process.stdout.isTTY;
}

export function shouldOutputJson(explicitJson: boolean): boolean {
  return explicitJson || !isTTY();
}

export function format(data: Formattable, options: { json: boolean }): string {
  if (options.json) {
    return JSON.stringify(data, null, 2);
  }

  // Duck-type detection to pick the right formatter
  if (Array.isArray(data)) {
    if (data.length === 0) {
      // Empty array — could be either SearchResult[] or CommandEntry[]
      // Default to search results (empty list renders the same either way)
      return formatSearchResults(data as SearchResult[]);
    }
    const first = data[0];
    if (first && 'score' in first) {
      return formatSearchResults(data as SearchResult[]);
    }
    return formatCategoryList(data as CommandEntry[]);
  }

  if ('useCases' in data) {
    return formatCommandInfo(data as CommandInfo);
  }

  if ('totalCategories' in data) {
    return formatListSummary(data as ListSummary);
  }

  if ('commandsFound' in data) {
    return formatScanResult(data as ScanResult);
  }

  return JSON.stringify(data, null, 2);
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No results found.';
  }

  const lines: string[] = ['## Search Results', ''];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. **${r.name}** — ${r.description}`);
    lines.push(`   Category: ${r.category} | Score: ${r.score}`);
  });
  return lines.join('\n');
}

export function formatCommandInfo(info: CommandInfo): string {
  const lines: string[] = [`## ${info.name}`, ''];

  if (info.description) {
    lines.push(info.description, '');
  }

  if (info.useCases.length > 0) {
    lines.push('### Use Cases', '');
    info.useCases.forEach((uc) => lines.push(`- ${uc}`));
    lines.push('');
  }

  if (info.examples.length > 0) {
    lines.push('### Examples', '');
    info.examples.forEach((ex) => {
      lines.push(`${ex.description}:`);
      lines.push('```');
      lines.push(ex.command);
      lines.push('```');
      lines.push('');
    });
  }

  if (info.caveats.length > 0) {
    lines.push('### Caveats', '');
    info.caveats.forEach((c) => lines.push(`- ${c}`));
  }

  return lines.join('\n').trimEnd();
}

export function formatListSummary(summary: ListSummary): string {
  const lines: string[] = [
    '## Command Summary',
    '',
    `Total: ${summary.totalCommands} commands in ${summary.totalCategories} categories`,
    '',
  ];

  summary.categories.forEach((cat) => {
    lines.push(`### ${cat.name} (${cat.count})`);
    if (cat.representative.length > 0) {
      lines.push(cat.representative.join(', '));
    }
    lines.push('');
  });

  return lines.join('\n').trimEnd();
}

export function formatCategoryList(commands: CommandEntry[]): string {
  if (commands.length === 0) {
    return 'No commands found.';
  }

  const lines: string[] = [];
  commands.forEach((cmd) => {
    lines.push(`- **${cmd.name}** — ${cmd.description}`);
  });
  return lines.join('\n');
}

export function formatScanResult(result: ScanResult): string {
  const lines: string[] = [
    '## Scan Complete',
    '',
    `- Commands found: ${result.commandsFound}`,
    `- With tldr data: ${result.commandsWithTldr}`,
    `- With help text: ${result.commandsWithHelp}`,
    `- VDB available: ${result.vdbAvailable ? 'yes' : 'no'}`,
    `- Scan time: ${result.scanTime}`,
  ];
  return lines.join('\n');
}
