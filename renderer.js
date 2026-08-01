const tabsContainer = document.getElementById('tabs-container');
const browserContainer = document.getElementById('browser-container');
const newTabBtn = document.getElementById('new-tab-btn');
const urlInput = document.getElementById('url-input');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const loadingBar = document.getElementById('loading-bar');
const shieldBtn = document.getElementById('shield-btn');
const shieldBadge = document.getElementById('shield-badge');
const lockIcon = document.getElementById('lock-icon');
const omniboxRune = document.getElementById('omnibox-rune');
const starBtn = document.getElementById('star-btn');
const menuBtn = document.getElementById('menu-btn');
const menuDropdown = document.getElementById('menu-dropdown');
const readerBtn = document.getElementById('reader-btn');
const readerPanel = document.getElementById('reader-panel');
const enterReaderBtn = document.getElementById('enter-reader-btn');
const scriptToggle = document.getElementById('script-toggle');

const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-input');
const findCount = document.getElementById('find-count');
const findPrev = document.getElementById('find-prev');
const findNext = document.getElementById('find-next');
const findClose = document.getElementById('find-close');

const urlSuggestions = document.getElementById('url-suggestions');
const privacyPanel = document.getElementById('privacy-panel');
const statBlocked = document.getElementById('stat-blocked');

const downloadsMenu = document.getElementById('downloads-menu');
const downloadsList = document.getElementById('downloads-list');
const downloadsBtn = document.getElementById('downloads-btn') || document.querySelector('[data-action="downloads"]');
const bookmarksMenu = document.getElementById('bookmarks-menu');
const bookmarksList = document.getElementById('bookmarks-list');
const bookmarksBtn = document.getElementById('bookmarks-btn') || document.querySelector('[data-action="bookmarks"]');
const historyMenu = document.getElementById('history-menu');
const historyList = document.getElementById('history-list');
const historyBtn = document.getElementById('history-btn') || document.querySelector('[data-action="history"]');

let tabs = [];
let activeTabId = null;
let tabCounter = 0;
let findRequestId = null;
let blockedCount = 0;
let searchEngine = 'Google';
let lastClosedTab = null;

const FREE_RESOURCES = {
  '🎬 Streaming & Movies': [
    { url: 'https://fmhy.net', title: 'FMHY — Free Media Hub', desc: 'The biggest free media collection' },
    { url: 'https://tbcpl.lol', title: 'TBCP — Big Compilation', desc: 'Massive free link directory' },
    { url: 'https://tubitv.com', title: 'Tubi — Free Movies & TV', desc: 'Legal free streaming with ads' },
    { url: 'https://pluto.tv', title: 'Pluto TV — Live & On-Demand', desc: 'Hundreds of free channels' },
    { url: 'https://www.crackle.com', title: 'Crackle — Free Movies', desc: 'Sony-owned free streaming' },
    { url: 'https://popcornflix.com', title: 'Popcornflix', desc: 'Free movies, no signup' }
  ],
  '🎵 Music & Audio': [
    { url: 'https://fmhy.net/videopiracyguide', title: 'FMHY Music Section', desc: 'Curated free music links' },
    { url: 'https://freemusicarchive.org', title: 'Free Music Archive', desc: 'Royalty-free music library' },
    { url: 'https://soundcloud.com', title: 'SoundCloud', desc: 'Free indie music platform' },
    { url: 'https://bandcamp.com', title: 'Bandcamp', desc: 'Support artists, free streams' },
    { url: 'https://www.jamendo.com', title: 'Jamendo', desc: 'Free music for everyone' },
    { url: 'https://music.youtube.com', title: 'YouTube Music Free', desc: 'Free tier with ads' }
  ],
  '💻 Software & Apps': [
    { url: 'https://fmhy.net/adblockvpnguide', title: 'FMHY Adblock & VPN', desc: 'Privacy tools collection' },
    { url: 'https://alternativeto.net', title: 'AlternativeTo', desc: 'Find free alternatives to paid apps' },
    { url: 'https://portableapps.com', title: 'PortableApps', desc: 'Portable free software suite' },
    { url: 'https://ninite.com', title: 'Ninite — Bulk Installer', desc: 'Install multiple free apps at once' },
    { url: 'https://sourceforge.net', title: 'SourceForge', desc: 'Open-source software hub' },
    { url: 'https://filepuma.com', title: 'FilePuma — Free Software', desc: 'Freeware & driver updates' }
  ],
  '📚 Books & Learning': [
    { url: 'https://fmhy.net/readingpiracyguide', title: 'FMHY Reading Section', desc: 'Free books & articles' },
    { url: 'https://openlibrary.org', title: 'Open Library', desc: 'Free ebook lending library' },
    { url: 'https://www.gutenberg.org', title: 'Project Gutenberg', desc: '70k+ free classic ebooks' },
    { url: 'https://standardebooks.org', title: 'Standard Ebooks', desc: 'Beautiful free ebooks' },
    { url: 'https://www.khanacademy.org', title: 'Khan Academy', desc: 'Free world-class education' },
    { url: 'https://ocw.mit.edu', title: 'MIT OpenCourseWare', desc: 'Free MIT course materials' }
  ],
  '🎮 Games': [
    { url: 'https://fmhy.net/gamingpiracyguide', title: 'FMHY Gaming Section', desc: 'Free games & resources' },
    { url: 'https://store.steampowered.com', title: 'Steam — Free Games', desc: 'Hundreds of free-to-play titles' },
    { url: 'https://itch.io', title: 'itch.io — Indie Games', desc: 'Thousands of free indie games' },
    { url: 'https://www.gog.com', title: 'GOG — Free Games', desc: 'DRM-free, many free titles' },
    { url: 'https://store.epicgames.com', title: 'Epic Games Store', desc: 'Free games every week' },
    { url: 'https://gamejolt.com', title: 'Game Jolt', desc: 'Free indie game platform' }
  ],
  '🔒 Privacy & VPN': [
    { url: 'https://fmhy.net/adblockvpnguide', title: 'FMHY Adblock/VPN', desc: 'Best privacy tool list' },
    { url: 'https://protonvpn.com', title: 'Proton VPN (Free)', desc: 'Unlimited free tier, no logs' },
    { url: 'https://windscribe.com', title: 'Windscribe (Free)', desc: '10GB/month free VPN' },
    { url: 'https://1.1.1.1', title: 'Cloudflare WARP', desc: 'Free VPN/proxy by Cloudflare' },
    { url: 'https://www.torproject.org', title: 'Tor Browser', desc: 'Anonymous browsing' },
    { url: 'https://ublockorigin.com', title: 'uBlock Origin', desc: 'Best free ad blocker' }
  ],
  '🤖 AI & Productivity': [
    { url: 'https://chatgpt.com', title: 'ChatGPT (Free)', desc: 'Free AI assistant by OpenAI' },
    { url: 'https://claude.ai', title: 'Claude (Free)', desc: 'Free AI by Anthropic' },
    { url: 'https://gemini.google.com', title: 'Google Gemini (Free)', desc: 'Free AI by Google' },
    { url: 'https://huggingface.co', title: 'Hugging Face', desc: 'Free AI models & datasets' },
    { url: 'https://www.perplexity.ai', title: 'Perplexity AI', desc: 'Free AI search engine' },
    { url: 'https://excalidraw.com', title: 'Excalidraw', desc: 'Free whiteboard tool' }
  ],
  '🌐 Web Tools & More': [
    { url: 'https://fmhy.net/toolsguide', title: 'FMHY Tools Section', desc: 'Curated free online tools' },
    { url: 'https://tinytool.space', title: 'tinytool.space', desc: 'Collection of tiny web tools' },
    { url: 'https://photopea.com', title: 'Photopea — Free Photoshop', desc: 'Free online image editor' },
    { url: 'https://pixlr.com', title: 'Pixlr — Free Photo Editor', desc: 'Browser-based photo editing' },
    { url: 'https://www.remove.bg', title: 'Remove.bg (Free)', desc: 'Free background remover' },
    { url: 'https://archive.org', title: 'Internet Archive', desc: 'Free books, movies, music & more' }
  ]
};

