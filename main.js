const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { ElectronBlocker } = require('@cliqz/adblocker-electron');
const fetch = require('cross-fetch');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: 'hidden', // Modern look with custom titlebar
    titleBarOverlay: {
      color: '#121212',
      symbolColor: '#ffffff'
    },
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true // Allow <webview> for the browser tabs
    },
    backgroundColor: '#121212'
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  // Initialize native adblocker
  ElectronBlocker.fromPrebuiltAdsAndTracking(fetch).then((blocker) => {
    blocker.enableBlockingInSession(session.defaultSession);
    console.log('Shields Up: Adblocker activated!');
  });

  createWindow();

  // Downloads Manager Logic
  session.defaultSession.on('will-download', (event, item, webContents) => {
    // Send initial start event
    if (mainWindow) {
      mainWindow.webContents.send('download-start', {
        filename: item.getFilename(),
        totalBytes: item.getTotalBytes()
      });
    }

    item.on('updated', (event, state) => {
      if (state === 'progressing') {
        const progress = (item.getReceivedBytes() / item.getTotalBytes()) * 100;
        if (mainWindow) {
          mainWindow.webContents.send('download-progress', {
            filename: item.getFilename(),
            progress: progress.toFixed(1)
          });
        }
      }
    });
    
    item.once('done', (event, state) => {
      if (mainWindow) {
        mainWindow.webContents.send('download-done', {
          filename: item.getFilename(),
          state: state
        });
      }
    });
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
