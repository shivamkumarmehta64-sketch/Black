const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const historyFile = path.join(__dirname, 'history.json');
const bookmarksFile = path.join(__dirname, 'bookmarks.json');

contextBridge.exposeInMainWorld('api', {
  // Bookmarks
  loadBookmarks: () => {
    if (fs.existsSync(bookmarksFile)) {
      try { return JSON.parse(fs.readFileSync(bookmarksFile, 'utf8')); }
      catch (e) { return []; }
    }
    return [];
  },
  saveBookmarks: (data) => {
    fs.writeFileSync(bookmarksFile, JSON.stringify(data, null, 2));
  },
  
  // History
  loadHistory: () => {
    if (fs.existsSync(historyFile)) {
      try { return JSON.parse(fs.readFileSync(historyFile, 'utf8')); }
      catch (e) { return []; }
    }
    return [];
  },
  saveHistory: (data) => {
    fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
  },
  
  // Downloads IPC
  onDownloadStart: (callback) => ipcRenderer.on('download-start', callback),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', callback),
  onDownloadDone: (callback) => ipcRenderer.on('download-done', callback)
});
