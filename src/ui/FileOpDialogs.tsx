import { useState } from "react";
import type { SchemaConfig } from "../core/schema";
import { slugify } from "../core/template";

/** The pending file operation, owned by BundleView. */
export type FileOp =
  | { kind: "new-doc"; dirPath: string }
  | { kind: "new-folder"; dirPath: string }
  | { kind: "rename"; path: string }
  | { kind: "delete"; path: string };

interface DialogsProps {
  op: FileOp;
  schema: SchemaConfig;
  /** Whether the AI prompt field should be offered in New Document. */
  aiReady: boolean;
  onClose: () => void;
  onCreateDoc: (args: {
    dirPath: string;
    type: string;
    title: string;
    filename: string;
    aiPrompt?: string;
  }) => void;
  onCreateFolder: (dirPath: string, name: string) => void;
  onRename: (oldPath: string, newPath: string) => void;
  onDelete: (path: string) => void;
}

export function FileOpDialogs(props: DialogsProps) {
  return (
    <div className="dialog-overlay" onClick={props.onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <DialogBody {...props} />
      </div>
    </div>
  );
}

function DialogBody(props: DialogsProps) {
  switch (props.op.kind) {
    case "new-doc":
      return <NewDocForm {...props} dirPath={props.op.dirPath} />;
    case "new-folder":
      return <NewFolderForm {...props} dirPath={props.op.dirPath} />;
    case "rename":
      return <RenameForm {...props} path={props.op.path} />;
    case "delete":
      return <DeleteConfirm {...props} path={props.op.path} />;
  }
}

function locationLabel(dirPath: string): string {
  return dirPath === "" ? "bundle root" : `${dirPath}/`;
}

function NewDocForm({
  dirPath,
  schema,
  aiReady,
  onClose,
  onCreateDoc,
}: DialogsProps & { dirPath: string }) {
  const [type, setType] = useState(Object.keys(schema.types)[0] ?? "guide");
  const [title, setTitle] = useState("");
  const [filename, setFilename] = useState("");
  const [filenameTouched, setFilenameTouched] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const effectiveFilename = filenameTouched
    ? filename
    : title === ""
      ? ""
      : `${slugify(title)}.md`;
  const valid = title.trim() !== "" && effectiveFilename.endsWith(".md");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onCreateDoc({
          dirPath,
          type,
          title: title.trim(),
          filename: effectiveFilename,
          aiPrompt: aiPrompt.trim() === "" ? undefined : aiPrompt.trim(),
        });
        onClose();
      }}
    >
      <h3>New document in {locationLabel(dirPath)}</h3>
      <label>
        Type
        <input
          list="new-doc-types"
          value={type}
          onChange={(e) => setType(e.target.value)}
        />
        <datalist id="new-doc-types">
          {Object.entries(schema.types).map(([name, def]) => (
            <option key={name} value={name}>
              {def.label ?? name}
            </option>
          ))}
        </datalist>
      </label>
      <label>
        Title
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Expense policy"
        />
      </label>
      <label>
        Filename
        <input
          value={effectiveFilename}
          onChange={(e) => {
            setFilenameTouched(true);
            setFilename(e.target.value);
          }}
          placeholder="expense-policy.md"
        />
      </label>
      {aiReady && (
        <label>
          Generate content with AI (optional)
          <textarea
            value={aiPrompt}
            rows={3}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe what this document should contain — the body will be drafted for you."
          />
        </label>
      )}
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={!valid}>
          Create
        </button>
      </div>
    </form>
  );
}

function NewFolderForm({
  dirPath,
  onClose,
  onCreateFolder,
}: DialogsProps & { dirPath: string }) {
  const [name, setName] = useState("");
  const clean = slugify(name);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() === "") return;
        onCreateFolder(dirPath, clean);
        onClose();
      }}
    >
      <h3>New folder in {locationLabel(dirPath)}</h3>
      <label>
        Name
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. engineering"
        />
      </label>
      {name !== "" && clean !== name && (
        <p className="dialog-hint">
          Will be created as <code>{clean}/</code> (with an index.md)
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={name.trim() === ""}>
          Create
        </button>
      </div>
    </form>
  );
}

function RenameForm({
  path,
  onClose,
  onRename,
}: DialogsProps & { path: string }) {
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const currentName = path.slice(path.lastIndexOf("/") + 1);
  const [name, setName] = useState(currentName);
  const valid = name.endsWith(".md") && !name.includes("/") && name !== "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || name === currentName) return;
        onRename(path, dir === "" ? name : `${dir}/${name}`);
        onClose();
      }}
    >
      <h3>Rename {currentName}</h3>
      <label>
        New name
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="dialog-hint">
        Links from other documents will be updated automatically.
      </p>
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          className="primary"
          disabled={!valid || name === currentName}
        >
          Rename
        </button>
      </div>
    </form>
  );
}

function DeleteConfirm({
  path,
  onClose,
  onDelete,
}: DialogsProps & { path: string }) {
  return (
    <div>
      <h3>Delete {path.slice(path.lastIndexOf("/") + 1)}?</h3>
      <p className="dialog-hint">
        The file moves to your system trash (recoverable). Links pointing to it
        will be flagged as broken.
      </p>
      <div className="dialog-actions">
        <button type="button" onClick={onClose} autoFocus>
          Cancel
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            onDelete(path);
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
