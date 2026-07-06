import { useEffect, useMemo, useState } from "react";
import { tauriPlatform as platform } from "../platform";
import { loadModel, OPENROUTER_KEY_NAME, saveModel } from "./aiClient";

const GITHUB_KEY_NAME = "github-token";
const MAX_VISIBLE = 20;

/** Familiar picks shown before the user types (only ones the catalog has). */
const FEATURED_MATCHERS = [
  "glm",
  "claude",
  "gpt",
  "gemini",
  "deepseek",
  "llama",
  "mistral",
  "qwen",
];

interface SettingsDialogProps {
  onClose: () => void;
  onChanged: () => void;
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  const detail = (err as { message?: string } | null)?.message;
  return detail ?? String(err);
}

export function SettingsDialog({ onClose, onChanged }: SettingsDialogProps) {
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog settings-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>
        <GithubSection onChanged={onChanged} />
        <hr className="settings-divider" />
        <AiSection onChanged={onChanged} />
        <div className="dialog-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function GithubSection({ onChanged }: { onChanged: () => void }) {
  const [hasToken, setHasToken] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [identity, setIdentity] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const verify = () => {
    platform
      .githubVerify()
      .then((user) => {
        setIdentity(
          user.name !== null ? `${user.name} (@${user.login})` : `@${user.login}`,
        );
        setFailure(null);
      })
      .catch((err: unknown) => {
        setIdentity(null);
        setFailure(`Token check failed: ${describe(err)}`);
      });
  };

  useEffect(() => {
    platform
      .secretExists(GITHUB_KEY_NAME)
      .then((exists) => {
        setHasToken(exists);
        if (exists) verify();
      })
      .catch((err: unknown) => setFailure(describe(err)));
     
  }, []);

  const saveToken = async () => {
    const value = tokenInput.trim();
    if (value === "") return;
    setFailure(null);
    try {
      await platform.secretSet(GITHUB_KEY_NAME, value);
    } catch (err) {
      setFailure(`Could not save the token: ${describe(err)}`);
      return;
    }
    setTokenInput("");
    setHasToken(true);
    setStatus("Token saved to your OS keychain.");
    verify();
    onChanged();
  };

  const clearToken = async () => {
    setFailure(null);
    try {
      await platform.secretDelete(GITHUB_KEY_NAME);
    } catch (err) {
      setFailure(`Could not remove the token: ${describe(err)}`);
      return;
    }
    setHasToken(false);
    setIdentity(null);
    setStatus("Token removed.");
    onChanged();
  };

  return (
    <section className="settings-section">
      <h4>GitHub</h4>
      <p className="dialog-hint">
        Personal access token for clone, pull, and push. Recommended: a{" "}
        <a
          href="https://github.com/settings/personal-access-tokens/new"
          target="_blank"
          rel="noreferrer"
        >
          fine-grained token
        </a>{" "}
        scoped to just your OKF repository with{" "}
        <strong>Contents: read &amp; write</strong> — least privilege. Stored
        in your OS keychain; used only from the app&apos;s native core.
      </p>
      <label>
        Token{" "}
        {identity !== null && (
          <span className="ok">✓ connected as {identity}</span>
        )}
        {identity === null && hasToken && <span className="ok">✓ saved</span>}
        <input
          type="password"
          value={tokenInput}
          placeholder={
            hasToken ? "•••••••• (enter to replace)" : "github_pat_… or ghp_…"
          }
          onChange={(e) => setTokenInput(e.target.value)}
        />
      </label>
      <div className="dialog-actions" style={{ justifyContent: "flex-start" }}>
        <button
          className="primary"
          disabled={tokenInput.trim() === ""}
          onClick={() => void saveToken()}
        >
          Save token
        </button>
        {hasToken && <button onClick={() => void clearToken()}>Remove</button>}
      </div>
      {status !== null && <p className="dialog-hint">{status}</p>}
      {failure !== null && <p className="dialog-error">{failure}</p>}
    </section>
  );
}

