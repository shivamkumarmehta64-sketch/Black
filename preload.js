const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ── Data persistence ──
  loadBookmarks:    ()           => ipcRenderer.invoke('load-bookmarks'),
  saveBookmarks:    (data)       => ipcRenderer.invoke('save-bookmarks', data),
  loadHistory:      ()           => ipcRenderer.invoke('load-history'),
  saveHistory:      (data)       => ipcRenderer.invoke('save-history', data),
  saveSession:      (data)       => ipcRenderer.invoke('save-session', data),
  loadSession:      ()           => ipcRenderer.invoke('load-session'),
  loadSettings:     ()           => ipcRenderer.invoke('load-settings'),
  saveSettings:     (data)       => ipcRenderer.invoke('save-settings', data),
  loadUsage:        ()           => ipcRenderer.invoke('load-usage'),
  saveUsage:        (data)       => ipcRenderer.invoke('save-usage', data),

  // ── Window ──
  toggleFullscreen: ()           => ipcRenderer.invoke('toggle-fullscreen'),
  setFullscreen:    (fs)         => ipcRenderer.invoke('set-fullscreen', fs),
  closeWindow:      ()           => ipcRenderer.invoke('close-window'),
  openPanel:        (panel)      => ipcRenderer.send('open-panel', panel),
  onOpenPanel:      (cb)         => ipcRenderer.on('open-panel', (_e, panel) => cb(panel)),
  newWindow:        (incognito)  => ipcRenderer.invoke('new-window', !!incognito),
  isIncognito:      ()           => process.argv.includes('--black-incognito'),

  // ── Navigation ──
  navigateRequest:  (tabId, url) => ipcRenderer.invoke('navigate-request', tabId, url),

  // ── Popups: page window.open / target=_blank → new tab in host window ──
  onOpenInTab:      (cb)         => ipcRenderer.on('open-in-tab', (_e, url) => cb(url)),

  // ── Shell: open external URLs in system browser (AI chat, links) ──
  openExternal:     (url)        => ipcRenderer.invoke('open-external', url),

  // ── Downloads ──
  openFileDialog:   ()           => ipcRenderer.invoke('open-file-dialog'),
  onDownloadStart:  (cb)         => ipcRenderer.on('download-start',    (_e, d) => cb(d)),
  onDownloadProgress:(cb)        => ipcRenderer.on('download-progress', (_e, d) => cb(d)),
  onDownloadDone:   (cb)         => ipcRenderer.on('download-done',     (_e, d) => cb(d)),

  // ── Privacy / Ad-blocking ──
  onBlockedCount:   (cb)         => ipcRenderer.on('blocked-count', (_e, count) => cb(count)),
  shieldsStatus:    ()           => ipcRenderer.invoke('shields-status'),
  setShields:       (enabled)    => ipcRenderer.invoke('shields-set', enabled),

  // ── Extensions (Chromium) ──
  extList:          ()           => ipcRenderer.invoke('ext-list'),
  extLoadDialog:    ()           => ipcRenderer.invoke('ext-load-dialog'),
  extLoad:          (dir)        => ipcRenderer.invoke('ext-load', dir),
  extRemove:        (id)         => ipcRenderer.invoke('ext-remove', id),
  extInstallStore:  (urlOrId)    => ipcRenderer.invoke('ext-install-store', urlOrId),

  // ── Web capture & PDF ──
  webScreenshot:    (wcId)       => ipcRenderer.invoke('web-screenshot', wcId),
  printPdf:         (wcId)       => ipcRenderer.invoke('print-pdf', wcId),

  // ── Reading list ──
  loadReading:      ()           => ipcRenderer.invoke('load-reading'),
  saveReading:      (data)       => ipcRenderer.invoke('save-reading', data),

  // ── Password Manager ──
  pmHasMaster:      ()           => ipcRenderer.invoke('pm-has-master'),
  pmSetMaster:      (pw)         => ipcRenderer.invoke('pm-set-master', pw),
  pmVerifyMaster:   (pw)         => ipcRenderer.invoke('pm-verify-master', pw),
  pmLoad:           (pw)         => ipcRenderer.invoke('pm-load', pw),
  pmSave:           (pw, entries)=> ipcRenderer.invoke('pm-save', pw, entries),

  // ── Memory ──
  gcCollect:        ()           => ipcRenderer.invoke('gc-collect'),

  // ── AI Assistant (Great Sage) ──
  aiChatStart:      (payload)    => ipcRenderer.invoke('ai-chat-start', payload),
  aiChatStop:       ()           => ipcRenderer.send('ai-chat-stop'),
  onAiChunk:        (cb)         => ipcRenderer.on('ai-chunk', (_e, d) => cb(d)),

  // ── Stability: memory-pressure notifications from main ──
  onMemoryPressure: (cb)         => ipcRenderer.on('memory-pressure', (_e, mb) => cb(mb)),

  // ── Site Advisor (McAfee WebAdvisor style) ──
  advisorStatus:    ()           => ipcRenderer.invoke('advisor-status'),
  advisorBlock:     (url)        => ipcRenderer.invoke('advisor-block', url),
  advisorProceed:   (url)        => ipcRenderer.invoke('advisor-proceed', url),
  onAdvisorBlocked: (cb)         => ipcRenderer.on('advisor-blocked', (_e, d) => cb(d)),

  // ── OSINT self-check tools (Great Sage) ──
  osintCheck:       (type, param) => ipcRenderer.invoke('osint-check', type, param),
  securityNotify:   (title, body) => ipcRenderer.invoke('security-notify', title, body),

  // ── Real SSD health (SMART) ──
  ssdHealth:        (force)      => ipcRenderer.invoke('ssd-health', !!force),
});
