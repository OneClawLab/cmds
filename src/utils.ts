import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Check if a command exists in the system PATH.
 * Uses `which` on Unix and `where` on Windows.
 * Never throws — returns false on any error.
 */
export async function commandExists(name: string): Promise<boolean> {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    await execFileAsync(cmd, [name], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute an external command and capture its output.
 * Throws on non-zero exit code or timeout.
 */
export async function execCommand(
  command: string,
  args: string[] = [],
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    timeout: 5000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  return { stdout, stderr };
}
