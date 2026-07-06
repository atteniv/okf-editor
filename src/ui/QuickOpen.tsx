import { useMemo, useState } from "react";
import type { DocMeta } from "../core/bundle";

interface QuickOpenProps {
  docs: Map<string, DocMeta>;
  onSelect: (path: string) => void;
  onClose: () => void;
}

const MAX_RESULTS = 12;

/** Cmd+P quick-open: fuzzy-ish match on title, path, and tags. */
export function QuickOpen({ docs, onSelect, onClose }: QuickOpenProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...docs.values()];
    if (q === "") {
      return all.slice(0, MAX_RESULTS);
    }
    const scored = all
      .map((doc) => ({ doc, score: score(doc, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
    return scored.slice(0, MAX_RESULTS).map((r) => r.doc);
  }, [docs, query]);

  const pick = (path: string) => {
    onSelect(path);
    onClose();
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="quick-open" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          placeholder="Open document by title, path, or tag…"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && results[active] !== undefined) {
              pick(results[active].path);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
        />
        <ul>
          {results.map((doc, i) => (
            <li key={doc.path}>
              <button
                className={i === active ? "active" : ""}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(doc.path)}
              >
                <span className="qo-title">{doc.title}</span>
                <span className="qo-path">{doc.path}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="qo-none">No matches</li>}
        </ul>
      </div>
    </div>
  );
}

function score(doc: DocMeta, q: string): number {
  const title = doc.title.toLowerCase();
  const path = doc.path.toLowerCase();
  if (title.startsWith(q)) return 100;
  if (title.includes(q)) return 60;
  if (path.includes(q)) return 40;
  if (doc.tags.some((t) => t.toLowerCase().includes(q))) return 20;
  return 0;
}