function buildResourceSectionHTML(category, links) {
  return '<div class="rc-category"><div class="rc-cat-title">' + category + '</div><div class="rc-grid">' +
    links.map(l => '<a class="rc-item" href="' + l.url + '" target="_blank"><div class="rc-name">' + esc(l.title) + '</div><div class="rc-desc">' + esc(l.desc) + '</div></a>').join('') +
    '</div></div>';
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// Build resource panel HTML once
const RESOURCE_PANEL_HTML = (() => {
  const cats = Object.entries(FREE_RESOURCES).map(([cat, links]) =>
    '<div class="rp-cat"><div class="rp-cat-title">' + cat + '</div><div class="rp-grid">' +
    links.map(l => '<a class="rp-item" href="' + esc(l.url) + '"><div class="rp-name">' + esc(l.title) + '</div><div class="rp-desc">' + esc(l.desc) + '</div></a>').join('') +
    '</div></div>'
  ).join('');
  return '<div class="rp-inner"><div class="rp-header"><div class="rp-title">&#127760; All Free Resources</div><button class="rp-close" id="rp-close-btn">&#10005;</button></div>' + cats + '</div>';
})();

const SPEED_DIALS = [
  { url: 'https://www.google.com', title: 'Google' },
  { url: 'https://www.youtube.com', title: 'YouTube' },
  { url: 'https://github.com', title: 'GitHub' },
  { url: 'https://www.reddit.com', title: 'Reddit' },
  { url: 'https://duckduckgo.com', title: 'DuckDuckGo' },
  { url: 'https://chatgpt.com', title: 'ChatGPT' },
  { url: 'https://www.amazon.com', title: 'Amazon' },
  { url: 'https://x.com', title: 'X' },
  { url: 'https://www.wikipedia.org', title: 'Wikipedia' },
  { url: 'https://www.twitch.tv', title: 'Twitch' }
];

const FAVICON = (u) => {
  try { return new URL(u).origin + '/favicon.ico'; } catch (e) { return ''; }
};

const SD_HTML = SPEED_DIALS.map(s =>
  '<a class="sd-item" href="' + s.url + '"><div class="sd-icon"><img src="' + FAVICON(s.url) + '" alt="" onerror="var p=this.parentNode;p.textContent=\'' + s.title.charAt(0) + '\';p.style.fontSize=\'18px\';p.style.fontWeight=\'600\';p.style.color=\'#9aa0a6\'"></div><div class="sd-label">' + s.title + '</div></a>'
).join('');

const RESOURCE_TOP = [
  { url: 'https://www.youtube.com', title: 'YouTube' },
  { url: 'https://github.com', title: 'GitHub' },
  { url: 'https://www.reddit.com', title: 'Reddit' },
  { url: 'https://chatgpt.com', title: 'ChatGPT' },
  { url: 'https://duckduckgo.com', title: 'DuckDuckGo' },
  { url: 'https://www.wikipedia.org', title: 'Wikipedia' },
  { url: 'https://archive.org', title: 'Archive' },
  { url: 'https://news.ycombinator.com', title: 'Hacker News' }
];

const RS_HTML = RESOURCE_TOP.map(r =>
  '<a class="rs-item" href="' + r.url + '"><img class="rs-icon" src="' + FAVICON(r.url) + '" alt="" onerror="this.style.display=\'none\'"><span class="rs-name">' + r.title + '</span></a>'
).join('');

const NEW_TAB_HTML = (function() {
  var h = new Date().getHours();
  var greet = h < 12 ? 'Welcome to the Sanctuary' : h < 18 ? 'Enter the Abyss' : 'Shadows Veil the Realm';
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(
'<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
'*{margin:0;padding:0;box-sizing:border-box}' +
'body{color:#f0f9ff;font-family:Inter,sans-serif;height:100vh;display:flex;flex-direction:column;overflow:hidden;background:#02050b}' +
'body::before{content:"";position:fixed;inset:0;background:radial-gradient(ellipse 80% 50% at 50% 15%,rgba(0,240,255,0.12),transparent),radial-gradient(ellipse 50% 40% at 80% 70%,rgba(2,132,199,0.08),transparent),radial-gradient(ellipse 40% 50% at 15% 80%,rgba(0,240,255,0.06),transparent);pointer-events:none;z-index:0}' +
'.runic-particles{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden}' +
'.p{position:absolute;font-family:"Cinzel",serif;color:rgba(0,240,255,0.22);text-shadow:0 0 10px rgba(0,240,255,0.4);will-change:transform,opacity;animation:runicEmberDrift 12s linear infinite;user-select:none}' +
'.p1{left:8%;bottom:-35px;font-size:24px;animation-delay:0s;animation-duration:10s}' +
'.p2{left:22%;bottom:-35px;font-size:18px;animation-delay:2.5s;animation-duration:13s}' +
'.p3{left:37%;bottom:-35px;font-size:22px;animation-delay:4.8s;animation-duration:11s}' +
'.p4{left:52%;bottom:-35px;font-size:20px;animation-delay:1.2s;animation-duration:12.5s}' +
'.p5{left:68%;bottom:-35px;font-size:26px;animation-delay:5.5s;animation-duration:11.8s}' +
'.p6{left:82%;bottom:-35px;font-size:19px;animation-delay:3.1s;animation-duration:14s}' +
'.p7{left:30%;bottom:-35px;font-size:25px;animation-delay:7.2s;animation-duration:13.2s}' +
'.p8{left:64%;bottom:-35px;font-size:21px;animation-delay:8.6s;animation-duration:10.8s}' +
'@keyframes runicEmberDrift{' +
'0%{transform:translateY(0) scale(0.8) rotate(0deg);opacity:0}' +
'20%{opacity:0.55;transform:translateY(-22vh) scale(1) rotate(12deg)}' +
'75%{opacity:0.35;transform:translateY(-78vh) scale(1.1) rotate(-14deg)}' +
'100%{transform:translateY(-106vh) scale(0.7) rotate(28deg);opacity:0}' +
'}' +
'.main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 20px;min-height:0;position:relative;z-index:1}' +
'.runic-title{font-family:"Cinzel",serif;font-size:32px;font-weight:900;letter-spacing:4px;color:#00f0ff;text-shadow:0 0 20px rgba(0,240,255,0.8),0 0 40px rgba(0,240,255,0.4);margin-bottom:8px}' +
'.greet{font-size:14px;color:#7dd3fc;margin-bottom:24px;font-weight:500;letter-spacing:1px;text-transform:uppercase}' +
'.search{width:100%;max-width:620px;margin-bottom:20px}' +
'.search input{width:100%;padding:14px 24px;border-radius:28px;border:1px solid rgba(0,240,255,0.3);background:rgba(7,13,24,0.7);color:#f0f9ff;font-size:15px;font-family:inherit;outline:none;backdrop-filter:blur(12px);transition:all 0.25s;box-shadow:0 0 15px rgba(0,240,255,0.1)}' +
'.search input:focus{background:rgba(13,23,42,0.9);border-color:#00f0ff;box-shadow:0 0 25px rgba(0,240,255,0.4)}' +
'.search input::placeholder{color:rgba(125,211,252,0.5)}' +
'.sd{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;max-width:620px;margin-bottom:22px}' +
'.sd-item{display:flex;flex-direction:column;align-items:center;gap:7px;text-decoration:none;cursor:pointer;width:72px;transition:transform 0.15s}' +
'.sd-item:hover{transform:translateY(-3px)}' +
'.sd-icon{width:46px;height:46px;border-radius:12px;background:rgba(7,13,24,0.8);display:flex;align-items:center;justify-content:center;overflow:hidden;backdrop-filter:blur(6px);border:1px solid rgba(0,240,255,0.2);box-shadow:0 0 10px rgba(0,240,255,0.1);transition:all 0.15s}' +
'.sd-item:hover .sd-icon{background:rgba(13,23,42,0.95);border-color:#00f0ff;box-shadow:0 0 15px rgba(0,240,255,0.3)}' +
'.sd-icon img{width:22px;height:22px;border-radius:6px}' +
'.sd-label{font-size:11px;color:#7dd3fc;max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;font-weight:500}' +
'.rs{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;max-width:620px;margin-bottom:6px}' +
'.rs-item{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;background:rgba(0,240,255,0.06);border:1px solid rgba(0,240,255,0.2);text-decoration:none;cursor:pointer;font-size:11px;color:#00f0ff;transition:all 0.15s}' +
'.rs-item:hover{background:rgba(0,240,255,0.15);box-shadow:0 0 12px rgba(0,240,255,0.3);transform:translateY(-1px)}' +
'.rs-icon{width:16px;height:16px;border-radius:4px}' +
'.rp-close{background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:18px;padding:4px}' +
'.rp-close:hover{color:#e8eaed}' +
'.rp-cat{margin-bottom:12px}' +
'.rp-cat-title{font-size:11px;color:rgba(255,255,255,0.4);font-weight:500;margin-bottom:4px;padding:0 2px}' +
'.rp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:4px}' +
'.rp-item{display:flex;flex-direction:column;gap:1px;padding:6px 8px;border-radius:6px;background:rgba(255,255,255,0.02);text-decoration:none;cursor:pointer;transition:background 0.1s}' +
'.rp-item:hover{background:rgba(138,180,248,0.06)}' +
'.rp-name{font-size:11px;color:#8ab4f8;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
'.rp-desc{font-size:10px;color:rgba(255,255,255,0.3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
'.ftr{text-align:center;padding:8px;font-size:10px;color:rgba(0,240,255,0.3);flex-shrink:0;position:relative;z-index:1;font-family:"Cinzel",serif}' +
'</style></head><body>' +
'<div class="runic-particles">' +
'<span class="p p1">&#5849;</span><span class="p p2">&#5808;</span><span class="p p3">&#5810;</span><span class="p p4">&#5823;</span>' +
'<span class="p p5">&#5809;</span><span class="p p6">&#5849;</span><span class="p p7">&#5808;</span><span class="p p8">&#5823;</span>' +
'</div>' +
'<div class="main">' +
'<div class="runic-title">&#5849; BLACK ARTIFACT &#5849;</div>' +
'<div class="greet">' + greet + '</div>' +
'<form class="search" onsubmit="event.preventDefault();var q=document.getElementById(\'q\').value;if(q){location.href=q.startsWith(\'http\')?q:\'https://www.google.com/search?q=\'+encodeURIComponent(q)}">' +
'<input type="text" id="q" placeholder="&#5808; Enter URL or search the Abyss..." autofocus autocomplete="off">' +
'</form>' +
'<div class="sd">' + SD_HTML + '</div>' +
'<div class="rs">' + RS_HTML + '</div>' +
'</div>' +
'<div id="panel">' + RESOURCE_PANEL_HTML + '</div>' +
'<div class="ftr">&#5849; Black Browser &#8212; Dark Fantasy Engine &#5849;</div>' +
'<script>document.getElementById("rp-close-btn").onclick=function(){document.getElementById("panel").classList.remove("open")};</script>' +
'</body></html>'
  );
})();

// --- SESSION ---
async function saveSession() {
  const data = tabs.map(t => ({
    url: t._savedURL && t._savedURL !== 'about:blank' ? t._savedURL : t.webview.getURL(),
    title: t.titleEl.innerText
  }));
  await window.api.saveSession(data);
}

async function loadSession() {
  try { return await window.api.loadSession(); } catch (e) { return null; }
}

// --- TAB MANAGEMENT ---
function createTab(url = NEW_TAB_HTML) {
  const tabId = 'tab-' + tabCounter++;
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.id = 'ui-' + tabId;
  const titleEl = document.createElement('span');
  titleEl.className = 'tab-title';
  titleEl.innerText = 'New Tab';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.innerHTML = '<span class="material-icons-round">close</span>';
  tabEl.appendChild(titleEl);
  tabEl.appendChild(closeBtn);
  tabsContainer.appendChild(tabEl);

  const webviewEl = document.createElement('webview');
  webviewEl.id = tabId;
  webviewEl.src = url;
  webviewEl.setAttribute('autosize', 'on');
  webviewEl.setAttribute('allowpopups', '');
  webviewEl.className = 'webview-hidden';
  browserContainer.appendChild(webviewEl);

  const tabObj = { id: tabId, el: tabEl, webview: webviewEl, titleEl, zoomLevel: 0, lastActive: Date.now(), pageTitle: '' };
  tabs.push(tabObj);

  webviewEl.addEventListener('did-start-loading', () => {
    showLoading();
    if (activeTabId === tabId) reloadBtn.innerHTML = '<span class="material-icons-round">close</span>';
    titleEl.innerText = 'Loading...';
    if (activeTabId === tabId) updateNavButtons(webviewEl);
    // Spin the omnibox rune during load
    if (activeTabId === tabId && omniboxRune) omniboxRune.classList.add('loading');
  });

  webviewEl.addEventListener('did-stop-loading', () => {
    hideLoading();
    if (activeTabId === tabId) {
      urlInput.value = webviewEl.getURL();
      reloadBtn.innerHTML = '<span class="material-icons-round">refresh</span>';
      updateLockIcon(webviewEl.getURL());
      updatePrivacyScore(tabObj);
      updateNavButtons(webviewEl);
      // Stop rune spin
      if (omniboxRune) omniboxRune.classList.remove('loading');
    }
    if (typeof addToHistory === 'function') addToHistory(webviewEl.getURL(), tabObj.pageTitle || titleEl.innerText);
    saveSession();
  });

  webviewEl.addEventListener('page-title-updated', (e) => { titleEl.innerText = e.title; tabObj.pageTitle = e.title; });

  webviewEl.addEventListener('did-navigate', () => {
    if (activeTabId === tabId) {
      urlInput.value = webviewEl.getURL();
      updateLockIcon(webviewEl.getURL());
      updatePrivacyScore(tabObj);
      updateNavButtons(webviewEl);
    }
  });
  webviewEl.addEventListener('did-navigate-in-page', () => {
    if (activeTabId === tabId) {
      urlInput.value = webviewEl.getURL();
    }
  });

  webviewEl.addEventListener('enter-html-full-screen', () => {
    window.api.setFullscreen(true);
  });
  webviewEl.addEventListener('leave-html-full-screen', () => {
    window.api.setFullscreen(false);
  });

  webviewEl.addEventListener('found-in-page', (e) => {
    if (activeTabId === tabId) {
      findCount.textContent = e.result.matches > 0 ? e.result.activeMatchOrdinal + ' of ' + e.result.matches : 'No results';
    }
  });

  webviewEl.addEventListener('new-window', (e) => {
    e.preventDefault();
    createTab(e.url);
  });

  tabEl.addEventListener('click', () => switchTab(tabId));
  tabEl.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(tabId); } });

  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tabId); });

  switchTab(tabId);
  saveSession();
}

