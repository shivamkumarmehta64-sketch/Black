const { app, BrowserWindow, session, ipcMain, dialog, protocol, Tray, Menu, nativeImage, webContents, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const startTime = Date.now();
let mainWindow;
let blockedCount = 0;
let windowCascadeCount = 0;
let pendingUrl = null;

// Extract a web URL from a command line (Windows passes "Black.exe <url>"
// when Black is chosen as the browser / default protocol handler).
function urlFromArgv(argv = []) {
  for (const a of argv) {
    if (typeof a === 'string' && (a.startsWith('http://') || a.startsWith('https://'))) return a;
  }
  return null;
}

// ── WEBVIEW MEMORY: GC on window blur & IPC collector ────────────────────────
app.on('browser-window-blur', () => {
  if (typeof global.gc === 'function') {
    try { global.gc(); } catch (_) {}
  }
});

ipcMain.handle('gc-collect', () => {
  if (typeof global.gc === 'function') {
    try { global.gc(); return true; } catch (_) {}
  }
  return false;
});
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

app.on('before-quit', flushDebouncedWrites);
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
    const res = await fetch(base + '/chat/completions', {
      method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal
    });
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

// Windows-style toast notifications from Great Sage (must be set before whenReady)
if (process.platform === 'win32') app.setAppUserModelId('com.black.browser');

// Register black-ui custom protocol scheme as privileged (must be before app.whenReady)
protocol.registerSchemesAsPrivileged([
  { scheme: 'black-ui', privileges: { standard: true, secure: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true } }
]);

// ── GPU & Rendering Performance Flags ──────────────────────────────────────
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512 --expose-gc');
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
        try { mainWindow.webContents.send('open-in-tab', url); } catch (e) {}
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
    if (!urlPath || urlPath === 'newtab' || urlPath === 'newtab/' || urlPath === 'newtab.html') {
      callback({ path: path.join(__dirname, 'newtab.html') });
    } else if (urlPath === 'warning' || urlPath === 'warning.html') {
      callback({ path: path.join(__dirname, 'warning.html') });
    } else {
      callback({ path: path.join(__dirname, urlPath) });
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
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      if (details.resourceType !== 'mainFrame') { callback({}); return; }
      advisorChecks++;
      if (advisorBypassed.has(details.url)) { callback({}); return; }
      const hit = advisorBlockUrl(details.url);
      if (hit) {
        advisorBlocks++;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('advisor-blocked', { url: details.url, category: hit.category, rule: hit.rule });
        }
        callback({
          redirectURL: 'black-ui://warning?url=' + encodeURIComponent(details.url) +
                       '&cat=' + encodeURIComponent(hit.category) +
                       '&rule=' + encodeURIComponent(hit.rule)
        });
        return;
      }
      callback({});
    }
  );

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

  // ── NATIVE SHIELDS ENGINE (Brave-style ad/tracker blocking, C++) ─────────
  const { spawn } = require('child_process');
  const readline = require('readline');

  let shieldsProc = null;
  let shieldsReady = false;
  let shieldsEnabled = true;
  let shieldsRulesCount = 0;
  let shieldsChecks = 0;
  let shieldsBlocks = 0;
  const shieldsPending = [];

  function shieldsExePath() {
    const prod = path.join(process.resourcesPath, 'native_engine', 'black_shields.exe');
    const dev = path.join(__dirname, 'native_engine', 'black_shields.exe');
    if (fs.existsSync(prod)) return prod;
    return dev;
  }

  function startShieldsEngine() {
    if (process.platform !== 'win32') return;
    const exe = shieldsExePath();
    if (!fs.existsSync(exe)) {
      console.error('[Black] Native shields engine not found:', exe);
      return;
    }
    try {
      shieldsProc = spawn(exe, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      console.error('[Black] Failed to spawn shields engine:', e.message);
      return;
    }
    readline.createInterface({ input: shieldsProc.stdout }).on('line', (line) => {
      if (line.startsWith('STATS\t')) {
        const parts = line.split('\t');
        shieldsRulesCount = parseInt(parts[1], 10) || 0;
        return;
      }
      if (line === 'PONG') { shieldsReady = true; return; }
      const resolver = shieldsPending.shift();
      if (!resolver) return;
      if (line.startsWith('BLOCK\t')) {
        shieldsBlocks++;
        const parts = line.split('\t');
        resolver({ blocked: true, category: parts[1] || 'advertising', rule: parts[2] || '' });
      } else {
        resolver({ blocked: false });
      }
    });
    shieldsProc.stderr.on('data', (d) => {
      if (process.env.NODE_ENV === 'development') console.error('[Shields]', String(d).trim());
    });
    shieldsProc.on('error', () => { shieldsReady = false; });
    shieldsProc.on('exit', () => { shieldsReady = false; });
    shieldsProc.stdin.write('PING\n');
    shieldsProc.stdin.write('STATS\n');
    if (process.env.NODE_ENV === 'development') console.log('[Black] Native shields engine started (C++)');
  }

  function shieldsCheck(url, type) {
    return new Promise((resolve) => {
      if (!shieldsReady || !shieldsEnabled || !shieldsProc) return resolve({ blocked: false });
      shieldsChecks++;
      shieldsPending.push(resolve);
      shieldsProc.stdin.write(`CHECK\t${type}\t${url}\n`);
      setTimeout(() => {
        const idx = shieldsPending.indexOf(resolve);
        if (idx > -1) { shieldsPending.splice(idx, 1); resolve({ blocked: false }); }
      }, 200);
    });
  }

  function shieldsResourceType(t) {
    if (t === 'script') return 'script';
    if (t === 'stylesheet') return 'stylesheet';
    if (t === 'image') return 'image';
    if (t === 'font') return 'font';
    if (t === 'media') return 'media';
    if (t === 'xhr') return 'xmlhttprequest';
    return 'other';
  }

  startShieldsEngine();

  // Honor persisted shields preference (settings.json → shields: false)
  try {
    const sf = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(sf)) {
      const s = JSON.parse(fs.readFileSync(sf, 'utf8'));
      if (s.shields === false) shieldsEnabled = false;
    }
  } catch (e) {}

  app.on('will-quit', () => {
    if (shieldsProc) {
      try { shieldsProc.stdin.write('EXIT\n'); } catch (e) {}
      setTimeout(() => { try { shieldsProc.kill(); } catch (e) {} }, 50);
      shieldsReady = false;
    }
  });

  ipcMain.handle('shields-status', () => ({
    engine: shieldsReady ? 'native' : 'fallback',
    rules: shieldsRulesCount,
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
      '*://*.googlesyndication.com/*',
      '*://*.xiti.com/*',
      '*://*.at.atwola.com/*',
      '*://*.adserver.adtechus.com/*',
      '*://*.adserver.adtech.de/*',
      '*://*.ad.doubleclick.net/*',
      '*://*.adclick.g.doubleclick.net/*'
    ] },
    (details, callback) => {
      // Government domains are exempt — portals must never be broken by ad filtering
      if (isGovUrl(details)) { callback({ cancel: false }); return; }
      blockedCount++;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('blocked-count', blockedCount);
      }
      callback({ cancel: true });
    }
  );

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

  mainWindow = createWindow();
  pendingUrl = urlFromArgv(process.argv);

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
                'bannerPromo','displayAd','actionCompanion','inFeedAd',
                'adBreakBegin','adBreakEnd','adBreakLength',
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

              function checkAds() {
                try {
                  var video = document.querySelector('video');
                  if (video) {
                    var ad = document.querySelector('.ad-showing') ||
                             document.querySelector('.ytp-ad-player-overlay');
                    if (ad) {
                      video.muted = true;
                      video.playbackRate = 16.0;
                      var skip = document.querySelector('.ytp-ad-skip-button') ||
                                 document.querySelector('.ytp-ad-skip-button-modern');
                      if (skip) skip.click();
                    } else if (video.playbackRate === 16.0) {
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
                setTimeout(checkAds, 500);
              }
              checkAds();

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
  // If the browser UI itself crashes, bring it back with a reload (session is
  // persisted, tabs are restored from session.json).
  app.on('web-contents-created', (_ev, wc) => {
    if (wc.getType() !== 'window') return;
    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit' || details.reason === 'launch-failed') return;
      setTimeout(() => {
        try {
          if (!wc.isDestroyed() && !wc.isLoading()) wc.reload();
        } catch (_) {}
      }, 1500);
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
    if (BrowserWindow.getAllWindows().length === 0) {
  mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin' && !tray) app.quit();
});
