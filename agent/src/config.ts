import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface FolderPair {
  /** Absolute local folder to keep synced. */
  local: string;
  /** Remote folder inside your MiniCloud (e.g. "backup/laptop"). */
  remote: string;
}

export interface AgentConfig {
  server: string;          // e.g. http://my-server:8484 or the Tailscale URL
  username: string;
  deviceToken?: string;    // written by `login`
  intervalMinutes: number; // 30 / 60 / anything
  folders: FolderPair[];
}

export const configDir = process.env.MINICLOUD_AGENT_DIR ?? path.join(os.homedir(), '.minicloud');
const configPath = () => path.join(configDir, 'agent.json');

export function loadConfig(): AgentConfig | null {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8')) as AgentConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: AgentConfig): void {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

export function statePathFor(pair: FolderPair): string {
  const key = Buffer.from(`${pair.local}→${pair.remote}`).toString('base64url').slice(0, 40);
  return path.join(configDir, 'state', `${key}.json`);
}

/** Same defaults the web app uses — skip dependency/build junk when syncing codebases. */
export const MINIIGNORE = ['node_modules', '.git', 'dist', 'build', '.next', '.cache', '__pycache__', '.DS_Store', '.minicloud-trash'];

export function ignored(rel: string): boolean {
  return rel.split('/').some((part) => MINIIGNORE.includes(part));
}