function switchTab(tabId) {
  const prevTab = tabs.find(t => t.id === activeTabId);
  if (prevTab && prevTab.id !== tabId) {
    if (!prevTab._savedURL || prevTab._savedURL === 'about:blank') {
      var u = prevTab.webview.getURL();
      if (u && u !== 'about:blank' && !u.startsWith('data:')) prevTab._savedURL = u;
    }
    prevTab.webview.loadURL('about:blank');
  }
  activeTabId = tabId;
  tabs.forEach(tab => {
    if (tab.id === tabId) {
      tab.el.classList.add('active');
      tab.webview.classList.remove('webview-hidden');
      tab.lastActive = Date.now();
      if (tab._savedURL && tab._savedURL !== 'about:blank') { tab.webview.loadURL(tab._savedURL); tab._savedURL = null; tab._sleeping = false; }
      urlInput.value = tab.webview.getURL() || '';
      updateLockIcon(tab.webview.getURL());
      updatePrivacyScore(tab);
    } else {
      tab.el.classList.remove('active');
      tab.webview.classList.add('webview-hidden');
    }
  });
  closeFindBar();
}

function closeTab(tabId) {
  const index = tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;
  const tab = tabs[index];
  lastClosedTab = { url: tab.webview.getURL() || NEW_TAB_HTML, title: tab.titleEl.innerText };
  tab.el.style.transition = 'opacity 0.15s, transform 0.15s';
  tab.el.style.opacity = '0';
  tab.el.style.transform = 'scale(0.9)';
  setTimeout(() => {
    tab.el.remove();
    tab.webview.remove();
    tabs.splice(index, 1);
    if (tabs.length === 0) createTab();
    else if (activeTabId === tabId) switchTab(tabs[index] ? tabs[index].id : tabs[index - 1].id);
    saveSession();
  }, 150);
}




function getActiveWebview() { const t = tabs.find(t => t.id === activeTabId); return t ? t.webview : null; }
function getActiveTab() { return tabs.find(t => t.id === activeTabId) || null; }

function updateLockIcon(url) {
  if (!url || url === 'about:blank') {
    lockIcon.textContent = 'shield';
    lockIcon.className = 'material-icons-round lock-icon';
    return;
  }
  if (url.startsWith('https://')) {
    lockIcon.textContent = 'lock';
    lockIcon.className = 'material-icons-round lock-icon secure';
  } else if (url.startsWith('http://')) {
    lockIcon.textContent = 'lock_open';
    lockIcon.className = 'material-icons-round lock-icon insecure';
  } else {
    lockIcon.textContent = 'info';
    lockIcon.className = 'material-icons-round lock-icon';
  }
}

function showLoading() { loadingBar.classList.remove('hidden'); loadingBar.classList.add('active'); loadingBar.style.width = '30%'; }
function hideLoading() { loadingBar.classList.remove('active'); loadingBar.style.width = '100%'; setTimeout(() => { loadingBar.classList.add('hidden'); loadingBar.style.width = '0%'; }, 200); }

