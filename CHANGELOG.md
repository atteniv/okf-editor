# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project scaffolding: proposal, license, contribution guidelines, code of
  conduct, security policy, issue/PR templates, and CI workflow.
- Design document (`docs/DESIGN.md`) and project plan (`docs/PLAN.md`).
- Editor core (M1): bundle browsing with a file-manager tree, CodeMirror
  editing with autosave and sanitized preview, schema-aware frontmatter form,
  inline lint, link autocomplete, file operations with automatic link
  rewriting, quick-open, and keyboard shortcuts.
- AI assistance (AI-1): bring-your-own-key OpenRouter integration — generate
  document content on creation and a document-grounded chat panel. The key is
  stored in the OS keychain; requests never leave the app's native core.
