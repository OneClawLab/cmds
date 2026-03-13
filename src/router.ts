import type { RuntimeIndex, RouteResult } from './types.js';

/**
 * Route a query to either 'info' (exact command match) or 'search' (no match).
 */
export function routeQuery(query: string, index: RuntimeIndex): RouteResult {
  const isKnownCommand = index.commands.some((cmd) => cmd.name === query);
  return {
    type: isKnownCommand ? 'info' : 'search',
    query,
  };
}