// --- PRIVACY SCORE ---
function updatePrivacyScore(tab) {
  const badge = document.getElementById('privacy-score');
  if (!tab || !tab.webview) { badge.classList.add('hidden'); return; }
  const url = tab.webview.getURL();
  if (!url || url === 'about:blank' || url.startsWith('data:')) { badge.classList.add('hidden'); return; }
  let score = 100;
  if (!url.startsWith('https:')) score -= 30;
  if (blockedCount > 50) score -= 20;
  else if (blockedCount > 20) score -= 10;
  else if (blockedCount > 5) score -= 5;
  if (sessionStorage.getItem('blockScripts') === '1') score += 10;
  let grade, color;
  if (score >= 90) { grade = 'A'; color = '#81c995'; }
  else if (score >= 70) { grade = 'B'; color = '#8ab4f8'; }
  else if (score >= 50) { grade = 'C'; color = '#fdd663'; }
  else if (score >= 30) { grade = 'D'; color = '#f28b82'; }
  else { grade = 'F'; color = '#f28b82'; }
  badge.textContent = grade;
  badge.style.color = color;
  badge.style.borderColor = color;
  badge.classList.remove('hidden');
  badge.title = 'Privacy score: ' + grade + ' (' + score + '/100)\nHTTPS: ' + (url.startsWith('https:') ? 'Yes' : 'No') + '\nAds blocked: ' + blockedCount;
}

window.api.onBlockedCount((count) => {
  blockedCount = count;
  shieldBadge.textContent = count > 99 ? '99+' : count;
  shieldBadge.classList.toggle('hidden', count === 0);
  shieldBtn.classList.toggle('active', count > 0);
  statBlocked.textContent = count;
  const tab = getActiveTab();
  if (tab) updatePrivacyScore(tab);
});

// --- TAB RIGHT-CLICK CONTEXT MENU ---
let tabContextTarget = null;
document.addEventListener('contextmenu', (e) => {
  const tabEl = e.target.closest('.tab');
  if (!tabEl) return;
  e.preventDefault();
  tabContextTarget = tabs.find(t => t.el === tabEl);
  if (!tabContextTarget) return;
  const existing = document.getElementById('tab-context-menu');
  if (existing) existing.remove();
  const menu = document.createElement('div');
  menu.id = 'tab-context-menu';
  menu.className = 'chrome-menu';
  menu.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;min-width:180px;z-index:9999';
  menu.innerHTML = `
    <div class="menu-item" data-action="tc-close"><span class="material-icons-round">close</span> Close tab</div>
    <div class="menu-item" data-action="tc-close-others"><span class="material-icons-round">tab</span> Close other tabs</div>
    <div class="menu-item" data-action="tc-close-right"><span class="material-icons-round">tab</span> Close tabs to the right</div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-action="tc-duplicate"><span class="material-icons-round">content_copy</span> Duplicate</div>
    <div class="menu-item" data-action="tc-mute"><span class="material-icons-round">volume_off</span> Mute site</div>
  `;
  document.body.appendChild(menu);
  menu.addEventListener('click', (ev) => {
    const action = ev.target.closest('.menu-item')?.dataset.action;
    if (!action || !tabContextTarget) return;
    const id = tabContextTarget.id;
    if (action === 'tc-close') closeTab(id);
    else if (action === 'tc-close-others') {
      [...tabs].forEach(t => { if (t.id !== id) closeTab(t.id); });
    } else if (action === 'tc-close-right') {
      const idx = tabs.findIndex(t => t.id === id);
      [...tabs].slice(idx + 1).forEach(t => closeTab(t.id));
    } else if (action === 'tc-duplicate') {
      createTab(tabContextTarget.webview.getURL());
    } else if (action === 'tc-mute') {
      tabContextTarget.webview.setAudioMuted(!tabContextTarget.webview.isAudioMuted());
    }
    menu.remove();
  });
  document.addEventListener('click', function rm(e) { if (!e.target.closest('#tab-context-menu')) { menu.remove(); document.removeEventListener('click', rm); } });
});

// --- TAB HOVER TOOLTIP ---
document.addEventListener('mouseover', (e) => {
  const tabEl = e.target.closest('.tab');
  if (!tabEl) { const t = document.getElementById('tab-tooltip'); if (t) t.classList.add('hidden'); return; }
  const tab = tabs.find(t => t.el === tabEl);
  if (!tab) return;
  let tip = document.getElementById('tab-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'tab-tooltip';
    tip.className = 'tab-tooltip hidden';
    document.body.appendChild(tip);
  }
  const url = tab._savedURL || tab.webview.getURL() || 'New Tab';
  const title = tab.titleEl.innerText || url;
  const titleShort = title.length > 60 ? title.slice(0, 57) + '...' : title;
  const urlShort = url.length > 80 ? url.slice(0, 77) + '...' : url;
  const memEst = tab._savedURL ? '💤' : 'Active';
  tip.innerHTML = '<div class="tip-title">' + esc(titleShort) + '</div><div class="tip-url">' + esc(urlShort) + '</div><div class="tip-status">' + memEst + '</div>';
  const rect = tabEl.getBoundingClientRect();
  tip.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - 320)) + 'px';
  tip.style.top = (rect.top - 4) + 'px';
  tip.classList.remove('hidden');
});
document.addEventListener('mouseout', (e) => {
  if (!e.target.closest('.tab')) { const t = document.getElementById('tab-tooltip'); if (t) t.classList.add('hidden'); }
});

// --- AGGRESSIVE TAB SLEEPING ---
function sleepTab(tab) {
  if (tab.id === activeTabId || tab._sleeping) return;
  try {
    if (tab.webview && typeof tab.webview.isCurrentlyAudible === 'function' && tab.webview.isCurrentlyAudible()) return;
  } catch (e) {}
  const url = (tab.webview ? tab.webview.getURL() : '') || tab._savedURL || '';
  if (url.includes('music.youtube.com') || url.includes('youtube.com') || url.includes('spotify.com') || url.includes('soundcloud.com')) return;
  tab._sleeping = true;
  if (url && url !== 'about:blank' && !url.startsWith('data:')) { tab._savedURL = url; tab.webview.loadURL('about:blank'); }
}

setTimeout(() => { tabs.forEach(sleepTab); }, 60000);
setInterval(() => { tabs.forEach(sleepTab); }, 30000);

// Update privacy score on URL change
document.addEventListener('webview-navigate', (e) => {
  const tab = getActiveTab();
  if (tab) updatePrivacyScore(tab);
});

// --- UI ACTIONS ---
newTabBtn.addEventListener('click', () => createTab());

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    let url = urlInput.value.trim();
    if (url) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) url = 'https://' + url;
        else url = (searchEngine === 'Google' ? 'https://www.google.com/search?q=' : 'https://duckduckgo.com/?q=') + encodeURIComponent(url);
      }
      const wv = getActiveWebview();
      if (wv) { wv.loadURL(url); urlInput.blur(); }
    }
    hideSuggestions();
  }
});

urlInput.addEventListener('focus', function() {
  const tab = getActiveTab();
  if (tab) {
    const url = tab.webview.getURL();
    if (url && url !== 'about:blank' && !url.startsWith('data:')) { this.value = url; }
  }
  const v = this.value.trim();
  if (v.length >= 1) showSuggestions(v);
  this.select();
});
urlInput.addEventListener('blur', function() {
  const tab = getActiveTab();
  if (tab) {
    const url = tab.webview.getURL();
    if (url && url !== 'about:blank' && !url.startsWith('data:')) {
      try { this.value = new URL(url).hostname; } catch (e) { /* keep full url */ }
    }
  }
  setTimeout(hideSuggestions, 200);
});
urlInput.addEventListener('input', () => { const v = urlInput.value.trim(); v.length >= 1 ? showSuggestions(v) : hideSuggestions(); });

function updateNavButtons(wv) {
  if (!wv) return;
  try {
    if (wv.canGoBack()) backBtn.classList.remove('disabled'); else backBtn.classList.add('disabled');
    if (wv.canGoForward()) forwardBtn.classList.remove('disabled'); else forwardBtn.classList.add('disabled');
  } catch (e) {}
}

backBtn.addEventListener('click', () => { const wv = getActiveWebview(); if (wv && wv.canGoBack()) { wv.goBack(); updateNavButtons(wv); } });
forwardBtn.addEventListener('click', () => { const wv = getActiveWebview(); if (wv && wv.canGoForward()) { wv.goForward(); updateNavButtons(wv); } });

reloadBtn.addEventListener('click', () => {
  const wv = getActiveWebview();
  if (wv) wv.isLoading() ? wv.stop() : wv.reload();
});

// --- MENU ---
function closeAllMenus() {
  document.querySelectorAll('.chrome-menu').forEach(m => m.classList.add('hidden'));
}

