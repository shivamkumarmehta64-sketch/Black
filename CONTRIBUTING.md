# Contributing to Black Firefox

Thank you for your interest in contributing. Black Firefox is a privacy-first, ad-blocking Chromium browser built with Electron.

## Quick Setup

```bash
git clone https://github.com/shivamkumarmehta64-sketch/Black.git
cd Black
npm install
npm start
```

## How to Contribute

### Reporting Bugs
- Include OS version, Electron version, and steps to reproduce
- Attach `main-log.txt` from `%TEMP%\opencode\` if relevant
- Check existing issues before opening a new one

### Suggesting Features
- Open an issue with the `enhancement` label first
- Describe the problem, not the solution
- Keep it scoped: one feature per issue

### Submitting Code
1. Fork the repo
2. Create a branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Run `node --check main.js renderer.js preload.js` to verify syntax
5. Commit with a clear message: `feat:`, `fix:`, `refactor:`, `docs:`
6. Push and open a PR

### Code Style
- CommonJS (`require`), no ES modules
- No comments unless critical
- Indent with tabs
- `node --check` must pass before committing

## Areas That Need Help

- **WebContentsView migration** (Phase 1): replacing `<webview>` tags — the biggest open item
- **Extension content scripts**: making Chrome store extensions actually inject into pages
- **Privacy stack**: fingerprint farbling, first-party isolation, cookie control
- **Tests**: Playwright e2e suite for the browser
- **CI**: GitHub Actions workflow for syntax checks + smoke tests
- **Localization**: i18n for non-English UI
- **macOS/Linux builds**: CI matrix for cross-platform

## Architecture

- `main.js` — Electron main process (IPC, services, ad-block engine, extension loader)
- `renderer.js` — UI logic (tabs, sidebar, settings, modals)
- `preload.js` — Bridge between main and renderer (`window.api`)
- `index.html` — Browser chrome (toolbar, tab strip, sidebar)
- `newtab.html` — New tab page (clock, search, widgets)
- `fingerprint.js` — Anti-fingerprinting script injected into every page

## Key IPC Channels

| Channel | Direction | Purpose |
|---|---|---|
| `shields-status` | main → renderer | Current blocking state |
| `shields-set` | renderer → main | Toggle blocking |
| `ext-list` | main → renderer | Installed extensions |
| `ext-load` | renderer → main | Load unpacked extension |
| `ext-install-store` | renderer → main | Install from Chrome Web Store |
| `open-in-tab` | main → renderer | Navigate a URL in a new tab |
| `blocked-count` | main → renderer | Update block counter |
| `memory-pressure` | main → renderer | Memory warning |

## Development Profile

Set these env vars for a test profile (does not affect production):

```
BLACK_USER_DATA=C:\Users\shiva\AppData\Local\Temp\opencode\black-profile2
BLACK_LOG_FILE=C:\Users\shiva\AppData\Local\Temp\opencode\main-log.txt
NODE_ENV=development
```

## License

ISC — see [LICENSE](LICENSE)