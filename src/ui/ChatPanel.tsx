import { useMemo, useRef, useState } from "react";
import { chatMessages, extractReferences, type ChatMessage } from "../core/ai";
import type { DocMeta } from "../core/bundle";
import type { SchemaConfig } from "../core/schema";
import { loadModel, streamChat, type StreamHandle } from "./aiClient";

interface ChatPanelProps {
  schema: SchemaConfig;
  /** The open doc (current draft state) for grounding; null when none. */
  doc: DocMeta | null;
  /** All bundle docs, for @-references. */
  docs: Map<string, DocMeta>;
  aiReady: boolean;
  onOpenSettings: () => void;
  onInsert: ((text: string) => void) | null;
  onClose: () => void;
}

const MAX_MENTIONS = 8;

export function ChatPanel({
  schema,
  doc,
  docs,
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // @-mention state: an active "@query" fragment before the cursor.
  const [mention, setMention] = useState<{ start: number; query: string } | null>(
    null,
  );
  const mentionMatches = useMemo(() => {
    if (mention === null) return [];
    const q = mention.query.toLowerCase();
    return [...docs.values()]
      .filter(
        (d) =>
          d.path.toLowerCase().includes(q) || d.title.toLowerCase().includes(q),
      )
      .slice(0, MAX_MENTIONS);
  }, [mention, docs]);

  const detectMention = (value: string, cursor: number) => {
    const before = value.slice(0, cursor);
    const match = before.match(/@([^\s@[\]]*)$/);
    setMention(
      match === null
        ? null
        : { start: cursor - match[0].length, query: match[1] },
    );
  };

  const pickMention = (path: string) => {
    if (mention === null) return;
    const cursor = inputRef.current?.selectionStart ?? input.length;
    const next = `${input.slice(0, mention.start)}@[${path}] ${input.slice(cursor)}`;
    setInput(next);
    setMention(null);
    inputRef.current?.focus();
  };

  const send = async (rawText?: string) => {
    const prompt = (rawText ?? input).trim();
    if (prompt === "" || streaming) return;
    const model = loadModel();
    if (model === "") {
      setError("Pick a default model in Settings first (⌘,).");
      return;
    }
    setError(null);
    setInput("");
    setMention(null);
    const references = extractReferences(prompt, docs);
    const nextHistory: ChatMessage[] = [
      ...history,
      { role: "user", content: prompt },
    ];
    setHistory([...nextHistory, { role: "assistant", content: "" }]);
    setStreaming(true);

    handleRef.current = await streamChat(
      model,
      chatMessages(schema, includeDoc ? doc : null, references, nextHistory),
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

  const suggestions =
    doc !== null
      ? [
          "Summarize this document",
          "Improve the writing of this document",
          "What sections are missing from this document?",
        ]
      : ["Draft an outline for a new document"];

  return (
    <aside className="chat-panel">
      <header>
        <SparkleIcon />
        <span className="chat-title">Assistant</span>
        <label className="chat-context" title="Ground the chat in the open document">
          <input
            type="checkbox"
            checked={includeDoc}
            disabled={doc === null}
            onChange={(e) => setIncludeDoc(e.target.checked)}
          />
          open doc
        </label>
        <button onClick={onOpenSettings} title="Settings (⌘,)">
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
            Open Settings
          </button>
        </div>
      ) : (
        <>
          <div className="chat-messages">
            {history.length === 0 && (
              <div className="chat-welcome">
                <p className="chat-welcome-headline">
                  Type <span className="at">@</span> to reference bundle
                  documents
                </p>
                <ul className="chat-suggestions">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion}>
                      <button onClick={() => void send(suggestion)}>
                        ↪ {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
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
            <div className="chat-input">
              {mention !== null && mentionMatches.length > 0 && (
                <ul className="mention-list">
                  {mentionMatches.map((d) => (
                    <li key={d.path}>
                      <button
                        // mousedown beats the textarea's blur
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickMention(d.path);
                        }}
                      >
                        <span className="mention-title">{d.title}</span>
                        <span className="mention-path">{d.path}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <textarea
                ref={inputRef}
                value={input}
                rows={2}
                placeholder="Ask the assistant — @ references a document"
                onChange={(e) => {
                  setInput(e.target.value);
                  detectMention(
                    e.target.value,
                    e.target.selectionStart ?? e.target.value.length,
                  );
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && mention !== null) {
                    setMention(null);
                  } else if (e.key === "Enter" && !e.shiftKey) {
                    if (mention !== null && mentionMatches.length > 0) {
                      e.preventDefault();
                      pickMention(mentionMatches[0].path);
                    } else {
                      e.preventDefault();
                      void send();
                    }
                  }
                }}
                onBlur={() => setTimeout(() => setMention(null), 150)}
              />
            </div>
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

export function SparkleIcon() {
  return (
    <svg className="sparkle-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10 1.5c.3 3.2 1.2 5.3 2.5 6.5S15.8 9.8 18.5 10c-3.2.3-5.3 1.2-6.5 2.5S10.2 15.8 10 18.5c-.3-3.2-1.2-5.3-2.5-6.5S4.2 10.2 1.5 10c3.2-.3 5.3-1.2 6.5-2.5S9.8 4.2 10 1.5Z"
      />
    </svg>
  );
}