function closeAllPanels() {
  closeAllMenus();
  privacyPanel.classList.add('hidden');
  readerPanel.classList.add('hidden');
}

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllPanels();
  menuDropdown.classList.toggle('hidden');
});

menuDropdown.addEventListener('click', (e) => {
  e.stopPropagation();
  const item = e.target.closest('.menu-item');
  if (!item) return;
  const action = item.dataset.action;
  if (action === 'newtab') { closeAllMenus(); createTab(); }
  else if (action === 'history') { closeAllMenus(); toggleHistory(); }
  else if (action === 'downloads') { closeAllMenus(); toggleDownloads(); }
  else if (action === 'bookmarks') { closeAllMenus(); toggleBookmarks(); }
  else if (action === 'zoomin') { closeAllMenus(); const t = getActiveTab(); if (t) { t.zoomLevel = Math.min(5, t.zoomLevel + 0.5); t.webview.setZoomLevel(t.zoomLevel); } }
  else if (action === 'zoomout') { closeAllMenus(); const t = getActiveTab(); if (t) { t.zoomLevel = Math.max(-5, t.zoomLevel - 0.5); t.webview.setZoomLevel(t.zoomLevel); } }
  else if (action === 'zoomreset') { closeAllMenus(); const t = getActiveTab(); if (t) { t.zoomLevel = 0; t.webview.setZoomLevel(0); } }
  else if (action === 'reader') { closeAllMenus(); readerPanel.classList.remove('hidden'); }
  else if (action === 'free') { closeAllMenus(); openFreeResources(); }
  else if (action === 'print') { closeAllMenus(); const wv = getActiveWebview(); if (wv) wv.print(); }
});

function openFreeResources() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) {
    tab._savedURL = NEW_TAB_HTML;
    tab.webview.loadURL(NEW_TAB_HTML);
    tab.titleEl.innerText = 'Free Resources';
  }
}

enterReaderBtn.addEventListener('click', () => {
  const wv = getActiveWebview();
  if (wv) {
    wv.executeJavaScript(`
      (function() {
        var c = document.createElement('style');
        c.textContent = 'body{max-width:680px!important;margin:40px auto!important;padding:20px!important;font-size:18px!important;line-height:1.8!important;color:#e8eaed!important;background:#202124!important}'+
          'img,video,iframe{max-width:100%!important;height:auto!important}'+
          'a{color:#8ab4f8!important}'+
          'nav,header,footer,aside,script,style{display:none!important}'+
          'h1,h2,h3{font-weight:600!important;margin:24px 0 12px!important}'+
          'p{margin:12px 0!important}'+
          '*{background:transparent!important;border:none!important;box-shadow:none!important}';
        document.head.appendChild(c);
      })();
    `, true).catch(() => {});
  }
  readerPanel.classList.add('hidden');
});

// Script blocking toggle
scriptToggle.addEventListener('change', () => {
  sessionStorage.setItem('blockScripts', scriptToggle.checked ? '1' : '0');
  const wv = getActiveWebview();
  if (wv) wv.reload();
  const tab = getActiveTab();
  if (tab) updatePrivacyScore(tab);
});

// --- SHORTCUTS ---
window.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  const wv = getActiveWebview();
  const tab = getActiveTab();

  if (e.key === 'F11') { e.preventDefault(); window.api.toggleFullscreen(); }
  else if (ctrl && e.key === 't') { e.preventDefault(); createTab(); }
  else if (ctrl && e.shiftKey && e.key === 'T') { e.preventDefault(); if (lastClosedTab) createTab(lastClosedTab.url); }
  else if (ctrl && e.key === 'w') { e.preventDefault(); if (tabs.length > 1) closeTab(activeTabId); }
  else if (ctrl && e.key === 'Tab') {
    e.preventDefault();
    const idx = tabs.findIndex(t => t.id === activeTabId);
    if (idx === -1) return;
    if (e.shiftKey) switchTab(tabs[idx <= 0 ? tabs.length - 1 : idx - 1].id);
    else switchTab(tabs[idx >= tabs.length - 1 ? 0 : idx + 1].id);
  }
  else if (ctrl && e.key >= '1' && e.key <= '8') { e.preventDefault(); const n = parseInt(e.key) - 1; if (n < tabs.length) switchTab(tabs[n].id); }
  else if (ctrl && e.key === '9') { e.preventDefault(); if (tabs.length > 0) switchTab(tabs[tabs.length - 1].id); }
  else if ((ctrl && e.key === 'r') || e.key === 'F5') { e.preventDefault(); if (wv) wv.reload(); }
  else if (ctrl && e.shiftKey && e.key === 'r') { e.preventDefault(); if (wv) wv.reloadIgnoringCache(); }
  else if (ctrl && e.key === 'l') { e.preventDefault(); urlInput.focus(); urlInput.select(); }
  else if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); if (tab) { tab.zoomLevel = Math.min(5, tab.zoomLevel + 0.5); tab.webview.setZoomLevel(tab.zoomLevel); } }
  else if (ctrl && e.key === '-') { e.preventDefault(); if (tab) { tab.zoomLevel = Math.max(-5, tab.zoomLevel - 0.5); tab.webview.setZoomLevel(tab.zoomLevel); } }
  else if (ctrl && e.key === '0') { e.preventDefault(); if (tab) { tab.zoomLevel = 0; tab.webview.setZoomLevel(0); } }
  else if (ctrl && e.key === 'f') { e.preventDefault(); openFindBar(); }
  else if (e.key === 'F3') { e.preventDefault(); if (wv && findInput.value) wv.findInPage(findInput.value, { forward: !e.shiftKey, findNext: true }); }
  else if (ctrl && e.key === 'd') { e.preventDefault(); starBtn.click(); }
  else if (ctrl && e.shiftKey && e.key === 'F') { e.preventDefault(); openFreeResources(); }
  else if (ctrl && e.key === 'h') { e.preventDefault(); toggleHistory(); }
  else if (ctrl && e.key === 'j') { e.preventDefault(); toggleDownloads(); }
  else if (e.key === 'F12' || (ctrl && e.shiftKey && e.key === 'I')) { e.preventDefault(); if (wv) wv.isDevToolsOpened() ? wv.closeDevTools() : wv.openDevTools(); }
  else if (ctrl && e.key === 'u') { e.preventDefault(); if (wv) { const u = wv.getURL(); if (u && !u.startsWith('view-source:')) wv.loadURL('view-source:' + u); } }
  else if (ctrl && e.key === 'p') { e.preventDefault(); if (wv) wv.print(); }
  else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); if (wv && wv.canGoBack()) wv.goBack(); }
  else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); if (wv && wv.canGoForward()) wv.goForward(); }
  else if (e.key === ' ') { e.preventDefault(); if (wv) wv.sendInputEvent({ type: 'keyDown', keyCode: 'PageDown' }); }
  else if (e.key === 'Home') { e.preventDefault(); if (wv) wv.sendInputEvent({ type: 'keyDown', keyCode: 'Home' }); }
  else if (e.key === 'End') { e.preventDefault(); if (wv) wv.sendInputEvent({ type: 'keyDown', keyCode: 'End' }); }
  else if (e.key === 'Escape') { closeFindBar(); hideSuggestions(); closeAllPanels(); }
});

// --- FIND ---
function openFindBar() {
  findBar.classList.remove('hidden');
  findInput.value = ''; findCount.textContent = ''; findInput.focus();
}
function closeFindBar() {
  findBar.classList.add('hidden');
  if (findRequestId !== null) { const wv = getActiveWebview(); if (wv) wv.stopFindInPage('clearSelection'); findRequestId = null; }
}
findInput.addEventListener('input', () => {
  const wv = getActiveWebview(); if (!wv) return;
  if (findInput.value) wv.findInPage(findInput.value, { forward: true, findNext: false });
  else { wv.stopFindInPage('clearSelection'); findCount.textContent = ''; }
});
findInput.addEventListener('keydown', (e) => {
  const wv = getActiveWebview(); if (!wv) return;
  if (e.key === 'Enter') { e.preventDefault(); if (findInput.value) wv.findInPage(findInput.value, { forward: !e.shiftKey, findNext: true }); }
  else if (e.key === 'Escape') closeFindBar();
});
findPrev.addEventListener('click', () => { const wv = getActiveWebview(); if (wv && findInput.value) wv.findInPage(findInput.value, { forward: false, findNext: true }); });
findNext.addEventListener('click', () => { const wv = getActiveWebview(); if (wv && findInput.value) wv.findInPage(findInput.value, { forward: true, findNext: true }); });
findClose.addEventListener('click', closeFindBar);

