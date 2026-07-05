# Atteniv OKF Editor

> A general-purpose, local-first desktop editor for **Open Knowledge Format (OKF)**
> bundles — schema-aware, git-native, and open source.

<!-- Badges (enable once CI/releases exist):
[![CI](https://github.com/atteniv/okf-editor/actions/workflows/ci.yml/badge.svg)](…)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
-->

<!-- TODO: drop a demo GIF here — it is the single biggest thing a visitor looks at.
![Demo](docs/demo.gif) -->

## What is this?

[OKF](https://okf.md) represents organizational knowledge as a directory of markdown
files with YAML frontmatter — portable, git-friendly, and designed to give AI agents
curated context. The ecosystem has generators, linters, and viewers, but **no
general-purpose GUI editor for authoring and maintaining prose OKF bundles.** This is
that editor.

Built with [Tauri](https://tauri.app) (Rust + web frontend) so it's a lightweight,
cross-platform desktop app that works directly against a local folder and git — no
server, no lock-in.

## Status

🚧 **Pre-MVP.** See [`PROPOSAL.md`](PROPOSAL.md) for scope and rationale,
[`docs/DESIGN.md`](docs/DESIGN.md) for the technical design, and
[`docs/PLAN.md`](docs/PLAN.md) for milestones and timeline.

## Features (planned MVP)

- Open a local OKF bundle (folder); tree view by `type` / `tags`
- Schema-aware **frontmatter form** + markdown editor + live preview
- Cross-document **link autocomplete** (the OKF knowledge graph)
- Inline **validation** (okflint rules)
- New-document-from-template per `type`
- GitHub: open/clone an existing bundle repo, commit & push (PAT auth)
- *(Later)* SSO onboarding + auto-create repo, graph view, embedded git

## Install

_Not yet released._ Signed installers for macOS / Windows / Linux will be published on
the [Releases](https://github.com/atteniv/okf-editor/releases) page.

## Development

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for build/test instructions and how to submit
changes.

## Contributing

Contributions are welcome! Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) and our
[Code of Conduct](CODE_OF_CONDUCT.md). All commits must be signed off (DCO).

## Roadmap

Milestones and timeline live in [`docs/PLAN.md`](docs/PLAN.md); day-to-day work is
tracked in [Issues](https://github.com/atteniv/okf-editor/issues). Scope is
intentionally focused — prose-first OKF authoring, not data-model/ER-diagram editing.

## License

[Apache-2.0](LICENSE). "Atteniv" and the Atteniv logo are trademarks of Atteniv, Inc.
and are not licensed for use by this license.

---

Built by the team at **[Atteniv](https://atteniv.com?utm_source=github&utm_medium=oss&utm_campaign=okf-editor)** — hybrid-workforce presence tracking & multi-state tax-nexus intelligence.
