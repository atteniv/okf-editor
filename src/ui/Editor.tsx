import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import {
  forceLinting,
  linter,
  lintGutter,
  type Diagnostic as CmDiagnostic,
} from "@codemirror/lint";
import { Compartment, StateEffect } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";
import type { Diagnostic, QuickFix } from "../core/lint";
import { useStore } from "./store";
import { useResolvedTheme } from "./useResolvedTheme";

const refreshLintEffect = StateEffect.define<void>();

interface EditorProps {
  /** Doc identity — remounting state when the user switches documents. */
  docPath: string;
  value: string;
  onChange: (text: string) => void;
  /** Body-scoped diagnostics for the current draft (offsets into value). */
  diagnostics: Diagnostic[];
  /** Link-autocomplete candidates, already relative to this doc. */
  linkTargets: string[];
  /** Receives an insert-at-cursor function while the editor is mounted. */
  registerInsert?: (insert: ((text: string) => void) | null) => void;
  /** Receives a scroll-to-range function while the editor is mounted. */
  registerNavigate?: (
    navigate: ((from: number, to: number) => void) | null,
  ) => void;
  /** Invoked when the user clicks a quick-fix action in a lint tooltip. */
  onQuickFix?: (fix: QuickFix) => void;
}

/** Thin React wrapper around CodeMirror 6. */
export function Editor({
  docPath,
  value,
  onChange,
  diagnostics,
  linkTargets,
  registerInsert,
  registerNavigate,
  onQuickFix,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef(new Compartment());
  const themePreference = useStore((state) => state.themePreference);
  const resolvedTheme = useResolvedTheme(themePreference);
  const onChangeRef = useRef(onChange);
  const diagnosticsRef = useRef(diagnostics);
  const linkTargetsRef = useRef(linkTargets);
  const onQuickFixRef = useRef(onQuickFix);
  useEffect(() => {
    onChangeRef.current = onChange;
    linkTargetsRef.current = linkTargets;
    onQuickFixRef.current = onQuickFix;
  }, [onChange, linkTargets, onQuickFix]);

  // Lint inputs come from bundle state rather than editor transactions.
  // Explicitly invalidate CodeMirror when, for example, creating a missing
  // linked document resolves a diagnostic without changing the open text.
  useEffect(() => {
    diagnosticsRef.current = diagnostics;
    const view = viewRef.current;
    if (view !== null) {
      view.dispatch({ effects: refreshLintEffect.of(undefined) });
      forceLinting(view);
    }
  }, [diagnostics]);

  // (Re)create the view when the document identity changes.
  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      doc: value,
      parent: containerRef.current,
      extensions: [
        basicSetup,
        themeCompartmentRef.current.of(resolvedTheme === "dark" ? oneDark : []),
        markdown(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        // Diagnostics come from core/lint via the ref; re-runs on doc changes.
        lintGutter(),
        linter(
          (view) => {
            const max = view.state.doc.length;
            return diagnosticsRef.current
              .filter((d) => d.where === "body" && d.from !== undefined)
              .filter((d) => d.from! <= max && d.to! <= max)
              .map((d): CmDiagnostic => {
                const fix = d.fix;
                return {
                  from: d.from!,
                  to: d.to!,
                  severity: d.severity,
                  message: `${d.message} (${d.rule})`,
                  ...(fix !== undefined
                    ? {
                        actions: [
                          {
                            name:
                              fix.kind === "create-doc"
                                ? "Create document"
                                : "Fix",
                            apply: () => onQuickFixRef.current?.(fix),
                          },
                        ],
                      }
                    : {}),
                };
              });
          },
          {
            delay: 300,
            needsRefresh: (update) =>
              update.transactions.some((transaction) =>
                transaction.effects.some((effect) =>
                  effect.is(refreshLintEffect),
                ),
              ),
          },
        ),
        autocompletion({
          override: [
            (context: CompletionContext): CompletionResult | null => {
              // Complete doc paths inside markdown link destinations: ](…
              const match = context.matchBefore(/\]\([^()\s]*/);
              if (match === null) return null;
              return {
                from: match.from + 2,
                options: linkTargetsRef.current.map((path) => ({
                  label: path,
                  type: "text",
                })),
                validFor: /^[^()\s]*$/,
              };
            },
          ],
        }),
      ],
    });
    viewRef.current = view;
    registerInsert?.((text) => {
      view.dispatch(view.state.replaceSelection(text));
      view.focus();
    });
    registerNavigate?.((from, to) => {
      const max = view.state.doc.length;
      if (from > max) return;
      view.dispatch({
        selection: { anchor: from, head: Math.min(to, max) },
        effects: EditorView.scrollIntoView(from, { y: "center" }),
      });
      view.focus();
    });
    return () => {
      registerInsert?.(null);
      registerNavigate?.(null);
      view.destroy();
      viewRef.current = null;
    };
    // `value` is deliberately not a dependency: while the doc is open the
    // editor is the source of truth; external updates come through below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docPath]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(
        resolvedTheme === "dark" ? oneDark : [],
      ),
    });
  }, [resolvedTheme]);

  // External value changes (reload-from-disk) — replace content in place.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div className="editor" ref={containerRef} />;
}
