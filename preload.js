const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadBookmarks: () => ipcRenderer.invoke('load-bookmarks'),
  saveBookmarks: (data) => ipcRenderer.invoke('save-bookmarks', data),
  loadHistory: () => ipcRenderer.invoke('load-history'),
  saveHistory: (data) => ipcRenderer.invoke('save-history', data),
  saveSession: (data) => ipcRenderer.invoke('save-session', data),
  loadSession: () => ipcRenderer.invoke('load-session'),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  setFullscreen: (fs) => ipcRenderer.invoke('set-fullscreen', fs),
  onBlockedCount: (callback) => ipcRenderer.on('blocked-count', (_e, count) => callback(count)),
  onDownloadStart: (callback) => ipcRenderer.on('download-start', (_e, data) => callback(data)),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_e, data) => callback(data)),
  onDownloadDone: (callback) => ipcRenderer.on('download-done', (_e, data) => callback(data)),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  pmHasMaster: () => ipcRenderer.invoke('pm-has-master'),
  pmSetMaster: (pw) => ipcRenderer.invoke('pm-set-master', pw),
  pmVerifyMaster: (pw) => ipcRenderer.invoke('pm-verify-master', pw),
  pmLoad: (pw) => ipcRenderer.invoke('pm-load', pw),
  pmSave: (pw, entries) => ipcRenderer.invoke('pm-save', pw, entries),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (data) => ipcRenderer.invoke('save-settings', data),
  loadUsage: () => ipcRenderer.invoke('load-usage'),
  saveUsage: (data) => ipcRenderer.invoke('save-usage', data)
});