// --- URL SUGGESTIONS ---
function showSuggestions(query) {
  const q = query.toLowerCase(); const matches = []; const seen = new Set();
  savedHistory.forEach(h => {
    if (matches.length >= 8 || seen.has(h.url)) return;
    if ((h.title && h.title.toLowerCase().includes(q)) || h.url.toLowerCase().includes(q)) {
      if (h.url && h.url !== 'about:blank') { seen.add(h.url); matches.push({ url: h.url, title: h.title || h.url, type: 'history' }); }
    }
  });
  savedBookmarks.forEach(b => {
    if (matches.length >= 8 || seen.has(b.url)) return;
    if ((b.title && b.title.toLowerCase().includes(q)) || b.url.toLowerCase().includes(q)) { seen.add(b.url); matches.push({ url: b.url, title: b.title || b.url, type: 'bookmark' }); }
  });
  if (q.includes('.') && !q.includes(' ')) {
    const fullUrl = q.startsWith('http') ? q : 'https://' + q;
    if (!seen.has(fullUrl)) matches.unshift({ url: fullUrl, title: 'Visit ' + fullUrl, type: 'direct' });
  }
  renderSuggestions(matches);
}
function hideSuggestions() { urlSuggestions.classList.add('hidden'); }
function renderSuggestions(matches) {
  if (!matches.length) { hideSuggestions(); return; }
  urlSuggestions.innerHTML = '';
  matches.forEach(m => {
    const item = document.createElement('div');
    item.className = 'url-suggestion-item';
    const icon = m.type === 'bookmark' ? 'star' : m.type === 'history' ? 'history' : 'open_in_new';
    item.innerHTML = '<div class="suggestion-icon"><span class="material-icons-round">' + icon + '</span></div><div class="suggestion-text"><div class="suggestion-title">' + esc(m.title) + '</div><div class="suggestion-url">' + esc(m.url) + '</div></div>';
    item.addEventListener('click', () => { const wv = getActiveWebview(); if (wv) { wv.loadURL(m.url); urlInput.value = m.url; hideSuggestions(); urlInput.blur(); } });
    urlSuggestions.appendChild(item);
  });
  urlSuggestions.classList.remove('hidden');
}

// --- BOOKMARKS ---
let savedBookmarks = [];
async function loadBookmarks() { savedBookmarks = await window.api.loadBookmarks(); }
function saveBookmarks() { window.api.saveBookmarks(savedBookmarks); }
function renderBookmarks() {
  bookmarksList.innerHTML = '';
  if (savedBookmarks.length === 0) {
    bookmarksList.innerHTML = '<div class="empty-state"><span class="material-icons-round">star</span>No bookmarks yet<br><span style="font-size:11px;color:#5f6368">Press Ctrl+D to bookmark this page</span></div>';
    return;
  }
  savedBookmarks.forEach(b => {
    const li = document.createElement('li');
    li.textContent = b.title || b.url; li.title = b.url;
    li.addEventListener('click', () => { const wv = getActiveWebview(); if (wv) wv.loadURL(b.url); bookmarksMenu.classList.add('hidden'); });
    bookmarksList.appendChild(li);
  });
}
starBtn.addEventListener('click', () => {
  const wv = getActiveWebview();
  if (wv) {
    const url = wv.getURL();
    const tab = tabs.find(t => t.id === activeTabId);
    const title = tab ? tab.titleEl.innerText : url;
    if (!savedBookmarks.find(b => b.url === url)) {
      savedBookmarks.push({ url, title });
      saveBookmarks(); renderBookmarks();
      starBtn.innerHTML = '<span class="material-icons-round" style="color:#ffd700">star</span>';
      setTimeout(() => { starBtn.innerHTML = '<span class="material-icons-round">star_border</span>'; }, 1000);
    }
  }
});

// --- DOWNLOADS ---
function toggleDownloads() {
  downloadsMenu.classList.toggle('hidden');
  closeAllMenus();
  bookmarksMenu.classList.add('hidden');
  historyMenu.classList.add('hidden');
  privacyPanel.classList.add('hidden');
  readerPanel.classList.add('hidden');
}

function createOrUpdateDownload(filename, progress = 0, state = 'progressing') {
  let li = document.getElementById('dl-' + filename);
  if (!li) {
    li = document.createElement('li'); li.id = 'dl-' + filename; li.className = 'download-item';
    li.innerHTML = '<div style="font-size:12px">' + esc(filename) + '</div><div class="download-progress-bg"><div class="download-progress-bar" id="dl-bar-' + filename + '"></div></div>';
    downloadsList.insertBefore(li, downloadsList.firstChild);
  }
  const bar = document.getElementById('dl-bar-' + filename);
  if (bar) bar.style.width = progress + '%';
  if (state === 'completed') li.style.opacity = '0.5';
  else if (state === 'cancelled' || state === 'interrupted') li.style.opacity = '0.3';
}

window.api.onDownloadStart((data) => { createOrUpdateDownload(data.filename, 0); });
window.api.onDownloadProgress((data) => { createOrUpdateDownload(data.filename, data.progress); });
window.api.onDownloadDone((data) => { createOrUpdateDownload(data.filename, 100, data.state); });

// --- HISTORY ---
let savedHistory = [];
async function loadHistory() { savedHistory = await window.api.loadHistory(); }
function saveHistory() { window.api.saveHistory(savedHistory); }
function renderHistory() {
  historyList.innerHTML = '';
  if (savedHistory.length === 0) {
    historyList.innerHTML = '<div class="empty-state"><span class="material-icons-round">history</span>No browsing history yet</div>';
    return;
  }
  savedHistory.slice(0, 50).forEach(h => {
    const li = document.createElement('li');
    li.textContent = h.title && h.title !== 'Loading...' ? h.title : h.url; li.title = h.url;
    li.addEventListener('click', () => { const wv = getActiveWebview(); if (wv) wv.loadURL(h.url); historyMenu.classList.add('hidden'); });
    historyList.appendChild(li);
  });
}
function addToHistory(url, title) {
  if (!url || url === 'about:blank') return;
  if (savedHistory.length > 0 && savedHistory[0].url === url) return;
  savedHistory.unshift({ url, title, time: Date.now() });
  if (savedHistory.length > 200) savedHistory.pop();
  saveHistory(); renderHistory();
}
function toggleHistory() {
  historyMenu.classList.toggle('hidden');
  closeAllMenus();
  bookmarksMenu.classList.add('hidden');
  downloadsMenu.classList.add('hidden');
  privacyPanel.classList.add('hidden');
  readerPanel.classList.add('hidden');
}

function toggleBookmarks() {
  bookmarksMenu.classList.toggle('hidden');
  closeAllMenus();
  historyMenu.classList.add('hidden');
  downloadsMenu.classList.add('hidden');
  privacyPanel.classList.add('hidden');
  readerPanel.classList.add('hidden');
}

// --- CHILD MENU TOGGLES ---
document.querySelectorAll('[data-action="history"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); toggleHistory(); }));
document.querySelectorAll('[data-action="downloads"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); toggleDownloads(); }));
document.querySelectorAll('[data-action="bookmarks"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); toggleBookmarks(); }));

shieldBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllMenus();
  readerPanel.classList.add('hidden');
  privacyPanel.classList.toggle('hidden');
});

const freeBtn = document.getElementById('free-btn');
freeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllPanels();
  openFreeResources();
});

readerBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllMenus();
  privacyPanel.classList.add('hidden');
  readerPanel.classList.toggle('hidden');
});

const profileBtn = document.getElementById('profile-btn');
profileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllPanels();
  openFreeResources();
});

// Click outside to close all panels
document.addEventListener('click', (e) => {
  const target = e.target;
  if (!target.closest('.chrome-menu') && !target.closest('.tb-btn') && !target.closest('#privacy-panel') && !target.closest('#reader-panel')) {
    closeAllPanels();
  }
});

// --- OPEN LOCAL FILE ---
async function openLocalFile() {
  const filePath = await window.api.openFileDialog();
  if (filePath) {
    const wv = getActiveWebview();
    if (wv) wv.loadURL('file:///' + filePath.replace(/\\/g, '/'));
  }
}

// --- DRAG AND DROP ---
browserContainer.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'link'; });
browserContainer.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = e.dataTransfer.files;
  const urls = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  const wv = getActiveWebview();
  if (!wv) return;
  if (files.length > 0) {
    const fp = files[0].path;
    if (fp) wv.loadURL('file:///' + fp.replace(/\\/g, '/'));
  } else if (urls) {
    wv.loadURL(urls.trim());
  }
});

// --- PASSWORD MANAGER ---
let pmMasterPassword = '';
let pmEntries = [];
let pmUnlocked = false;

