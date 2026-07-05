# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities **privately** — do not open a public issue.

- Preferred: use GitHub's [private vulnerability reporting](../../security/advisories/new)
  (Security → Report a vulnerability).
- Or email **security@atteniv.com** with details and reproduction steps.

We'll acknowledge receipt within a few business days and keep you updated on the fix.
Please give us a reasonable window to address the issue before public disclosure.

## Supported versions

This project is pre-1.0; only the latest release receives security fixes.

## Scope notes

- This is a **local-first desktop app**. It reads/writes files on your machine and
  talks to GitHub with a token **you** provide.
- Tokens are stored in your operating system's keychain, never in plaintext in the repo
  or app data.
- **Never commit secrets** (tokens, keys) to an OKF bundle or to this repository.
