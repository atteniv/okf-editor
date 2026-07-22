import { create } from "zustand";
import { buildBacklinks, buildIndex, parseDoc, type DocMeta } from "../core/bundle";
import { joinFrontmatter, splitFrontmatter } from "../core/frontmatter";
import { lintBundle, type Diagnostic } from "../core/lint";
import { rewriteLinksForRename } from "../core/rename";
import { generateSkeleton, instantiateTemplate } from "../core/template";
import {
  appendUpdateLog,
  createUpdateLog,
  ROOT_UPDATE_LOG,
} from "../core/updateLog";
import {
  addTypeToSchemaSource,
  CONFIG_FILENAME,
  DEFAULT_SCHEMA,
  mergeSchema,
  parseSchemaConfig,
  type SchemaConfig,
} from "../core/schema";
import {
  tauriPlatform as platform,
  type GitStatus,
  type PulledFile,
} from "../platform";

const RECENTS_KEY = "okf-editor.recent-projects";
const RECENTS_MAX = 8;
const AUTOSAVE_MS = 1000;

function loadRecents(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === "string")
      : [];
  } catch {
    return [];
  }
}

function saveRecents(recents: string[]) {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
}

function message(err: unknown): string {
  if (err instanceof Error) return err.message;
  const detail = (err as { message?: string } | null)?.message;
  return detail ?? String(err);
}

export type ViewMode = "edit" | "split" | "preview";
export type TreeMode = "folder" | "type";

const TREE_MODE_KEY = "okf-editor.tree-mode";

function loadTreeMode(): TreeMode {
  return localStorage.getItem(TREE_MODE_KEY) === "type" ? "type" : "folder";
}

interface AppState {
  view: "start" | "bundle";
  root: string | null;
  docs: Map<string, DocMeta>;
  /** Every scanned bundle file (docs and non-docs), for the folder tree. */
  allFiles: string[];
  backlinks: Map<string, string[]>;
  selectedPath: string | null;
  recents: string[];
  error: string | null;

  viewMode: ViewMode;
  /** Sidebar layout: file-manager folders (default) or grouped by type. */
  treeMode: TreeMode;
  /** Editor text for the selected doc; authoritative while dirty. */
  draft: string | null;
  dirty: boolean;
  /** The selected doc changed on disk while dirty (DESIGN §7.2). */
  conflict: boolean;

  /** Resolved schema: project .okf-editor.json over the shipped default. */
  schema: SchemaConfig;
  schemaError: string | null;
  /** Bundle-wide lint findings, path → diagnostics (saved state, not draft). */
  problems: Map<string, Diagnostic[]>;

  /** App settings dialog (AI key + model). Reachable from every screen. */
  settingsOpen: boolean;
  aiReady: boolean;
  perplexityReady: boolean;
  setSettingsOpen(open: boolean): void;
  refreshAiStatus(): Promise<void>;
  refreshPerplexityStatus(): Promise<void>;

  /** Git state for the open bundle (null until loaded). */
  git: GitStatus | null;
  gitRemote: string | null;
  /** The repo's home branch — main/master/whatever origin declares. */
  gitDefaultBranch: string | null;
  gitBusy: boolean;
  gitError: string | null;
  /** Conflicted file paths while a merge is unresolved; null otherwise. */
  gitConflicts: string[] | null;
  /** Files the last "Pull Updates" changed — non-null opens the dialog. */
  pullResult: PulledFile[] | null;
  /** One-line good-news note ("You're up to date"); cleared on next action. */
  pullNotice: string | null;
  clearPullResult(): void;
  switchBranch(name: string): Promise<boolean>;
  refreshGit(): Promise<void>;
  /** Save = stage everything, commit, and upload (pull+push) when a
   *  remote exists. Resolves true when the commit landed (even if the
   *  upload had to wait for connectivity). */
  commitAll(message: string, signoff: boolean): Promise<boolean>;
  /** Get the latest from GitHub (and upload any waiting local commits). */
  pullUpdates(): Promise<boolean>;
  /** Point origin at url and push -u. Resolves true on success. */
  publishTo(url: string): Promise<boolean>;
  /** Cancel an in-progress merge, restoring the pre-pull state. */
  abortMerge(): Promise<void>;
  /** All conflicts resolved on disk → commit the merge and upload. */
  finishMerge(): Promise<boolean>;

