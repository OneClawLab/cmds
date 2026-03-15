import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Commands that should never be executed for help extraction.
 * These are known to have dangerous side effects, launch GUIs,
 * or behave unpredictably even with --help.
 */
const SKIP_LIST = new Set([
  // --- System power / session ---
  'reboot', 'shutdown', 'poweroff', 'halt', 'init', 'telinit',
  'systemctl', 'loginctl', 'sleep',

  // --- Destructive / disk ---
  'mkfs', 'mkfs.ext4', 'mkfs.xfs', 'mkfs.btrfs', 'mkfs.vfat',
  'mkswap', 'fdisk', 'gdisk', 'parted', 'cfdisk', 'sfdisk',
  'dd', 'shred', 'wipefs',

  // --- Network daemons / services ---
  'sshd', 'httpd', 'nginx', 'apache2', 'mysqld', 'postgres',
  'mongod', 'redis-server', 'dockerd', 'containerd',

  // --- GUI applications ---
  'nautilus', 'dolphin', 'thunar', 'nemo', 'pcmanfm',
  'firefox', 'chromium', 'chromium-browser', 'google-chrome',
  'google-chrome-stable', 'brave-browser',
  'code', 'gedit', 'kate', 'mousepad', 'pluma', 'xed',
  'eog', 'evince', 'okular', 'gimp', 'inkscape', 'libreoffice',
  'vlc', 'mpv', 'totem', 'rhythmbox',
  'gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm',
  'gnome-calculator', 'kcalc', 'gnome-system-monitor',
  'gnome-control-center', 'gnome-settings-daemon',
  'dbus-daemon', 'dbus-launch',
  'xdg-open', 'open', 'start',
  'zenity', 'kdialog', 'yad',

  // --- Windows GUI ---
  'notepad', 'calc', 'mspaint', 'explorer', 'taskmgr',
  'mmc', 'regedit', 'control', 'msconfig', 'devmgmt',
  'write', 'wordpad', 'charmap', 'snippingtool',

  // --- Package managers (may auto-install/update) ---
  'apt', 'apt-get', 'dpkg', 'yum', 'dnf', 'pacman', 'zypper',
  'snap', 'flatpak', 'brew',

  // --- Container / VM runtime ---
  'docker', 'podman', 'vagrant', 'qemu', 'qemu-system-x86_64',
  'vboxmanage', 'virsh',

  // --- Misc dangerous ---
  'rm', 'rmdir', 'kill', 'killall', 'pkill',
  'su', 'sudo', 'doas', 'chroot', 'unshare', 'nsenter',
  'mount', 'umount', 'fusermount',
  'iptables', 'ip6tables', 'nft', 'ufw',
  'modprobe', 'insmod', 'rmmod',
  'mknod', 'losetup',
]);

/**
 * Path segments that indicate a command is likely a GUI application
 * or system daemon and should not be executed for help extraction.
 */
const UNSAFE_PATH_SEGMENTS: readonly string[] = [
  // GUI / desktop application directories
  '/games',
  // Windows-specific GUI paths
  '/WindowsApps/',
  '/SystemApps/',
  '/Windows/System32/WindowsPowerShell/',
];

/**
 * Path prefixes that are considered safe for help extraction.
 * Commands outside these paths get extra scrutiny.
 */
const SAFE_PATH_PREFIXES_UNIX: readonly string[] = [
  '/usr/bin',
  '/usr/local/bin',
  '/bin',
  '/usr/sbin',
  '/usr/local/sbin',
  '/sbin',
  '/opt/',
  '/home/',
];

/**
 * Resolve the full path of a command using `which` (Unix) or `where` (Windows).
 * Returns null if the command cannot be found.
 */
export async function resolveCommandPath(command: string): Promise<string | null> {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const { stdout } = await execFileAsync(cmd, [command], { timeout: 3000 });
    // `where` on Windows may return multiple lines; take the first
    const firstLine = stdout.trim().split('\n')[0]?.trim();
    return firstLine || null;
  } catch {
    return null;
  }
}

/**
 * Check if a command path looks like a GUI or unsafe location.
 */
function isUnsafePath(cmdPath: string): boolean {
  const normalized = cmdPath.replace(/\\/g, '/');

  // Check for known unsafe path segments
  for (const segment of UNSAFE_PATH_SEGMENTS) {
    if (normalized.includes(segment)) return true;
  }

  // On Unix, if the path is not under any known safe prefix, be cautious
  if (process.platform !== 'win32') {
    const underSafePath = SAFE_PATH_PREFIXES_UNIX.some((prefix) =>
      normalized.startsWith(prefix),
    );
    if (!underSafePath) return true;
  }

  return false;
}

/**
 * Determine whether a command is safe to execute with --help/-h for
 * help extraction during enrich.
 *
 * Returns { safe: false, reason: string } if the command should be skipped.
 */
export async function isEnrichSafe(command: string): Promise<{ safe: boolean; reason?: string }> {
  // 1. Skip list check
  if (SKIP_LIST.has(command)) {
    return { safe: false, reason: 'skiplist' };
  }

  // 2. Path-based heuristic
  const cmdPath = await resolveCommandPath(command);
  if (!cmdPath) {
    return { safe: false, reason: 'not-found' };
  }
  if (isUnsafePath(cmdPath)) {
    return { safe: false, reason: `unsafe-path: ${cmdPath}` };
  }

  return { safe: true };
}

/**
 * Validate that command output looks like genuine help/usage text.
 * Returns true if the output appears to be valid help output.
 *
 * Rejects output that:
 * - Is too short to be useful (< 10 chars)
 * - Is excessively long (> 50KB, likely a data dump)
 * - Contains no help-like keywords at all
 * - Looks like a binary/garbage output
 */
export function isHelpLikeOutput(output: string): boolean {
  if (!output || output.length < 10) return false;
  if (output.length > 50_000) return false;

  // Check for binary/garbage: high ratio of non-printable characters
  const nonPrintable = output.replace(/[\x20-\x7E\t\n\r]/g, '');
  if (nonPrintable.length > output.length * 0.1) return false;

  // Check for at least some help-like indicators
  const lower = output.toLowerCase();
  const helpIndicators = [
    'usage', 'options', '--', 'help', 'command',
    'synopsis', 'description', 'arguments', 'flags',
    '-h', 'version', 'example', 'error:',
  ];
  const matchCount = helpIndicators.filter((kw) => lower.includes(kw)).length;
  // Require at least 1 indicator
  return matchCount >= 1;
}
