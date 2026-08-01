const { app, BrowserWindow, session, ipcMain, dialog, protocol, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let mainWindow;
let blockedCount = 0;

ipcMain.handle('toggle-fullscreen', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.setFullScreen(!win.isFullScreen());
  }
});

ipcMain.handle('set-fullscreen', (_e, fs) => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.setFullScreen(fs);
});

function setupContextMenu() {
  app.whenReady().then(async () => {
    try {
      const { default: contextMenu } = await import(/* webpackIgnore: true */ 'electron-context-menu');
      if (typeof contextMenu === 'function') {
        contextMenu({
          showSaveImageAs: true,
          showCopyImage: true,
          showCopyImageAddress: true,
          showInspectElement: true
        });
      }
    } catch (e) {
      console.error('Context menu unavailable:', e.message);
    }
  });
}

setupContextMenu();

// ── GPU & Rendering Performance Flags ──────────────────────────────────────
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-frame-rate-limit');         // uncap compositor FPS
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('num-raster-threads', '4');           // parallel tile rasterisation
app.commandLine.appendSwitch('enable-accelerated-video-decode');   // GPU video decode
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512 --expose-gc');
// ────────────────────────────────────────────────────────────────────────────

let tray = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  // Use .ico on Windows (multi-resolution), .png elsewhere
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, iconFile),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1c1e',
      symbolColor: '#e8eaed',
      height: 30
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true
    },
    backgroundColor: '#202124'
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  // YouTube ad URL blocking
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: [
      '*://*.doubleclick.net/*',
      '*://*.googlesyndication.com/*',
      '*://*.googleadservices.com/*',
      '*://*.googletagservices.com/*',
      '*://*.googletagmanager.com/*',
      '*://*.google-analytics.com/*',
      '*://*.g.doubleclick.net/*',
      '*://*/pagead/*',
      '*://*/pagead2/*',
      '*://*/pubads.g.doubleclick.net/*',
      '*://*.youtube.com/api/stats/ads*',
      '*://*.youtube.com/ptracking*',
      '*://*.youtube.com/pagead/*',
      '*://*.youtube.com/get_midroll_info*',
      '*://*.youtube.com/youtubei/v1/AdTrailer*',
      '*://*.taboola.com/*',
      '*://*.outbrain.com/*',
      '*://*.scorecardresearch.com/*',
      '*://*.criteo.com/*',
      '*://*.criteo.net/*',
      '*://*.amazon-adsystem.com/*',
      '*://*.adnxs.com/*',
      '*://*.adsrvr.org/*',
      '*://*.adservice.google.com/*',
      '*://*.adserver.yahoo.com/*',
      '*://*.advertising.com/*',
      '*://*.adzerk.net/*',
      '*://*.adsafeprotected.com/*',
      '*://*.moatads.com/*',
      '*://*.sharethrough.com/*',
      '*://*.indexww.com/*',
      '*://*.pubmatic.com/*',
      '*://*.openx.net/*',
      '*://*.rubiconproject.com/*',
      '*://*.appnexus.com/*',
      '*://*.casalemedia.com/*',
      '*://*.contextweb.com/*',
      '*://*.onetag.com/*',
      '*://*.criteo.com/*',
      '*://*.criteo.net/*',
      '*://*.ads.linkedin.com/*',
      '*://*.ads.facebook.com/*',
      '*://*.ads.yahoo.com/*',
      '*://*.analytics.yahoo.com/*',
      '*://*.ads.youtube.com/*',
      '*://*.youtube-nocookie.com/*',
      '*://*.googlesyndication.com/*',
      '*://*.xiti.com/*',
      '*://*.at.atwola.com/*',
      '*://*.adserver.adtechus.com/*',
      '*://*.adserver.adtech.de/*',
      '*://*.ad.doubleclick.net/*',
      '*://*.adclick.g.doubleclick.net/*'
    ] },
    (details, callback) => {
      blockedCount++;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('blocked-count', blockedCount);
      }
      callback({ cancel: true });
    }
  );

  const userDataPath = app.getPath('userData');
  const historyFile = path.join(userDataPath, 'history.json');
  const bookmarksFile = path.join(userDataPath, 'bookmarks.json');
  const passwordFile = path.join(userDataPath, 'passwords.enc');
  const configFile = path.join(userDataPath, 'config.json');

  function encryptPasswords(data, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(key).digest(), iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + ':' + authTag + ':' + encrypted;
  }

  function decryptPasswords(data, key) {
    try {
      const parts = data.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(key).digest(), iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch (e) { return null; }
  }

  ipcMain.handle('pm-has-master', () => {
    try {
      if (fs.existsSync(configFile)) {
        const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        return !!cfg.masterHash;
      }
    } catch (e) {}
    return false;
  });

  ipcMain.handle('pm-set-master', (_e, masterPassword) => {
    try {
      const hash = crypto.createHash('sha256').update(masterPassword).digest('hex');
      fs.writeFileSync(configFile, JSON.stringify({ masterHash: hash }));
      fs.writeFileSync(passwordFile, encryptPasswords([], masterPassword));
      return true;
    } catch (e) { return false; }
  });

  ipcMain.handle('pm-verify-master', (_e, masterPassword) => {
    try {
      if (!fs.existsSync(configFile)) return false;
      const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      const hash = crypto.createHash('sha256').update(masterPassword).digest('hex');
      return hash === cfg.masterHash;
    } catch (e) { return false; }
  });

  ipcMain.handle('pm-load', (_e, masterPassword) => {
    try {
      if (!fs.existsSync(passwordFile)) return [];
      const data = fs.readFileSync(passwordFile, 'utf8');
      const decrypted = decryptPasswords(data, masterPassword);
      return decrypted || [];
    } catch (e) { return []; }
  });

  ipcMain.handle('pm-save', (_e, masterPassword, entries) => {
    try {
      fs.writeFileSync(passwordFile, encryptPasswords(entries, masterPassword));
      return true;
    } catch (e) { return false; }
  });

  const settingsFile = path.join(userDataPath, 'settings.json');

  ipcMain.handle('load-settings', () => {
    try {
      if (fs.existsSync(settingsFile)) {
        return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      }
    } catch (e) {}
    return null;
  });

  const usageFile = path.join(userDataPath, 'usage.json');

  ipcMain.handle('load-usage', () => {
    try {
      if (fs.existsSync(usageFile)) {
        return JSON.parse(fs.readFileSync(usageFile, 'utf8'));
      }
    } catch (e) {}
    return {};
  });

  ipcMain.handle('save-usage', (_e, data) => {
    try {
      fs.writeFileSync(usageFile, JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  });

  ipcMain.handle('load-bookmarks', () => {
    try {
      if (fs.existsSync(bookmarksFile)) {
        return JSON.parse(fs.readFileSync(bookmarksFile, 'utf8'));
      }
    } catch (e) {
      console.error('Failed to load bookmarks:', e);
    }
    return [];
  });

  ipcMain.handle('save-bookmarks', (_e, data) => {
    try {
      fs.writeFileSync(bookmarksFile, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('Failed to save bookmarks:', e);
    }
  });

  ipcMain.handle('load-history', () => {
    try {
      if (fs.existsSync(historyFile)) {
        return JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    }
    return [];
  });

  ipcMain.handle('save-history', (_e, data) => {
    try {
      fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('Failed to save history:', e);
    }
  });

  const sessionFile = path.join(userDataPath, 'session.json');

  ipcMain.handle('save-session', (_e, data) => {
    try {
      fs.writeFileSync(sessionFile, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  });

  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'All Supported', extensions: ['html','htm','pdf','txt','jpg','png','gif','svg','webp','mp4','webm','mp3','ogg','json','xml','css','js','md'] },
        { name: 'Documents', extensions: ['html','htm','pdf','txt','md','json','xml'] },
        { name: 'Images', extensions: ['jpg','png','gif','svg','webp'] },
        { name: 'Media', extensions: ['mp4','webm','mp3','ogg'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('load-session', () => {
    try {
      if (fs.existsSync(sessionFile)) {
        return JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      }
    } catch (e) {
      console.error('Failed to load session:', e);
    }
    return null;
  });

  // ── IPC NAVIGATE-REQUEST: 150ms debounce + 30s same-URL cache ─────────────
  const _navDebounceMap = new Map(); // tabId → timer
  const _navCache = new Map();       // url  → { result, ts }
  const NAV_DEBOUNCE_MS  = 150;
  const NAV_CACHE_TTL_MS = 30_000;

  // Dev-mode IPC message counter (logs per minute)
  let _ipcMsgCount = 0;
  if (process.env.NODE_ENV === 'development') {
    setInterval(() => {
      if (_ipcMsgCount > 0) {
        console.log(`[Black IPC] ${_ipcMsgCount} messages/min`);
        _ipcMsgCount = 0;
      }
    }, 60_000);
  }

  ipcMain.handle('navigate-request', (_e, tabId, url) => {
    if (process.env.NODE_ENV === 'development') _ipcMsgCount++;

    return new Promise((resolve) => {
      // Clear pending debounce for this tab
      if (_navDebounceMap.has(tabId)) clearTimeout(_navDebounceMap.get(tabId));

      _navDebounceMap.set(tabId, setTimeout(() => {
        _navDebounceMap.delete(tabId);

        // Check 30-second same-URL cache
        const cached = _navCache.get(url);
        if (cached && (Date.now() - cached.ts) < NAV_CACHE_TTL_MS) {
          if (process.env.NODE_ENV === 'development')
            console.log(`[Black IPC] Cache hit for ${url}`);
          return resolve({ cached: true, url });
        }

        // Cache the navigation intent
        _navCache.set(url, { ts: Date.now() });
        // Evict stale cache entries
        for (const [k, v] of _navCache) {
          if (Date.now() - v.ts > NAV_CACHE_TTL_MS) _navCache.delete(k);
        }

        resolve({ cached: false, url });
      }, NAV_DEBOUNCE_MS));
    });
  });
  // ─────────────────────────────────────────────────────────────────────────

  createWindow();

  // System tray — prefer .ico for multi-res Windows taskbar
  try {
    const iconPath = process.platform === 'win32'
      ? path.join(__dirname, 'icon.ico')
      : path.join(__dirname, 'icon.png');
    let trayIcon;
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
    } else {
      const pngPath = path.join(__dirname, 'icon.png');
      if (fs.existsSync(pngPath)) {
        trayIcon = nativeImage.createFromPath(pngPath);
      }
    }
    if (trayIcon && !trayIcon.isEmpty()) {
      tray = new Tray(trayIcon);
      tray.setToolTip('Black Browser');
      const ctxMenu = Menu.buildFromTemplate([
        { label: 'Show Black', click: () => { mainWindow.show(); mainWindow.focus(); } },
        { type: 'separator' },
        { label: 'Quit', click: () => {
          tray.destroy();
          tray = null;
          mainWindow.destroy();
          app.quit();
        } }
      ]);
      tray.setContextMenu(ctxMenu);
      tray.on('click', () => { mainWindow.show(); mainWindow.focus(); });
    }
  } catch (e) { console.error('Tray unavailable:', e.message); }

  // Close to tray or quit
  let closing = false;
  mainWindow.on('close', (event) => {
    if (tray && !closing) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // HTTPS everywhere (auto-upgrade http→https)
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*'] }, (details, callback) => {
    try {
      const url = new URL(details.url);
      if (url.protocol === 'http:' && !url.port && !url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
        url.protocol = 'https:';
        callback({ redirectURL: url.toString() });
        return;
      }
    } catch (e) {}
    callback({});
  });

  // Anti-fingerprinting
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    const blocked = ['media', 'geolocation', 'notifications', 'midi', 'keyboardLock', 'pointerLock'];
    callback(blocked.includes(permission) ? false : true);
  });

  // Cache dark mode setting
  let darkModeEnabled = true;
  try {
    const sf = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(sf)) {
      const s = JSON.parse(fs.readFileSync(sf, 'utf8'));
      if (s.forceDarkMode === false) darkModeEnabled = false;
    }
  } catch (e) {}
  // Re-check on settings save
  ipcMain.handle('save-settings', (_e, data) => {
    try {
      fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify(data, null, 2));
      darkModeEnabled = data.forceDarkMode !== false;
      return true;
    } catch (e) { return false; }
  });

  // Inject fingerprint + YT adblock + dark mode into all webviews
  app.on('web-contents-created', (event, wc) => {
    wc.on('did-finish-load', () => {
      const url = wc.getURL();

      // Anti-fingerprinting (every page)
      wc.executeJavaScript(fs.readFileSync(path.join(__dirname, 'fingerprint.js'), 'utf8'), true).catch(() => {});

      // Force dark mode using Chrome's built-in engine (preserves images, videos, layouts)
      if (url.startsWith('http') && darkModeEnabled) {
        wc.debugger.attach().then(() => {
          wc.debugger.sendCommand('Emulation.setAutoDarkModeOverride', { enabled: true });
        }).catch(() => {
          // Fallback for debugger failure
        });
      }

      // YouTube ad stripping
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        wc.executeJavaScript(`
          (function() {
            try {
              const adKeys = [
                'adPlacements','playerAds','adSlots','promotedVideoRenderer',
                'inlineAdLayoutRenderer','carouselAdRenderer','searchVideoRenderer',
                'adBreak','adBreakBegin','adBreakEnd','adBreakLength',
                'adBreakOffset','adBreakType','adPlacement','adInfoRenderer',
                'adFeedbackDialog','adVideoId','adVideoIds','adBreakIndex',
                'interstitialPlayerConfig','interstitialPlayerOverlay','midroll',
                'postroll','preroll','paidVideoOverlay','adRenderer',
                'slotRenderer','hotkeyAd','adServiceEndpoint','adLayoutEndpoint',
                'adSlot','adBadge','adBadgeText','adBadgePosition','adHint',
                'adHintText','adCaption','adCaptionText','adOverlay',
                'adOverlayRenderer','adOverlayStyle','adTriggerType',
                'adTriggerValue','adTriggerPosition','adTriggerOffset'
              ];

              function stripAds(obj) {
                if (!obj || typeof obj !== 'object') return;
                if (Array.isArray(obj)) {
                  obj.forEach(stripAds);
                  return;
                }
                Object.keys(obj).forEach(key => {
                  if (adKeys.includes(key)) {
                    delete obj[key];
                  } else {
                    stripAds(obj[key]);
                  }
                });
              }

              const origParse = JSON.parse;
              JSON.parse = function(t, r) {
                try {
                  const obj = origParse.call(this, t, r);
                  if (obj && typeof obj === 'object') stripAds(obj);
                  return obj;
                } catch(e) {
                  return origParse.call(this, t, r);
                }
              };

              const origFetch = window.fetch;
              window.fetch = function(i, init) {
                return origFetch.apply(this, arguments).then(function(r) {
                  const url = typeof i === 'string' ? i : (i && i.url ? i.url : '');
                  if (url.includes('youtubei.googleapis.com') || url.includes('/youtubei/v1/')) {
                    return r.clone().json().then(function(d) {
                      stripAds(d);
                      return new Response(JSON.stringify(d), { status: r.status, headers: r.headers });
                    }).catch(function() { return r; });
                  }
                  return r;
                });
              };
            } catch(e) { console.log('[Black] YT adblock:', e.message); }
          })();
        `, true).catch(() => {});
      }
    });
  });

  session.defaultSession.on('will-download', (event, item, webContents) => {
    const filePath = dialog.showSaveDialogSync(mainWindow, {
      defaultPath: item.getFilename(),
      filters: [{ name: 'All Files', extensions: ['*'] }]
    });

    if (!filePath) {
      item.cancel();
      return;
    }

    item.setSavePath(filePath);

    if (mainWindow) {
      mainWindow.webContents.send('download-start', {
        filename: path.basename(filePath),
        totalBytes: item.getTotalBytes()
      });
    }

    item.on('updated', (event, state) => {
      if (state === 'progressing') {
        const progress = (item.getReceivedBytes() / item.getTotalBytes()) * 100;
        if (mainWindow) {
          mainWindow.webContents.send('download-progress', {
            filename: path.basename(filePath),
            progress: progress.toFixed(1)
          });
        }
      }
    });

    item.once('done', (event, state) => {
      if (mainWindow) {
        mainWindow.webContents.send('download-done', {
          filename: path.basename(filePath),
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
  if (process.platform !== 'darwin' && !tray) app.quit();
});
