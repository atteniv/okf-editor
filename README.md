# Atteniv OKF Editor

> A local-first desktop editor for **Open Knowledge Format (OKF)** bundles —
> schema-aware, Git-native, cross-platform, and open source.

<!-- Badges (enable once CI/releases exist):
[![CI](https://github.com/atteniv/okf-editor/actions/workflows/ci.yml/badge.svg)](…)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
-->

<!-- TODO: add docs/demo.gif before v0.1.0. -->

## What is OKF?

[Open Knowledge Format (OKF)](https://okf.md) is a portable format for the
knowledge surrounding data, systems, products, policies, and organizational
concepts. It is designed for people and AI agents to read and author.

An OKF bundle is an ordinary directory of Markdown files. Concept documents use
YAML frontmatter for machine-readable metadata and Markdown for human-readable
context:

```markdown
---
type: Policy
title: Remote Work Policy
tags: [people, compliance]
---

# Remote Work Policy

Employees may work remotely subject to…
```

Bundles may also contain two reserved files at any directory level:

- `index.md` lists the contents of that directory for progressive disclosure.
- `log.md` optionally records changes under newest-first `## YYYY-MM-DD` headings.

Reserved files do not use frontmatter. Everything remains readable with a text
editor, diffable in Git, and transferable without a database, proprietary API,
or hosted service.

OKF deliberately permits producer-defined types and metadata. A bundle can model
its own domain without registering a taxonomy with a central authority. See the
[OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
for the complete format.

## Where this editor fits

The Atteniv OKF Editor provides a graphical authoring environment over the plain
files in an OKF bundle. It does not replace the format or hide it behind a
service: edits are written directly to the local directory.

The app is built with [Tauri 2](https://tauri.app), Rust, React, and TypeScript.
It uses the operating system webview, so it is smaller than a typical
browser-bundled desktop application.

### Editing and navigation

- Open an existing bundle or create one from a starter or AI-assisted plan.
- Edit Markdown with autosave, live preview, quick-open, and a file-manager tree.
- Edit YAML through a schema-aware frontmatter form without rewriting unrelated
  formatting, comments, field order, or unknown fields.
- Explore links and backlinks through a read-only knowledge-graph overview.
- Rename or move documents while updating inbound relative links.

### OKF assistance

- Validate required frontmatter, reserved files, links, tags, and project schema.
- Apply quick fixes for missing frontmatter and project-specific document types.
- Configure types, fields, templates, and tag vocabulary in `.okf-editor.json`.
- Optionally create and maintain a root `log.md` from explicit commit messages.

### GitHub synchronization

- Clone an existing bundle repository or publish a local bundle to GitHub.
- Save, commit, pull, and upload through a trunk-based workflow intended for
  people who do not want to operate Git directly.
- Resolve overlapping edits with guided keep-mine, use-theirs, or AI-assisted
  merge choices.
- Store GitHub credentials in the operating system keychain, not bundle files.

### Optional AI assistance

Bring your own [OpenRouter](https://openrouter.ai) key to generate new documents,
chat with the open document as context, or assist with merge conflicts.

An optional [Perplexity Agent API](https://docs.perplexity.ai/docs/agent-api/quickstart)
key adds **Research a website** to the New Bundle dialog. Perplexity reads the
canonical OKF specification, discovers and fetches relevant public pages from the
supplied domain, and proposes a source-grounded bundle for review before any files
are written. Research is bounded to one website and at most ten fetched URLs per
tool call; it does not bypass logins or paywalls. Generated documents retain their
source links.

Both integrations are off by default. Non-AI editing works without an account or
network connection. Perplexity API usage is billed separately from a consumer
Perplexity Pro subscription.

## Try an included sample

Select **Try a sample bundle…** on the splash page to create an editable copy of:

- **Getting Started Handbook** — a small teaching bundle for documents, links,
  policies, and the knowledge graph.
- **Google Bitcoin** — Google's compact BigQuery Bitcoin reference bundle.
- **Google Analytics 4** — Google's richer e-commerce example with metrics and
  joins.

Choose a destination folder, select **Create editable copy**, and experiment
freely. The packaged originals remain unchanged. Google's examples are copied
from the
[`GoogleCloudPlatform/knowledge-catalog`](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf/bundles)
repository under Apache 2.0; each copied bundle includes its license and exact
source provenance.

## Download a preview build

🚀 **Feature-complete for MVP and preparing for v0.1.0.** Early, unsigned
installers are available on the
[GitHub Releases page](https://github.com/atteniv/okf-editor/releases). Choose
the macOS DMG matching your Mac (`aarch64` for Apple Silicon or `x64` for Intel),
or the Windows installer.

Preview builds are not yet code-signed or notarized:

- **macOS:** after copying the app to Applications and trying to open it, go to
  **System Settings → Privacy & Security** and choose **Open Anyway**.
- **Windows:** if SmartScreen appears, choose **More info → Run anyway**.

Only install a preview downloaded from the official `atteniv/okf-editor`
Releases page. Signing and notarization are planned if early-user demand
justifies the distribution setup.

See [`PROPOSAL.md`](PROPOSAL.md) for product rationale,
[`docs/DESIGN.md`](docs/DESIGN.md) for architecture, and
[`docs/PLAN.md`](docs/PLAN.md) for release milestones.

## Compile and run from source

Build on the operating system you intend to run. Tauri produces native artifacts
for the host platform; these instructions do not configure cross-compilation.

### Common requirements

Every platform needs:

- [Git](https://git-scm.com) — required at runtime for clone, commit, pull, and
  publish features. Local folder editing still works if Git features are unused.
- [Node.js](https://nodejs.org) **22 or newer**.
- [pnpm](https://pnpm.io) **10 or newer**.
- [Rust](https://rustup.rs) stable, including Cargo.
- Tauri's platform-specific compiler, webview, and system dependencies.

After installing Node.js, install the expected pnpm major version:

```bash
npm install --global pnpm@10
pnpm --version
```

### macOS

Supported development hosts require Xcode Command Line Tools. Install them from
Terminal:

```bash
xcode-select --install
```

Install Node.js 22+ with the official installer, a version manager, or Homebrew:

```bash
brew install node@22
npm install --global pnpm@10
```

Install Rust and reload the shell environment:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

Git is normally installed with the Xcode Command Line Tools. Confirm all tools:

```bash
git --version
node --version
pnpm --version
rustc --version
cargo --version
```

Development builds are ad-hoc signed. macOS may repeatedly ask for permission
when a dev build accesses GitHub or OpenRouter credentials in Keychain; this is
expected because the development signature changes between builds.

### Windows

Run these commands in PowerShell. Install Git, Node.js, and Rust with `winget`:

```powershell
winget install --exact --id Git.Git
winget install --exact --id OpenJS.NodeJS.LTS
winget install --exact --id Rustlang.Rustup
```

Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
and select the **Desktop development with C++** workload. Keep its recommended
Windows SDK and MSVC components selected.

Install the [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
if it is not already present. Windows 11 and most maintained Windows 10 systems
include it.

Restart PowerShell so the new tools are on `PATH`, then install pnpm and verify
the toolchain:

```powershell
npm install --global pnpm@10
git --version
node --version
pnpm --version
rustc --version
cargo --version
```

Use [Git for Windows](https://gitforwindows.org) defaults unless your environment
requires custom credential or proxy settings.

### Linux (Debian or Ubuntu)

Install the compiler and Tauri/WebKitGTK dependencies used by CI:

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl wget file git \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

Install Node.js 22+ from [nodejs.org](https://nodejs.org), your distribution's
supported repository, or a version manager. Then install pnpm:

```bash
npm install --global pnpm@10
```

Install Rust and reload the shell environment:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

Verify the toolchain:

```bash
git --version
node --version
pnpm --version
rustc --version
cargo --version
```

GitHub and OpenRouter credential storage requires a running Secret Service
provider such as GNOME Keyring or KWallet. The editor itself can run without one,
but keychain-backed features will report an error until a provider is available.

For Fedora, Arch, and other distributions, translate the package list using the
[Tauri Linux prerequisites guide](https://tauri.app/start/prerequisites/#linux).

### Clone, install, and run

The remaining commands are the same on macOS, Windows PowerShell, and Linux:

```bash
git clone https://github.com/atteniv/okf-editor.git
cd okf-editor
pnpm install --frozen-lockfile
pnpm tauri dev
```

The first run compiles the Rust native core and may take several minutes.
Subsequent builds are incremental. Vite starts at `http://localhost:1420`, and
Tauri opens the native editor window with hot reload enabled.

`pnpm dev` starts only the Vite frontend. Most editor operations require the
Tauri native core, so use `pnpm tauri dev` for normal development.

To try the app, select **Open bundle folder…** and open
[`fixtures/sample-bundle`](fixtures/sample-bundle), or create a new bundle from
the start screen.

### Create a production build

Run on the target operating system:

```bash
pnpm tauri build
```

Artifacts are written beneath `src-tauri/target/release/bundle/`:

- **macOS:** `.app` and `.dmg` output under `macos/` and `dmg/`.
- **Windows:** installer output under `msi/` or `nsis/`.
- **Linux:** `.deb` and AppImage output under `deb/` and `appimage/`.

Local artifacts are unsigned or ad-hoc signed and may trigger operating-system
warnings. Official releases will use the signing and notarization process in
[`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md).

## Run tests and checks

From the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod --audit-level high
```

Run Rust checks from `src-tauri/`:

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for architecture boundaries,
development gotchas, and the code layout.

## Contributing

Contributions are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md) before submitting changes. Every commit
must include a DCO sign-off; use `git commit -s`.

## Roadmap

Milestones live in [`docs/PLAN.md`](docs/PLAN.md), and day-to-day work is tracked
in [GitHub Issues](https://github.com/atteniv/okf-editor/issues). Scope remains
focused on prose-first OKF authoring rather than data-model or ER-diagram editing.

## License

[Apache-2.0](LICENSE). “Atteniv” and the Atteniv logo are trademarks of Atteniv,
Inc. and are not licensed for use under the Apache license.

---

Built by
**[Atteniv](https://atteniv.com?utm_source=github&utm_medium=oss&utm_campaign=okf-editor)** —
hybrid-workforce presence tracking and multi-state tax-nexus intelligence.
