const { app, BrowserWindow, session, ipcMain, dialog, protocol, Tray, Menu, nativeImage, webContents, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { execFile } = require('child_process');

const startTime = Date.now();
let mainWindow;
let blockedCount = 0;
let windowCascadeCount = 0;
let pendingUrl = null;
let uboRefreshTimer = null;

// ── GLOBAL CRASH SAFETY NETS ───────────────────────────────────────────────
// No throw anywhere in main should take the browser down silently: log it,
// dump a breadcrumb for diagnostics, and keep running. Unhandled promise
// rejections are the same class of bug — surface them too.
process.on('uncaughtException', (err) => {
  try {
    const line = '[Black] uncaughtException: ' + (err && err.stack ? err.stack : String(err));
    console.error(line);
    if (process.env.BLACK_LOG_FILE) {
      try { fs.appendFileSync(process.env.BLACK_LOG_FILE, line + '\n'); } catch (e) {}
    }
  } catch (e) {}
});
process.on('unhandledRejection', (reason) => {
  try {
    const line = '[Black] unhandledRejection: ' + (reason && reason.stack ? reason.stack : String(reason));
    console.error(line);
    if (process.env.BLACK_LOG_FILE) {
      try { fs.appendFileSync(process.env.BLACK_LOG_FILE, line + '\n'); } catch (e) {}
    }
  } catch (e) {}
});
// Crash dumps land in userData/crashpad for real process-level failures
// (renderer/GPU crashes) so the root causes are never lost again.
app.setPath('crashDumps', path.join(app.getPath('userData'), 'crashpad'));
// ────────────────────────────────────────────────────────────────────────────

// Dev/testing override: run with an isolated profile via BLACK_USER_DATA
if (process.env.BLACK_USER_DATA) {
  try { app.setPath('userData', process.env.BLACK_USER_DATA); } catch (e) {}
}

// Extract a web URL from a command line (Windows passes "Black.exe <url>"
// when Black is chosen as the browser / default protocol handler).
function urlFromArgv(argv = []) {
  for (const a of argv) {
    if (typeof a === 'string' && (a.startsWith('http://') || a.startsWith('https://'))) return a;
  }
  return null;
}

// ── WEBVIEW MEMORY: GC on IPC trigger only ──────────────────────────
// Removed aggressive GC-on-blur (caused jank during normal browsing).
// GC is available on demand via the memory-pressure IPC channel.
// ────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// ── SSD HEALTH: RAM-buffered debounced disk writes ──────────────────────────
// Buffers JSON in memory and flushes to disk only after 2.5s of silence,
// eliminating hundreds of micro-writes per minute (protects SSD lifespan).
const _writeBuffers = new Map();
const WRITE_DEBOUNCE_MS = 2500;

function debouncedWrite(key, file, data) {
  let json;
  try { json = JSON.stringify(data); } catch (e) { return; }
  const existing = _writeBuffers.get(key);
  if (existing && existing.json === json) return; // skip identical writes
  if (existing) clearTimeout(existing.timer);
  _writeBuffers.set(key, {
    json, file,
    timer: setTimeout(() => {
      _writeBuffers.delete(key);
      try { fs.writeFileSync(file, json, 'utf8'); }
      catch (e) { console.error(`[Black] Failed to write ${file}:`, e); }
    }, WRITE_DEBOUNCE_MS)
  });
}

function flushDebouncedWrites() {
  for (const [key, buf] of _writeBuffers) {
    clearTimeout(buf.timer);
    _writeBuffers.delete(key);
    try { fs.writeFileSync(buf.file, buf.json, 'utf8'); }
    catch (e) { console.error(`[Black] Failed to flush ${buf.file}:`, e); }
  }
}

app.on('before-quit', () => {
  flushDebouncedWrites();
  if (uboRefreshTimer) { clearInterval(uboRefreshTimer); uboRefreshTimer = null; }
});
app.on('will-quit', flushDebouncedWrites);
// ─────────────────────────────────────────────────────────────────────────────

// ── REAL SSD HEALTH (SMART via Windows PowerShell) ──────────────────────────
// Reads wear %, temperature and error counters with Get-StorageReliabilityCounter.
// Results are cached for 30 s — SMART reads are slow and should not spam disks.
let ssdCache = null;
let ssdCacheAt = 0;
ipcMain.handle('ssd-health', async (_e, force) => {
  if (process.platform !== 'win32') return { ok: false, error: 'unsupported platform' };
  if (!force && ssdCache && Date.now() - ssdCacheAt < 30000) return ssdCache;
  const { execFile } = require('child_process');
  const script = `
    $ErrorActionPreference = 'SilentlyContinue';
    Get-PhysicalDisk | ForEach-Object {
      $p = $_;
      $r = $null;
      try { $r = $p | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue } catch {};
      $vals = @([string]$p.FriendlyName, [string]$p.MediaType, [string]$p.Size, [string]$p.HealthStatus);
      if ($r) { $vals += @([string]$r.Wear, [string]$r.Temperature, [string]$r.ReadErrorsTotal, [string]$r.WriteErrorsTotal, [string]$r.PowerOnHours) }
      else { $vals += @('', '', '', '', '') };
      ($vals -join [char]9) | Write-Output
    }`;
  try {
    const out = await new Promise((resolve, reject) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { timeout: 20000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout) => err ? reject(err) : resolve(stdout));
    });
    const disks = [];
    let telemetry = false;
    for (const line of out.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const f = line.split('\t');
      if (f.length < 4) continue;
      const num = (v) => { const n = parseFloat(v); return isNaN(n) || v === '' ? -1 : n; };
      const disk = {
        name: f[0] || 'Unknown drive',
        media: f[1] || '',
        sizeGB: num(f[2]) > 0 ? Math.round(num(f[2]) / 1073741824) : 0,
        health: f[3] || 'Unknown',
        wear: num(f[4]),
        temp: num(f[5]),
        readErrors: num(f[6]),
        writeErrors: num(f[7]),
        powerOnHours: num(f[8])
      };
      if (f[4] !== '') telemetry = true;
      disks.push(disk);
    }
    if (!disks.length) { ssdCache = { ok: false, error: 'no disks reported' }; ssdCacheAt = Date.now(); return ssdCache; }
    ssdCache = { ok: true, disks, telemetry };
    ssdCacheAt = Date.now();
    return ssdCache;
  } catch (e) {
    ssdCache = { ok: false, error: String((e && e.message) || e) };
    ssdCacheAt = Date.now();
    return ssdCache;
  }
});
// ─────────────────────────────────────────────────────────────────────────────

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

ipcMain.handle('close-window', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && !win.isDestroyed()) win.close();
  return true;
});

// New browser window (Ctrl+N) / InPrivate window (Ctrl+Shift+N)
ipcMain.handle('new-window', (_e, incognito) => {
  const win = createWindow({ incognito: !!incognito });
  return true;
});

// Relay "open panel" requests from webviews (new tab page dock, etc.) to their host window
ipcMain.on('open-panel', (e, panel) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && !win.isDestroyed()) {
    win.webContents.send('open-panel', panel);
  }
});

// Open external URLs safely in the system default browser
ipcMain.handle('open-external', (_e, url) => {
  if (typeof url !== 'string') return false;
  if (!url.startsWith('https://') && !url.startsWith('http://')) return false;
  const { shell } = require('electron');
  shell.openExternal(url).catch(() => {});
  return true;
});

// ── AI ASSISTANT (Great Sage): streaming chat via main-process fetch ────────
// Routes requests through the main process so any OpenAI-compatible provider
// works (no CORS issues), including local servers like Ollama.
const aiControllers = new Map();

