import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { ScanEntry } from "../core/bundle";
import type { Platform } from "./index";

export const tauriPlatform: Platform = {
  appVersion: () => getVersion(),

  pickFolder: async () => {
    const picked = await open({ directory: true, multiple: false });
    return typeof picked === "string" ? picked : null;
  },

  scanBundle: (root) => invoke<ScanEntry[]>("bundle_scan", { root }),

  readDoc: (root, relPath) => invoke<string>("doc_read", { root, relPath }),

  writeDoc: (root, relPath, content) =>
    invoke<void>("doc_write", { root, relPath, content }),

  watchStart: (root) => invoke<void>("watch_start", { root }),

  watchStop: (root) => invoke<void>("watch_stop", { root }),

  onFsChanged: (handler) =>
    listen<{ root: string; paths: string[] }>("okf://fs-changed", (event) =>
      handler(event.payload),
    ),
};
