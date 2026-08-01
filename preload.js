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

  // ── Navigation ──
  navigateRequest:  (tabId, url) => ipcRenderer.invoke('navigate-request', tabId, url),

  // ── Shell: open external URLs in system browser (AI chat, links) ──
  openExternal:     (url)        => ipcRenderer.invoke('open-external', url),

  // ── Downloads ──
  openFileDialog:   ()           => ipcRenderer.invoke('open-file-dialog'),
  onDownloadStart:  (cb)         => ipcRenderer.on('download-start',    (_e, d) => cb(d)),
  onDownloadProgress:(cb)        => ipcRenderer.on('download-progress', (_e, d) => cb(d)),
  onDownloadDone:   (cb)         => ipcRenderer.on('download-done',     (_e, d) => cb(d)),

  // ── Privacy / Ad-blocking ──
  onBlockedCount:   (cb)         => ipcRenderer.on('blocked-count', (_e, count) => cb(count)),

  // ── Password Manager ──
  pmHasMaster:      ()           => ipcRenderer.invoke('pm-has-master'),
  pmSetMaster:      (pw)         => ipcRenderer.invoke('pm-set-master', pw),
  pmVerifyMaster:   (pw)         => ipcRenderer.invoke('pm-verify-master', pw),
  pmLoad:           (pw)         => ipcRenderer.invoke('pm-load', pw),
  pmSave:           (pw, entries)=> ipcRenderer.invoke('pm-save', pw, entries),

  // ── Memory ──
  gcCollect:        ()           => ipcRenderer.invoke('gc-collect'),
});