const pmOverlay = document.getElementById('pm-overlay');
const pmUnlock = document.getElementById('pm-unlock');
const pmVault = document.getElementById('pm-vault');
const pmMasterInput = document.getElementById('pm-master-input');
const pmMasterError = document.getElementById('pm-master-error');
const pmUnlockBtn = document.getElementById('pm-unlock-btn');
const pmSetupBtn = document.getElementById('pm-setup-btn');
const pmCloseBtn = document.getElementById('pm-close-btn');
const pmSearch = document.getElementById('pm-search');
const pmList = document.getElementById('pm-list');
const pmCount = document.getElementById('pm-count');
const pmNotif = document.getElementById('pm-notification');
const pmNotifDomain = document.getElementById('pm-notif-domain');
const pmNotifDetails = document.getElementById('pm-notif-details');
const pmNotifSave = document.getElementById('pm-notif-save');
const pmNotifNever = document.getElementById('pm-notif-never');

function renderPMList(filter = '') {
  pmList.innerHTML = '';
  const filtered = filter ? pmEntries.filter(e => e.site.toLowerCase().includes(filter) || e.username.toLowerCase().includes(filter)) : pmEntries;
  pmCount.textContent = '(' + filtered.length + '/' + pmEntries.length + ')';
  filtered.forEach((entry, idx) => {
    const div = document.createElement('div');
    div.className = 'pm-entry';
    const domain = entry.site.replace(/^https?:\/\//, '').split('/')[0];
    div.innerHTML = `
      <div class="pm-entry-icon">${domain.charAt(0).toUpperCase()}</div>
      <div class="pm-entry-info">
        <div class="pm-entry-site">${esc(entry.site)}</div>
        <div class="pm-entry-username">${esc(entry.username)}${entry.password ? ' — ••••••••' : ''}</div>
      </div>
      <div class="pm-entry-actions">
        <button class="pm-copy-user" data-idx="${idx}" title="Copy username"><span class="material-icons-round">person</span></button>
        <button class="pm-copy-pass" data-idx="${idx}" title="Copy password"><span class="material-icons-round">key</span></button>
        <button class="pm-delete-entry" data-idx="${idx}" title="Delete"><span class="material-icons-round">delete</span></button>
      </div>`;
    pmList.appendChild(div);
  });
  pmList.querySelectorAll('.pm-copy-user').forEach(b => b.addEventListener('click', (e) => {
    const i = parseInt(e.currentTarget.dataset.idx);
    navigator.clipboard.writeText(pmEntries[i].username || '');
  }));
  pmList.querySelectorAll('.pm-copy-pass').forEach(b => b.addEventListener('click', (e) => {
    const i = parseInt(e.currentTarget.dataset.idx);
    if (pmEntries[i].password) navigator.clipboard.writeText(pmEntries[i].password);
  }));
  pmList.querySelectorAll('.pm-delete-entry').forEach(b => b.addEventListener('click', (e) => {
    const i = parseInt(e.currentTarget.dataset.idx);
    pmEntries.splice(i, 1);
    window.api.pmSave(pmMasterPassword, pmEntries);
    renderPMList(pmSearch.value.toLowerCase());
  }));
}

async function openPM() {
  closeAllPanels();
  pmMasterError.classList.add('hidden');
  pmMasterInput.value = '';
  const has = await window.api.pmHasMaster();
  if (has) {
    pmUnlock.classList.remove('hidden');
    pmVault.classList.add('hidden');
    pmSetupBtn.style.display = 'none';
    pmOverlay.classList.remove('hidden');
    setTimeout(() => pmMasterInput.focus(), 100);
  } else {
    pmUnlock.classList.remove('hidden');
    pmVault.classList.add('hidden');
    pmSetupBtn.style.display = 'block';
    pmSetupBtn.textContent = 'Create Master Password';
    pmOverlay.classList.remove('hidden');
    setTimeout(() => pmMasterInput.focus(), 100);
  }
}

pmUnlockBtn.addEventListener('click', async () => {
  const pw = pmMasterInput.value;
  if (!pw) return;
  const has = await window.api.pmHasMaster();
  if (!has) {
    pmMasterError.textContent = 'Set a master password first';
    pmMasterError.classList.remove('hidden');
    return;
  }
  const ok = await window.api.pmVerifyMaster(pw);
  if (!ok) { pmMasterError.classList.remove('hidden'); return; }
  pmMasterPassword = pw;
  pmEntries = await window.api.pmLoad(pw);
  pmUnlock.classList.add('hidden');
  pmVault.classList.remove('hidden');
  renderPMList();
  pmUnlocked = true;
});

pmSetupBtn.addEventListener('click', async () => {
  const pw = pmMasterInput.value;
  if (!pw || pw.length < 4) {
    pmMasterError.textContent = 'Password must be at least 4 characters';
    pmMasterError.classList.remove('hidden');
    return;
  }
  const has = await window.api.pmHasMaster();
  if (has) {
    pmMasterError.textContent = 'Master password already set. Enter it above.';
    pmMasterError.classList.remove('hidden');
    return;
  }
  const ok = await window.api.pmSetMaster(pw);
  if (!ok) { pmMasterError.textContent = 'Failed to save'; pmMasterError.classList.remove('hidden'); return; }
  pmMasterPassword = pw;
  pmEntries = [];
  pmUnlock.classList.add('hidden');
  pmVault.classList.remove('hidden');
  renderPMList();
  pmUnlocked = true;
});

pmCloseBtn.addEventListener('click', () => { pmOverlay.classList.add('hidden'); });
pmOverlay.addEventListener('click', (e) => { if (e.target === pmOverlay) pmOverlay.classList.add('hidden'); });
pmMasterInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') pmUnlockBtn.click(); });
pmSearch.addEventListener('input', () => renderPMList(pmSearch.value.toLowerCase()));

// Detect login forms and offer to save
let pmPendingSave = null;
let pmNeverDomains = [];

setInterval(() => {
  const tab = getActiveTab();
  if (!tab || !tab.webview || !pmUnlocked) return;
  const url = tab.webview.getURL();
  if (!url || url === 'about:blank' || url.startsWith('data:') || url.startsWith('file:')) return;
  const domain = new URL(url).hostname;
  if (pmNeverDomains.includes(domain)) return;
  if (pmEntries.some(e => e.site === url)) return;
  tab.webview.executeJavaScript(`
    (function() {
      var f = document.querySelector('form[action*="login"],form[action*="signin"],form[action*="auth"],form input[type="password"]');
      if (!f) return null;
      var p = f.querySelector('input[type="password"]');
      if (!p || !p.value) return null;
      var u = f.querySelector('input[type="email"],input[name*="user"],input[name*="email"],input[name*="login"],input[name*="log"]');
      return { username: u ? u.value : '', password: p.value };
    })();
  `, true).then((result) => {
    if (!result || !result.password) return;
    pmPendingSave = { url, username: result.username, password: result.password, domain };
    pmNotifDomain.textContent = domain;
    pmNotifDetails.textContent = result.username ? result.username + ' / ••••••••' : '••••••••';
    pmNotif.classList.remove('hidden');
    setTimeout(() => { if (pmPendingSave) { pmNotif.classList.add('hidden'); pmPendingSave = null; } }, 8000);
  }).catch(() => {});
}, 3000);

pmNotifSave.addEventListener('click', () => {
  if (!pmPendingSave) return;
  pmEntries.push({ site: pmPendingSave.url, username: pmPendingSave.username, password: pmPendingSave.password });
  window.api.pmSave(pmMasterPassword, pmEntries);
  renderPMList();
  pmNotif.classList.add('hidden');
  pmPendingSave = null;
});

pmNotifNever.addEventListener('click', () => {
  if (!pmPendingSave) return;
  pmNeverDomains.push(pmPendingSave.domain);
  pmNotif.classList.add('hidden');
  pmPendingSave = null;
});

// Auto-fill passwords on login pages
setInterval(() => {
  const tab = getActiveTab();
  if (!tab || !tab.webview || !pmUnlocked) return;
  const url = tab.webview.getURL();
  if (!url || url === 'about:blank') return;
  const match = pmEntries.find(e => e.site === url);
  if (!match) return;
  tab.webview.executeJavaScript(`
    (function() {
      var u = document.querySelector('input[type="email"],input[name*="user"],input[name*="email"],input[name*="login"]');
      var p = document.querySelector('input[type="password"]');
      if (u && !u.value && ${JSON.stringify(match.username)}) { u.value = ${JSON.stringify(match.username)}; }
      if (p && !p.value && ${JSON.stringify(match.password)}) { p.value = ${JSON.stringify(match.password)}; }
    })();
  `, true).catch(() => {});
}, 2000);

// --- BROWSING TIME TRACKER ---
let usageData = {};
let sessionStart = Date.now();
let currentDomain = '';
let domainStartTime = 0;

async function loadUsage() {
  try {
    const d = await window.api.loadUsage();
    if (d && typeof d === 'object') usageData = d;
  } catch (e) {}
}
async function saveUsage() {
  await window.api.saveUsage(usageData);
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch (e) { return ''; }
}

function trackTime() {
  const tab = getActiveTab();
  if (!tab || !tab.webview) return;
  const url = tab.webview.getURL();
  if (!url || url === 'about:blank' || url.startsWith('data:') || url.startsWith('file:')) {
    if (currentDomain) { tallyTime(); currentDomain = ''; }
    return;
  }
  const domain = getDomain(url);
  if (!domain) return;
  if (domain !== currentDomain) {
    if (currentDomain) tallyTime();
    currentDomain = domain;
    domainStartTime = Date.now();
  }
}

function tallyTime() {
  if (!currentDomain || !domainStartTime) return;
  const elapsed = Math.floor((Date.now() - domainStartTime) / 1000);
  if (elapsed < 1) return;
  const today = new Date().toISOString().slice(0, 10);
  if (!usageData[currentDomain]) usageData[currentDomain] = { total: 0, days: {} };
  if (!usageData[currentDomain].days[today]) usageData[currentDomain].days[today] = 0;
  usageData[currentDomain].total += elapsed;
  usageData[currentDomain].days[today] += elapsed;
  domainStartTime = Date.now();
}

setInterval(() => { trackTime(); }, 5000);
setInterval(() => { saveUsage(); }, 30000);

window.addEventListener('beforeunload', () => { tallyTime(); saveUsage(); });

// --- USAGE PANEL ---
const usageOverlay = document.getElementById('usage-overlay');
const usageSearch = document.getElementById('usage-search');
const usageList = document.getElementById('usage-list');
const usageToday = document.getElementById('usage-today');
const usageSession = document.getElementById('usage-session');
const usageTop = document.getElementById('usage-top');
const usageCloseBtn = document.getElementById('usage-close-btn');

function formatTime(seconds) {
  if (seconds < 60) return seconds + 's';
  const m = Math.floor(seconds / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

function renderUsage(filter = '') {
  const today = new Date().toISOString().slice(0, 10);
  let todayTotal = 0;
  let sessionTotal = Math.floor((Date.now() - sessionStart) / 1000);
  let topSite = '';
  let topTime = 0;
  const entries = Object.entries(usageData).filter(([domain]) => !filter || domain.includes(filter.toLowerCase()));
  entries.sort((a, b) => (b[1].total || 0) - (a[1].total || 0));

  entries.forEach(([domain, data]) => {
    if (data.days && data.days[today]) todayTotal += data.days[today];
    if (data.total > topTime) { topTime = data.total; topSite = domain; }
  });

  usageToday.textContent = formatTime(todayTotal);
  usageSession.textContent = formatTime(sessionTotal);
  usageTop.textContent = topSite || '-';

  usageList.innerHTML = '';
  entries.slice(0, 30).forEach(([domain, data]) => {
    const div = document.createElement('div');
    div.className = 'pm-entry';
    const todaySecs = (data.days && data.days[today]) || 0;
    div.innerHTML = `
      <div class="pm-entry-icon">${domain.charAt(0).toUpperCase()}</div>
      <div class="pm-entry-info">
        <div class="pm-entry-site">${esc(domain)}</div>
        <div class="pm-entry-username">Total: ${formatTime(data.total)} · Today: ${formatTime(todaySecs)}</div>
      </div>`;
    usageList.appendChild(div);
  });
}

function openUsage() {
  closeAllPanels();
  tallyTime();
  renderUsage();
  usageOverlay.classList.remove('hidden');
}

document.querySelectorAll('[data-action="usage"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); openUsage(); }));
usageCloseBtn.addEventListener('click', () => usageOverlay.classList.add('hidden'));
usageOverlay.addEventListener('click', (e) => { if (e.target === usageOverlay) usageOverlay.classList.add('hidden'); });
usageSearch.addEventListener('input', () => renderUsage(usageSearch.value.toLowerCase()));

// --- SETTINGS ---
let settings = {
  searchEngine: 'Google',
  startup: 'home',
  homepage: 'free',
  homepageUrl: '',
  accentColor: '#8ab4f8',
  blockScripts: false,
  forceDarkMode: true,
  customCSS: '',
  showFree: true,
  showReader: true,
  showShield: true
};

const settingsOverlay = document.getElementById('settings-overlay');
const settingsEngine = document.getElementById('settings-engine');
const settingsHomepage = document.getElementById('settings-homepage');
const settingsStartup = document.getElementById('settings-startup');
const settingsHomepageUrl = document.getElementById('settings-homepage-url');
const settingsBlockScripts = document.getElementById('settings-block-scripts');
const settingsDarkMode = document.getElementById('settings-dark-mode');
const settingsCustomCSS = document.getElementById('settings-custom-css');
const settingsShowFree = document.getElementById('settings-show-free');
const settingsShowReader = document.getElementById('settings-show-reader');
const settingsShowShield = document.getElementById('settings-show-shield');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const settingsCloseBtn = document.getElementById('settings-close-btn');

function applySettings() {
  document.documentElement.style.setProperty('--accent', settings.accentColor);
  const accentEls = document.querySelectorAll('.chrome-btn, .loading-bar');
  accentEls.forEach(el => el.style.setProperty('background', settings.accentColor, 'important'));
  if (freeBtn) freeBtn.style.display = settings.showFree ? '' : 'none';
  readerBtn.style.display = settings.showReader ? '' : 'none';
  shieldBtn.style.display = settings.showShield ? '' : 'none';
  sessionStorage.setItem('blockScripts', settings.blockScripts ? '1' : '0');
  if (scriptToggle) scriptToggle.checked = settings.blockScripts;
  // Re-inject custom CSS into active webview
  const tab = getActiveTab();
  if (tab && tab.webview && settings.customCSS) {
    tab.webview.insertCSS(settings.customCSS).catch(() => {});
  }
}

function openSettings() {
  closeAllPanels();
  settingsEngine.value = settings.searchEngine;
  settingsStartup.value = settings.startup || 'home';
  settingsHomepage.value = settings.homepage;
  settingsHomepageUrl.value = settings.homepageUrl || '';
  settingsHomepageUrl.style.display = settings.homepage === 'custom' ? '' : 'none';
  settingsBlockScripts.checked = settings.blockScripts;
  settingsDarkMode.checked = settings.forceDarkMode;
  settingsCustomCSS.value = settings.customCSS || '';
  settingsShowFree.checked = settings.showFree;
  settingsShowReader.checked = settings.showReader;
  settingsShowShield.checked = settings.showShield;
  document.querySelectorAll('.color-swatch').forEach(el => {
    el.classList.toggle('active', el.dataset.color === settings.accentColor);
  });
  settingsOverlay.classList.remove('hidden');
}

settingsHomepage.addEventListener('change', () => {
  settingsHomepageUrl.style.display = settingsHomepage.value === 'custom' ? '' : 'none';
});

document.querySelectorAll('.color-swatch').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
  });
});

