import { useState } from "react";
import {
  generateDocMessages,
  parseBundlePlan,
  parseWebsitePlan,
  planBundleMessages,
  renderWebsiteDocument,
  websiteDocPrompt,
  websitePlanPrompt,
  type PlannedDoc,
  type WebsitePlannedDoc,
} from "../core/ai";
import { starterBundleFiles } from "../core/starter";
import { slugify } from "../core/template";
import { tauriPlatform as platform } from "../platform";
import { loadModel, streamChat } from "./aiClient";
import { useStore } from "./store";

interface NewBundleDialogProps {
  onClose: () => void;
}

type DraftProvider = "openrouter" | "perplexity";

type Step =
  | { kind: "setup" }
  | { kind: "planning"; provider: DraftProvider }
  | {
      kind: "review";
      plan: PlannedDoc[];
      provider: DraftProvider;
      websiteUrl?: string;
      deselected: Set<string>;
    }
  | { kind: "generating"; plan: PlannedDoc[]; done: number; current: string };

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  const detail = (err as { message?: string } | null)?.message;
  return detail ?? String(err);
}

export function NewBundleDialog({ onClose }: NewBundleDialogProps) {
  const {
    openBundle,
    schema,
    aiReady,
    perplexityReady,
    setSettingsOpen,
  } = useStore();
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [mode, setMode] = useState<"sample" | "ai" | "website">("sample");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteInstructions, setWebsiteInstructions] = useState("");
  const [step, setStep] = useState<Step>({ kind: "setup" });
  const [error, setError] = useState<string | null>(null);

  const folder = slugify(name);
  const busy = step.kind === "planning" || step.kind === "generating";
  const setupReady =
    name.trim() !== "" &&
    parent !== null &&
    (mode === "sample" ||
      (mode === "ai" && description.trim() !== "") ||
      (mode === "website" && websiteUrl.trim() !== "" && perplexityReady));

  /** Write files into the new bundle, init git, commit, open. */
  const finalize = async (files: { path: string; content: string }[]) => {
    if (parent === null) return;
    const root = `${parent}/${folder}`;
    try {
      await platform.gitInit(root);
      for (const file of files) {
        await platform.writeDoc(root, file.path, file.content);
      }
      try {
        await platform.gitCommit(root, "Initial bundle", false);
      } catch {
        // Identity not configured etc. — the bundle still works; publish
        // flows will surface git problems in their own UI.
      }
    } catch (err) {
      setError(describe(err));
      setStep({ kind: "setup" });
      return;
    }
    onClose();
    await openBundle(root);
  };

  const createSample = () => void finalize(starterBundleFiles(name.trim()));

  const startPlanning = async () => {
    const model = loadModel();
    if (model === "") {
      setError("Pick a default model in Settings (⌘,) first.");
      return;
    }
    setError(null);
    setStep({ kind: "planning", provider: "openrouter" });
    let text = "";
    await streamChat(
      model,
      planBundleMessages(schema, name.trim(), description.trim()),
      {
        onDelta: (t) => {
          text += t;
        },
        onDone: () => {
          const plan = parseBundlePlan(text);
          if (plan === null) {
            setError("The model didn't return a usable plan — try again.");
            setStep({ kind: "setup" });
          } else {
            setStep({
              kind: "review",
              plan,
              provider: "openrouter",
              deselected: new Set(),
            });
          }
        },
        onError: (message) => {
          setError(message);
          setStep({ kind: "setup" });
        },
      },
    );
  };

  const startWebsitePlanning = async () => {
    const url = websiteUrl.trim();
    setError(null);
    setStep({ kind: "planning", provider: "perplexity" });
    try {
      const text = await platform.perplexityAgent(
        url,
        websitePlanPrompt(
          schema,
          name.trim(),
          url,
          websiteInstructions.trim(),
        ),
        true,
      );
      const result = parseWebsitePlan(text, schema, url);
      if (result === null) {
        setError(
          "Perplexity returned a plan that wasn't safe or valid for this bundle — try again.",
        );
        setStep({ kind: "setup" });
        return;
      }
      setStep({
        kind: "review",
        plan: result.docs,
        provider: "perplexity",
        websiteUrl: url,
        deselected: new Set(),
      });
    } catch (err) {
      setError(describe(err));
      setStep({ kind: "setup" });
    }
  };

  const generate = async (
    plan: PlannedDoc[],
    provider: DraftProvider,
    sourceWebsiteUrl?: string,
  ) => {
    const model = provider === "openrouter" ? loadModel() : "";
    const files: { path: string; content: string }[] = [];
    for (let i = 0; i < plan.length; i++) {
      const doc = plan[i];
      setStep({ kind: "generating", plan, done: i, current: doc.title });
      let body: string | null;
      if (provider === "perplexity") {
        const websiteDoc = doc as WebsitePlannedDoc;
        if (
          sourceWebsiteUrl === undefined ||
          !Array.isArray(websiteDoc.sourceUrls) ||
          websiteDoc.sourceUrls.length === 0
        ) {
          setError(`${doc.path}: the approved source list is missing.`);
          setStep({ kind: "setup" });
          return;
        }
        try {
          body = await platform.perplexityAgent(
            sourceWebsiteUrl,
            websiteDocPrompt(schema, websiteDoc),
            false,
          );
        } catch (err) {
          setError(`${doc.path}: ${describe(err)}`);
          body = null;
        }
      } else {
        body = await new Promise<string | null>((resolve) => {
          let text = "";
          void streamChat(
            model,
            generateDocMessages(schema, doc.type, doc.title, doc.brief),
            {
              onDelta: (textDelta) => {
                text += textDelta;
              },
              onDone: () => resolve(text),
              onError: (message) => {
                setError(`${doc.path}: ${message}`);
                resolve(null);
              },
            },
          );
        });
      }
      if (body === null || body.trim() === "") {
        if (body !== null) {
          setError(`${doc.path}: Perplexity returned an empty document.`);
        }
        setStep({ kind: "setup" });
        return;
      }
      files.push({
        path: doc.path,
        content:
          provider === "perplexity"
            ? renderWebsiteDocument(doc as WebsitePlannedDoc, body)
            : `---\ntype: ${doc.type}\ntitle: ${JSON.stringify(doc.title)}\n---\n\n# ${doc.title}\n\n${body.trim()}\n`,
      });
    }
    setStep({ kind: "generating", plan, done: plan.length, current: "" });
    await finalize(files);
  };

  return (
    <div className="dialog-overlay" onClick={busy ? undefined : onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>New bundle</h3>

        {step.kind === "setup" && (
          <>
            <label>
              Name
              <input
                autoFocus
                value={name}
                placeholder="e.g. Company Handbook"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Location
              <div className="dest-row">
                <button
                  type="button"
                  onClick={() =>
                    void platform.pickFolder().then((dir) => {
                      if (dir !== null) setParent(dir);
                    })
                  }
                >
                  Choose folder…
                </button>
                <span className="dest-path">
                  {parent !== null
                    ? `${parent}/${folder || "…"}`
                    : "no location chosen"}
                </span>
              </div>
            </label>

            <label className="fm-field-check radio-row">
              <input
                type="radio"
                checked={mode === "sample"}
                onChange={() => setMode("sample")}
              />
              Start with sample docs
            </label>
            <label className="fm-field-check radio-row">
              <input
                type="radio"
                checked={mode === "ai"}
                disabled={!aiReady}
                onChange={() => setMode("ai")}
              />
              Describe it — AI drafts the initial documents
              {!aiReady && (
                <span className="dialog-hint"> (connect OpenRouter in Settings)</span>
              )}
            </label>
            {mode === "ai" && (
              <label>
                What should this bundle contain?
                <textarea
                  autoFocus
                  value={description}
                  rows={3}
                  placeholder="e.g. Engineering onboarding and IT policies for a 40-person SaaS company"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            )}
            <label className="fm-field-check radio-row">
              <input
                type="radio"
                checked={mode === "website"}
                disabled={!perplexityReady}
                onChange={() => setMode("website")}
              />
              Research a website — Perplexity creates a source-grounded bundle
              {!perplexityReady && (
                <span className="dialog-hint"> (connect Perplexity in Settings)</span>
              )}
            </label>
            {!perplexityReady && (
              <button
                type="button"
                className="link-button integration-setup-link"
                onClick={() => setSettingsOpen(true)}
              >
                Connect Perplexity…
              </button>
            )}
            {mode === "website" && (
              <>
                <label>
                  Website URL
                  <input
                    autoFocus
                    type="url"
                    value={websiteUrl}
                    placeholder="https://example.com"
                    onChange={(event) => setWebsiteUrl(event.target.value)}
                  />
                </label>
                <label>
                  What should the bundle emphasize? <span>(optional)</span>
                  <textarea
                    value={websiteInstructions}
                    rows={2}
                    placeholder="e.g. Focus on services, operating policies, and customer guidance"
                    onChange={(event) =>
                      setWebsiteInstructions(event.target.value)
                    }
                  />
                </label>
                <p className="dialog-hint website-privacy-note">
                  Perplexity will receive this URL, retrieved public website
                  content, the bundle schema, and your instructions. Research is
                  limited to this website&apos;s domain and up to 10 fetched URLs
                  per tool call. API usage is billed by Perplexity.
                </p>
              </>
            )}

            {error !== null && <p className="dialog-error">{error}</p>}
            <div className="dialog-actions">
              <button onClick={onClose}>Cancel</button>
              <button
                className="primary"
                disabled={!setupReady}
                onClick={() => {
                  if (mode === "sample") createSample();
                  else if (mode === "website") void startWebsitePlanning();
                  else void startPlanning();
                }}
              >
                {mode === "sample" ? "Create" : "Plan bundle"}
              </button>
            </div>
          </>
        )}

        {step.kind === "planning" && (
          <p className="dialog-hint">
            {step.provider === "perplexity"
              ? "Perplexity is reading the OKF specification and researching the website…"
              : "Asking the model to plan the bundle…"}
          </p>
        )}

        {step.kind === "review" && (
          <>
            <p className="dialog-hint">
              Proposed structure — untick anything you don&apos;t want, then
              generate. The required index stays selected.
            </p>
            <ul className="plan-list">
              {step.plan.map((doc) => (
                <li key={doc.path}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!step.deselected.has(doc.path)}
                      disabled={doc.path === "index.md"}
                      onChange={(e) => {
                        const next = new Set(step.deselected);
                        if (e.target.checked) next.delete(doc.path);
                        else next.add(doc.path);
                        setStep({ ...step, deselected: next });
                      }}
                    />
                    <span className="plan-title">
                      {doc.title} <code>{doc.path}</code>
                    </span>
                    <span className="plan-brief">
                      {doc.brief}
                      {step.provider === "perplexity" &&
                        ` · ${(doc as WebsitePlannedDoc).sourceUrls.length} source${(doc as WebsitePlannedDoc).sourceUrls.length === 1 ? "" : "s"}`}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {error !== null && <p className="dialog-error">{error}</p>}
            <div className="dialog-actions">
              <button onClick={() => setStep({ kind: "setup" })}>Back</button>
              <button
                className="primary"
                disabled={step.plan.length === step.deselected.size}
                onClick={() =>
                  void generate(
                    step.plan.filter((d) => !step.deselected.has(d.path)),
                    step.provider,
                    step.websiteUrl,
                  )
                }
              >
                Generate {step.plan.length - step.deselected.size} documents
              </button>
            </div>
          </>
        )}

        {step.kind === "generating" && (
          <>
            <p className="dialog-hint">
              {step.done < step.plan.length
                ? `Drafting ${step.done + 1} of ${step.plan.length}: ${step.current}…`
                : "Finishing up…"}
            </p>
            <progress value={step.done} max={step.plan.length} />
          </>
        )}
      </div>
    </div>
  );
}
