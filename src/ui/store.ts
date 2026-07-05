import { create } from "zustand";
import { buildIndex, type DocMeta } from "../core/bundle";
import { tauriPlatform as platform } from "../platform";

const RECENTS_KEY = "okf-editor.recent-projects";
const RECENTS_MAX = 8;

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

interface AppState {
  view: "start" | "bundle";
  root: string | null;
  docs: Map<string, DocMeta>;
  backlinks: Map<string, string[]>;
  selectedPath: string | null;
  recents: string[];
  error: string | null;

  openFolder(): Promise<void>;
  openBundle(root: string): Promise<void>;
  selectDoc(path: string): void;
  closeBundle(): void;
}

export const useStore = create<AppState>((set, get) => ({
  view: "start",
  root: null,
  docs: new Map(),
  backlinks: new Map(),
  selectedPath: null,
  recents: loadRecents(),
  error: null,

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
      set({ view: "bundle", root, docs, backlinks, selectedPath: null, recents });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : ((err as { message?: string })?.message ?? String(err));
      set({ error: `Could not open bundle: ${message}` });
    }
  },

  selectDoc: (path) => set({ selectedPath: path }),

  closeBundle: () =>
    set({ view: "start", root: null, docs: new Map(), selectedPath: null }),
}));
