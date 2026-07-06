# Atteniv OKF Editor — Design Document

**Status:** draft v1 · July 2026
**Companion docs:** [`PROPOSAL.md`](../PROPOSAL.md) (why / scope), [`docs/PLAN.md`](PLAN.md) (schedule / milestones)

This document turns the proposal into a buildable design: concrete stack choices,
module boundaries, data formats, command signatures, and the security/testing
posture. Where the proposal left a question open, this doc records a decision and
its rationale (§2). Decisions are cheap to reverse before code lands — object early.

---

## 1. Goals and non-goals

**Goals (MVP):**
- Open a local OKF bundle (a folder of markdown + YAML frontmatter) and edit it
  with schema awareness: frontmatter form, markdown editor, live preview, inline
  lint, cross-document link autocomplete, new-doc-from-template.
- Publish via git: status/commit/push/pull on a cloned repo; clone an existing
  repo with a PAT. Token lives in the OS keychain.
- Run on macOS, Windows, Linux as a small signed desktop app.

**Non-goals (see proposal §7):**
- Data-model / ER-diagram editing, real-time collaboration, auto-merge conflict
  resolution, hosted/web deployment (kept *possible*, not built).
- Graph visualization (deferred; the link index is designed so a graph view can
  be added without rework).

## 2. Decisions (resolving the proposal's open questions)

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | React vs Svelte | **React + TypeScript** | This is an OSS brand play — maximize the contributor pool and ecosystem (CodeMirror bindings, Radix, testing tools). The team already knows React, and Svelte's size win is marginal inside Tauri, where the webview is the floor. |
| 2 | Bundle `okflint` vs reimplement | **Reimplement core rules in TS** (data-driven rule set), keep parity tests against upstream `okflint` | Inline lint must run per keystroke in the webview; spawning a process per edit is the wrong shape. The seeded repo skeleton still includes an `okflint` GitHub Action, so the *authoritative* check stays upstream. |
| 3 | Tag vocabulary | **Per-project config, with a shipped starter taxonomy as the default** | Both halves of the question are right: projects need control, and an empty vocabulary is a bad first-run experience. |
| 4 | Graph view in MVP | **Deferred** | Confirming the proposal's lean. The link index (§6.5) is the graph's data source, so nothing is lost by waiting. |
| 5 | Org support in Phase 1 | **Read/clone/push to org repos: yes** (any repo a fine-grained PAT can reach). **Org repo *creation*: Phase 2** | Cloning an org repo needs no extra design; creation is where org token-approval policies bite (proposal §5). |

Additional stack decisions:

| Area | Choice | Notes |
|------|--------|-------|
| Build tooling | Vite + `pnpm` | Standard Tauri pairing; fast HMR. |
| Editor component | **CodeMirror 6** | Light (Monaco is ~10× heavier), first-class markdown mode, extension API fits inline lint + autocomplete. |
| Markdown preview | unified (`remark` → `rehype`) + `rehype-sanitize` | Sanitization is mandatory — bundle content is untrusted input rendered in a privileged webview (§9). |
| YAML | `yaml` package, **document API** (not plain parse/stringify) | Preserves comments, key order, and formatting on round-trip. Never destroy the user's YAML (§6.4). |
| State | Zustand | Small, unopinionated; the app is mostly local state + a doc index. |
| Styling | Tailwind + Radix primitives | Accessible primitives without a heavyweight component framework. |
| Rust crates | `notify` (watcher), `keyring` (keychain), `serde`/`thiserror`, `reqwest` (GitHub REST) | Git is system-git in MVP — no `git2` yet (§7.3). |

## 3. Architecture overview

Same shape as the proposal, with named modules:

```
┌────────────────────────── Tauri app ──────────────────────────────┐
│  Webview (React + TS)                                             │
│  ┌─────────────┐ ┌──────────────────────────┐ ┌────────────────┐  │
│  │  App shell  │ │       Editor pane        │ │  Publish pane  │  │
│  │  · project  │ │  · CodeMirror (markdown) │ │  · git status  │  │
│  │    switcher │ │  · frontmatter form      │ │  · commit/push │  │
│  │  · doc tree │ │  · live preview          │ │  · PR branch   │  │
│  │  · lint     │ │  · link autocomplete     │ └────────────────┘  │
│  │    panel    │ └──────────────────────────┘                     │
│  └─────────────┘                                                  │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  core/ (pure TS, no Tauri imports — unit-testable, portable) │ │
│  │  · bundle index  · schema engine  · lint rules  · md utils   │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  platform/ (thin wrappers over invoke() — the ONLY place     │ │
│  │  that touches Tauri APIs; mockable in tests)                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                             │ invoke()                            │
│  Rust command boundary (src-tauri)                                │
│  · fs.rs  · watch.rs  · git.rs  · secrets.rs  · github.rs        │
└───────────────────────────────────────────────────────────────────┘
```

