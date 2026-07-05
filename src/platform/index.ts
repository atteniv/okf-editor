/**
 * The Platform seam (docs/DESIGN.md §3): the ONLY module allowed to import
 * Tauri APIs. Everything above sees this interface, so tests mock it and a
 * future web build swaps in a different implementation.
 *
 * Grows alongside the Rust command surface (DESIGN §7); M1 adds the fs and
 * watcher commands.
 */
export interface Platform {
  /** App version, from the Tauri config. */
  appVersion(): Promise<string>;
}

export { tauriPlatform } from "./tauri";