  openFolder(): Promise<void>;
  openBundle(root: string): Promise<void>;
  selectDoc(path: string): Promise<void>;
  closeBundle(): Promise<void>;
  setViewMode(mode: ViewMode): void;
  setTreeMode(mode: TreeMode): void;

  /** Create a doc from the type's template; selects it unless select:false. */
  createDoc(args: {
    dirPath: string;
    type: string;
    title: string;
    filename: string;
    select?: boolean;
  }): Promise<void>;
  /** Create a folder by creating its index.md cover page. */
  createFolder(dirPath: string, name: string): Promise<void>;
  /** Rename/move a doc, rewriting inbound and own links. */
  renameDoc(oldPath: string, newPath: string): Promise<void>;
  /** Delete to the OS trash. */
  deleteDoc(path: string): Promise<void>;
  /** Add an unknown document type to the root project schema. */
  addSchemaType(typeName: string): Promise<void>;
  /** Create the optional root OKF log; later commits append to it. */
  enableUpdateLog(): Promise<void>;

  onEdit(text: string): void;
  /** Replace only the body, keeping the draft's frontmatter. */
  onEditBody(text: string): void;
  /** Replace only the frontmatter, keeping the draft's body. */
  onEditFrontmatter(frontmatterRaw: string | null): void;
  saveNow(): Promise<void>;
  resolveConflict(action: "reload" | "keep-mine"): Promise<void>;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let unlistenFs: (() => void) | null = null;

function scheduleAutosave(save: () => void) {
  if (autosaveTimer !== null) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(save, AUTOSAVE_MS);
}

function cancelAutosave() {
  if (autosaveTimer !== null) clearTimeout(autosaveTimer);
  autosaveTimer = null;
}

export const useStore = create<AppState>((set, get) => {
  /** Load .okf-editor.json (if any) and resolve the schema (DESIGN §5). */
  async function loadSchema(root: string) {
    let source: string | null;
    try {
      source = await platform.readDoc(root, CONFIG_FILENAME);
    } catch {
      source = null; // no project config — shipped defaults
    }
    if (source === null) {
      set({ schema: DEFAULT_SCHEMA, schemaError: null });
      return;
    }
    const { config, error } = parseSchemaConfig(source);
    if (error !== null) {
      set({ schema: DEFAULT_SCHEMA, schemaError: `${CONFIG_FILENAME}: ${error}` });
    } else {
      set({ schema: mergeSchema(DEFAULT_SCHEMA, config), schemaError: null });
    }
  }

  /**
   * Pull (integrating remote changes), then push. Conflicts populate
   * gitConflicts for the resolution dialog; connectivity failures degrade
   * to a friendly "will upload later" — the local commit is always safe.
   */
  async function syncWithRemote(): Promise<{
    outcome: "ok" | "conflict" | "offline" | "error";
    pulled: PulledFile[];
  }> {
    const { root } = get();
    if (root === null) return { outcome: "error", pulled: [] };
    const offlineNotice =
      "Saved on this computer — couldn't reach GitHub, so your changes will upload next time.";
    let pulled: PulledFile[] = [];
    try {
      pulled = await platform.gitPull(root);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      const detail = message(err);
      if (code === "conflict") {
        const files = await platform.gitConflictedFiles(root).catch(() => []);
        set({ gitConflicts: files });
        return { outcome: "conflict", pulled };
      }
      if (code === "auth_failed") {
        set({ gitError: detail });
        return { outcome: "error", pulled };
      }
      // No upstream yet is fine — the push below establishes it (-u).
      if (!/no tracking information|couldn't find remote ref/i.test(detail)) {
        set({ gitError: offlineNotice });
        return { outcome: "offline", pulled };
      }
    }
    try {
      await platform.gitPush(root);
      return { outcome: "ok", pulled };
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      set({
        gitError: code === "auth_failed" ? message(err) : offlineNotice,
      });
      return { outcome: code === "auth_failed" ? "error" : "offline", pulled };
    }
  }

  /** Re-read changed paths and refresh the index (watcher callback). */
  async function handleFsChanged(event: { root: string; paths: string[] }) {
    const state = get();
    if (event.root !== state.root) return;
    const docs = new Map(state.docs);
    const files = new Set(state.allFiles);
    let selectedChangedOnDisk = false;

    for (const path of event.paths) {
      if (path === CONFIG_FILENAME) {
        // Project config changed: reload the schema; it is not a doc.
        await loadSchema(event.root);
      }
      let content: string | null;
      try {
        content = await platform.readDoc(event.root, path);
      } catch {
        content = null; // deleted or unreadable
      }
      if (content === null) files.delete(path);
      else files.add(path);
      if (path === CONFIG_FILENAME) continue;
      if (path === state.selectedPath) {
        // Never clobber the open doc from here — decide below.
        if (content !== null && content !== state.draft) {
          selectedChangedOnDisk = true;
        }
        if (content !== null) docs.set(path, parseDoc({ path, content }));
        continue;
      }
      if (content === null) docs.delete(path);
      else docs.set(path, parseDoc({ path, content }));
    }

    set({
      docs,
      allFiles: [...files].sort(),
      backlinks: buildBacklinks(docs),
      problems: lintBundle(docs, get().schema),
    });
    if (selectedChangedOnDisk) {
      if (state.dirty) {
        set({ conflict: true }); // user decides: reload or keep mine
      } else {
        const fresh = docs.get(state.selectedPath!);
        if (fresh) set({ draft: fresh.source });
      }
    }
    void get().refreshGit();
  }

  return {
    view: "start",
    root: null,
    docs: new Map(),
    allFiles: [],
    backlinks: new Map(),
    selectedPath: null,
    recents: loadRecents(),
    error: null,
    viewMode: "split",
    treeMode: loadTreeMode(),
    draft: null,
    dirty: false,
    conflict: false,
    schema: DEFAULT_SCHEMA,
    schemaError: null,
    problems: new Map(),
    settingsOpen: false,
    aiReady: false,
    perplexityReady: false,

    setSettingsOpen: (open) => set({ settingsOpen: open }),

    refreshAiStatus: async () => {
      try {
        set({ aiReady: await platform.aiKeyStatus() });
      } catch {
        set({ aiReady: false });
      }
    },

    refreshPerplexityStatus: async () => {
      try {
        set({ perplexityReady: await platform.perplexityKeyStatus() });
      } catch {
        set({ perplexityReady: false });
      }
    },

    git: null,
    gitRemote: null,
    gitDefaultBranch: null,
    gitBusy: false,
    gitError: null,
    gitConflicts: null,
    pullResult: null,
    pullNotice: null,
    clearPullResult: () => set({ pullResult: null }),

    refreshGit: async () => {
      const { root } = get();
      if (root === null) {
        set({ git: null, gitRemote: null, gitDefaultBranch: null });
        return;
      }
      try {
        const [git, gitRemote] = await Promise.all([
          platform.gitStatus(root),
          platform.gitRemoteUrl(root),
        ]);
        const gitDefaultBranch = git.is_repo
          ? await platform.gitDefaultBranch(root)
          : null;
        set({ git, gitRemote, gitDefaultBranch });
      } catch (err) {
        set({ gitError: message(err) });
      }
    },

    switchBranch: async (name) => {
      const state = get();
      if (state.root === null) return false;
      if (state.dirty) await state.saveNow();
      set({ gitError: null });
      try {
        await platform.gitSwitchBranch(state.root, name);
      } catch (err) {
        set({ gitError: message(err) });
        await get().refreshGit();
        return false;
      }
      // Branch content may differ — rescan the bundle like a fresh open.
      await get().openBundle(state.root);
      return true;
    },

    commitAll: async (commitMessage, signoff) => {
      const { root, dirty } = get();
      if (root === null) return false;
      if (dirty) await get().saveNow();
      set({ gitBusy: true, gitError: null, pullNotice: null });
      try {
        if (get().allFiles.includes(ROOT_UPDATE_LOG)) {
          const source = await platform.readDoc(root, ROOT_UPDATE_LOG);
          const date = new Date().toISOString().slice(0, 10);
          const content = appendUpdateLog(source, date, commitMessage);
          await platform.writeDoc(root, ROOT_UPDATE_LOG, content);
          const docs = new Map(get().docs);
          docs.set(ROOT_UPDATE_LOG, parseDoc({ path: ROOT_UPDATE_LOG, content }));
          set({
            docs,
            problems: lintBundle(docs, get().schema),
          });
        }
        await platform.gitCommit(root, commitMessage, signoff);
      } catch (err) {
        set({ gitError: message(err), gitBusy: false });
        await get().refreshGit();
        return false;
      }
      // Saved locally — now upload if this bundle has a home on GitHub.
      if (get().gitRemote !== null) {
        await syncWithRemote();
      }
      set({ gitBusy: false });
      await get().refreshGit();
      return true;
    },

    pullUpdates: async () => {
      const { root } = get();
      if (root === null) return false;
      set({ gitBusy: true, gitError: null, pullNotice: null });
      const { outcome, pulled } = await syncWithRemote();
      // Say what happened: list what came down (even if the upload half
      // failed), or confirm there was nothing to get.
      if (pulled.length > 0) {
        set({ pullResult: pulled });
      } else if (outcome === "ok") {
        set({ pullNotice: "You're up to date — nothing new on GitHub." });
      }
      set({ gitBusy: false });
      await get().refreshGit();
      return outcome === "ok";
    },

    publishTo: async (url) => {
      const { root } = get();
      if (root === null) return false;
      set({ gitBusy: true, gitError: null });
      try {
        await platform.gitSetRemote(root, url);
        await platform.gitPush(root);
        return true;
      } catch (err) {
        set({ gitError: message(err) });
        return false;
      } finally {
        set({ gitBusy: false });
        await get().refreshGit();
      }
    },

    abortMerge: async () => {
      const { root } = get();
      if (root === null) return;
      try {
        await platform.gitMergeAbort(root);
      } catch (err) {
        set({ gitError: message(err) });
      }
      set({ gitConflicts: null });
      await get().refreshGit();
    },

    finishMerge: async () => {
      const { root } = get();
      if (root === null) return false;
      set({ gitBusy: true, gitError: null });
      try {
        await platform.gitCommit(root, "Merge updates from GitHub", false);
        await platform.gitPush(root);
        set({ gitConflicts: null });
        return true;
      } catch (err) {
        set({ gitError: message(err) });
        return false;
      } finally {
        set({ gitBusy: false });
        await get().refreshGit();
      }
    },

    openFolder: async () => {
      const root = await platform.pickFolder();
      if (root !== null) await get().openBundle(root);
    },

    openBundle: async (root) => {
      set({ error: null });
      try {
        const entries = await platform.scanBundle(root);
        const { docs, backlinks } = buildIndex(entries);
        const recents = [root, ...get().recents.filter((r) => r !== root)].slice(
          0,
          RECENTS_MAX,
        );
        saveRecents(recents);
        await loadSchema(root);
        unlistenFs?.();
        unlistenFs = await platform.onFsChanged((event) => {
          void handleFsChanged(event);
        });
        await platform.watchStart(root);
        set({
          view: "bundle",
          root,
          docs,
          allFiles: entries.map((e) => e.path),
          backlinks,
          selectedPath: null,
          recents,
          draft: null,
          dirty: false,
          conflict: false,
          problems: lintBundle(docs, get().schema),
        });
        void get().refreshGit();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : ((err as { message?: string })?.message ?? String(err));
        set({ error: `Could not open bundle: ${message}` });
      }
    },

    selectDoc: async (path) => {
      const state = get();
      if (state.dirty) await state.saveNow(); // flush before switching
      const doc = get().docs.get(path);
      set({
        selectedPath: path,
        draft: doc?.source ?? null,
        dirty: false,
        conflict: false,
      });
    },

    closeBundle: async () => {
      const state = get();
      if (state.dirty) await state.saveNow();
      cancelAutosave();
      unlistenFs?.();
      unlistenFs = null;
      if (state.root !== null) await platform.watchStop(state.root);
      set({
        view: "start",
        root: null,
        docs: new Map(),
        allFiles: [],
        backlinks: new Map(),
        selectedPath: null,
        draft: null,
        dirty: false,
        conflict: false,
      });
    },

    setViewMode: (mode) => set({ viewMode: mode }),

    setTreeMode: (mode) => {
      localStorage.setItem(TREE_MODE_KEY, mode);
      set({ treeMode: mode });
    },

    createDoc: async ({ dirPath, type, title, filename, select = true }) => {
      const { root, schema } = get();
      if (root === null) return;
      const path = dirPath === "" ? filename : `${dirPath}/${filename}`;
      if (get().docs.has(path)) {
        set({ error: `A document already exists at ${path}` });
        return;
      }
      const date = new Date().toISOString().slice(0, 10);
      let content: string;
      const templatePath = schema.types[type]?.template;
      if (templatePath !== undefined) {
        try {
          const template = await platform.readDoc(root, templatePath);
          content = instantiateTemplate(template, { title, type, date });
        } catch {
          content = generateSkeleton(schema, type, title, date);
        }
      } else {
        content = generateSkeleton(schema, type, title, date);
      }
      try {
        await platform.writeDoc(root, path, content);
      } catch (err) {
        set({ error: `Could not create document: ${message(err)}` });
        return;
      }
      const docs = new Map(get().docs);
      docs.set(path, parseDoc({ path, content }));
      const files = new Set(get().allFiles);
      files.add(path);
      set({
        docs,
        allFiles: [...files].sort(),
        backlinks: buildBacklinks(docs),
        problems: lintBundle(docs, get().schema),
        ...(select
          ? { selectedPath: path, draft: content, dirty: false, conflict: false }
          : {}),
        error: null,
      });
      void get().refreshGit();
    },

    createFolder: async (dirPath, name) => {
      const clean = name.replace(/\/+$/, "");
      if (clean === "") return;
      await get().createDoc({
        dirPath: dirPath === "" ? clean : `${dirPath}/${clean}`,
        type: "index",
        title: clean,
        filename: "index.md",
      });
    },

    renameDoc: async (oldPath, newPath) => {
      const state = get();
      if (state.root === null || oldPath === newPath) return;
      if (state.dirty && state.selectedPath === oldPath) await state.saveNow();

      const { root } = state;
      const updates = rewriteLinksForRename(
        get().docs,
        get().backlinks,
        oldPath,
        newPath,
      );
      try {
        // 1. Retarget inbound links in their files.
        for (const [path, content] of updates) {
          if (path !== oldPath) await platform.writeDoc(root, path, content);
        }
        // 2. Move the file.
        await platform.renameDoc(root, oldPath, newPath);
        // 3. If the doc's own links shifted, write the corrected content.
        const ownContent = updates.get(oldPath);
        if (ownContent !== undefined) {
          await platform.writeDoc(root, newPath, ownContent);
        }
      } catch (err) {
        set({ error: `Rename failed: ${message(err)}` });
        return;
      }

      const docs = new Map(get().docs);
      const moved = docs.get(oldPath);
      docs.delete(oldPath);
      const newContent = updates.get(oldPath) ?? moved?.source;
      if (newContent !== undefined) {
        docs.set(newPath, parseDoc({ path: newPath, content: newContent }));
      }
      for (const [path, content] of updates) {
        if (path !== oldPath) docs.set(path, parseDoc({ path, content }));
      }
      const files = new Set(get().allFiles);
      files.delete(oldPath);
      files.add(newPath);
      const wasSelected = get().selectedPath === oldPath;
      set({
        docs,
        allFiles: [...files].sort(),
        backlinks: buildBacklinks(docs),
        problems: lintBundle(docs, get().schema),
        ...(wasSelected
          ? { selectedPath: newPath, draft: newContent ?? null, dirty: false }
          : {}),
        error: null,
      });
      void get().refreshGit();
    },

    enableUpdateLog: async () => {
      const { root, allFiles } = get();
      if (root === null || allFiles.includes(ROOT_UPDATE_LOG)) return;
      const date = new Date().toISOString().slice(0, 10);
      const content = createUpdateLog(date);
      try {
        await platform.writeDoc(root, ROOT_UPDATE_LOG, content);
      } catch (err) {
        set({ error: `Could not create update log: ${message(err)}` });
        return;
      }

      const docs = new Map(get().docs);
      docs.set(ROOT_UPDATE_LOG, parseDoc({ path: ROOT_UPDATE_LOG, content }));
      const files = new Set(get().allFiles);
      files.add(ROOT_UPDATE_LOG);
      set({
        docs,
        allFiles: [...files].sort(),
        problems: lintBundle(docs, get().schema),
        error: null,
      });
      void get().refreshGit();
    },

    addSchemaType: async (typeName) => {
      const { root } = get();
      if (root === null) return;

      let currentSource: string | null;
      try {
        currentSource = await platform.readDoc(root, CONFIG_FILENAME);
      } catch {
        currentSource = null;
      }
      const update = addTypeToSchemaSource(currentSource, typeName);
      if (update.error !== null) {
        set({ schemaError: `${CONFIG_FILENAME}: ${update.error}` });
        return;
      }

      try {
        await platform.writeDoc(root, CONFIG_FILENAME, update.source);
      } catch (err) {
        set({ error: `Could not update project schema: ${message(err)}` });
        return;
      }

      const parsed = parseSchemaConfig(update.source);
      if (parsed.error !== null) return;
      const schema = mergeSchema(DEFAULT_SCHEMA, parsed.config);
      const files = new Set(get().allFiles);
      files.add(CONFIG_FILENAME);
      set({
        schema,
        schemaError: null,
        allFiles: [...files].sort(),
        problems: lintBundle(get().docs, schema),
        error: null,
      });
    },

    deleteDoc: async (path) => {
      const { root } = get();
      if (root === null) return;
      try {
        await platform.deleteDoc(root, path);
      } catch (err) {
        set({ error: `Delete failed: ${message(err)}` });
        return;
      }
      cancelAutosave();
      const docs = new Map(get().docs);
      docs.delete(path);
      const files = new Set(get().allFiles);
      files.delete(path);
      const wasSelected = get().selectedPath === path;
      set({
        docs,
        allFiles: [...files].sort(),
        backlinks: buildBacklinks(docs),
        problems: lintBundle(docs, get().schema),
        ...(wasSelected
          ? { selectedPath: null, draft: null, dirty: false, conflict: false }
          : {}),
        error: null,
      });
      void get().refreshGit();
    },

    onEdit: (text) => {
      set({ draft: text, dirty: true });
      scheduleAutosave(() => void get().saveNow());
    },

    onEditBody: (text) => {
      const { draft } = get();
      const frontmatterRaw =
        draft !== null ? splitFrontmatter(draft).frontmatterRaw : null;
      get().onEdit(joinFrontmatter(frontmatterRaw, text));
    },

    onEditFrontmatter: (frontmatterRaw) => {
      const { draft } = get();
      const body = draft !== null ? splitFrontmatter(draft).body : "";
      get().onEdit(joinFrontmatter(frontmatterRaw, body));
    },

    saveNow: async () => {
      cancelAutosave();
      const { root, selectedPath, draft, dirty } = get();
      if (!dirty || root === null || selectedPath === null || draft === null) {
        return;
      }
      try {
        await platform.writeDoc(root, selectedPath, draft);
        const docs = new Map(get().docs);
        docs.set(selectedPath, parseDoc({ path: selectedPath, content: draft }));
        set({
          docs,
          backlinks: buildBacklinks(docs),
          problems: lintBundle(docs, get().schema),
          dirty: false,
          error: null,
        });
        void get().refreshGit();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : ((err as { message?: string })?.message ?? String(err));
        set({ error: `Save failed: ${message}` });
      }
    },

    resolveConflict: async (action) => {
      const { root, selectedPath } = get();
      if (root === null || selectedPath === null) return;
      if (action === "reload") {
        cancelAutosave();
        const content = await platform.readDoc(root, selectedPath);
        const docs = new Map(get().docs);
        docs.set(selectedPath, parseDoc({ path: selectedPath, content }));
        set({
          docs,
          backlinks: buildBacklinks(docs),
          draft: content,
          dirty: false,
          conflict: false,
        });
      } else {
        // Keep mine: clear the flag and persist the draft over the disk copy.
        set({ conflict: false });
        await get().saveNow();
      }
    },
  };
});
