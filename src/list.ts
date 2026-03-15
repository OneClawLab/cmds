import type { RuntimeIndex, CommandEntry, CategorySummary, ListSummary } from './types.js';

const PREDEFINED_CATEGORIES = [
  'filesystem',
  'text-processing',
  'search',
  'archive',
  'process',
  'system',
  'network',
  'shell',
  'other',
  'unknown',
] as const;

export class CategoryNotFoundError extends Error {
  constructor(category: string) {
    super(`Category not found: ${category}`);
    this.name = 'CategoryNotFoundError';
  }
}

/**
 * Build a summary overview of all commands grouped by category.
 * Returns category counts, representative commands, and totals.
 */
export function listSummary(index: RuntimeIndex): ListSummary {
  const grouped = new Map<string, CommandEntry[]>();

  for (const cmd of index.commands) {
    const cat = cmd.category || 'unknown';
    const list = grouped.get(cat);
    if (list) {
      list.push(cmd);
    } else {
      grouped.set(cat, [cmd]);
    }
  }

  const categories: CategorySummary[] = [];

  for (const [name, commands] of grouped) {
    categories.push({
      name,
      count: commands.length,
      representative: commands.slice(0, 5).map((c) => c.name),
    });
  }

  // Sort categories alphabetically for consistent output
  categories.sort((a, b) => a.name.localeCompare(b.name));

  return {
    totalCategories: categories.length,
    totalCommands: index.commands.length,
    categories,
  };
}

/**
 * Return all commands in the given category.
 * Throws CategoryNotFoundError if the category is not in the predefined list
 * or has no commands.
 */
export function listByCategory(index: RuntimeIndex, category: string): CommandEntry[] {
  const isValidCategory = (PREDEFINED_CATEGORIES as readonly string[]).includes(category);
  if (!isValidCategory) {
    throw new CategoryNotFoundError(category);
  }

  const commands = index.commands.filter((c) => c.category === category);
  if (commands.length === 0) {
    throw new CategoryNotFoundError(category);
  }

  return commands;
}
