import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { ScanEntry } from "../core/bundle";
import type { AiStreamEvent, GitStatus, Platform } from "./index";

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

  renameDoc: (root, from, to) => invoke<void>("doc_rename", { root, from, to }),

  deleteDoc: (root, relPath) => invoke<void>("doc_delete", { root, relPath }),

  watchStart: (root) => invoke<void>("watch_start", { root }),

  watchStop: (root) => invoke<void>("watch_stop", { root }),

  onFsChanged: (handler) =>
    listen<{ root: string; paths: string[] }>("okf://fs-changed", (event) =>
      handler(event.payload),
    ),

  secretSet: (name, value) => invoke<void>("secret_set", { name, value }),

  secretDelete: (name) => invoke<void>("secret_delete", { name }),

  secretExists: (name) => invoke<boolean>("secret_exists", { name }),

  aiChat: (requestId, model, messages) =>
    invoke<void>("ai_chat", { requestId, model, messages }),

  aiCancel: (requestId) => invoke<void>("ai_cancel", { requestId }),

  aiModels: () => invoke<{ id: string; name: string }[]>("ai_models"),

  aiKeyStatus: () => invoke<boolean>("ai_key_status"),

  onAiStream: (handler) =>
    listen<AiStreamEvent>("okf://ai-stream", (event) => handler(event.payload)),

  onOpenSettings: (handler) => listen("okf://open-settings", () => handler()),

  gitDetect: () => invoke<{ version: string } | null>("git_detect"),

  gitStatus: (root) => invoke<GitStatus>("git_status", { root }),

  gitCommit: (root, message, signoff) =>
    invoke<void>("git_commit", { root, message, signoff }),

  gitPull: (root) => invoke<void>("git_pull", { root }),

  gitPush: (root, branch) => invoke<void>("git_push", { root, branch }),

  gitCreateBranch: (root, name) =>
    invoke<void>("git_create_branch", { root, name }),

  gitClone: (url, dest) => invoke<void>("git_clone", { url, dest }),

  githubVerify: () =>
    invoke<{ login: string; name: string | null }>("github_verify"),

  githubListRepos: () =>
    invoke<{ full_name: string; clone_url: string; private: boolean }[]>(
      "github_list_repos",
    ),
};
