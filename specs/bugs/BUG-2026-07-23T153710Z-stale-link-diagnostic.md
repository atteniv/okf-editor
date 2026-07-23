---
bug_id: BUG-2026-07-23T153710Z
status: resolved
severity: medium
scope: editor-diagnostics
title: Created link target leaves stale editor diagnostic
---

# BUG-2026-07-23T153710Z: Created link target leaves stale editor diagnostic

## Problem

When a user invokes **Create document** from a broken-link diagnostic, the target document is created and the bundle index is updated, but the open editor continues displaying the old broken-link marker and action. Invoking the apparently available action again reports `A document already exists at <path>`.

Expected behavior: creating the missing target immediately removes the resolved diagnostic from the open editor while leaving unrelated diagnostics visible.

Reproduction:

1. Open a document containing a Markdown link to a missing `.md` file.
2. Open the diagnostic tooltip and choose **Create document**.
3. Observe that the target appears in the file tree but the original editor marker persists.
4. Choose **Create document** from the stale marker again.
5. Observe the duplicate-document notice.

Security impact: **NONE** — no security exploit path identified.

## Root Cause Analysis

### Reproduce

The supplied screenshot confirms the duplicate-document notice while the source editor still renders the broken-link marker. The store's creation path adds the new document and synchronously recomputes bundle diagnostics.

### Isolate

The stale state is isolated to the CodeMirror presentation layer. Bundle state correctly contains the created path and recomputed diagnostics; the editor receives changed diagnostics through React props. The CodeMirror lint source reads diagnostics from a mutable reference, but CodeMirror is only prompted to lint after document edits or its scheduled lint lifecycle.

### Hypothesize

1. **Confirmed candidate:** changing diagnostics props updates the reference but does not request a new CodeMirror lint pass. Falsification: verify whether the editor dispatches a lint refresh when diagnostics change.
2. Store diagnostics remain stale after document creation. Falsification: inspect the create operation for bundle re-linting.
3. The target path is normalized differently after creation. Falsification: compare the created map key with the diagnostic target.

### Verify

The store's create operation inserts the exact target path and runs bundle linting immediately, falsifying hypotheses 2 and 3. The editor's prop effect only assigns `diagnosticsRef.current`; it does not dispatch `forceLinting` or a diagnostics effect. CodeMirror explicitly exposes `forceLinting(view)` for externally changed lint inputs. This confirms the single root cause: external diagnostic changes are not invalidating CodeMirror's cached lint presentation.

Risk level: **Low**. The change is localized to diagnostic synchronization in the editor wrapper.

## TDD Fix Plan

1. **RED**: Render an editor with a body diagnostic, then rerender it with that diagnostic removed and assert that CodeMirror no longer reports the diagnostic without changing document text.
   **GREEN**: When the diagnostics prop changes, update the lint source reference and force a CodeMirror lint pass.
   **verify**: `pnpm test -- src/ui/Editor.test.tsx`

2. **RED**: Rerender with one resolved and one remaining diagnostic and assert only the unresolved diagnostic remains.
   **GREEN**: Preserve the complete current diagnostics mapping during forced refresh.
   **verify**: `pnpm test -- src/ui/Editor.test.tsx`

**REFACTOR**: Keep callback and autocomplete references independent from diagnostic invalidation so unrelated prop changes do not trigger lint work.

## Acceptance Criteria

- [x] Creating a missing linked document removes its broken-link marker from the open editor immediately.
- [x] The stale **Create document** action cannot be invoked a second time.
- [x] Unrelated diagnostics remain visible.
- [x] No document edit or manual navigation is required to refresh diagnostics.
- [x] All new tests pass.
- [x] Existing tests still pass.

## Resolution

The editor now explicitly invalidates CodeMirror's lint state whenever externally computed diagnostics change. A dedicated editor integration test proves that a resolved diagnostic disappears without a text edit and that unrelated diagnostics remain visible.

Validation completed with 17 test files / 118 tests, TypeScript type checking, ESLint, production build, dependency audit, and diff whitespace checks. All passed; the existing bundle-size advisory remains non-blocking.