settingsSaveBtn.addEventListener('click', async () => {
  const swatch = document.querySelector('.color-swatch.active');
  settings.searchEngine = settingsEngine.value;
  settings.startup = settingsStartup.value;
  settings.homepage = settingsHomepage.value;
  settings.homepageUrl = settingsHomepageUrl.value;
  settings.accentColor = swatch ? swatch.dataset.color : '#8ab4f8';
  settings.blockScripts = settingsBlockScripts.checked;
  settings.forceDarkMode = settingsDarkMode.checked;
  settings.customCSS = settingsCustomCSS.value;
  settings.showFree = settingsShowFree.checked;
  settings.showReader = settingsShowReader.checked;
  settings.showShield = settingsShowShield.checked;
  await window.api.saveSettings(settings);
  applySettings();
  settingsOverlay.classList.add('hidden');
});

settingsCloseBtn.addEventListener('click', () => settingsOverlay.classList.add('hidden'));
settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden'); });

// --- MENU ACTIONS ---
document.querySelectorAll('[data-action="passwords"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); openPM(); }));
document.querySelectorAll('[data-action="settings"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); openSettings(); }));

// --- INIT ---
(async () => {
  await loadBookmarks(); renderBookmarks();
  await loadHistory(); renderHistory();
  await loadUsage();

  // Load settings
  try {
    const s = await window.api.loadSettings();
    if (s) Object.assign(settings, s);
  } catch (e) {}
  applySettings();

  const startup = settings.startup || 'home';
  if (startup === 'restore') {
    const session = await loadSession();
    if (session && Array.isArray(session) && session.length > 0) {
      session.forEach(s => createTab(s.url));
      switchTab(tabs[0].id);
      return;
    }
  }
  createTab();
})();