Two load-bearing boundaries:

1. **`core/` is pure TypeScript** — no Tauri, no DOM. The bundle index, schema
   engine, and lint rules are plain functions over plain data. This is what makes
   unit testing cheap and keeps the "hosted web variant later" option real.
2. **`platform/` is the only module that calls `invoke()`.** Everything above it
   sees an interface (`Platform`), so tests and a future web build swap in a
   different implementation.

## 4. Data model

```ts
// A parsed document in the bundle
interface Doc {
  path: string;           // relative to bundle root, POSIX separators
  frontmatter: YamlDoc;   // `yaml` Document — preserves comments/formatting
  type: string | null;    // frontmatter `type` (the one required OKF field)
  title: string;          // derived: frontmatter title ?? first H1 ?? filename
  tags: string[];
  body: string;           // markdown after the frontmatter block
  links: OutLink[];       // parsed outbound links (target path, source range)
  diagnostics: Diagnostic[]; // lint results
}

// The in-memory bundle
interface Bundle {
  root: string;
  docs: Map<string, Doc>;        // keyed by path
  backlinks: Map<string, string[]>; // target path -> source paths (graph-ready)
  schema: SchemaConfig;          // resolved: project override ?? shipped default
}
```

- The index is built by a full scan on open (Rust walks the tree, streams file
  contents; TS parses) and kept fresh incrementally by watcher events (§7.2).
- `backlinks` is maintained now even though nothing renders it yet — it powers
  link-target renames ("update 3 documents that link here?") and is the future
  graph view's dataset.
- Target scale: comfortable at 5,000 docs. Parsing is the only O(n) cost and is
  incremental after first scan; no persistence/cache layer unless profiling says
  otherwise (see §10).

## 5. Schema configuration

OKF is v0.1 and will move; the schema is **data, not code** (proposal §4). The
app ships a default schema and a project can override it with `.okf-editor.json`
at the bundle root. Project config deep-merges over the default.

```jsonc
// .okf-editor.json (all fields optional)
{
  "$schema": "https://raw.githubusercontent.com/atteniv/okf-editor/main/schemas/okf-editor.schema.json",
  "types": {
    "guide": {
      "label": "Guide",
      "template": "templates/guide.md",        // new-doc-from-template source
      "fields": [
        { "key": "title",   "kind": "string",  "required": true },
        { "key": "owner",   "kind": "string" },
        { "key": "tags",    "kind": "tags" },                    // uses vocabulary
        { "key": "status",  "kind": "enum", "values": ["draft", "published", "deprecated"] },
        { "key": "reviewed","kind": "date" }
      ]
    }
  },
  "tagVocabulary": ["onboarding", "policy", "engineering"],  // replaces starter set
  "allowUnknownTags": true,
  "lint": { "disable": ["OKF012"] }                          // rule toggles
}
```

Schema-engine behavior worth pinning down now:

- **Unknown frontmatter fields are preserved verbatim**, shown in a read-only
  "other fields" section of the form, and never reordered or reformatted. The
  form only writes keys it owns. Round-trip safety is a hard requirement — a
  schema-aware editor that mangles YAML it doesn't understand is worse than a
  text editor.
- Unknown `type` values degrade gracefully: raw YAML editing plus generic
  title/tags fields, and a one-click "add this type to project schema" helper.
- Field kinds for MVP: `string`, `text`, `enum`, `tags`, `date`, `boolean`,
  `number`, `doc-ref` (a link to another doc, with autocomplete).
- We publish a JSON Schema for `.okf-editor.json` itself so config gets editor
  validation in VS Code etc.

## 6. Frontend design

### 6.1 App shell
- **Recent projects** screen on launch (list of known local bundles), plus
  Open Folder / Clone Repo / New Project entry points (New Project = Phase 2).
