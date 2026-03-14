import { describe, it, expect } from 'vitest';
import { commandExists, execCommand } from '../../src/utils.js';

describe('utils', () => {
  describe('commandExists', () => {
    it('returns true for a command that exists (node)', async () => {
      const result = await commandExists('node');
      expect(result).toBe(true);
    });

    it('returns false for a command that does not exist', async () => {
      const result = await commandExists('this-command-definitely-does-not-exist-xyz');
      expect(result).toBe(false);
    });

    it('returns false for an empty string', async () => {
      const result = await commandExists('');
      expect(result).toBe(false);
    });

    it('never throws, even with invalid input', async () => {
      // Should not throw, just return false
      const result = await commandExists('///invalid///');
      expect(result).toBe(false);
    });
  });

  describe('execCommand', () => {
    it('captures stdout from a simple command', async () => {
      const { stdout } = await execCommand('node', ['--version']);
      expect(stdout.trim()).toMatch(/^v\d+\.\d+\.\d+$/);
    });

    it('returns empty stderr on success', async () => {
      const { stderr } = await execCommand('node', ['--version']);
      expect(stderr).toBe('');
    });

    it('throws on non-existent command', async () => {
      await expect(
        execCommand('this-command-definitely-does-not-exist-xyz'),
      ).rejects.toThrow();
    });

    it('throws on non-zero exit code', async () => {
      await expect(
        execCommand('node', ['-e', 'process.exit(1)']),
      ).rejects.toThrow();
    });
  });
});
