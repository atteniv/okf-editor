# Atteniv OKF Editor — Proposal

A general-purpose, open-source **desktop editor for Open Knowledge Format (OKF)**
bundles, built with **Tauri**. Local-first, git-native, schema-aware.

**Status:** proposal / pre-MVP. **License:** Apache-2.0 (see [`LICENSE`](LICENSE)).
**This is a standalone project** — deliberately *not* part of the Nexus Radar /
atteniv-nexus codebase (different lifecycle, different audience).

---

## 1. Why

[OKF](https://okf.md) (Google Cloud, launched June 2026) represents organizational
knowledge as a directory of **markdown files with YAML frontmatter** — portable,
git-friendly, vendor-neutral, and designed to feed AI agents curated context. It's
"format, not platform": the only required frontmatter field is `type`.

**The gap:** as of mid-2026 the OKF ecosystem is generators, linters, and viewers —
there is **no general-purpose, prose-oriented, schema-aware GUI editor**:
- Google's visualizer is **read-only**.
- **OWOX Model Canvas** is a visual editor but scoped to **data models / ER diagrams**,
  not prose knowledge docs.
- **Obsidian** edits markdown natively but is not OKF-aware (no schema, no tag
  vocabulary, no lint).
- Everything else (`okflint`, `superops-team/okf`, WordPress/website converters,
  the BigQuery enrichment agent) generates or validates — it doesn't *author*.

**Goal (business):** this is a **brand / thought-leadership play** for Atteniv, not a
revenue product. Being an early, genuinely-useful contributor to a Google-backed
standard's ecosystem builds credibility and broadens awareness of Atteniv among a
technical audience. Success = the tool is good enough to get shared, land on
[okf.md/tools](https://okf.md/tools/), and put Atteniv's name on it.

**Goal (internal, secondary):** Atteniv can use it to author its own OKF packages
(e.g. an "Atteniv services & offerings" bundle), which downstream feeds contextual
product callouts in Nexus Vision. See "Relationship to Atteniv" below.

## 2. Audience — and one important boundary

This tool targets **technical authors and the OKF/OSS community** — people who have
a git checkout and are comfortable installing a desktop app.

It is **not** the right tool for a non-technical marketer editing a CTA blurb. That is
a *separate, hosted, form-driven* need (a web app committing via the GitHub API, with
a controlled vocabulary and guardrails). **Building this editor does not discharge that
need — they're different products for different users.** Don't conflate the two.

## 3. Why Tauri

The tool's core job is "edit a local folder of markdown + frontmatter and commit it
with git." A **local-first desktop app is the ideal shape**, and Tauri fits it:

- **Local filesystem + local git are first-class** — no server, no hosted auth, works
  offline; publish when back online. (A browser app can't do this cleanly — the File
  System Access API is Chromium-only and clunky.)
- **Small footprint** — Rust core + system webview → MB-sized binaries, not Electron's
  hundreds.
- **Portable frontend** — the UI is a normal web app (React/Svelte); Tauri just wraps
  it with native FS/git/keychain commands. A hosted web variant remains possible later
  from the same frontend.

Watch-outs (tracked as real work, not blockers):
- **Code signing / notarization** (Apple, Windows) for warning-free distribution.
- **Linux webview** (WebKitGTK) inconsistencies — test early if Linux matters.
- Keep the **Rust surface thin** — FS, git, keychain, lint as a few Tauri commands;
  everything else stays in the webview (mostly TS, minimal Rust).

## 4. Architecture

```
┌──────────────────────────── Tauri app ────────────────────────────┐
│  Frontend (web app: React/Svelte)                                  │
│   • bundle tree (by type/tags)                                     │
│   • schema-aware frontmatter form  + markdown editor + live preview│
│   • cross-doc link autocomplete (the OKF graph)                    │
│   • lint results panel, project switcher                           │
│                     │  invoke() Tauri commands                     │
│                     ▼                                              │
│  Rust command boundary (thin)                                      │
│   • fs:      read/write bundle files, watch                        │
│   • git:     clone / status / commit / push / pull  (system git → git2 later)│
│   • auth:    token in OS keychain (keyring / stronghold)           │
│   • lint:    okflint rules (bundled or reimplemented core)         │
│   • github:  REST (create repo, list repos)                        │
└────────────────────────────────────────────────────────────────────┘
```

**Data-drive the schema.** OKF is v0.1 and will move. Represent the frontmatter schema
(required fields, per-`type` fields, controlled tag vocabularies) as *configuration*,
not hard-coded UI — so spec changes are a config edit, not a rewrite. Ship with a
sensible default schema; let a project override it (e.g. an `.okf-editor.json` in the
bundle).

## 5. GitHub integration & auth

### Phase 1 — Personal Access Token (no OAuth infrastructure)
- **Accept any token as an opaque bearer credential** — don't hard-code the type. This
  future-proofs and lets users pick their security posture.
- **Recommend fine-grained PATs** in the UI, scoped to the single OKF repo
  (**Contents: read/write**) — least privilege. Classic `repo` scope works too but
  grants all-repo access (more blast radius).
- **Store the token in the OS keychain**, never plaintext.
- **Fine-grained PATs require an expiration** (≤1 year; orgs may cap lower) → build a
  graceful "token expired, re-enter" path; don't assume a token is permanent.

PAT status (verified July 2026): both classic and fine-grained PATs are **fully
supported**; classic is recommended-against but has **no announced sunset**, and both
were added to GitHub's credential-revocation API in March 2026. PATs are a safe
foundation. ([GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens))

### Phase 2 — SSO onboarding (OAuth Device Flow)
- Desktop apps **cannot safely embed an OAuth client secret** → use **OAuth Device
  Flow** (client_id only, no secret; user approves a code at `github.com/login/device`,
  app polls for the token). This gives the "Connect GitHub" SSO feel without a redirect
  server.

### Repo creation nuance (why auto-create is Phase 2, not 1)
Creating a repo is an **owner-level** action. Fine-grained tokens need owner-level
**Administration: write** (and orgs often **require owner approval** for fine-grained
tokens), whereas classic `repo` scope creates repos more simply. Forcing a
least-privilege user into an admin-scoped PAT undercuts the security story — so:
- **Phase 1** supports **open/clone an existing OKF repo → edit → commit → push** with a
  repo-scoped fine-grained PAT. (User creates the empty repo themselves, or pastes a
  classic token to auto-create.)
- **Phase 2** adds the full **device-flow SSO + auto-create-repo** onboarding, where
  creation permissions are handled more gracefully.

### Git mechanics
- **MVP:** shell out to system `git` via a Tauri command (robust, uses the user's git).
  Detect missing git and guide the user.
- **Later:** embed **`git2` (libgit2)** for a self-contained, no-external-dependency
  experience; supply the token via libgit2's HTTPS credential callback.
- **Push auth:** HTTPS remote + token as credential
  (`https://x-access-token:<token>@github.com/...`). No SSH key management.
- **Create + seed:** `POST /user/repos` (or `/orgs/{org}/repos`) → seed an OKF skeleton
  (`index.md`, directory structure, README, `okflint` config, a lint GitHub Action) →
  clone locally.
- **Publish:** offer **direct commit to main** *and* **branch + PR**. Pull-before-push;
  surface conflicts (assume single-author for MVP — don't auto-resolve markdown).

## 6. Core user flow

1. **Connect GitHub** — paste a fine-grained PAT (Phase 1) / device-flow SSO (Phase 2);
   token → keychain.
2. **New project** → pick account/org + name → app creates + seeds the repo, clones it
   locally. **Or Open existing** → pick from repos → clone. **Or Open local folder** →
   edit an already-cloned bundle (no GitHub needed).
3. **Edit** — tree view; schema-aware frontmatter form + markdown/preview; link
   autocomplete; new-doc-from-template per `type`; live lint.
4. **Publish** — commit (message) → push (main or PR branch).
5. **Recent projects** list of local clones for one-click reopen.

## 7. MVP scope & phasing

Build so there's always something usable; front-load the editor, not the auth/git.

- **Phase 1a — Editor core (no GitHub):** open a local folder, schema-aware editing,
  markdown + live preview, cross-doc link autocomplete, `okflint` validation,
  new-from-template. *Immediately useful.*
- **Phase 1b — Git layer (PAT):** commit/push/pull on an already-cloned repo;
  fine-grained PAT in keychain; "open existing repo" (clone).
- **Phase 2 — SSO onboarding:** device-flow auth + auto-create-repo + skeleton seeding
  — the frictionless "wow."
- **Later / optional:** force-directed **graph view**; full **git UI**; embedded
  `git2`; multi-bundle workspaces; a hosted web build of the same frontend.

**Explicitly deferred / out of scope:** canvas/ER-diagram editing (that's OWOX's
data-model niche; we're prose-first), auto-merge conflict resolution, real-time
collaboration.

## 8. Distribution

- Cross-platform builds (macOS, Windows, Linux).
- **Code signing + notarization** (Apple Developer cert; Windows signing) so users run
  it without OS warnings — real work, schedule before public release.
- Auto-update channel (Tauri updater).

## 9. Risks & cautions

- **v0.1 spec churn** — mitigated by the data-driven schema (config, not code).
- **Tiny, nascent market** — adoption may not materialize; treat as a bounded
  brand/OSS bet, not an open-ended product. Time-box it.
- **Not defensible** — Google or OWOX could ship an official general editor and eat the
  niche. First-mover ≠ moat; differentiate on *general-purpose prose + schema-aware +
  local-first + git-native*.
- **OSS maintenance is an ongoing cost** — budget for stewardship, or set expectations
  as "source-available, low-support."
- **Don't let it distract** from Atteniv's core (Nexus/tax). Bounded scope, clear MVP.

## 10. Maximizing the brand payoff

- Permissive license (MIT / Apache-2.0), strong README + short demo GIF.
- Submit to [okf.md/tools](https://okf.md/tools/).
- A launch blog post positioning **Atteniv** as an early steward of the OKF ecosystem.
- Low-friction + genuinely useful + early = the recipe for the awareness we're after.

## 11. Relationship to Atteniv (Nexus)

Atteniv can dogfood this editor to author an **OKF package of its services &
offerings** (a GitHub repo, source of truth). Downstream, Nexus Vision's *isolated
marketing-CTA stage* (see the Nexus repo's `plans/marketing-cta.md`) can consume the
**customer-capability subset** of that bundle (tag-filtered) to generate contextual
"How Atteniv can help" callouts — **never** touching the grounded tax answer, and
**never** on the paid MCP surface. The editor and the CTA feature are decoupled: the
editor produces the bundle; Nexus consumes it.

## 12. Open questions

1. Frontend framework — React vs Svelte (both fine; Svelte = smaller/faster, React =
   bigger ecosystem).
2. Bundle `okflint` vs reimplement its core rules in the app for inline linting.
3. Controlled tag vocabulary — per-project config, or a starter taxonomy shipped by
   default?
4. Graph view in MVP or deferred (leaning deferred).
5. Org support in Phase 1, or personal-account only until Phase 2?

---

## Appendix — references

- OKF spec & reference impl: `GoogleCloudPlatform/knowledge-catalog` (`/okf`)
- OKF site / ecosystem: https://okf.md , https://okf.md/tools/
- Launch blog: https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/
- Tauri: https://tauri.app
- GitHub PATs: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- GitHub OAuth Device Flow: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
