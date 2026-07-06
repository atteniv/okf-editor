import type { ChatMessage } from "../core/ai";
import { tauriPlatform as platform } from "../platform";

export const OPENROUTER_KEY_NAME = "openrouter-api-key";
const MODEL_KEY = "okf-editor.ai-model";

export function loadModel(): string {
  return localStorage.getItem(MODEL_KEY) ?? "";
}

export function saveModel(model: string) {
  localStorage.setItem(MODEL_KEY, model);
}

export interface StreamHandle {
  cancel(): void;
}

/** Start a streaming chat; callbacks fire as chunks arrive. */
export async function streamChat(
  model: string,
  messages: ChatMessage[],
  callbacks: {
    onDelta(text: string): void;
    onDone(): void;
    onError(message: string): void;
  },
): Promise<StreamHandle> {
  const requestId = crypto.randomUUID();
  let finished = false;
  const unlisten = await platform.onAiStream((event) => {
    if (event.request_id !== requestId || finished) return;
    if (event.kind === "delta") {
      callbacks.onDelta(event.text);
    } else if (event.kind === "done") {
      finished = true;
      unlisten();
      callbacks.onDone();
    } else {
      finished = true;
      unlisten();
      callbacks.onError(event.text);
    }
  });

  platform.aiChat(requestId, model, messages).catch((err: unknown) => {
    if (finished) return;
    finished = true;
    unlisten();
    const detail =
      err instanceof Error
        ? err.message
        : ((err as { message?: string } | null)?.message ?? String(err));
    callbacks.onError(detail);
  });

  return {
    cancel: () => {
      void platform.aiCancel(requestId);
    },
  };
}
