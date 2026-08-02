# Black Browser — Build Roadmap

**Target**: a Chrome-parity browser with stronger privacy and built-in AI, built fast and lean.

---

## Week 1–2: Foundation (Phase 0 — DONE)

- [x] Crash safety nets + global error handling
- [x] IPC hardening + type checks
- [x] Security hardening (path traversal, CSP, shields-off auth)
- [x] Multi-window event routing
- [x] Occlusion fix (`CalculateNativeWinOcclusion`)
- [x] Memory: crash-reload backoff, uBO timer cleanup, GC gating
- [x] Dead code removal (`navigate-request`)

---

## Week 2–4: Tab Architecture (Phase 1)

The single biggest item. Replace `<webview>` with `WebContentsView`.

- [ ] Replace `document.createElement('webview')` with `new WebContentsView()` in renderer
- [ ] Move tab lifecycle management to main process (create/close/zoom/find/PiP per tab)
- [ ] Per-tab process isolation + crash recovery (already has UI, just wire it)
- [ ] Real incognito: per-window session partition
- [ ] Extension content scripts inject properly (the reason for this migration)
- [ ] Per-site shields toggle (URL bar icon → per-host network/cosmetics/cookies)
- [ ] Tab freeze via PageLifecycle (not `about:blank` sleep)

**Verification**: uBlock Origin content script injects on a webview page; incognito cookies don't leak to normal mode.

---

## Week 4–5: Privacy 2.0 (Phase 2)

- [ ] Fingerprint farbling (randomized canvas/audio/WebGL per session)
- [ ] First-party isolation (Storage API partitioning)
- [ ] 3P cookie default-block + per-site exceptions
- [ ] Bounce-tracking protection + link-decoration stripping
- [ ] Local hash-prefix safe browsing (download scan)
- [ ] Internal `about:` pages (extensions, settings, history, downloads)

---

## Week 5–6: Polish (Phase 3)

- [ ] Profiles (multi-user, workspace switching)
- [ ] Downloads shelf (resume, silent, open-folder)
- [ ] Bundled PDF viewer
- [ ] Password generator + real autofill
- [ ] Search suggestions (Google Suggest API)
- [ ] Spellcheck
- [ ] PWA install support

---

## Week 6–8: Platform (Phase 4)

- [ ] `electron-updater` + code signing (SmartScreen trust)
- [ ] Crash telemetry (opt-in)
- [ ] Playwright e2e test suite
- [ ] Self-hostable E2EE sync server (bookmarks/passwords/settings)
- [ ] CI: syntax checks + smoke test on every PR

---

## What Already Exists

Tabs, bookmarks, history, downloads, reading list, password manager (AES-256-GCM), AI assistant, OSINT tools, SSD health, uBO ad-blocking (4 lists), Chrome Web Store extension install, new tab page with widgets, fingerprint anti-tracking, dark mode, incognito mode, single-instance lock, crash recovery, tray icon, Windows browser registration, PDF print, web capture, QR share, tab groups, vertical tabs, tab sleeping.

## What Blocks Us From Competing

1. `<webview>` tags → extensions don't inject content scripts (fix: Phase 1)
2. No process isolation → one tab crash can hang UI (fix: Phase 1)
3. No privacy farbling → Brave has stronger fingerprinting defense (fix: Phase 2)
4. No sync → users lose data (fix: Phase 4)

## Success Metrics

- Startup < 1s
- RAM per tab < 120 MB
- Crash-free sessions > 99.9%
- uBO blocks > 95% of ad requests on YouTube
- Extension content scripts inject on all sites

---

*This roadmap is a living document. Priorities shift based on what moves the needle fastest.*