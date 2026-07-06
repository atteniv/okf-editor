import { create } from "zustand";
import { buildBacklinks, buildIndex, parseDoc, type DocMeta } from "../core/bundle";
import { joinFrontmatter, splitFrontmatter } from "../core/frontmatter";
import {
  CONFIG_FILENAME,
  DEFAULT_SCHEMA,
  mergeSchema,
  parseSchemaConfig,
  type SchemaConfig,
} from "../core/schema";
import { tauriPlatform as platform } from "../platform";

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

export type ViewMode = "edit" | "split" | "preview";

interface AppState {
  view: "start" | "bundle";
  root: string | null;
  docs: Map<string, DocMeta>;
  backlinks: Map<string, string[]>;
  selectedPath: string | null;
  recents: string[];
  error: string | null;

  viewMode: ViewMode;
  /** Editor text for the selected doc; authoritative while dirty. */
  draft: string | null;
  dirty: boolean;
  /** The selected doc changed on disk while dirty (DESIGN §7.2). */
  conflict: boolean;

  /** Resolved schema: project .okf-editor.json over the shipped default. */
  schema: SchemaConfig;
  schemaError: string | null;

  openFolder(): Promise<void>;
  openBundle(root: string): Promise<void>;
  selectDoc(path: string): Promise<void>;
  closeBundle(): Promise<void>;
  setViewMode(mode: ViewMode): void;

  onEdit(text: string): void;
  /** Replace only the body, keeping the draft's frontmatter. */
  onEditBody(text: string): void;
  /** Replace only the frontmatter, keeping the draft's body. */
  onEditFrontmatter(frontmatterRaw: string): void;
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

  /** Re-read changed paths and refresh the index (watcher callback). */
  async function handleFsChanged(event: { root: string; paths: string[] }) {
    const state = get();
    if (event.root !== state.root) return;
    const docs = new Map(state.docs);
    let selectedChangedOnDisk = false;

    for (const path of event.paths) {
      if (path === CONFIG_FILENAME) {
        // Project config changed: reload the schema; it is not a doc.
        await loadSchema(event.root);
        continue;
      }
      let content: string | null;
      try {
        content = await platform.readDoc(event.root, path);
      } catch {
        content = null; // deleted or unreadable
      }
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

    set({ docs, backlinks: buildBacklinks(docs) });
    if (selectedChangedOnDisk) {
      if (state.dirty) {
        set({ conflict: true }); // user decides: reload or keep mine
      } else {
        const fresh = docs.get(state.selectedPath!);
        if (fresh) set({ draft: fresh.source });
      }
    }
  }

  return {
    view: "start",
    root: null,
    docs: new Map(),
    backlinks: new Map(),
    selectedPath: null,
    recents: loadRecents(),
    error: null,
    viewMode: "split",
    draft: null,
    dirty: false,
    conflict: false,
    schema: DEFAULT_SCHEMA,
    schemaError: null,

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
          backlinks,
          selectedPath: null,
          recents,
          draft: null,
          dirty: false,
          conflict: false,
        });
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
        backlinks: new Map(),
        selectedPath: null,
        draft: null,
        dirty: false,
        conflict: false,
      });
    },

    setViewMode: (mode) => set({ viewMode: mode }),

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
        set({ docs, backlinks: buildBacklinks(docs), dirty: false, error: null });
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
