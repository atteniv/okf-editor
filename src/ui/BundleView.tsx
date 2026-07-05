import { groupByType } from "../core/bundle";
import { useStore } from "./store";

const UNTYPED_LABEL = "(no type)";

export function BundleView() {
  const { root, docs, selectedPath, selectDoc, closeBundle } = useStore();
  const groups = groupByType(docs);
  const selected = selectedPath !== null ? docs.get(selectedPath) : undefined;

  return (
    <div className="bundle-view">
      <aside className="sidebar">
        <header>
          <button onClick={closeBundle} title="Back to start">
            ←
          </button>
          <span className="bundle-name" title={root ?? ""}>
            {root?.split("/").at(-1)}
          </span>
        </header>
        <nav className="doc-tree">
          {[...groups.entries()].map(([type, group]) => (
            <section key={type || UNTYPED_LABEL}>
              <h2>
                {type || UNTYPED_LABEL} <span className="count">{group.length}</span>
              </h2>
              <ul>
                {group.map((doc) => (
                  <li key={doc.path}>
                    <button
                      className={doc.path === selectedPath ? "selected" : ""}
                      onClick={() => selectDoc(doc.path)}
                      title={doc.path}
                    >
                      {doc.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </aside>

      <section className="doc-pane">
        {selected ? (
          <article>
            <header className="doc-header">
              <h1>{selected.title}</h1>
              <div className="doc-meta">
                <span className="doc-path">{selected.path}</span>
                {selected.tags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </header>
            {/* Read-only for M1 week 1; the CodeMirror editor lands in week 2. */}
            <pre className="doc-body">{selected.body}</pre>
          </article>
        ) : (
          <p className="empty">Select a document from the tree.</p>
        )}
      </section>
    </div>
  );
}
