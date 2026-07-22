# Developer setup

How to get the Atteniv OKF Editor building and running locally. For contribution
process (PRs, DCO sign-off, coding style) see [`CONTRIBUTING.md`](../CONTRIBUTING.md);
for why the code is shaped the way it is, see [`DESIGN.md`](DESIGN.md).

## Stack at a glance

- **Shell:** [Tauri 2](https://tauri.app) — a Rust native core hosting a system webview
- **Frontend:** React + TypeScript, built with Vite
- **Package manager:** pnpm (Node.js)
- **Native core:** Rust (`src-tauri/`) — filesystem, git, keychain, GitHub API

## Prerequisites

### 1. Rust (stable)

Install via [rustup](https://rustup.rs):

```bash
# macOS / Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Windows (PowerShell)
winget install --id Rustlang.Rustup
```

After installing, restart your shell (or `source ~/.cargo/env`) so `cargo` is on
your `PATH`. The stable toolchain is fine; CI uses stable with `rustfmt` and
`clippy` components (`rustup component add rustfmt clippy`).

### 2. Node.js ≥ 22 and pnpm ≥ 10

Install Node 22+ from [nodejs.org](https://nodejs.org), or with a version manager:

```bash
# macOS (Homebrew)
brew install node@22

# any OS, via nvm
nvm install 22
```

Then enable pnpm via corepack (ships with Node):

```bash
corepack enable pnpm
```

(or `npm install -g pnpm` if you prefer.)

### 3. Tauri system dependencies (per OS)

- **macOS:** Xcode Command Line Tools — `xcode-select --install`
- **Windows:** the [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  with the "Desktop development with C++" workload, plus the
  [WebView2 runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
  (preinstalled on Windows 11 and most updated Windows 10 machines)
- **Linux (Debian/Ubuntu):**

  ```bash
  sudo apt-get update
  sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

  (This is exactly what CI installs — see
  [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). For other distros, see
  the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/).)

### 4. git

[git](https://git-scm.com) must be on your `PATH`. It's both a build-time tool and a
**runtime prerequisite**: the app shells out to system git for clone, commit, and
publish. On macOS it comes with the Xcode Command Line Tools; on Windows use
[Git for Windows](https://gitforwindows.org); on Linux `sudo apt-get install git`.

### 5. Optional — only for exercising specific features

- **GitHub publishing:** a GitHub
  [fine-grained personal access token](https://github.com/settings/personal-access-tokens)
  with Contents read/write on the repos you'll test against. Entered in the app's
  Settings; stored only through the OS keychain, never in plaintext application
  files or repository data.
- **AI features (generate, chat, AI merge):** an [OpenRouter](https://openrouter.ai)
  API key, also entered in Settings and stored in the keychain. Everything else
  works without it.

On Linux, key storage requires a running Secret Service provider such as GNOME
Keyring or KWallet. Minimal/headless sessions without one can run the editor, but
GitHub and AI credential storage will fail until a provider is available.

## Build and run

```bash
git clone https://github.com/atteniv/okf-editor.git
cd okf-editor
pnpm install

# run the app in development (starts Vite + the Tauri window, hot-reloads both)
pnpm tauri dev
```

The first run compiles the Rust core, so expect a few minutes; subsequent runs are
incremental. `pnpm dev` alone starts only the Vite dev server — without the
native core almost nothing works, so use `pnpm tauri dev` for real development.

To try the app with sample content, use **Open bundle folder…** on the start screen
and pick the sample bundle in [`fixtures/`](../fixtures/), or create a new bundle
from the starter template.

### Production build

```bash
pnpm tauri build
```

Produces a platform installer/bundle under `src-tauri/target/release/bundle/`.
Local builds are unsigned (ad-hoc on macOS); signed releases come from release CI.

## Tests and checks

Frontend (run from the repo root — this is what CI's `build` job runs):

```bash
pnpm lint
pnpm typecheck
pnpm test        # Vitest, src/core unit tests
pnpm build
pnpm audit --prod --audit-level high
```

Rust (run from `src-tauri/` — CI's `rust` job):

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

## Development gotchas

- **macOS keychain prompts:** dev builds are ad-hoc signed, and the signature changes
  on every rebuild. When the keychain prompt appears for a stored secret (GitHub
  token or OpenRouter key), choose **"Always Allow"** — you'll still get re-prompted
  after rebuilds, which is expected.
- **Architecture boundary (lint-enforced):** only `src/platform/` may import Tauri
  APIs. `src/core/` is pure TypeScript with no Tauri and no DOM. If ESLint rejects
  your import, that's the boundary working — go through the `Platform` interface.
- **DCO:** every commit needs a sign-off — commit with `git commit -s`. CI rejects
  PRs with unsigned commits.

## Code layout

- `src/core/` — pure TypeScript (no Tauri, no DOM): bundle index, schema engine,
  lint rules. Unit-tested with Vitest.
- `src/platform/` — the **only** module that may import Tauri APIs; everything else
  sees the `Platform` interface.
- `src/ui/` — React components.
- `src-tauri/` — the Rust command boundary: fs, git, keychain, GitHub, AI streaming.
- `fixtures/` — sample OKF bundles used by tests (and handy for manual testing).
- `schemas/` — published JSON Schemas (e.g. for `.okf-editor.json`).
- [`okf-editor-architecture.html`](../okf-editor-architecture.html) — generated
  point-in-time architecture diagram (archify 2.11.0). Maintainers regenerate it
  with archify against the current source tree whenever the module boundaries
  above change; treat it as documentation, not build output.
