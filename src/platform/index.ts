import type { ScanEntry } from "../core/bundle";

/**
 * The Platform seam (docs/DESIGN.md §3): the ONLY module allowed to import
 * Tauri APIs. Everything above sees this interface, so tests mock it and a
 * future web build swaps in a different implementation.
 *
 * Grows alongside the Rust command surface (DESIGN §7); the watcher, git,
 * and secrets commands land in later M1/M2 weeks.
 */
export interface Platform {
  /** App version, from the Tauri config. */
  appVersion(): Promise<string>;
  /** Native folder picker; null when the user cancels. */
  pickFolder(): Promise<string | null>;
  /** Full scan: every markdown file in the bundle with its content. */
  scanBundle(root: string): Promise<ScanEntry[]>;
  readDoc(root: string, relPath: string): Promise<string>;
  writeDoc(root: string, relPath: string, content: string): Promise<void>;
  renameDoc(root: string, from: string, to: string): Promise<void>;
  /** Moves to the OS trash — never a hard unlink. */
  deleteDoc(root: string, relPath: string): Promise<void>;
  /** Start/stop the recursive fs watcher for a bundle root (DESIGN §7.2). */
  watchStart(root: string): Promise<void>;
  watchStop(root: string): Promise<void>;
  /** Subscribe to debounced fs-change events; returns an unsubscribe fn. */
  onFsChanged(
    handler: (event: { root: string; paths: string[] }) => void,
  ): Promise<() => void>;

  // --- Secrets (OS keychain; write-only from the webview's perspective) ---
  secretSet(name: string, value: string): Promise<void>;
  secretDelete(name: string): Promise<void>;
  secretExists(name: string): Promise<boolean>;

  // --- AI (OpenRouter via Rust; the key never enters the webview) ---
  aiChat(
    requestId: string,
    model: string,
    messages: { role: string; content: string }[],
  ): Promise<void>;
  aiCancel(requestId: string): Promise<void>;
  aiModels(): Promise<{ id: string; name: string }[]>;
  aiKeyStatus(): Promise<boolean>;
  onAiStream(
    handler: (event: AiStreamEvent) => void,
  ): Promise<() => void>;
  /** Fires when the native Settings… menu item is chosen. */
  onOpenSettings(handler: () => void): Promise<() => void>;

  // --- Git (system git via Rust; token via askpass, never argv/URL) ---
  gitDetect(): Promise<{ version: string } | null>;
  gitStatus(root: string): Promise<GitStatus>;
  gitCommit(root: string, message: string, signoff: boolean): Promise<void>;
  gitPull(root: string): Promise<void>;
  gitPush(root: string, branch?: string): Promise<void>;
  gitCreateBranch(root: string, name: string): Promise<void>;
  gitClone(url: string, dest: string): Promise<void>;
  /** git init -b main (creates the directory). */
  gitInit(dest: string): Promise<void>;

  // --- GitHub REST (token from keychain; webview never sees it) ---
  githubVerify(): Promise<{ login: string; name: string | null }>;
  githubListRepos(): Promise<
    { full_name: string; clone_url: string; private: boolean }[]
  >;
}

export interface GitFileChange {
  path: string;
  /** Porcelain XY code, or "??" for untracked. */
  status: string;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  changes: GitFileChange[];
  is_repo: boolean;
}

export interface AiStreamEvent {
  request_id: string;
  kind: "delta" | "done" | "error";
  text: string;
}

/** Structured error shape thrown across the command boundary (DESIGN §7). */
export interface AppError {
  code: string;
  message: string;
}

export { tauriPlatform } from "./tauri";
