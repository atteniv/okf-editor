# Contributing to the Atteniv OKF Editor

Thanks for your interest! This project is open source under [Apache-2.0](LICENSE) and
welcomes issues and pull requests. It's maintained on a **best-effort** basis by the
team at Atteniv plus community contributors.

## Ways to contribute

- **Report a bug** or **request a feature** via [Issues](../../issues) (use the
  templates).
- **Discuss ideas** in [Discussions](../../discussions) before large changes — it saves
  everyone time if we agree on scope first.
- **Send a pull request** for bug fixes, docs, or agreed-upon features.

## Scope philosophy

This is a **prose-first, general-purpose OKF editor**. We intentionally keep it focused:
- ✅ authoring/maintaining OKF markdown + frontmatter, validation, git publishing
- ❌ data-model / ER-diagram editing (that's a different tool's niche)

Please open an issue to discuss before building anything large or scope-expanding.

## Development setup

Prerequisites: [Rust](https://rustup.rs) (stable), Node.js ≥ 22 with
[pnpm](https://pnpm.io) ≥ 10, and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS
(on Linux that includes WebKitGTK dev packages — see the list in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

```bash
# install deps
pnpm install

# run the app in dev (starts Vite + the Tauri window)
pnpm tauri dev

# lint / typecheck / test (what CI runs)
pnpm lint
pnpm typecheck
pnpm test

# Rust checks (run from src-tauri/)
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

### Code layout

- `src/core/` — pure TypeScript (no Tauri, no DOM): bundle index, schema
  engine, lint rules. Unit-tested with Vitest.
- `src/platform/` — the **only** module that may import Tauri APIs
  (lint-enforced). Everything else sees the `Platform` interface.
- `src/ui/` — React components.
- `src-tauri/` — the Rust command boundary: fs, git, keychain, GitHub.
- `fixtures/` — sample OKF bundles used by tests.
- `schemas/` — published JSON Schemas (e.g. for `.okf-editor.json`).

See [`docs/DESIGN.md`](docs/DESIGN.md) for why these boundaries exist.

## Pull request process

1. Fork and create a topic branch off `main`.
2. Keep PRs focused and small where possible; one logical change per PR.
3. Make sure lint, typecheck, and tests pass (CI enforces this).
4. Update docs / `CHANGELOG.md` (the `Unreleased` section) if behavior changes.
5. **Sign off every commit** (see DCO below).
6. Open the PR against `main` with a clear description of the change and motivation.

## Developer Certificate of Origin (DCO)

We use the [DCO](https://developercertificate.org/) instead of a CLA. It's a simple,
low-friction way to certify you have the right to contribute your changes. **Every
commit must include a `Signed-off-by` line** matching your name and email:

```
Signed-off-by: Your Name <you@example.com>
```

The easiest way is to commit with `-s`:

```bash
git commit -s -m "fix: handle empty frontmatter"
```

CI checks that every commit in a PR is signed off. If you forget, you can amend or
rebase with sign-off.

## Coding style

Follow the existing style; formatting/linting are enforced in CI. Prefer clarity and
small, well-named functions over cleverness. Match the surrounding code.

## Reporting security issues

Please do **not** open a public issue for security vulnerabilities. See
[`SECURITY.md`](SECURITY.md) for the private reporting process.

## Code of Conduct

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).
