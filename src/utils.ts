import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// On Windows under bash/MSYS, npm-installed commands are sh scripts that
// cannot be spawned directly by execFile — shell:true is required.
const useShell = process.platform === 'win32';

/**
 * Check if a command exists in the system PATH.
 * Uses `which` on Unix and `where` on Windows.
 * Never throws — returns false on any error.
 */
export async function commandExists(name: string): Promise<boolean> {
  const cmd = useShell ? 'where' : 'which';
  try {
    await execFileAsync(cmd, [name], { timeout: 5000, shell: useShell });
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute an external command and capture its output.
 * Throws on non-zero exit code or timeout.
 * shell:true is required on Windows so npm-installed sh-wrapper commands work.
 */
export async function execCommand(
  command: string,
  args: string[] = [],
  timeoutMs = 5000,
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    shell: useShell,
  });
  return { stdout, stderr };
}