ipcMain.handle('ai-chat-start', async (e, payload) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const key = win && !win.isDestroyed() ? win.id : e.sender.id;
  const controller = new AbortController();
  aiControllers.set(key, controller);

  const base = String(payload && payload.baseUrl || '').replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (payload && payload.apiKey) headers.Authorization = 'Bearer ' + payload.apiKey;
  const body = {
    model: payload && payload.model || '',
    messages: payload && payload.messages || [],
    temperature: payload && payload.temperature !== undefined ? payload.temperature : 0.7,
    max_tokens: payload && payload.maxTokens || 1024
  };
  const stream = !!(payload && payload.stream);
  if (stream) body.stream = true;

  try {
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(base + '/chat/completions', {
      method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 500); } catch (_) {}
      return { ok: false, status: res.status, detail };
    }
    if (!stream) {
      const j = await res.json();
      const content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      return { ok: true, full: typeof content === 'string' ? content : JSON.stringify(content || '') };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let full = '';
    let done = false;
    while (true) {
      let chunk;
      try { chunk = await reader.read(); } catch (_) { break; }
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const data = t.slice(5).trim();
        if (data === '[DONE]') { done = true; break; }
        try {
          const j = JSON.parse(data);
          const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
          if (d) {
            full += d;
            if (!controller.signal.aborted && win && !win.isDestroyed()) win.webContents.send('ai-chunk', { text: d });
          }
        } catch (_) {}
      }
      if (done) break;
    }
    return { ok: true, full, stopped: controller.signal.aborted };
  } catch (err) {
    return {
      ok: false, status: 0, stopped: controller.signal.aborted,
      detail: controller.signal.aborted ? 'stopped' : String((err && err.message) || err)
    };
  } finally {
    aiControllers.delete(key);
  }
});

ipcMain.on('ai-chat-stop', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const key = win && !win.isDestroyed() ? win.id : e.sender.id;
  const c = aiControllers.get(key);
  if (c) c.abort();
});
// ─────────────────────────────────────────────────────────────────────────────

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

// Set official app name & AppUserModelID for Windows Volume Mixer & System Media Transport Controls
app.name = 'Black Browser';
if (process.platform === 'win32') app.setAppUserModelId('com.black.browser');

// Register black-ui custom protocol scheme as privileged (must be before app.whenReady)
protocol.registerSchemesAsPrivileged([
  { scheme: 'black-ui', privileges: { standard: true, secure: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true } }
]);

// ── GPU & Rendering Performance Flags ──────────────────────────────────────
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport,HardwareMediaKeyHandling');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512 --expose-gc');
// Stop Chromium from marking occluded windows as hidden — this is the root cause
// of YouTube pausing when the Black window is covered by another window.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
// ────────────────────────────────────────────────────────────────────────────

let tray = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      const url = urlFromArgv(argv);
      if (url && !mainWindow.webContents.isDestroyed()) {
        try { broadcast('open-in-tab', url); } catch (e) {}
      }
    }
  });
}

function createWindow(opts = {}) {
  const incognito = !!opts.incognito;
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const cascade = (++windowCascadeCount - 1) * 28;
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    x: 120 + cascade,
    y: 60 + cascade,
    icon: path.join(__dirname, iconFile),
    title: incognito ? 'InPrivate — Black Browser' : 'Black Browser',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      additionalArguments: [incognito ? '--black-incognito' : '--black-normal']
    },
    backgroundColor: '#05080f',
    show: false
  });

  const showWindow = () => {
    if (win && !win.isVisible()) {
      if (win.isMinimized()) win.restore();
      if (windowCascadeCount === 1) win.center();
      win.show();
      win.focus();
      if (!incognito) console.log('[Black] Window ready and shown in', Date.now() - startTime, 'ms');
    }
  };

  win.once('ready-to-show', () => {
    showWindow();
    // If launched with a URL argument (e.g. opened a link from another app),
    // route it to the tab strip once the renderer is ready.
    if (!incognito && pendingUrl) {
      const u = pendingUrl;
      pendingUrl = null;
      setTimeout(() => { try { win.webContents.send('open-in-tab', u); } catch (e) {} }, 150);
    }
  });

  // Safety fallback: Ensure window shows even if ready-to-show is delayed
  setTimeout(showWindow, 1200);

  win.loadFile('index.html');
  if (incognito && process.env.NODE_ENV === 'development') console.log('[Black] InPrivate window created');
  return win;
}

