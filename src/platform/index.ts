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
}

/** Structured error shape thrown across the command boundary (DESIGN §7). */
export interface AppError {
  code: string;
  message: string;
}

export { tauriPlatform } from "./tauri";