function AiSection({ onChanged }: { onChanged: () => void }) {
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [model, setModel] = useState(loadModel());
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const loadModels = () => {
    platform
      .aiModels()
      .then((list) => {
        setModels(list);
        if (list.length === 0) setFailure("Model list came back empty.");
      })
      .catch((err: unknown) =>
        setFailure(`Could not load the model list: ${describe(err)}`),
      );
  };

  useEffect(() => {
    platform
      .secretExists(OPENROUTER_KEY_NAME)
      .then(setHasKey)
      .catch((err: unknown) =>
        setFailure(`Keychain check failed: ${describe(err)}`),
      );
    loadModels();
     
  }, []);

  const saveKey = async () => {
    const value = keyInput.trim();
    if (value === "") return;
    setFailure(null);
    try {
      await platform.secretSet(OPENROUTER_KEY_NAME, value);
    } catch (err) {
      setFailure(`Could not save the key: ${describe(err)}`);
      return;
    }
    setKeyInput("");
    setHasKey(true);
    setStatus("Key saved to your OS keychain.");
    loadModels();
    onChanged();
  };

  const clearKey = async () => {
    setFailure(null);
    try {
      await platform.secretDelete(OPENROUTER_KEY_NAME);
    } catch (err) {
      setFailure(`Could not remove the key: ${describe(err)}`);
      return;
    }
    setHasKey(false);
    setStatus("Key removed.");
    onChanged();
  };

  return (
    <section className="settings-section">
      <h4>AI (OpenRouter)</h4>
      <p className="dialog-hint">
        Bring your own{" "}
        <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
          OpenRouter key
        </a>
        . Stored in your OS keychain; used only from the app&apos;s native
        core. Using AI sends the relevant document content to OpenRouter
        under your key.
      </p>

      <label>
        API key {hasKey && <span className="ok">✓ configured</span>}
        <input
          type="password"
          value={keyInput}
          placeholder={hasKey ? "•••••••• (enter to replace)" : "sk-or-…"}
          onChange={(e) => setKeyInput(e.target.value)}
        />
      </label>
      <div className="dialog-actions" style={{ justifyContent: "flex-start" }}>
        <button
          className="primary"
          disabled={keyInput.trim() === ""}
          onClick={() => void saveKey()}
        >
          Save key
        </button>
        {hasKey && <button onClick={() => void clearKey()}>Remove key</button>}
      </div>

      <ModelPicker
        models={models}
        value={model}
        onChange={(value) => {
          setModel(value);
          saveModel(value);
        }}
      />

      {status !== null && <p className="dialog-hint">{status}</p>}
      {failure !== null && <p className="dialog-error">{failure}</p>}
    </section>
  );
}

interface ModelPickerProps {
  models: { id: string; name: string }[];
  value: string;
  onChange: (value: string) => void;
}

function ModelPicker({ models, value, onChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false);

  const visible = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (q !== "") {
      return models
        .filter(
          (m) =>
            m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
        )
        .slice(0, MAX_VISIBLE);
    }
    // No query: a familiar shortlist — one leading entry per known family,
    // padded with the head of the catalog.
    const featured: typeof models = [];
    for (const matcher of FEATURED_MATCHERS) {
      const hit = models.find((m) => m.id.toLowerCase().includes(matcher));
      if (hit !== undefined && !featured.includes(hit)) featured.push(hit);
    }
    for (const m of models) {
      if (featured.length >= MAX_VISIBLE) break;
      if (!featured.includes(m)) featured.push(m);
    }
    return featured;
  }, [models, value]);

  return (
    <label className="model-picker">
      Default model
      <input
        value={value}
        placeholder={models.length > 0 ? "Search models…" : "e.g. z-ai/glm-5.2"}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && visible.length > 0 && (
        <ul className="model-list">
          {visible.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={m.id === value ? "selected" : ""}
                // mousedown beats the input's blur-close
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                <span className="model-id">{m.id}</span>
                {m.name !== m.id && <span className="model-name">{m.name}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
