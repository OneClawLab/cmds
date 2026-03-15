import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import type { RuntimeIndex } from '../../src/types.js';

// Mock utils before importing info module
vi.mock('../../src/os-utils.js', () => ({
  commandExists: vi.fn(),
  execCommand: vi.fn(),
}));

import { resolveInfo } from '../../src/info.js';
import { commandExists } from '../../src/os-utils.js'
import { arbCommandEntry } from '../helpers/arbitraries.js';

const mockedCommandExists = vi.mocked(commandExists);

/**
 * Validates: Requirements 3.1
 */
describe('Property 5: Info returns complete structured info', () => {
  it('Feature: cmds-cli, Property 5: resolveInfo returns CommandInfo with non-empty name, description, and examples array', async () => {
    await fc.assert(
      fc.asyncProperty(arbCommandEntry, async (entry) => {
        mockedCommandExists.mockResolvedValue(true);

        const index: RuntimeIndex = {
          meta: {
            xdbAvailable: false,
            lastScanTime: new Date().toISOString(),
            systemInfo: { platform: 'linux', arch: 'x64', shell: '/bin/bash' },
          },
          commands: [entry],
        };

        const info = await resolveInfo(entry.name, index);

        expect(info.name).toBe(entry.name);
        expect(typeof info.name).toBe('string');
        expect(info.name.length).toBeGreaterThan(0);
        expect(typeof info.description).toBe('string');
        expect(info.description.length).toBeGreaterThan(0);
        expect(Array.isArray(info.examples)).toBe(true);
        expect(Array.isArray(info.useCases)).toBe(true);
        expect(Array.isArray(info.caveats)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