// ── WINDOWS BROWSER REGISTRATION (Open With / Default Apps list) ────────────
// Registers Black with Windows so it appears in "Open with" menus, the
// Windows default-apps list, and as an HTML handler. Uses only HKCU (per-user)
// — no admin rights required. Safe to re-run on every launch: keeps the
// registration fresh if the app is moved to a new location.
function registerAsBrowser() {
  if (process.platform !== 'win32') return;
  const { execFile } = require('child_process');
  const appName = 'Black';
  const appId = 'com.black.browser';
  const regClass = 'BlackBrowser';
  const htmlClass = 'BlackBrowserHTML';
  const exe = process.execPath.replace(/'/g, "''");
  const exeCommand = `"${exe}" "%1"`;
  const exeIcon = `"${exe}",0`;
  const description = 'The Dark Browser — Fast. Private. Secure.';
  const company = 'Shivam Mehta';

  const reg = (key, values) => {
    for (const [name, value] of Object.entries(values)) {
      const args = ['add', key];
      if (name === '@') args.push('/ve'); else args.push('/v', name);
      args.push('/t', 'REG_SZ', '/d', value, '/f');
      execFile('reg.exe', args, { windowsHide: true }, (err) => {
        if (err) console.error(`[Black] Reg write failed ${key}\\${name}:`, err.message);
      });
    }
  };

  reg(`HKCU\\Software\\RegisteredApplications`, { [appName]: `Software\\Classes\\${regClass}\\Capabilities` });

  reg(`HKCU\\Software\\Classes\\${regClass}`, {
    '@': exeCommand,
  });
  reg(`HKCU\\Software\\Classes\\${regClass}\\DefaultIcon`, { '@': exeIcon });
  reg(`HKCU\\Software\\Classes\\${regClass}\\Capabilities`, {
    ApplicationName: appName,
    ApplicationDescription: description,
    ApplicationIcon: exeIcon,
    ApplicationCompany: company,
  });
  reg(`HKCU\\Software\\Classes\\${regClass}\\Capabilities\\URLAssociations`, {
    http: regClass,
    https: regClass,
  });
  reg(`HKCU\\Software\\Classes\\${regClass}\\Capabilities\\FileAssociations`, {
    '.htm': `${htmlClass}`,
    '.html': `${htmlClass}`,
  });
  reg(`HKCU\\Software\\Classes\\${regClass}\\Application`, {
    AppUserModelID: appId,
    ApplicationName: appName,
    ApplicationDescription: description,
    ApplicationIcon: exeIcon,
    FriendlyAppName: appName,
  });
  reg(`HKCU\\Software\\Classes\\${htmlClass}`, { '@': exeCommand });
  reg(`HKCU\\Software\\Classes\\${htmlClass}\\DefaultIcon`, { '@': exeIcon });
  reg(`HKCU\\Software\\Classes\\${htmlClass}\\Application`, { AppUserModelID: appId, FriendlyAppName: appName });

  // "Open with" app-list entry (so Black.exe shows even while another
  // browser is the default) and the http/https protocol handlers.
  reg(`HKCU\\Software\\Classes\\Applications\\Black.exe\\shell\\open\\command`, { '@': exeCommand });
  reg(`HKCU\\Software\\Classes\\Applications\\Black.exe\\DefaultIcon`, { '@': exeIcon });
  console.log('[Black] Registered as a Windows browser (HKCU)');
}

ipcMain.on('register-browser', () => registerAsBrowser());
// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  registerAsBrowser();
  // Custom protocol for internal browser pages (black-ui://newtab, warning)
  protocol.registerFileProtocol('black-ui', (request, callback) => {
    let urlPath = request.url.replace(/^black-ui:\/\//, '');
    urlPath = urlPath.split('?')[0].split('#')[0];
    if (urlPath.includes('..') || urlPath.includes('\\')) { callback({ error: -6 }); return; }
    const resolved = path.resolve(path.join(__dirname, urlPath));
    if (!resolved.startsWith(path.resolve(__dirname))) { callback({ error: -6 }); return; }
    if (!urlPath || urlPath === 'newtab' || urlPath === 'newtab/' || urlPath === 'newtab.html') {
      callback({ path: path.join(__dirname, 'newtab.html') });
    } else if (urlPath === 'warning' || urlPath === 'warning.html') {
      callback({ path: path.join(__dirname, 'warning.html') });
    } else {
      callback({ path: resolved });
    }
  });

  // ── SITE ADVISOR (McAfee WebAdvisor-style safe browsing) ─────────────────
  let advisorRules = [];
  let advisorChecks = 0;
  let advisorBlocks = 0;
  const advisorBypassed = new Set();
  const advisorFile = path.join(app.getPath('userData'), 'site_advisor.json');
  try {
    const src = fs.existsSync(advisorFile) ? advisorFile : path.join(__dirname, 'rules', 'site_advisor.json');
    advisorRules = JSON.parse(fs.readFileSync(src, 'utf8')).rules || [];
    if (!Array.isArray(advisorRules)) advisorRules = [];
  } catch (e) {
    advisorRules = [];
    console.error('[Black] Site Advisor rules failed to load:', e.message);
  }
  const advisorMatch = (hostname) => {
    const h = hostname.toLowerCase().replace(/^www\./, '');
    for (const r of advisorRules) {
      if (r.rule === h || h.endsWith('.' + r.rule)) return r;
    }
    return null;
  };
  const advisorBlockUrl = (url) => {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return advisorMatch(u.hostname);
    } catch (_) { return null; }
  };
  // Persist a user-blocked host into the local rules file
  ipcMain.handle('advisor-block', (_e, url) => {
    try {
      const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      if (!h || h.includes('localhost') || h.includes('127.0.0.1')) return false;
      if (!advisorRules.some(r => r.rule === h)) {
        advisorRules.push({ category: 'user-block', rule: h });
        try { fs.writeFileSync(advisorFile, JSON.stringify({ version: 1, rules: advisorRules }, null, 2)); } catch (e) {}
        return true;
      }
      return false;
    } catch (_) { return false; }
  });
  ipcMain.handle('advisor-proceed', (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) advisorBypassed.add(url);
    return true;
  });
  ipcMain.handle('advisor-status', () => ({
    rules: advisorRules.length,
    checks: advisorChecks,
    blocks: advisorBlocks
  }));
  // Check every main-frame navigation; dangerous pages go to the warning page
  // (handled inside the consolidated webRequest listener registered below)

  // ── OSINT SELF-CHECK TOOLS (free, no API keys, privacy-first) ────────────
  // pwned-range: k-anonymity check against the Pwned Passwords API — only the
  // first 5 chars of the SHA-1 hash ever leave this device.
  ipcMain.handle('osint-check', async (_e, type, param) => {
    const crypto = require('crypto');
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    try {
      if (type === 'pwned') {
        const pw = String(param || '');
        if (!pw) return { ok: false, error: 'empty' };
        const sha = crypto.createHash('sha1').update(pw).digest('hex').toUpperCase();
        const prefix = sha.slice(0, 5);
        const res = await withTimeout(fetch('https://api.pwnedpasswords.com/range/' + prefix), 20000);
        if (!res.ok) return { ok: false, error: 'http ' + res.status };
        const body = await res.text();
        let count = 0;
        for (const line of body.split('\n')) {
          const i = line.indexOf(':');
          if (i > 0 && (prefix + line.slice(0, i)) === sha) { count = parseInt(line.slice(i + 1), 10) || 0; break; }
        }
        return { ok: true, pwned: count > 0, count };
      }
      if (type === 'ip') {
        const ipRes = await withTimeout(fetch('https://api.ipify.org?format=json'), 20000);
        const ipJson = await ipRes.json();
        const infoRes = await withTimeout(fetch('https://ipinfo.io/json'), 20000);
        const info = await infoRes.json();
        return { ok: true, ip: ipJson.ip, city: info.city || '?', region: info.region || '?', country: info.country || '?', org: info.org || '?', hostname: info.hostname || '' };
      }
      if (type === 'dns') {
        const host = String(param || '').trim();
        if (!host) return { ok: false, error: 'empty' };
        const res = await withTimeout(fetch('https://dns.google/resolve?name=' + encodeURIComponent(host) + '&type=A'), 20000);
        const j = await res.json();
        const answers = (j.Answer || []).map(a => ({ type: a.type, data: a.data }));
        return { ok: true, host, status: j.Status, nxdomain: j.Status === 3, answers };
      }
      return { ok: false, error: 'unknown-type' };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });

  // Windows-style notification from the renderer (Great Sage alerts)
  ipcMain.handle('security-notify', (_e, title, body) => {
    try {
      if (Notification.isSupported()) {
        const n = new Notification({ title: String(title || 'Great Sage'), body: String(body || ''), silent: false });
        n.show();
        return true;
      }
    } catch (e) {}
    return false;
  });

  // ── AD-BLOCK STATE ────────────────────────────────────────────────────────
  // Single engine: uBO (@ghostery/adblocker-electron) handles network AND
  // cosmetic filtering in-process (no native exe, no IPC).
  let shieldsEnabled = true;
  let shieldsChecks = 0;
  let shieldsBlocks = 0;

  // ── uBO ENGINE (Ghostery/adblocker — the uBlock Origin engine) ──────────
  // Primary network filter: synchronous in-process matching (no IPC, no
  // per-request latency). Loads uBlock Origin lists (ublock-filters, unbreak,
  // easylist, easyprivacy, ...) with an on-disk serialized cache. The C++
  // engine above stays as fallback (and keeps serving cosmetic filters).
  let uboBlocker = null;
  let uboReady = false;
  let uboRulesCount = 0;
  let uboCosmeticCount = 0;

  async function startUboEngine() {
    try {
      const { ElectronBlocker } = require('@ghostery/adblocker-electron');
      // Minimal, fast list set: core uBO + EasyList/Privacy only (the 17-list
      // full set tripled boot time for marginal extra coverage).
      const uboLists = [
        'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/easylist/easylist.txt',
        'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/easylist/easyprivacy.txt',
        'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/filters.txt',
        'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/unbreak.txt'
      ];
      const cachePath = path.join(app.getPath('userData'), 'engine2.bin');
      const config = {
        enableCompression: true,
        loadNetworkFilters: true,
        loadCosmeticFilters: true,
        loadExceptionFilters: true,
        loadPreprocessors: true
      };
      const caching = {
        path: cachePath,
        read: async (p) => {
          if (!fs.existsSync(p)) throw new Error('no cached engine');
          return new Uint8Array(fs.readFileSync(p));
        },
        write: async (p, b) => { try { fs.writeFileSync(p, Buffer.from(b)); } catch (e) {} }
      };
      const blocker = await ElectronBlocker.fromLists(fetch, uboLists, config, caching);
      uboBlocker = blocker;
      const f = blocker.getFilters();
      uboRulesCount = f.networkFilters.length;
      uboCosmeticCount = f.cosmeticFilters.length;
      uboReady = true;
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Black] uBO engine ready (${uboRulesCount} network, ${uboCosmeticCount} cosmetic filters)`);
      }
      // Zero-maintenance list updates: silently re-fetch fresh uBO lists in
      // the background when the cached engine is older than 24h, then daily.
      // A failed refresh leaves the current engine untouched.
      const refresh = async () => {
        try {
          const b = await ElectronBlocker.fromLists(fetch, uboLists, config, {
            path: cachePath,
            read: async () => { throw new Error('no cache'); },
            write: caching.write
          });
          uboBlocker = b;
          const fn = b.getFilters();
          uboRulesCount = fn.networkFilters.length;
          uboCosmeticCount = fn.cosmeticFilters.length;
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Black] uBO lists refreshed (${uboRulesCount} network, ${uboCosmeticCount} cosmetic filters)`);
          }
        } catch (e) {}
      };
       const stale = fs.existsSync(cachePath) && (Date.now() - fs.statSync(cachePath).mtimeMs) > 24 * 3600 * 1000;
       if (stale) uboRefreshTimer = setTimeout(refresh, 30000);
       uboRefreshTimer = setInterval(refresh, 24 * 3600 * 1000);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Black] uBO engine failed to start, C++ engine remains active:', e.message);
      }
    }
  }
  // Defer the uBO bootstrap a few seconds so the window paints instantly;
  // the C++ engine covers requests until uBO is ready.
  setTimeout(startUboEngine, 3000);

  // Honor persisted shields preference (settings.json → shields: false)
  try {
    const sf = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(sf)) {
      const s = JSON.parse(fs.readFileSync(sf, 'utf8'));
      if (s.shields === false) shieldsEnabled = false;
    }
  } catch (e) {}

  ipcMain.handle('shields-status', () => ({
    engine: uboReady ? 'ubo' : 'fallback',
    rules: uboRulesCount,
    cosmetic: uboCosmeticCount,
    checks: shieldsChecks,
    blocks: shieldsBlocks,
    enabled: shieldsEnabled
  }));

  ipcMain.handle('shields-set', (_e, enabled) => {
    shieldsEnabled = !!enabled;
    const sf = path.join(app.getPath('userData'), 'settings.json');
    try {
      const existing = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
      existing.shields = shieldsEnabled;
      debouncedWrite('settings', sf, existing);
    } catch (e) {}
    return shieldsEnabled;
  });
  // ─────────────────────────────────────────────────────────────────────────
  // Single consolidated webRequest listener (advisor + adblock + HTTPS upgrade).
  // Electron's webRequest API honors only one listener per event, so all
  // filtering lives here.

  // Known ad/telemetry hosts (suffix match) + YouTube ad endpoint substrings.
  // Base list = proven ytube/mtube client set (doubleclick, googlesyndication,
  // googleadservices, 2mdn.net, moatads, etc.) extended with more trackers.
  const blockedAdHosts = [
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
    '2mdn.net', 'googletagservices.com', 'googletagmanager.com',
    'google-analytics.com', 'adservice.google.com', 'adservice.google.co.in',
    'taboola.com', 'outbrain.com', 'scorecardresearch.com', 'criteo.com',
    'criteo.net', 'amazon-adsystem.com', 'adnxs.com', 'adsrvr.org',
    'adserver.yahoo.com', 'advertising.com', 'adzerk.net',
    'adsafeprotected.com', 'moatads.com', 'sharethrough.com',
    'indexww.com', 'pubmatic.com', 'openx.net', 'rubiconproject.com',
    'appnexus.com', 'casalemedia.com', 'contextweb.com', 'onetag.com',
    'ads.linkedin.com', 'ads.facebook.com', 'ads.yahoo.com',
    'analytics.yahoo.com', 'ads.youtube.com', 'xiti.com', 'at.atwola.com',
    'adserver.adtechus.com', 'adserver.adtech.de',
    'hotjar.com', 'mixpanel.com', 'bat.bing.com', 'demdex.net',
    'bluekai.com', 'connect.facebook.net', 'an.facebook.com'
  ];
  const blockedAdPathSubstrs = [
    '/pagead/', '/pagead2/', '/pubads.g.doubleclick.net/',
    '/api/stats/ads', '/ptracking', '/get_midroll_info',
    '/youtubei/v1/AdTrailer'
  ];

  function siteForRequest(details) {
    try {
      if (details.webContentsId) {
        const wc = webContents.fromId(details.webContentsId);
        if (wc && !wc.isDestroyed()) {
          const host = new URL(wc.getURL()).hostname.toLowerCase();
          if (host) return host;
        }
      }
    } catch (e) {}
    try {
      const ref = new URL(details.referrer).hostname.toLowerCase();
      if (ref) return ref;
    } catch (e) {}
    return '';
  }

  function passOrUpgrade(details, callback) {
    // HTTPS everywhere: auto-upgrade plain http to https
    if (details.url.startsWith('http://')) {
      try {
        const url = new URL(details.url);
        if (!url.port && !url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
          url.protocol = 'https:';
          callback({ redirectURL: url.toString() });
          return;
        }
      } catch (e) {}
    }
    callback({ cancel: false });
  }

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    (details, callback) => {
      // Any exception here would destabilize the session — always degrade to
      // "let it through" rather than break the page.
      try {
      // ── Stuck-player signal: a page whose video won't start asks to pause
      // blocking for 5s so the blocked ad pipeline can complete (YouTube
      // holds playback while a blocked preroll request hangs). One-shot per
      // stuck video, scheduled by the page's checkPlayback loop.
      // Authenticated: only honored when the requesting document is a YouTube page.
      if (details.url === 'https://black.shields-off/') {
        let fromYT = false;
        try { fromYT = new URL(details.firstPartyUrl || '').hostname.endsWith('youtube.com'); } catch (e) {}
        if (!fromYT) { passOrUpgrade(details, callback); return; }
        if (shieldsEnabled) {
          shieldsEnabled = false;
          if (process.env.NODE_ENV === 'development') console.log('[Shields] player stuck — blocking paused for 5s');
          setTimeout(() => {
            shieldsEnabled = true;
            if (process.env.NODE_ENV === 'development') console.log('[Shields] blocking resumed');
          }, 5000);
        }
        callback({ cancel: true });
        return;
      }
      // ── Safety advisor: dangerous main-frame navigations → warning page
      if (details.resourceType === 'mainFrame') {
        advisorChecks++;
        if (!advisorBypassed.has(details.url)) {
          const hit = advisorBlockUrl(details.url);
          if (hit) {
            advisorBlocks++;
            if (mainWindow && !mainWindow.isDestroyed()) {
              broadcast('advisor-blocked', { url: details.url, category: hit.category, rule: hit.rule });
            }
            callback({
              redirectURL: 'black-ui://warning?url=' + encodeURIComponent(details.url) +
                           '&cat=' + encodeURIComponent(hit.category) +
                           '&rule=' + encodeURIComponent(hit.rule)
            });
            return;
          }
        }
      }

      // ── Government domains are exempt — portals must never be broken by ad filtering
      if (isGovUrl(details)) { passOrUpgrade(details, callback); return; }

      // ── YouTube streaming CDNs are exempt — video media fragments & manifests must never be blocked
      try {
        const u = new URL(details.url);
        const h = u.hostname.toLowerCase();
        if (h === 'googlevideo.com' || h.endsWith('.googlevideo.com') ||
            h === 'ytimg.com' || h.endsWith('.ytimg.com')) {
          passOrUpgrade(details, callback);
          return;
        }
      } catch (e) {}

      const type = details.resourceType;

      // ── Fast static layer: well-known ad/telemetry hosts + YouTube ad endpoints
      // (gated on shieldsEnabled so the user's toggle and the 5s stuck-player
      // pause genuinely let everything through)
      let host = '';
      try { host = new URL(details.url).hostname.toLowerCase(); } catch (e) {}
      let staticBlocked = false;
      if (shieldsEnabled && host) {
        for (const d of blockedAdHosts) {
          if (host === d || host.endsWith('.' + d)) { staticBlocked = true; break; }
        }
      }
      if (!staticBlocked && shieldsEnabled) {
        const u = details.url.toLowerCase();
        for (const p of blockedAdPathSubstrs) {
          if (u.includes(p)) { staticBlocked = true; break; }
        }
      }
      if (staticBlocked) {
        if (process.env.NODE_ENV === 'development') console.log(`[StaticBlock] ${type} ${details.url.slice(0, 140)}`);
        blockedCount++;
        shieldsBlocks++;
        if (mainWindow && !mainWindow.isDestroyed()) {
          broadcast('blocked-count', blockedCount);
        }
        callback({ cancel: true });
        return;
      }

      // ── Filtering engine layer: uBO engine (network + cosmetics, sync) ──
      const siteHost = siteForRequest(details);
      if (uboReady && uboBlocker && shieldsEnabled) {
        shieldsChecks++;
        uboBlocker.onBeforeRequest(details, (resp) => {
          if (resp && resp.cancel) {
            if (process.env.NODE_ENV === 'development') console.log(`[Block] ${type} ${details.url.slice(0, 140)} (uBO) site=${siteHost}`);
            blockedCount++;
            shieldsBlocks++;
            if (mainWindow && !mainWindow.isDestroyed()) {
          broadcast('blocked-count', blockedCount);
            }
            callback({ cancel: true });
          } else if (resp && resp.redirectURL) {
            callback({ redirectURL: resp.redirectURL });
          } else {
            passOrUpgrade(details, callback);
          }
        });
      } else {
        passOrUpgrade(details, callback);
      }
      } catch (e) {
        if (process.env.NODE_ENV === 'development') console.error('[WebRequest] handler error:', e.message);
        passOrUpgrade(details, callback);
      }
    }
  );

  // Cosmetic (element-hiding) filtering: inject hide rules on page load and
  // again on SPA navigations (YouTube watch→watch swaps content without a
  // dom-ready event, so site-wide hiding rules must be re-applied).
  const applyCosmetics = (wc) => {
    if (wc.isDestroyed()) return;
    const type = wc.getType();
    let host = '';
    try { host = new URL(wc.getURL()).hostname.toLowerCase(); } catch (err) {}
    if (process.env.NODE_ENV === 'development') console.log(`[Cosmetic] type=${type} host=${host}`);
    if (type !== 'webview' && type !== 'window') return;
    if (!host || host === 'localhost' || host === '127.0.0.1' || isGovDomain('https://' + host)) return;
    if (!uboReady || !uboBlocker || !shieldsEnabled) return;
    // uBO cosmetic filtering: element-hiding rules for the site, injected
    // in-process (same rules re-applied on SPA navs are harmless duplicates).
    try {
      const url = wc.getURL();
      const { active, styles } = uboBlocker.getCosmeticsFilters({
        domain: host,
        hostname: host,
        url: url,
        getBaseRules: true,
        getInjectionRules: true,
        getExtendedRules: false,
        getRulesFromHostname: true,
        getRulesFromDOM: false,
        callerContext: { frameId: -1, processId: -1, lifecycle: 'start' }
      });
      if (process.env.NODE_ENV === 'development') console.log(`[Cosmetic] ${host} sels=${styles ? styles.length : 0}`);
      if (active === false || !styles || !styles.length) return;
      if (wc.isDestroyed()) return;
      wc.insertCSS(styles, { cssOrigin: 'user' })
        .then(() => { if (process.env.NODE_ENV === 'development') console.log(`[Cosmetic] injected ${styles.length} rules into ${host}`); })
        .catch((e) => { if (process.env.NODE_ENV === 'development') console.log('[Cosmetic] insertCSS error:', e.message); });
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.log('[Cosmetic] error:', e.message);
    }
  };
  app.on('web-contents-created', (_e, wc) => {
    wc.on('dom-ready', () => applyCosmetics(wc));
    wc.on('did-navigate-in-page', () => applyCosmetics(wc));
  });

  // User-Agent override for YouTube Playables & Google Services compatibility
  const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
  session.defaultSession.setUserAgent(chromeUA);

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

  // ── EXTENSIONS (Chrome Web Store / MV3, loaded via Chromium engine) ───────
  const loadedExtensions = [];

  function extensionLoad(p) {
    // Prefer the modern sessions API, fall back to session.loadExtension
    const { sessions } = require('electron');
    if (sessions && typeof sessions.loadExtension === 'function') {
      return sessions.loadExtension({ path: p, options: { allowFileAccess: true } });
    }
    return session.defaultSession.loadExtension(p);
  }

  function extensionRemove(id) {
    const { sessions } = require('electron');
    if (sessions && typeof sessions.removeExtension === 'function') {
      return sessions.removeExtension(id);
    }
    return session.defaultSession.removeExtension(id);
  }

  function persistExtensions() {
    try {
      const existing = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : {};
      existing.extensionPaths = loadedExtensions.map(x => x.path);
      debouncedWrite('settings-ext', settingsFile, existing);
    } catch (e) {}
  }

  // Restore extensions on startup
  try {
    const cfg = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : {};
    (cfg.extensionPaths || []).forEach(async (p) => {
      try {
        const ext = await extensionLoad(p);
        loadedExtensions.push({ id: ext.id, name: ext.name, path: p, version: ext.version || '' });
        if (process.env.NODE_ENV === 'development') console.log('[Black] Extension loaded:', ext.name);
      } catch (e) {
        console.error('[Black] Failed to load extension:', p, e.message);
      }
    });
  } catch (e) {}

  ipcMain.handle('ext-list', () => loadedExtensions.map(x => ({ id: x.id, name: x.name, path: x.path, version: x.version })));

  ipcMain.handle('ext-load-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow || BrowserWindow.getAllWindows()[0], {
      title: 'Load Unpacked Extension',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('ext-load', async (_e, dir) => {
    if (typeof dir !== 'string') return { ok: false, error: 'Invalid path' };
    try {
      const ext = await extensionLoad(dir);
      if (!loadedExtensions.some(x => x.id === ext.id)) {
        loadedExtensions.push({ id: ext.id, name: ext.name, path: dir, version: ext.version || '' });
        persistExtensions();
      }
      return { ok: true, id: ext.id, name: ext.name, version: ext.version || '' };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('ext-remove', async (_e, id) => {
    try { await extensionRemove(id); } catch (e) {}
    const i = loadedExtensions.findIndex(x => x.id === id);
    if (i > -1) loadedExtensions.splice(i, 1);
    persistExtensions();
    return true;
  });

  // ── Chrome Web Store install: CRX download → header strip → unzip → load ─
  const extRootDir = path.join(app.getPath('userData'), 'extensions');

  function downloadToFile(url, dest, redirectsLeft = 5) {
    return new Promise((resolve, reject) => {
      const lib = url.startsWith('https:') ? https : http;
      const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
        const loc = res.headers.location;
        if (res.statusCode >= 300 && res.statusCode < 400 && loc && redirectsLeft > 0) {
          res.resume();
          return downloadToFile(new URL(loc, url).toString(), dest, redirectsLeft - 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('Download failed (HTTP ' + res.statusCode + ')')); }
        const ws = fs.createWriteStream(dest);
        res.pipe(ws);
        ws.on('finish', () => ws.close(() => resolve()));
        ws.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(60000, () => req.destroy(new Error('Download timed out')));
    });
  }

  // CRX packages wrap a plain ZIP: "Cr24" + version + headerLength + header,
  // then the ZIP archive. The web store's CRX3 may carry a small extra field
  // between the header and the archive, so scan for the ZIP magic instead of
  // trusting an exact offset.
  function crxToZip(crxPath, zipPath) {
    const buf = fs.readFileSync(crxPath);
    if (buf.length < 16 || buf.toString('latin1', 0, 4) !== 'Cr24') throw new Error('Not a valid CRX file');
    const version = buf.readUInt32LE(4);
    const headerSize = buf.readUInt32LE(8);
    if (version !== 2 && version !== 3) throw new Error('Unsupported CRX version: ' + version);
    const from = 8 + headerSize;
    let start = -1;
    for (let i = from; i <= Math.min(buf.length - 4, from + 128); i++) {
      if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x03 && buf[i + 3] === 0x04) { start = i; break; }
    }
    if (start < 0) throw new Error('CRX payload is not a ZIP archive');
    fs.writeFileSync(zipPath, buf.subarray(start));
  }

  function unzipZip(zipPath, destDir) {
    return new Promise((resolve, reject) => {
      execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`
      ], { timeout: 120000, windowsHide: true }, (err) => err ? reject(err) : resolve());
    });
  }

  // Store archives put files at the root; a few unpack one level deep.
  function findManifestDir(root) {
    if (fs.existsSync(path.join(root, 'manifest.json'))) return root;
    try {
      const sub = fs.readdirSync(root).filter((d) => {
        try { return fs.statSync(path.join(root, d)).isDirectory(); } catch (e) { return false; }
      });
      if (sub.length === 1 && fs.existsSync(path.join(root, sub[0], 'manifest.json'))) {
        return path.join(root, sub[0]);
      }
    } catch (e) {}
    return root;
  }

  function extensionIdFromInput(input) {
    const m = String(input || '').match(/([a-p]{32})/i);
    return m ? m[1].toLowerCase() : null;
  }

  ipcMain.handle('ext-install-store', async (_e, storeUrlOrId) => {
    const id = extensionIdFromInput(storeUrlOrId);
    if (!id) return { ok: false, error: 'No valid Chrome Web Store extension ID in that input' };
    const dir = path.join(extRootDir, id);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const crxPath = path.join(dir, 'ext.crx');
      const zipPath = path.join(dir, 'ext.zip');
      const url = 'https://clients2.google.com/service/update2/crx?response=redirect' +
        '&acceptformat=crx2,crx3&prodversion=132.0.0.0&x=id%3D' + id + '%26uc';
      await downloadToFile(url, crxPath);
      crxToZip(crxPath, zipPath);
      await unzipZip(zipPath, dir);
      try { fs.unlinkSync(crxPath); fs.unlinkSync(zipPath); } catch (e) {}
      const extDir = findManifestDir(dir);
      const ext = await extensionLoad(extDir);
      if (!loadedExtensions.some(x => x.id === ext.id)) {
        loadedExtensions.push({ id: ext.id, name: ext.name, path: extDir, version: ext.version || '' });
        persistExtensions();
      }
      if (process.env.NODE_ENV === 'development') console.log('[Black] Store extension installed:', ext.name, ext.id);
      return { ok: true, id: ext.id, name: ext.name, version: ext.version || '' };
    } catch (err) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
      return { ok: false, error: err.message || String(err) };
    }
  });

  // ── WEB CAPTURE & PRINT TO PDF (active webview by webContents id) ─────────
  ipcMain.handle('web-screenshot', async (_e, wcId) => {
    const wc = webContents.fromId(wcId);
    if (!wc) return { ok: false, error: 'No active page' };
    try {
      const img = await wc.capturePage();
      const png = img.toPNG();
      const result = await dialog.showSaveDialog(mainWindow || BrowserWindow.getAllWindows()[0], {
        title: 'Save Web Capture',
        defaultPath: `web-capture-${Date.now()}.png`,
        filters: [{ name: 'PNG Image', extensions: ['png'] }]
      });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(result.filePath, png);
      return { ok: true, filePath: result.filePath };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('print-pdf', async (_e, wcId) => {
    const wc = webContents.fromId(wcId);
    if (!wc) return { ok: false, error: 'No active page' };
    try {
      const data = await wc.printToPDF({});
      const result = await dialog.showSaveDialog(mainWindow || BrowserWindow.getAllWindows()[0], {
        title: 'Save as PDF',
        defaultPath: `page-${Date.now()}.pdf`,
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
      });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(result.filePath, data);
      return { ok: true, filePath: result.filePath };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  // ── READING LIST (Edge-style "read later") ───────────────────────────────
  const readingFile = path.join(userDataPath, 'reading.json');

  ipcMain.handle('load-reading', () => {
    try {
      if (fs.existsSync(readingFile)) return JSON.parse(fs.readFileSync(readingFile, 'utf8'));
    } catch (e) {}
    return [];
  });

  ipcMain.handle('save-reading', (_e, data) => {
    try { debouncedWrite('reading', readingFile, data); } catch (e) {}
    return true;
  });

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
      debouncedWrite('usage', usageFile, data);
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
      debouncedWrite('bookmarks', bookmarksFile, data);
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
      debouncedWrite('history', historyFile, data);
    } catch (e) {
      console.error('Failed to save history:', e);
    }
  });

  const sessionFile = path.join(userDataPath, 'session.json');

  ipcMain.handle('save-session', (_e, data) => {
    try {
      debouncedWrite('session', sessionFile, data);
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

  mainWindow = createWindow();
  pendingUrl = urlFromArgv(process.argv);

  // Broadcast an event to every open window (not just the first one).
  function broadcast(event, data) {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(event, data);
    }
  }

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

  // HTTPS everywhere (auto-upgrade http→https) — inside consolidated listener below

  // Anti-fingerprinting + selective permission handler
  // Government portals (GST, e-filing, DigiLocker, EPFO...) need geolocation,
  // notifications & media to work — those are allowed on official gov domains.
  const isGovDomain = (u) => {
    try {
      const h = new URL(u).hostname.toLowerCase();
      return /\.gov\.in$|\.gov$|\.nic\.in$|\.ac\.in$|\.gov\.(uk|au|nz|sg|ca|za|my|hk|bd|lk|np|id|th|ph)$/.test(h);
    } catch (_) { return false; }
  };
  // Ad-filter exemption for gov portals: exempt when the request URL or the
  // tab's top-level page belongs to an official government domain.
  const isGovUrl = (details) => {
    try {
      if (isGovDomain(details.url || '')) return true;
      if (details.webContentsId) {
        const wc = webContents.fromId(details.webContentsId);
        if (wc && !wc.isDestroyed() && isGovDomain(wc.getURL() || '')) return true;
      }
    } catch (_) {}
    return false;
  };
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    const url = wc.getURL();
    // Allow geolocation for black-ui newtab weather widget
    if (permission === 'geolocation' && url.startsWith('black-ui://')) {
      callback(true);
      return;
    }
    if (isGovDomain(url) && ['geolocation', 'notifications', 'media', 'clipboard-read'].includes(permission)) {
      callback(true);
      return;
    }
    const blocked = ['media', 'geolocation', 'notifications', 'midi', 'keyboardLock', 'pointerLock'];
    callback(!blocked.includes(permission));
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
      // Preserve extension registry — the renderer settings payload doesn't own it
      try {
        const sf = path.join(app.getPath('userData'), 'settings.json');
        if (fs.existsSync(sf)) {
          const existing = JSON.parse(fs.readFileSync(sf, 'utf8'));
          if (existing.extensionPaths && !data.extensionPaths) data.extensionPaths = existing.extensionPaths;
        }
      } catch (e) {}
      debouncedWrite('settings', path.join(app.getPath('userData'), 'settings.json'), data);
      darkModeEnabled = data.forceDarkMode !== false;
      return true;
    } catch (e) { return false; }
  });

  // Inject fingerprint + YT adblock + dark mode into all webviews
  app.on('web-contents-created', (event, wc) => {
    wc.on('did-finish-load', () => {
      try {
      const url = wc.getURL();

      // Anti-fingerprinting (every page)
      wc.executeJavaScript(fs.readFileSync(path.join(__dirname, 'fingerprint.js'), 'utf8'), true).catch(() => {});

      // Force dark mode using Chrome's built-in engine (preserves images, videos, layouts)
      if (url.startsWith('http') && darkModeEnabled) {
        try {
          if (!wc.debugger.isAttached()) wc.debugger.attach();
          wc.debugger.sendCommand('Emulation.setAutoDarkModeOverride', { enabled: true }).catch(() => {});
        } catch (e) {
          // Debugger already attached or unavailable — dark mode skipped
        }
      }

      // YouTube ad stripping — 3 layers (network rules above + this DOM/API layer,
      // ported from the proven ytube/mtube WebView2 clients). NOTE: no window.fetch
      // override — re-wrapping youtubei responses with the original compressed
      // headers breaks the player response (decompression mismatch → video won't play).
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        wc.executeJavaScript(`
          (function() {
            try {
              var adKeys = [
                'adPlacements','adSlots','playerAds','adBreak','adBreakHeartbeatParams',
                'promotedSparklesWebRenderer','promotedVideoRenderer',
                'compactPromotedVideoRenderer','compactPromotedItemRenderer',
                'backgroundPromoRenderer','statementBannerRenderer',
                'brandVideoShelfRenderer','inlineAdLayoutRenderer','adSlotRenderer',
                'adBreakParams','playerAdParams','adTagUrl','adTagUrls',
                'companionAd','instreamVideoAd','overlayAd','promotedUrl',
                'searchPyvRenderer','actionCompanionAdRenderer','displayAdRenderer',
                'videoMastheadAdRenderer','mastheadAdRenderer','mastheadAd',
                'midrolls','prerolls','postrolls',
                'adIsActive','adIsPlaying','adIsPaused','adIsSkippable',
                'adType','adMode','adFormat','adSource','adNetwork',
                'cumulativeAds','adCount','totalAds','remainingAds',
                'masthead','sparkles','promoted','promo','promotion',
                'mealbar','legalBanner','enforcementMessage',
                'bannerPromo','displayAd','actionCompanion','inFeedAd'
              ];

              // API payload stripping — proven key set from the ytube/mtube
              // clients (no depth cap, same as shipped). Runs on the embedded
              // player response and all JSON.parse'd payloads; innertube
              // fetch().json() responses are unaffected.
              function stripAdKeys(obj) {
                if (!obj || typeof obj !== 'object') return obj;
                try {
                  var keys = Object.keys(obj);
                  for (var i = 0; i < keys.length; i++) {
                    var k = keys[i];
                    if (adKeys.indexOf(k) !== -1) { delete obj[k]; }
                    else if (obj[k] && typeof obj[k] === 'object') { stripAdKeys(obj[k]); }
                  }
                } catch(e) {}
                return obj;
              }

              var _origParse = JSON.parse;
              JSON.parse = function() {
                try { return stripAdKeys(_origParse.apply(this, arguments)); }
                catch(e) { return _origParse.apply(this, arguments); }
              };

              // Brave-style layer: hook window.fetch so youtubei/v1/player
              // responses are ad-stripped BEFORE the player parses them
              // (Response.json() bypasses the patched JSON.parse). The rebuilt
              // Response must NOT keep content-encoding/content-length —
              // clone().text() decompresses the body, and re-claiming the
              // original compressed headers corrupts the player response.
              var _origFetch = window.fetch;
              if (typeof _origFetch === 'function') {
                window.fetch = function() {
                  var args = arguments;
                  var url = '';
                  try { url = typeof args[0] === 'string' ? args[0] : (args[0].url || ''); } catch(e) {}
                  var p = _origFetch.apply(this, args);
                  if (url.indexOf('youtubei/v1/player') === -1) return p;
                  return p.then(function(res) {
                    try {
                      var ct = (res.headers.get('content-type') || '');
                      if (ct.indexOf('json') === -1) return res;
                      return res.clone().text().then(function(text) {
                        try {
                          var obj = JSON.parse(text);
                          var cleaned = JSON.stringify(obj);
                          if (cleaned !== text) {
                            var h = new Headers();
                            res.headers.forEach(function(v, k) {
                              var lk = String(k).toLowerCase();
                              if (lk !== 'content-encoding' && lk !== 'content-length') h.append(k, v);
                            });
                            return new Response(cleaned, { status: res.status, statusText: res.statusText, headers: h });
                          }
                        } catch(e) {}
                        return res;
                      });
                    } catch(e) { return res; }
                  });
                };
              }

              var style = document.createElement('style');
              try {
                style.textContent = [
                  'ytd-ad-slot-renderer,ytd-in-feed-ad-layout-renderer,',
                  'ytd-banner-promo-renderer,ytd-statement-banner-renderer,',
                  'ytd-display-ad-renderer,.ytp-ad-module,.ytp-ad-player-overlay,',
                  '.ytp-ad-image-overlay,.ytp-ad-text-overlay,.ytp-ce-element,',
                  '.ytp-suggested-action,#masthead-ad,#player-ads,',
                  'ytd-promoted-sparkles-web-renderer,ytd-companion-ad-renderer,',
                  'ytd-enforcement-message-view-model,tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)',
                  '{display:none!important}'
                ].join('');
                document.head.appendChild(style);
              } catch(e) { console.log('[Black] YT ad CSS:', e.message); }

              var fastForwarding = false;
              function checkAds() {
                try {
                  var video = document.querySelector('video');
                  if (video) {
                    // Ad present when the player marks ad-showing OR the ad
                    // overlay exists at all (visibility-independent — YT hides
                    // it during ad load, so visibility checks let prerolls
                    // play out and destabilize the player).
                    var overlay = document.querySelector('.ytp-ad-player-overlay');
                    var ad = document.querySelector('.ad-showing') || overlay;
                    if (ad) {
                      // Only fast-forward while the video is genuinely playing;
                      // a stalled/loading player must not be stuck at 16x.
                      if (video.readyState >= 2 && !video.paused) {
                        fastForwarding = true;
                        video.muted = true;
                        video.playbackRate = 16.0;
                      }
                      var skip = document.querySelector('.ytp-ad-skip-button') ||
                                 document.querySelector('.ytp-ad-skip-button-modern');
                      if (skip) skip.click();
                    } else if (fastForwarding) {
                      // YouTube resets playbackRate to 1 on buffering/seek, so
                      // keying the restore off rate===16 leaks a permanent mute.
                      fastForwarding = false;
                      video.playbackRate = 1.0;
                      video.muted = false;
                    }
                  }
                  var popup = document.querySelector('ytd-enforcement-message-view-model');
                  if (popup) {
                    var btn = popup.querySelector('button') || document.querySelector('.yt-spec-button-shape-next');
                    if (btn) btn.click();
                    popup.remove();
                  }
                  } catch(e) {}
                  setTimeout(checkAds, 1500);
              }
              checkAds();

              // Stuck-player bail-out: if a video hasn't started within 2s of
              // being selected (playability OK, readyState 0, paused, no error —
              // YouTube usually waits on a blocked preroll request here), ask
              // the main process to pause blocking for 5s so the pipeline can
              // complete and the video can start. One-shot per video; only
              // fires while the window is visible (hidden windows never
              // autoplay by design).
              var stuckSent = false;
              var stuckVid = '';
              var stuckSince = 0;
              function checkPlayback() {
                try {
                  var m = location.search.match(/[?&]v=([^&]+)/);
                  var vid = m ? m[1] : '';
                  if (vid && vid !== stuckVid) { stuckVid = vid; stuckSent = false; stuckSince = Date.now(); }
                  var pr = window.ytInitialPlayerResponse;
                  var ok = pr && pr.playabilityStatus && pr.playabilityStatus.status === 'OK';
                  if (!ok) { setTimeout(checkPlayback, 2000); return; }
                  var v = document.querySelector('video');
                  var stuck = v && document.visibilityState === 'visible' &&
                              v.readyState === 0 && v.paused && !v.error;
                  if (!stuckSent && stuck && Date.now() - stuckSince >= 2000) {
                    stuckSent = true;
                    try { fetch('https://black.shields-off/', { mode: 'no-cors' }).catch(function() {}); } catch(e) {}
                  }
                } catch(e) {}
                setTimeout(checkPlayback, 1000);
              }
              setTimeout(checkPlayback, 500);

              try {
                new MutationObserver(function() {
                  try {
                    var els = document.querySelectorAll(
                      'ytd-ad-slot-renderer,.ytp-ad-module,ytd-promoted-sparkles-web-renderer,ytd-enforcement-message-view-model');
                    for (var i = 0; i < els.length; i++) els[i].style.display = 'none';
                  } catch(e) {}
                }).observe(document.documentElement, {childList:true, subtree:true});
              } catch(e) {}

              var sponsorCache = {};
              function skipSponsors(videoId) {
                if (!videoId || sponsorCache[videoId]) return;
                sponsorCache[videoId] = true;
                try {
                  var xhr = new XMLHttpRequest();
                  xhr.open('GET',
                    'https://sponsor.ajay.app/api/skipSegments?videoID=' + videoId +
                    '&categories[]=sponsor&categories[]=selfpromo&categories[]=intro&categories[]=outro');
                  xhr.onload = function() {
                    try {
                      var segs = _origParse(xhr.responseText);
                      if (!segs || !segs.length) return;
                      sponsorCache[videoId] = segs;
                      var video = document.querySelector('video');
                      if (!video) return;
                      video.addEventListener('timeupdate', function() {
                        for (var i = 0; i < segs.length; i++) {
                          var s = segs[i];
                          if (s.segment && s.segment.length === 2 &&
                              video.currentTime >= s.segment[0] &&
                              video.currentTime < s.segment[1]) {
                            video.currentTime = s.segment[1];
                          }
                        }
                      });
                    } catch(e) {}
                  };
                  xhr.send();
                } catch(e) {}
              }

              function detectVideoId() {
                try {
                  var m = window.location.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
                  if (m) skipSponsors(m[1]);
                } catch(e) {}
              }
              var _origPush = history.pushState;
              history.pushState = function() { _origPush.apply(this, arguments); setTimeout(detectVideoId, 1500); };
              window.addEventListener('popstate', function() { setTimeout(detectVideoId, 1500); });
              setTimeout(detectVideoId, 3000);
            } catch(e) { console.log('[Black] YT adblock:', e.message); }
          })();
          true;
        `, true).catch(() => {});
      }
      } catch (e) {
        if (process.env.NODE_ENV === 'development') console.error('[Black] did-finish-load:', e.message);
      }
    });
  });

  // ── POPUP HANDLER: target=_blank / window.open → open in a new tab ───────
  // Webviews carry allowpopups so window.open works, but without a handler the
  // URL would open in a tiny default Electron popup window. Intercept every
  // popup and route it back to the host window's tab strip instead.
  app.on('web-contents-created', (_ev, wc) => {
    if (wc.getType() === 'webview') {
      wc.setWindowOpenHandler(({ url }) => {
        try {
          if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
            const win = BrowserWindow.fromWebContents(wc);
            if (win && !win.isDestroyed()) {
              win.webContents.send('open-in-tab', url);
            }
          }
        } catch (e) {}
        return { action: 'deny' };
      });
    }
  });
  // ─────────────────────────────────────────────────────────────────────────

  // ── Crash recovery & memory guard (multi-tab stability) ─────────────────
  // Backoff: max 3 reloads in 60s per window to avoid reload loops.
  const crashReloads = new Map();
  app.on('web-contents-created', (_ev, wc) => {
    if (wc.getType() !== 'window') return;
    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit' || details.reason === 'launch-failed') return;
      const count = (crashReloads.get(wc.id) || 0) + 1;
      crashReloads.set(wc.id, count);
      if (count > 3) {
        if (process.env.NODE_ENV === 'development') console.log('[Black] Crash loop aborted for window', wc.id);
        return;
      }
      const delay = Math.min(count * 2000, 10000);
      setTimeout(() => {
        try {
          if (!wc.isDestroyed() && !wc.isLoading()) wc.reload();
        } catch (_) {}
      }, delay);
    });
  });

  // Memory pressure watch: when the app crosses a high-water mark, ask every
  // window to sleep its least-recently-used background tab.
  let memoryGuardLast = 0;
  setInterval(() => {
    try {
      const mb = Math.round(process.memoryInfo().total / 1048576);
      if (mb > 3500 && Date.now() - memoryGuardLast > 20000) {
        memoryGuardLast = Date.now();
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed()) w.webContents.send('memory-pressure', mb);
        }
      }
    } catch (_) {}
  }, 15000);

  session.defaultSession.on('will-download', (event, item, webContents) => {
    const filePath = dialog.showSaveDialogSync(mainWindow || BrowserWindow.getAllWindows()[0], {
      defaultPath: item.getFilename(),
      filters: [{ name: 'All Files', extensions: ['*'] }]
    });

    if (!filePath) {
      item.cancel();
      return;
    }

    item.setSavePath(filePath);

    if (mainWindow) {
      broadcast('download-start', {
        filename: path.basename(filePath),
        totalBytes: item.getTotalBytes()
      });
    }

    item.on('updated', (event, state) => {
      if (state === 'progressing') {
        const progress = (item.getReceivedBytes() / item.getTotalBytes()) * 100;
        if (mainWindow) {
          broadcast('download-progress', {
            filename: path.basename(filePath),
            progress: progress.toFixed(1)
          });
        }
      }
    });

    item.once('done', (event, state) => {
      if (mainWindow) {
        broadcast('download-done', {
          filename: path.basename(filePath),
          state: state
        });
      }
    });
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
  mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin' && !tray) app.quit();
});
