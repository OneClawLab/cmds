// Shared types for cmds

// --- Tldr Index ---

export interface TldrEntry {
  name: string;
  description: string;
  category: string;
  examples: Array<{ description: string; command: string }>;
  aliases: string[];
  relatedCommands: string[];
  seeAlso: string[];
  tags: string[];
  platforms: string[];
}

export type TldrIndex = TldrEntry[];

// --- Runtime Index ---

export interface CommandEntry {
  name: string;
  description: string;
  category: string;
  examples: Array<{ description: string; command: string }>;
  source: 'tldr' | 'help' | 'unknown';
  aliases: string[];
  tags: string[];
}

export interface RuntimeIndexMeta {
  vdbAvailable: boolean;
  lastScanTime: string; // ISO 8601
  systemInfo: {
    platform: string;
    arch: string;
    shell: string;
  };
}

export interface RuntimeIndex {
  meta: RuntimeIndexMeta;
  commands: CommandEntry[];
}

// --- Search ---

export interface SearchResult {
  name: string;
  description: string;
  score: number;
  category: string;
}

// --- Command Info ---

export interface CommandInfo {
  name: string;
  description: string;
  useCases: string[];
  examples: Array<{ description: string; command: string }>;
  caveats: string[];
}

// --- List Aggregator ---

export interface CategorySummary {
  name: string;
  count: number;
  representative: string[];
}

export interface ListSummary {
  totalCategories: number;
  totalCommands: number;
  categories: CategorySummary[];
}

// --- Smart Router ---

export interface RouteResult {
  type: 'info' | 'search';
  query: string;
}

// --- Scanner ---

export interface ScanResult {
  commandsFound: number;
  commandsWithTldr: number;
  commandsWithHelp: number;
  vdbAvailable: boolean;
  scanTime: string;
}
