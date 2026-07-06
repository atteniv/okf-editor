import { useRef, useState } from "react";
import { chatMessages, type ChatMessage } from "../core/ai";
import type { DocMeta } from "../core/bundle";
import type { SchemaConfig } from "../core/schema";
import { loadModel, streamChat, type StreamHandle } from "./aiClient";

interface ChatPanelProps {
  schema: SchemaConfig;
  /** The open doc (current draft state) for grounding; null when none. */
  doc: DocMeta | null;
  aiReady: boolean;
  onOpenSettings: () => void;
  onInsert: ((text: string) => void) | null;
  onClose: () => void;
}

export function ChatPanel({
  schema,
  doc,
  aiReady,
  onOpenSettings,
  onInsert,
  onClose,
}: ChatPanelProps) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [includeDoc, setIncludeDoc] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<StreamHandle | null>(null);

  const send = async () => {
    const prompt = input.trim();
    if (prompt === "" || streaming) return;
    const model = loadModel();
    if (model === "") {
      setError("Pick a default model in AI settings first.");
      return;
    }
    setError(null);
    setInput("");
    const nextHistory: ChatMessage[] = [
      ...history,
      { role: "user", content: prompt },
    ];
    setHistory([...nextHistory, { role: "assistant", content: "" }]);
    setStreaming(true);

    handleRef.current = await streamChat(
      model,
      chatMessages(schema, includeDoc ? doc : null, nextHistory),
      {
        onDelta: (text) =>
          setHistory((h) => {
            const updated = [...h];
            const last = updated.at(-1)!;
            updated[updated.length - 1] = {
              ...last,
              content: last.content + text,
            };
            return updated;
          }),
        onDone: () => setStreaming(false),
        onError: (message) => {
          setStreaming(false);
          setError(message);
        },
      },
    );
  };

  const stop = () => {
    handleRef.current?.cancel();
    setStreaming(false);
  };

  return (
    <aside className="chat-panel">
      <header>
        <span className="chat-title">AI</span>
        <label className="chat-context" title="Ground the chat in the open document">
          <input
            type="checkbox"
            checked={includeDoc}
            disabled={doc === null}
            onChange={(e) => setIncludeDoc(e.target.checked)}
          />
          include open doc
        </label>
        <button onClick={onOpenSettings} title="AI settings">
          ⚙
        </button>
        <button onClick={onClose} title="Close panel">
          ✕
        </button>
      </header>

      {!aiReady ? (
        <div className="chat-empty">
          <p>Connect OpenRouter to use AI assistance.</p>
          <button className="primary" onClick={onOpenSettings}>
            Open AI settings
          </button>
        </div>
      ) : (
        <>
          <div className="chat-messages">
            {history.length === 0 && (
              <p className="chat-empty-hint">
                Ask anything — drafting, rewriting, summarizing.
                {doc !== null && " The open document is included as context."}
              </p>
            )}
            {history.map((message, i) => (
              <div key={i} className={`chat-msg ${message.role}`}>
                <div className="chat-msg-body">
                  {message.content === "" && streaming && i === history.length - 1
                    ? "…"
                    : message.content}
                </div>
                {message.role === "assistant" &&
                  message.content !== "" &&
                  onInsert !== null && (
                    <button
                      className="chat-insert"
                      onClick={() => onInsert(message.content)}
                      title="Insert at cursor"
                    >
                      Insert at cursor
                    </button>
                  )}
              </div>
            ))}
          </div>
          {error !== null && <div className="chat-error">{error}</div>}
          <footer>
            <textarea
              value={input}
              rows={2}
              placeholder="Ask the assistant…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            {streaming ? (
              <button onClick={stop}>Stop</button>
            ) : (
              <button
                className="primary"
                disabled={input.trim() === ""}
                onClick={() => void send()}
              >
                Send
              </button>
            )}
          </footer>
        </>
      )}
    </aside>
  );
}
