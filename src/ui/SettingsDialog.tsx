import { useEffect, useMemo, useState } from "react";
import { tauriPlatform as platform } from "../platform";
import { loadModel, OPENROUTER_KEY_NAME, saveModel } from "./aiClient";

const GITHUB_KEY_NAME = "github-token";
const PERPLEXITY_KEY_NAME = "perplexity-api-key";
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
        <hr className="settings-divider" />
        <PerplexitySection onChanged={onChanged} />
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
      <details className="dialog-steps">
        <summary>Show me how to create one</summary>
        <ol>
          <li>
            Open{" "}
            <a
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noreferrer"
            >
              github.com/settings/personal-access-tokens/new
            </a>{" "}
            (or on GitHub: your profile photo → <strong>Settings</strong> →{" "}
            <strong>Developer settings</strong> →{" "}
            <strong>Personal access tokens</strong> →{" "}
            <strong>Fine-grained tokens</strong> → <strong>Generate new
            token</strong>).
          </li>
          <li>
            Give it a name (e.g. “OKF Editor”) and an expiration — GitHub
            requires one; you&apos;ll paste a fresh token here when it
            expires.
          </li>
          <li>
            Under <strong>Repository access</strong> choose{" "}
            <strong>Only select repositories</strong> and pick your bundle
            repository. (To let the app <em>create</em> repositories too,
            you&apos;d instead need broader Administration access — the app
            offers a connect-existing-repo path so you don&apos;t have to.)
          </li>
          <li>
            Under <strong>Permissions → Repository permissions</strong>, set{" "}
            <strong>Contents</strong> to <strong>Read and write</strong>.
            Nothing else is needed.
          </li>
          <li>
            Click <strong>Generate token</strong>, copy the value that starts
            with <code>github_pat_</code>, and paste it below. GitHub shows it
            only once.
          </li>
        </ol>
      </details>
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

function PerplexitySection({ onChanged }: { onChanged: () => void }) {
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [verified, setVerified] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const verifyKey = () => {
    platform
      .perplexityVerify()
      .then(() => {
        setVerified(true);
        setFailure(null);
      })
      .catch((err: unknown) => {
        setVerified(false);
        setFailure(`Key check failed: ${describe(err)}`);
      });
  };

  useEffect(() => {
    platform
      .secretExists(PERPLEXITY_KEY_NAME)
      .then((exists) => {
        setHasKey(exists);
        if (exists) verifyKey();
      })
      .catch((err: unknown) =>
        setFailure(`Keychain check failed: ${describe(err)}`),
      );
    
  }, []);

  const saveKey = async () => {
    const value = keyInput.trim();
    if (value === "") return;
    setFailure(null);
    try {
      await platform.secretSet(PERPLEXITY_KEY_NAME, value);
    } catch (err) {
      setFailure(`Could not save the key: ${describe(err)}`);
      return;
    }
    setKeyInput("");
    setHasKey(true);
    setStatus("Key saved to your OS keychain.");
    verifyKey();
    onChanged();
  };

  const clearKey = async () => {
    setFailure(null);
    try {
      await platform.secretDelete(PERPLEXITY_KEY_NAME);
    } catch (err) {
      setFailure(`Could not remove the key: ${describe(err)}`);
      return;
    }
    setHasKey(false);
    setVerified(false);
    setStatus("Key removed.");
    onChanged();
  };

  return (
    <section className="settings-section">
      <h4>Website research (Perplexity)</h4>
      <p className="dialog-hint">
        Optional integration for creating an OKF bundle from a public website.
        The website URL, retrieved content, bundle schema, and your instructions
        are sent to Perplexity under your own key. API billing is separate from
        a Perplexity Pro subscription.
      </p>
      <details className="dialog-steps">
        <summary>Show me how to get a key</summary>
        <ol>
          <li>
            Open the{" "}
            <a
              href="https://console.perplexity.ai"
              target="_blank"
              rel="noreferrer"
            >
              Perplexity API Console
            </a>
            , add billing credit, and generate an API key.
          </li>
          <li>
            Paste the key below. It stays in your OS keychain and is used only
            by the app&apos;s native core.
          </li>
          <li>
            Website import uses Perplexity&apos;s Agent API search and URL-fetch
            tools, so both model and tool usage may be billed.
          </li>
        </ol>
      </details>
      <label>
        API key{" "}
        {verified ? (
          <span className="ok">✓ connected</span>
        ) : (
          hasKey && <span className="ok">✓ saved</span>
        )}
        <input
          type="password"
          value={keyInput}
          placeholder={hasKey ? "•••••••• (enter to replace)" : "pplx-…"}
          onChange={(event) => setKeyInput(event.target.value)}
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
  const [keyInfo, setKeyInfo] = useState<string | null>(null);
  const [capExhausted, setCapExhausted] = useState(false);
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

  const verifyKey = () => {
    platform
      .aiVerify()
      .then((info) => {
        const label = info.label !== null ? `key “${info.label}” valid` : "key valid";
        const spend =
          info.limit !== null
            ? ` — $${(info.usage ?? 0).toFixed(2)} of $${info.limit.toFixed(2)} key limit used`
            : "";
        setKeyInfo(label + spend);
        setCapExhausted(info.limit !== null && (info.usage ?? 0) >= info.limit);
        setFailure(null);
      })
      .catch((err: unknown) => {
        setKeyInfo(null);
        setCapExhausted(false);
        setFailure(describe(err));
      });
  };

  useEffect(() => {
    platform
      .secretExists(OPENROUTER_KEY_NAME)
      .then((exists) => {
        setHasKey(exists);
        if (exists) verifyKey();
      })
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
    verifyKey();
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
    setKeyInfo(null);
    setCapExhausted(false);
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
      <details className="dialog-steps">
        <summary>Show me how to get one</summary>
        <ol>
          <li>
            OpenRouter is one account/key for many AI models (GLM, Claude,
            GPT, Gemini, …) with pay-as-you-go pricing. Create an account at{" "}
            <a href="https://openrouter.ai" target="_blank" rel="noreferrer">
              openrouter.ai
            </a>{" "}
            (sign-in with Google or GitHub works).
          </li>
          <li>
            Add credit under{" "}
            <a
              href="https://openrouter.ai/settings/credits"
              target="_blank"
              rel="noreferrer"
            >
              Credits
            </a>{" "}
            — even $5–10 goes a long way for document drafting.
          </li>
          <li>
            Go to{" "}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
              Keys
            </a>{" "}
            → <strong>Create Key</strong>. Name it (e.g. “OKF Editor”). The
            optional <strong>credit limit</strong> caps what this key alone
            can spend — useful, but if it runs out the app will tell you.
          </li>
          <li>
            Copy the key (starts with <code>sk-or-</code>) and paste it below
            — it&apos;s shown only once.
          </li>
          <li>
            Pick a default model underneath — any model id works; the list
            filters as you type.
          </li>
        </ol>
      </details>

      <label>
        API key{" "}
        {keyInfo !== null ? (
          <span className="ok">✓ {keyInfo}</span>
        ) : (
          hasKey && <span className="ok">✓ saved</span>
        )}
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
      {capExhausted && (
        <p className="dialog-error">
          This key&apos;s own spending cap is used up (separate from your
          account credits). Raise the key&apos;s credit limit on{" "}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
            openrouter.ai/keys
          </a>{" "}
          — make sure it&apos;s the key shown above — then{" "}
          <button className="link-button" onClick={verifyKey}>
            re-check
          </button>
          . The numbers are live from OpenRouter.
        </p>
      )}
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
