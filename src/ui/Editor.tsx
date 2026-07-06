import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { linter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";
import type { Diagnostic } from "../core/lint";

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
}

/** Thin React wrapper around CodeMirror 6. */
export function Editor({
  docPath,
  value,
  onChange,
  diagnostics,
  linkTargets,
  registerInsert,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const diagnosticsRef = useRef(diagnostics);
  const linkTargetsRef = useRef(linkTargets);
  useEffect(() => {
    onChangeRef.current = onChange;
    diagnosticsRef.current = diagnostics;
    linkTargetsRef.current = linkTargets;
  }, [onChange, diagnostics, linkTargets]);

  // (Re)create the view when the document identity changes.
  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      doc: value,
      parent: containerRef.current,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        // Diagnostics come from core/lint via the ref; re-runs on doc changes.
        linter(
          (view) => {
            const max = view.state.doc.length;
            return diagnosticsRef.current
              .filter((d) => d.where === "body" && d.from !== undefined)
              .filter((d) => d.from! <= max && d.to! <= max)
              .map(
                (d): CmDiagnostic => ({
                  from: d.from!,
                  to: d.to!,
                  severity: d.severity,
                  message: `${d.message} (${d.rule})`,
                }),
              );
          },
          { delay: 300 },
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
    return () => {
      registerInsert?.(null);
      view.destroy();
      viewRef.current = null;
    };
    // `value` is deliberately not a dependency: while the doc is open the
    // editor is the source of truth; external updates come through below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docPath]);

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