- **Doc tree** is a file-manager-style folder view by default (bundles nest
  arbitrarily deep; `index.md` floats first as a directory's cover page),
  toggleable to a group-by-`type` view; filter box matches title/path/tags.
  Hand-rolled recursive tree — revisit a library (react-arborist) only when
  drag-to-move lands with the rename machinery.
- **Lint panel** lists diagnostics bundle-wide, grouped by file; click →
  jump-to-range in the editor.

### 6.2 Editor pane
Three-region layout: frontmatter form (collapsible) above a CodeMirror markdown
editor, preview alongside (toggle: side-by-side / preview-only / editor-only).

- CodeMirror extensions: markdown syntax, lint gutter (from `core/lint`),
  completion source (from the link index), frontmatter region rendered read-only
  in the text editor *when the form is open* (single source of truth — no
  two-way sync fights; an "edit as YAML" toggle swaps which surface is live).
- Preview renders through the sanitized unified pipeline; relative image paths
  resolve through a Tauri asset-scope handler restricted to the bundle root.

### 6.3 Autosave and dirty state
- Debounced autosave (~1s after idle) to disk; git is the undo/publish layer, so
  autosave is safe and keeps "did I save?" out of the UX.
- CodeMirror history for in-session undo.

### 6.4 Frontmatter round-tripping
All frontmatter edits go through the `yaml` Document API: set/delete specific
keys in place. Comments, ordering, quoting style, and unknown keys survive. A
parity test suite asserts `parse → edit one key → stringify` produces a minimal
diff on a corpus of real-world frontmatter samples.

### 6.5 Link autocomplete
- Trigger inside markdown link syntax (`](` and `[[` if wiki-links are enabled
  in config; OKF convention is relative markdown links — wiki-links off by
  default).
- Completion source queries the bundle index by title/path/tags; inserts a
  correct relative path from the current doc.
- Diagnostics for broken links (target doesn't exist) come from the same index,
  so autocomplete and lint can't disagree.
- On file rename/move (detected via watcher or done in-app), offer to rewrite
  inbound links using `backlinks`.

### 6.6 Lint
- `core/lint` implements okflint's core rules as pure functions
  `(doc, bundle, schema) -> Diagnostic[]` with rule IDs matching upstream.
- Runs debounced on the active doc per edit; bundle-wide on open and on watcher
  events. At target scale this is fast enough on the main thread; move to a Web
  Worker only if profiling demands it.
- A CI parity job runs upstream `okflint` and our linter over shared fixtures
  and diffs the findings — drift with upstream becomes a failing test, not a
  user bug report.

## 7. Rust core design

Commands are thin, typed, and audited — this is the app's entire privileged
surface. Everything returns `Result<T, AppError>` where `AppError` serializes to
`{ code, message, detail? }` for structured frontend handling.

### 7.1 fs.rs
```
bundle_scan(root: PathBuf) -> Vec<FileEntry>     // walk, honoring ignore rules (.git, node_modules)
doc_read(root, rel_path) -> String
doc_write(root, rel_path, content: String)
doc_rename(root, from, to)
doc_delete(root, rel_path)                        // to OS trash, not unlink
```
**Every path-taking command canonicalizes and verifies the result is inside the
bundle root** — the webview must not be able to escape the bundle via `../` or
symlinks (§9). Tauri's FS scope is configured to the same effect as defense in
depth; app permissions/capabilities are minimal (no shell-open of arbitrary
paths, no global FS).

### 7.2 watch.rs
- `notify`-based recursive watcher on the bundle root, debounced (~200ms),
  emitting coalesced `{ created, modified, deleted }` events to the webview.
- Conflict rule: if a doc changes on disk while dirty in the editor, do **not**
  clobber either side — banner offers *Reload from disk* / *Keep mine* /
  *Show diff*. (Single-author assumption, per proposal — no merging.)

### 7.3 git.rs (MVP: system git)
```
git_detect() -> Option<GitInfo>                   // version; drives "install git" guidance
git_clone(url, dest, token?)
git_status(root) -> GitStatus                     // branch, ahead/behind, changed files
git_commit(root, message, signoff: bool)
git_pull(root) -> PullResult                      // surfaces conflicts, never auto-resolves
git_push(root, branch?) -> PushResult
git_create_branch(root, name)
```
- Invokes the system `git` binary with **args as a vector — never through a
  shell** (no injection surface).
- **Token is never placed in the remote URL or argv** (argv is visible in
  process listings). Supply it per-invocation via
  `-c credential.helper=<ephemeral askpass>` / `GIT_ASKPASS` pointing at the
  app, which answers from the keychain. Nothing persists in `.git/config`.
- Pull-before-push; a conflicted pull returns a structured error the UI turns
  into "resolve in your own tools, then retry" guidance.
- `git2` (libgit2) is a later swap behind the same command signatures.

### 7.4 secrets.rs
```
secret_set(key: SecretKey, value)                 // SecretKey is an enum, not a free string
secret_get(key) -> Option<String>
secret_delete(key)
```
- `keyring` crate → macOS Keychain / Windows Credential Manager / Secret
  Service. One entry per GitHub host (github.com now; enterprise hosts later).
- Tokens never appear in logs, error messages, or the frontend store; the
  webview gets only `{ connected: true, tokenHint: "…a1b2" }`.

### 7.5 github.rs
Phase 1: `github_verify_token() -> TokenInfo` (identity + a friendly warning
when the token can't reach the target repo), `github_list_repos()`.
Phase 2: `github_create_repo(...)`, `github_device_flow_start() -> {user_code,
verification_uri}`, `github_device_flow_poll() -> TokenResult`.
All REST calls happen in Rust (token stays out of the webview); `reqwest` with
explicit timeouts.

## 8. Core user flows (MVP behavior spec)

1. **Open local folder** → scan → index → tree renders grouped by `type`.
   Non-bundle folder (no markdown with frontmatter) → gentle "doesn't look like
   an OKF bundle — open anyway?"
2. **Edit** → form + editor per §6; autosave; inline lint; link autocomplete.
3. **New doc** → pick `type` → template instantiated (frontmatter pre-filled,
   `{{title}}`-style substitutions) → named & placed per type convention.
4. **Connect GitHub** → paste PAT → verify → keychain. UI copy recommends a
   fine-grained PAT scoped to the one repo (Contents: read/write) and links
   GitHub's docs; accepts any token as an opaque bearer credential.
5. **Clone existing** → URL or repo picker (if token can list) → clone to a
   chosen parent dir → opens as a project.
6. **Publish** → status view → message (+ optional `-s` signoff) → commit →
   pull → push. "Branch + PR" mode: create branch, push, open compare URL in
   the browser.
7. **Token expired/revoked** (fine-grained PATs *must* expire) → 401 anywhere →
   non-blocking "reconnect GitHub" banner; local editing never blocks on auth.

## 9. Security considerations

| Threat | Mitigation |
|---|---|
| Malicious bundle content (XSS → privileged webview) | `rehype-sanitize` allowlist; strict Tauri CSP; no `dangerouslySetInnerHTML` outside the sanitized pipeline. A hostile *cloned repo* is in scope — treat all bundle content as untrusted. |
| Path traversal from webview | Canonicalize-and-verify in every fs command (§7.1) + Tauri FS scope. |
| Token leakage | Keychain only; never in URL/argv/logs/frontend state (§7.3–7.4); GitHub REST from Rust only. |
| Command injection | No shell interpolation anywhere; `git` via arg vectors. |
| Supply chain | Lockfiles committed; `cargo audit` + `pnpm audit` in CI; Tauri updater artifacts **signed** (updater public key pinned in the app). |
| Overbroad app permissions | Tauri capabilities minimal; asset scope limited to bundle roots. |

Privacy stance: **no telemetry in MVP.** It's the right OSS trust posture and
cheaper than doing consent properly. Revisit post-launch if real usage questions
emerge (opt-in only).

## 10. Performance targets

- Cold open of a 1,000-doc bundle: index + tree < 1.5s on a mid-range laptop.
- Keystroke → lint/preview update: < 50ms perceived (debounce hides the rest).
- Memory: index only (metadata + links), not full bodies, for non-open docs if
  profiling shows pressure at 5k docs; don't pre-optimize.

## 11. Testing strategy

| Layer | Tool | What |
|---|---|---|
| `core/` TS | Vitest | Schema engine, lint rules (fixture corpus shared with parity job), index/backlinks, YAML round-trip minimal-diff suite. |
| Lint parity | CI job | Upstream `okflint` vs `core/lint` over shared fixtures; diff = failure. |
| Rust commands | `cargo test` | Path-guard property tests (traversal attempts), git wrapper against throwaway repos, error mapping. |
| E2E smoke | `tauri-driver` + WebdriverIO (Linux CI) | Open fixture bundle → edit → lint appears → commit to a local bare repo. Keep it to one happy path — E2E is expensive to maintain. |
| Manual matrix | Pre-release checklist | Real macOS/Windows/Linux; the checklist lives in PLAN.md M3. |

CI grows from the existing guarded workflow: `fmt`/`clippy`/`cargo test` +
frontend lint/typecheck/test/build once scaffolding lands; release workflow
(`tauri-action`) builds and signs all three platforms on tag.

## 12. Distribution

- **macOS:** Developer ID cert, hardened runtime, notarization (in CI via
  App Store Connect API key).
- **Windows:** OV/EV code-signing cert — **procure early; can take weeks**
  (M0 task, not M3 discovery).
- **Linux:** AppImage + .deb; test WebKitGTK early (M0 smoke on Linux CI).
- Tauri updater with signed manifests, hosted on GitHub Releases.
- Version scheme: SemVer from `v0.1.0`; CHANGELOG per Keep-a-Changelog (already
  in place).

## 13. Deliberately deferred

Graph view (data source already maintained, §4) · embedded `git2` (same command
signatures, §7.3) · hosted web variant (enforced by the `platform/` seam, §3) ·
multi-bundle workspaces · real-time collaboration (non-goal) · OAuth device flow
and repo auto-creation (designed in §7.5, scheduled in Phase 2).
