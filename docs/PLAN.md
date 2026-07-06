# Atteniv OKF Editor — Project Plan

**Status:** draft v1 · July 2026
**Companion docs:** [`PROPOSAL.md`](../PROPOSAL.md) (why / scope), [`docs/DESIGN.md`](DESIGN.md) (how)

## 1. Framing and assumptions

- **This is a time-boxed brand/OSS bet, not a product line** (proposal §9). The
  plan is sized so a clear go/no-go signal exists by **end of 2026**.
- **Resourcing assumption: one engineer at ~60–70% allocation**, with occasional
  design/marketing help at launch. Estimates below are calendar weeks at that
  allocation; a second contributor mostly compresses M1 (editor core
  parallelizes; the git layer doesn't).
- Milestones are ordered so **something is demonstrably useful at every
  checkpoint** (proposal §7: front-load the editor, not the auth/git).
- Dates assume a **start of Mon Jul 13, 2026** and include no vacation/interrupt
  buffer beyond the explicit buffer week in M3. Slip the calendar, not the
  scope-per-milestone.

## 2. Milestone overview

| Milestone | Deliverable | Duration | Target dates (2026) |
|---|---|---|---|
| **M0** | Scaffolding: app skeleton runs on all 3 OSes; CI real | 1 wk | Jul 13 – Jul 17 |
| **M1** | Editor core (Phase 1a): fully useful local editor | 5 wks | Jul 20 – Aug 21 |
| **M2** | Git layer (Phase 1b): PAT connect, clone, commit/push | 3 wks | Aug 24 – Sep 11 |
| **M3** | **v0.1.0 public release**: signed installers, polish | 3 wks (incl. 1 wk buffer) | Sep 14 – Oct 2 |
| **M4** | SSO onboarding (Phase 2): device flow + auto-create → v0.2.0 | 3 wks | Oct 5 – Oct 23 |
| **M5** | Launch push: okf.md/tools listing, blog post, dogfood bundle | 1 wk + ongoing | Oct 26 – Oct 30 |
| — | **Go/no-go review** (§6) | — | mid-Dec 2026 |

Critical path: M0 → M1 → M2 → M3. M4 is deliberately *after* the public release —
v0.1.0 with PAT auth is a complete, honest product; SSO is the frictionless
"wow," not a launch blocker. The two long-lead items (signing certs, Apple
notarization setup) start in M0 precisely so they're off the critical path by M3.

## 3. Milestone detail

### M0 — Scaffolding (1 wk)

Everything here de-risks later milestones; nothing is user-visible.

- [ ] Tauri + React + TS + Vite + pnpm scaffold; app opens a window on
      macOS/Windows/Linux (Linux via CI-built AppImage — catches WebKitGTK
      issues on day one, per DESIGN §12)
- [ ] Repo layout: `src/` (`core/`, `platform/`, `ui/`), `src-tauri/`,
      `schemas/`, `fixtures/` (sample OKF bundles for tests)
- [ ] CI: extend existing workflow — frontend lint/typecheck/test/build now
      real; add `cargo fmt`/`clippy`/`test`; add `cargo audit`/`pnpm audit`
- [ ] Fill in CONTRIBUTING.md dev-setup placeholders (currently `<pkg>` stubs)
- [ ] **Start long-lead procurement:** Apple Developer enrollment + Developer ID
      cert; order Windows code-signing cert (can take weeks — the reason this
      is an M0 task)
- [ ] Collect a fixture corpus: real OKF bundles from the ecosystem
      (`GoogleCloudPlatform/knowledge-catalog` examples, `superops-team/okf`)
      for schema/lint/round-trip tests

**Exit criteria:** fresh clone → `pnpm i && pnpm tauri dev` works per docs; CI
green with real checks; certs in procurement.

### M1 — Editor core, Phase 1a (5 wks)

The heart of the product; ordered so each week ends with something demoable.

- [ ] **Wk 1 — Bundle model:** Rust `fs.rs` + path guards; scan → parse →
      index (`core/bundle`); doc tree grouped by `type`; open-local-folder flow
- [ ] **Wk 2 — Editing:** CodeMirror markdown editor; autosave; sanitized live
      preview; file watcher + external-change conflict banner (DESIGN §7.2)
- [ ] **Wk 3 — Schema engine:** default schema + `.okf-editor.json` override;
      frontmatter form (all MVP field kinds); YAML round-trip via document API
      + minimal-diff test suite (DESIGN §6.4 — the hard requirement)
- [ ] **Wk 4 — Lint + links:** `core/lint` rules with okflint rule IDs + parity
      CI job; lint panel + editor gutter; link index + autocomplete +
      broken-link diagnostics; backlink maintenance
- [ ] **Wk 5 — Templates & polish:** new-doc-from-template per type; rename
      with inbound-link rewrite; recent-projects screen; keyboard shortcuts;
      empty/error states

**Exit criteria:** an OKF author with an existing local clone can do all their
authoring in the app (everything but publish). Dogfood begins: start the
Atteniv services-and-offerings bundle (proposal §11) in the app and file the
friction as issues.

### AI-1 — AI assistance (added 2026-07-05, ~1 wk; shifts M2+ accordingly)

Maintainer-requested addition after M1: BYOK OpenRouter assistance (see
DESIGN §13). Strengthens the brand-play story — an AI-native OKF editor.

- [x] Keychain-backed secret store (no read path to the webview) — also
      pre-builds M2's git-token storage
- [x] Rust SSE streaming with cancellation; models listing
- [x] AI settings (key, default model picker); generate-on-create in New
      Document; doc-grounded chat panel with insert-at-cursor
- [ ] AI-2 (unscheduled): bundle-graph grounding, ⌘K inline edits, lint fixes

### M2 — Git layer, Phase 1b (3 wks)

- [ ] **Wk 1 — Git plumbing:** `git.rs` (detect/status/commit/pull/push/branch)
      with askpass credential injection (DESIGN §7.3 — token never in
      argv/URL); tests against local bare repos
- [ ] **Wk 2 — Auth + clone:** keychain storage; connect-GitHub flow with
      fine-grained-PAT guidance copy; token verification; clone-by-URL and
      repo-picker; token-expiry re-auth banner (401 path tested end-to-end)
- [ ] **Wk 3 — Publish UX:** status view — changed-file list + tree badges,
      no diff rendering (descoped 2026-07-05: modified-indicators suffice;
      diffs live in the user's git tools); commit (+DCO signoff
      toggle); pull-before-push with structured conflict guidance; branch + PR
      mode (opens compare URL); e2e smoke: edit → commit → push to bare repo

**Exit criteria:** full core loop (proposal §6, minus New Project) works
against a real GitHub repo with a fine-grained PAT on all 3 OSes.

### M3 — v0.1.0 public release (3 wks, incl. 1 wk buffer)

- [ ] Release CI (`tauri-action`): signed + notarized artifacts for
      macOS (dmg), Windows (msi/nsis), Linux (AppImage + deb); updater manifest
      signing, keys secured
- [ ] Manual test matrix pass on real hardware (checklist: every M1/M2 exit
      flow × 3 OSes); fix blockers
- [ ] Docs: README un-comment badges, add real install instructions + demo GIF
      (the proposal calls the GIF the single biggest visitor asset — treat as a
      release blocker, not a nice-to-have); in-app "getting started" empty state
- [ ] Cut `v0.1.0`: changelog, release notes, updater channel live
- [ ] **Buffer week** — absorbs signing/notarization surprises (the usual
      suspect) and matrix fallout

**Exit criteria:** a stranger on any OS can download, install without OS
warnings, open a bundle, edit, and push — with no help from us.

### M4 — SSO onboarding, Phase 2 (3 wks) → v0.2.0

- [ ] Register the GitHub OAuth app; device-flow implementation in `github.rs`
      (start/poll; client_id only — no secret in the binary)
- [ ] "Connect GitHub" upgraded: device flow as the default path, PAT as the
      advanced path (both remain supported)
- [ ] New Project flow: create repo (user or org, handling org-approval
      failure modes gracefully) → seed skeleton (`index.md`, structure, README,
      okflint config + GitHub Action) → clone → open
- [ ] v0.2.0 release through the now-proven M3 pipeline

**Exit criteria:** first-run user with zero setup reaches an editable, published
bundle in < 5 minutes (the "frictionless wow").

### M5 — Launch push (1 wk + ongoing)

- [ ] Submit to [okf.md/tools](https://okf.md/tools/)
- [ ] Launch blog post (Atteniv as early OKF steward — proposal §10); social
- [ ] Post to relevant communities (OKF discussions, HN/Show HN when ready)
- [ ] Publish the dogfooded Atteniv OKF bundle publicly (it's also the demo)
- [ ] Set up triage rhythm: label taxonomy, weekly issue sweep,
      `good-first-issue` seeding — per the best-effort maintenance posture

## 4. Dependencies and long-lead items

| Item | Needed by | Start | Owner note |
|---|---|---|---|
| Apple Developer account + Developer ID cert | M3 | **M0** | Enrollment + cert issuance latency |
| Windows code-signing cert | M3 | **M0** | OV validation can take weeks |
| GitHub OAuth app registration | M4 | M3 | Trivial, but decide app ownership (Atteniv org) |
| okf.md/tools submission process | M5 | M3 | Find out the process early; unknown review latency |
| Fixture corpus of real bundles | M1 | M0 | Also seeds lint parity tests |

## 5. Risk register

| Risk | L | I | Mitigation / trigger |
|---|---|---|---|
| Signing/notarization delays release | M | H | Certs procured in M0; buffer week in M3; worst case ship Linux/macOS first |
| OKF v0.1 spec churn breaks schema/lint | M | M | Data-driven schema (DESIGN §5); lint parity job turns upstream drift into a failing test within a day |
| WebKitGTK (Linux) rendering issues | M | M | Linux AppImage built + smoked from M0, not discovered at M3 |
| YAML round-trip edge cases mangle user files | L | **H** | Worst possible bug for trust. Minimal-diff test corpus from M1 wk 3; grow corpus from every bug report |
| Google/OWOX ships an official general editor | L | H | Accept — proposal §9 says first-mover ≠ moat. Ship early (M3 before M4 exists for this reason); differentiation is prose+schema+local+git |
| Adoption doesn't materialize | M | M | That's what the go/no-go is for (§6); the internal dogfood value (proposal §11) is the floor on wasted effort |
| Scope creep from community asks | M | M | CONTRIBUTING scope philosophy already in place; "discuss before building" enforced in triage |
| Engineer pulled to Nexus core work | M | M | Milestones are independently shippable; the plan degrades to "pause after any milestone," not "half-built everything" |

## 6. Success metrics and go/no-go

Per the proposal, success = *shared, listed, credited*. Review **mid-Dec 2026**
(~6 weeks post-launch):

**Ship signals (hard):** listed on okf.md/tools; ≥ 200 installs (updater-ping
proxy or release download counts); ≥ 25 GitHub stars; ≥ 5 external issues/PRs
from non-Atteniv contributors.

**Brand signals (soft):** launch post traffic/referrals to atteniv.com; any
inbound mention (newsletters, socials, OKF community) crediting Atteniv.

**Internal floor:** Atteniv's own OKF bundle authored and maintained in the app,
feeding the Nexus Vision CTA pipeline (proposal §11).

**Outcomes:** *Grow* (signals strong → budget Phase-3 items: graph view, git2,
workspaces) · *Steward* (moderate → maintenance mode: triage + fixes, no new
features — the expected case) · *Sunset* (weak → archive gracefully: README
notice, source stays up; the internal dogfood value is retained either way).

## 7. Working agreements

- Every merged change updates `CHANGELOG.md` (Unreleased) — already in
  CONTRIBUTING.
- DCO signoff on all commits (CI-enforced — already in place).
- Design changes that contradict `DESIGN.md` update the doc in the same PR;
  the doc stays true, not archaeological.
- Public roadmap = GitHub issues + milestones mirroring M1–M5; this file is the
  narrative version and links out once milestones exist.
