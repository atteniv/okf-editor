import { useEffect, useState } from "react";
import { tauriPlatform as platform } from "../platform";
import { loadModel, OPENROUTER_KEY_NAME, saveModel } from "./aiClient";

interface AiSettingsProps {
  onClose: () => void;
  onChanged: () => void;
}

export function AiSettings({ onClose, onChanged }: AiSettingsProps) {
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [model, setModel] = useState(loadModel());
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void platform.secretExists(OPENROUTER_KEY_NAME).then(setHasKey);
    platform.aiModels().then(setModels).catch(() => setModels([]));
  }, []);

  const saveKey = async () => {
    const value = keyInput.trim();
    if (value === "") return;
    await platform.secretSet(OPENROUTER_KEY_NAME, value);
    setKeyInput("");
    setHasKey(true);
    setStatus("Key saved to your OS keychain.");
    platform.aiModels().then(setModels).catch(() => {});
    onChanged();
  };

  const clearKey = async () => {
    await platform.secretDelete(OPENROUTER_KEY_NAME);
    setHasKey(false);
    setStatus("Key removed.");
    onChanged();
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>AI settings (OpenRouter)</h3>
        <p className="dialog-hint">
          Bring your own <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">OpenRouter key</a>.
          It is stored in your OS keychain and used only from the app&apos;s
          native core — never exposed to documents or the web view. Using AI
          sends the relevant document content to OpenRouter under your key.
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
          {hasKey && (
            <button onClick={() => void clearKey()}>Remove key</button>
          )}
        </div>

        <label>
          Default model
          <input
            list="ai-models"
            value={model}
            placeholder="e.g. z-ai/glm-5.2"
            onChange={(e) => {
              setModel(e.target.value);
              saveModel(e.target.value);
            }}
          />
          <datalist id="ai-models">
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </datalist>
        </label>

        {status !== null && <p className="dialog-hint">{status}</p>}

        <div className="dialog-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
